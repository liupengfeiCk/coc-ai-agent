/**
 * Unified Database Schema for CoC Multi-Agent System
 * Stores rules, skills, weapons, and memory data
 */

import Database from "better-sqlite3";
type DBInstance = InstanceType<typeof Database>;
import path from "path";

export class CoCDatabase {
  private db: DBInstance;

  constructor(dbPath?: string) {
    const defaultPath = path.join(process.cwd(), "data", "coc_game.db");
    this.db = new Database(dbPath || defaultPath);
    this.db.pragma("journal_mode = WAL");
    this.initializeSchema();
  }

  /**
   * Check if a column exists in a table (defensive for schema drift)
   */
  public hasColumn(tableName: string, columnName: string): boolean {
    const safeTable = tableName.replace(/[^\w]/g, "");
    const safeColumn = columnName.replace(/[^\w]/g, "");
    const rows = this.db
      .prepare(`PRAGMA table_info(${safeTable});`)
      .all() as { name: string }[];
    return rows.some((row) => row.name === safeColumn);
  }

  private initializeSchema(): void {
    // Rules table
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS rules (
                id TEXT PRIMARY KEY,
                category TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                mechanics TEXT,
                examples TEXT, -- JSON array
                related_rules TEXT, -- JSON array of IDs
                tags TEXT, -- JSON array
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_rules_category ON rules(category);
            CREATE INDEX IF NOT EXISTS idx_rules_title ON rules(title);
        `);

    // Skills table
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS skills (
                name TEXT PRIMARY KEY,
                base_value INTEGER NOT NULL,
                description TEXT NOT NULL,
                category TEXT NOT NULL,
                uncommon INTEGER NOT NULL DEFAULT 0,
                examples TEXT, -- JSON array
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
        `);

    // Weapons table
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS weapons (
                name TEXT PRIMARY KEY,
                skill TEXT NOT NULL,
                damage TEXT NOT NULL,
                range TEXT NOT NULL,
                attacks_per_round INTEGER NOT NULL,
                ammo INTEGER,
                malfunction INTEGER,
                era TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);

    // Sanity triggers table
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS sanity_triggers (
                trigger TEXT PRIMARY KEY,
                sanity_loss TEXT NOT NULL,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);


    // Game Turns table - records each complete game interaction round
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS game_turns (
                turn_id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                turn_number INTEGER NOT NULL,
                
                -- Input from character
                character_input TEXT NOT NULL,
                character_id TEXT,
                character_name TEXT,
                
                -- Processing results from agents
                action_analysis TEXT,        -- Orchestrator analysis (JSON)
                action_results TEXT,         -- Action Agent results (JSON array)
                director_decision TEXT,      -- Director decision (JSON)
                
                -- Output from Keeper
                keeper_narrative TEXT,
                clue_revelations TEXT,       -- Revealed clues (JSON)
                
                -- Scene context
                scene_id TEXT,
                scene_name TEXT,
                location TEXT,
                
                -- Status and timing
                status TEXT NOT NULL DEFAULT 'processing', -- 'processing' | 'completed' | 'error'
                error_message TEXT,
                started_at DATETIME NOT NULL,
                completed_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                
                -- Simulation flag
                is_simulated INTEGER DEFAULT 0 -- 0 for real user input, 1 for simulated query
            );
            CREATE INDEX IF NOT EXISTS idx_turns_session ON game_turns(session_id);
            CREATE INDEX IF NOT EXISTS idx_turns_status ON game_turns(status);
            CREATE INDEX IF NOT EXISTS idx_turns_number ON game_turns(session_id, turn_number);
            CREATE INDEX IF NOT EXISTS idx_turns_started ON game_turns(started_at);
        `);

    // Game events table
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS game_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                session_id TEXT NOT NULL,
                timestamp DATETIME NOT NULL,
                details TEXT NOT NULL, -- JSON
                character_id TEXT,
                location TEXT,
                tags TEXT, -- JSON array
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_events_session ON game_events(session_id);
            CREATE INDEX IF NOT EXISTS idx_events_type ON game_events(event_type);
            CREATE INDEX IF NOT EXISTS idx_events_timestamp ON game_events(timestamp);
            CREATE INDEX IF NOT EXISTS idx_events_character ON game_events(character_id);
        `);



    // Discoveries table
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS discoveries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                clue_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                discoverer TEXT NOT NULL,
                method TEXT NOT NULL,
                timestamp DATETIME NOT NULL,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_discoveries_session ON discoveries(session_id);
            CREATE INDEX IF NOT EXISTS idx_discoveries_clue ON discoveries(clue_id);
        `);

    // Relationships table
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS relationships (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                character_id TEXT NOT NULL,
                npc_id TEXT NOT NULL,
                value INTEGER NOT NULL DEFAULT 0,
                session_id TEXT NOT NULL,
                last_updated DATETIME NOT NULL,
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(character_id, npc_id, session_id)
            );
        `);
    
    // Create indexes for relationships table
    try {
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_relationships_character ON relationships(character_id);`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_relationships_npc ON relationships(npc_id);`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_relationships_session ON relationships(session_id);`);
    } catch {
      // ignore errors
    }

    // Characters table (包含玩家角色和NPC)
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS characters (
                character_id TEXT PRIMARY KEY,
                session_id TEXT,
                template_npc_id TEXT,
                name TEXT NOT NULL,
                attributes TEXT NOT NULL,
                status TEXT NOT NULL,
                inventory TEXT,
                skills TEXT,
                notes TEXT,
                is_npc INTEGER DEFAULT 0,
                occupation TEXT,
                age INTEGER,
                gender TEXT,
                appearance TEXT,
                description TEXT,
                personality TEXT,
                background TEXT,
                goals TEXT,
                secrets TEXT,
                current_location TEXT,
                combat TEXT,
                special_abilities TEXT,
                encounter_notes TEXT,
                weaknesses TEXT,
                sanity_loss TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(session_id)
            );
        `);
    
    // Backfill columns for existing characters table
    const columnsToAdd = [
      "skills TEXT",
      "is_npc INTEGER DEFAULT 0",
      "occupation TEXT",
      "age INTEGER",
      "gender TEXT",
      "appearance TEXT",
      "description TEXT",
      "personality TEXT",
      "background TEXT",
      "goals TEXT",
      "secrets TEXT",
      "current_location TEXT",
      "session_id TEXT",
      "template_npc_id TEXT",
      "combat TEXT",
      "special_abilities TEXT",
      "encounter_notes TEXT",
      "weaknesses TEXT",
      "sanity_loss TEXT",
    ];
    for (const column of columnsToAdd) {
      try {
        const columnName = column.split(' ')[0];
        if (!this.hasColumn("characters", columnName)) {
          this.db.exec(`ALTER TABLE characters ADD COLUMN ${column};`);
        }
      } catch {
        // ignore if column already exists
      }
    }
    
    // Create indexes for new columns if they don't exist (after ensuring columns exist)
    try {
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_characters_name ON characters(name);`);
      if (this.hasColumn("characters", "is_npc")) {
        this.db.exec(`CREATE INDEX IF NOT EXISTS idx_characters_is_npc ON characters(is_npc);`);
      }
      if (this.hasColumn("characters", "session_id")) {
        this.db.exec(`CREATE INDEX IF NOT EXISTS idx_characters_session ON characters(session_id);`);
        if (this.hasColumn("characters", "is_npc")) {
          this.db.exec(`CREATE INDEX IF NOT EXISTS idx_characters_session_npc ON characters(session_id, is_npc);`);
        }
      }
      if (this.hasColumn("characters", "template_npc_id")) {
        this.db.exec(`CREATE INDEX IF NOT EXISTS idx_characters_template ON characters(template_npc_id);`);
      }
    } catch {
      // ignore errors
    }

    // NPC Clues table (游戏实例NPC线索)
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS npc_clues (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                npc_id TEXT NOT NULL,
                clue_text TEXT NOT NULL,
                category TEXT,
                difficulty TEXT,
                revealed INTEGER DEFAULT 0,
                related_to TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(session_id),
                FOREIGN KEY (npc_id) REFERENCES characters(character_id)
            );
            CREATE INDEX IF NOT EXISTS idx_npc_clues_npc ON npc_clues(npc_id);
            CREATE INDEX IF NOT EXISTS idx_npc_clues_revealed ON npc_clues(revealed);
            CREATE INDEX IF NOT EXISTS idx_npc_clues_session ON npc_clues(session_id);
        `);
    
    // Backfill session_id column for npc_clues if table already existed
    try {
      if (!this.hasColumn("npc_clues", "session_id")) {
        this.db.exec(
          "ALTER TABLE npc_clues ADD COLUMN session_id TEXT;"
        );
        this.db.exec(
          "CREATE INDEX IF NOT EXISTS idx_npc_clues_session ON npc_clues(session_id);"
        );
      }
    } catch {
      // ignore if column already exists or cannot be added
    }

    // NPC Relationships table (extended version) - 游戏实例NPC关系
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS npc_relationships (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                source_id TEXT NOT NULL,
                target_id TEXT NOT NULL,
                target_name TEXT NOT NULL,
                relationship_type TEXT NOT NULL,
                attitude INTEGER DEFAULT 0,
                description TEXT,
                history TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(session_id),
                FOREIGN KEY (source_id) REFERENCES characters(character_id),
                UNIQUE(source_id, target_id, session_id)
            );
            CREATE INDEX IF NOT EXISTS idx_npc_relationships_source ON npc_relationships(source_id);
            CREATE INDEX IF NOT EXISTS idx_npc_relationships_target ON npc_relationships(target_id);
            CREATE INDEX IF NOT EXISTS idx_npc_relationships_session ON npc_relationships(session_id);
        `);
    
    // Backfill session_id column for npc_relationships if table already existed
    try {
      if (!this.hasColumn("npc_relationships", "session_id")) {
        this.db.exec(
          "ALTER TABLE npc_relationships ADD COLUMN session_id TEXT;"
        );
        this.db.exec(
          "CREATE INDEX IF NOT EXISTS idx_npc_relationships_session ON npc_relationships(session_id);"
        );
      }
    } catch {
      // ignore if column already exists or cannot be added
    }

    // Full-text search for events
    this.db.exec(`
            CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
                event_id UNINDEXED,
                details,
                content='game_events',
                content_rowid='id'
            );

            CREATE TRIGGER IF NOT EXISTS events_fts_insert AFTER INSERT ON game_events BEGIN
                INSERT INTO events_fts(event_id, details)
                VALUES (new.id, new.details);
            END;

            CREATE TRIGGER IF NOT EXISTS events_fts_delete AFTER DELETE ON game_events BEGIN
                DELETE FROM events_fts WHERE event_id = old.id;
            END;

            CREATE TRIGGER IF NOT EXISTS events_fts_update AFTER UPDATE ON game_events BEGIN
                DELETE FROM events_fts WHERE event_id = old.id;
                INSERT INTO events_fts(event_id, details)
                VALUES (new.id, new.details);
            END;
        `);

    // ========================================
    // 模板层 (Template Layer) - 只读模组数据
    // ========================================
    
    // 1. 模组场景模板表 - 存储场景的全部原始信息
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS module_scenarios (
                template_scenario_id TEXT PRIMARY KEY,
                module_name TEXT NOT NULL,
                name TEXT NOT NULL,
                location TEXT NOT NULL,
                description TEXT NOT NULL,
                characters TEXT,
                clues TEXT,
                conditions TEXT,
                events TEXT,
                exits TEXT,
                keeper_notes TEXT,
                tags TEXT,
                connections TEXT,
                metadata TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_module_scenarios_name ON module_scenarios(name);
            CREATE INDEX IF NOT EXISTS idx_module_scenarios_module ON module_scenarios(module_name);
        `);
    
    // Backfill columns for module_scenarios if they don't exist
    const scenarioColumns = [
      "location TEXT",
      "characters TEXT",
      "clues TEXT", 
      "conditions TEXT",
      "events TEXT",
      "exits TEXT",
      "keeper_notes TEXT"
    ];
    for (const column of scenarioColumns) {
      try {
        const columnName = column.split(' ')[0];
        if (!this.hasColumn("module_scenarios", columnName)) {
          this.db.exec(`ALTER TABLE module_scenarios ADD COLUMN ${column};`);
        }
      } catch {
        // ignore if column already exists
      }
    }

    // 2. 模组NPC模板表 - 存储NPC的全部原始信息
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS module_npcs (
                template_npc_id TEXT PRIMARY KEY,
                module_name TEXT NOT NULL,
                name TEXT NOT NULL,
                occupation TEXT,
                age INTEGER,
                gender TEXT,
                appearance TEXT,
                description TEXT,
                personality TEXT,
                background TEXT,
                goals TEXT,
                secrets TEXT,
                attributes TEXT,
                status TEXT,
                skills TEXT,
                inventory TEXT,
                relationships TEXT,
                clues TEXT,
                notes TEXT,
                combat TEXT,
                special_abilities TEXT,
                encounter_notes TEXT,
                weaknesses TEXT,
                sanity_loss TEXT,
                metadata TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_module_npcs_name ON module_npcs(name);
            CREATE INDEX IF NOT EXISTS idx_module_npcs_module ON module_npcs(module_name);
        `);
    
    // Backfill columns for module_npcs if they don't exist
    const npcColumns = [
      "gender TEXT",
      "appearance TEXT",
      "description TEXT",
      "goals TEXT",
      "status TEXT",
      "inventory TEXT",
      "notes TEXT",
      "combat TEXT",
      "special_abilities TEXT",
      "encounter_notes TEXT",
      "weaknesses TEXT",
      "sanity_loss TEXT"
    ];
    for (const column of npcColumns) {
      try {
        const columnName = column.split(' ')[0];
        if (!this.hasColumn("module_npcs", columnName)) {
          this.db.exec(`ALTER TABLE module_npcs ADD COLUMN ${column};`);
        }
      } catch {
        // ignore if column already exists
      }
    }

    // ========================================
    // 实例层 (Instance Layer) - 游戏会话数据
    // ========================================
    
    // 游戏场景实例表 (原 scenarios 表改造)
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS scenarios (
                scenario_id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                template_scenario_id TEXT,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                tags TEXT,
                connections TEXT,
                permanent_changes TEXT,
                metadata TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(session_id)
            );
            CREATE INDEX IF NOT EXISTS idx_scenarios_name ON scenarios(name);
            CREATE INDEX IF NOT EXISTS idx_scenarios_session ON scenarios(session_id);
            CREATE INDEX IF NOT EXISTS idx_scenarios_template ON scenarios(template_scenario_id);
        `);
    
    // Backfill permanent_changes column if table already existed
    try {
      if (!this.hasColumn("scenarios", "permanent_changes")) {
        this.db.exec(
          "ALTER TABLE scenarios ADD COLUMN permanent_changes TEXT;"
        );
      }
    } catch {
      // ignore if column already exists or cannot be added
    }
    
    // Backfill session_id column if table already existed
    try {
      if (!this.hasColumn("scenarios", "session_id")) {
        this.db.exec(
          "ALTER TABLE scenarios ADD COLUMN session_id TEXT;"
        );
        // Create index for new column
        this.db.exec(
          "CREATE INDEX IF NOT EXISTS idx_scenarios_session ON scenarios(session_id);"
        );
      }
    } catch {
      // ignore if column already exists or cannot be added
    }
    
    // Backfill template_scenario_id column if table already existed
    try {
      if (!this.hasColumn("scenarios", "template_scenario_id")) {
        this.db.exec(
          "ALTER TABLE scenarios ADD COLUMN template_scenario_id TEXT;"
        );
        this.db.exec(
          "CREATE INDEX IF NOT EXISTS idx_scenarios_template ON scenarios(template_scenario_id);"
        );
      }
    } catch {
      // ignore if column already exists or cannot be added
    }

    // 游戏场景快照实例表 (原 scenario_snapshots 表改造)
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS scenario_snapshots (
                snapshot_id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                scenario_id TEXT NOT NULL,
                template_snapshot_id TEXT,
                snapshot_name TEXT,
                location TEXT NOT NULL,
                description TEXT NOT NULL,
                characters TEXT,
                clues TEXT,
                conditions TEXT,
                events TEXT,
                exits TEXT,
                keeper_notes TEXT,
                time_restriction TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(session_id),
                FOREIGN KEY (scenario_id) REFERENCES scenarios(scenario_id)
            );
            CREATE INDEX IF NOT EXISTS idx_snapshots_scenario ON scenario_snapshots(scenario_id);
            CREATE INDEX IF NOT EXISTS idx_snapshots_session ON scenario_snapshots(session_id);
            CREATE INDEX IF NOT EXISTS idx_snapshots_template ON scenario_snapshots(template_snapshot_id);
        `);
    
    // Backfill time_restriction column if table already existed
    try {
      if (!this.hasColumn("scenario_snapshots", "time_restriction")) {
        this.db.exec(
          "ALTER TABLE scenario_snapshots ADD COLUMN time_restriction TEXT;"
        );
      }
    } catch {
      // ignore if column already exists or cannot be added
    }
    
    // Backfill session_id column if table already existed
    try {
      if (!this.hasColumn("scenario_snapshots", "session_id")) {
        this.db.exec(
          "ALTER TABLE scenario_snapshots ADD COLUMN session_id TEXT;"
        );
        this.db.exec(
          "CREATE INDEX IF NOT EXISTS idx_snapshots_session ON scenario_snapshots(session_id);"
        );
      }
    } catch {
      // ignore if column already exists or cannot be added
    }
    
    // Backfill template_snapshot_id column if table already existed
    try {
      if (!this.hasColumn("scenario_snapshots", "template_snapshot_id")) {
        this.db.exec(
          "ALTER TABLE scenario_snapshots ADD COLUMN template_snapshot_id TEXT;"
        );
        this.db.exec(
          "CREATE INDEX IF NOT EXISTS idx_snapshots_template ON scenario_snapshots(template_snapshot_id);"
        );
      }
    } catch {
      // ignore if column already exists or cannot be added
    }
    
    // Legacy time fields removed - scenarios no longer have timeline/timepoint data

    // 游戏场景角色关联表 (原 scenario_characters 表改造)
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS scenario_characters (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                snapshot_id TEXT NOT NULL,
                character_name TEXT NOT NULL,
                character_role TEXT NOT NULL,
                character_status TEXT NOT NULL,
                character_location TEXT,
                character_notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(session_id),
                FOREIGN KEY (snapshot_id) REFERENCES scenario_snapshots(snapshot_id)
            );
            CREATE INDEX IF NOT EXISTS idx_scenario_characters_snapshot ON scenario_characters(snapshot_id);
            CREATE INDEX IF NOT EXISTS idx_scenario_characters_name ON scenario_characters(character_name);
            CREATE INDEX IF NOT EXISTS idx_scenario_characters_session ON scenario_characters(session_id);
        `);
    
    // Backfill session_id column for scenario_characters if table already existed
    try {
      if (!this.hasColumn("scenario_characters", "session_id")) {
        this.db.exec(
          "ALTER TABLE scenario_characters ADD COLUMN session_id TEXT;"
        );
        this.db.exec(
          "CREATE INDEX IF NOT EXISTS idx_scenario_characters_session ON scenario_characters(session_id);"
        );
      }
    } catch {
      // ignore if column already exists or cannot be added
    }

    // 游戏场景线索表 (原 scenario_clues 表改造)
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS scenario_clues (
                clue_id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                snapshot_id TEXT NOT NULL,
                template_clue_id TEXT,
                clue_text TEXT NOT NULL,
                category TEXT NOT NULL,
                difficulty TEXT NOT NULL,
                clue_location TEXT NOT NULL,
                discovery_method TEXT,
                reveals TEXT,
                discovered INTEGER DEFAULT 0,
                discovery_details TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(session_id),
                FOREIGN KEY (snapshot_id) REFERENCES scenario_snapshots(snapshot_id)
            );
            CREATE INDEX IF NOT EXISTS idx_scenario_clues_snapshot ON scenario_clues(snapshot_id);
            CREATE INDEX IF NOT EXISTS idx_scenario_clues_location ON scenario_clues(clue_location);
            CREATE INDEX IF NOT EXISTS idx_scenario_clues_discovered ON scenario_clues(discovered);
            CREATE INDEX IF NOT EXISTS idx_scenario_clues_session ON scenario_clues(session_id);
            CREATE INDEX IF NOT EXISTS idx_scenario_clues_template ON scenario_clues(template_clue_id);
        `);
    
    // Backfill session_id column for scenario_clues if table already existed
    try {
      if (!this.hasColumn("scenario_clues", "session_id")) {
        this.db.exec(
          "ALTER TABLE scenario_clues ADD COLUMN session_id TEXT;"
        );
        this.db.exec(
          "CREATE INDEX IF NOT EXISTS idx_scenario_clues_session ON scenario_clues(session_id);"
        );
      }
    } catch {
      // ignore if column already exists or cannot be added
    }
    
    // Backfill template_clue_id column for scenario_clues if table already existed
    try {
      if (!this.hasColumn("scenario_clues", "template_clue_id")) {
        this.db.exec(
          "ALTER TABLE scenario_clues ADD COLUMN template_clue_id TEXT;"
        );
        this.db.exec(
          "CREATE INDEX IF NOT EXISTS idx_scenario_clues_template ON scenario_clues(template_clue_id);"
        );
      }
    } catch {
      // ignore if column already exists or cannot be added
    }

    // 游戏场景条件表 (原 scenario_conditions 表改造)
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS scenario_conditions (
                condition_id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                snapshot_id TEXT NOT NULL,
                condition_type TEXT NOT NULL,
                description TEXT NOT NULL,
                mechanical_effect TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(session_id),
                FOREIGN KEY (snapshot_id) REFERENCES scenario_snapshots(snapshot_id)
            );
            CREATE INDEX IF NOT EXISTS idx_scenario_conditions_snapshot ON scenario_conditions(snapshot_id);
            CREATE INDEX IF NOT EXISTS idx_scenario_conditions_type ON scenario_conditions(condition_type);
            CREATE INDEX IF NOT EXISTS idx_scenario_conditions_session ON scenario_conditions(session_id);
        `);
    
    // Backfill session_id column for scenario_conditions if table already existed
    try {
      if (!this.hasColumn("scenario_conditions", "session_id")) {
        this.db.exec(
          "ALTER TABLE scenario_conditions ADD COLUMN session_id TEXT;"
        );
        this.db.exec(
          "CREATE INDEX IF NOT EXISTS idx_scenario_conditions_session ON scenario_conditions(session_id);"
        );
      }
    } catch {
      // ignore if column already exists or cannot be added
    }

    // Full-text search for scenarios
    this.db.exec(`
            CREATE VIRTUAL TABLE IF NOT EXISTS scenarios_fts USING fts5(
                scenario_id UNINDEXED,
                name,
                description,
                content='scenarios',
                content_rowid='rowid'
            );

            CREATE TRIGGER IF NOT EXISTS scenarios_fts_insert AFTER INSERT ON scenarios BEGIN
                INSERT INTO scenarios_fts(scenario_id, name, description)
                VALUES (new.scenario_id, new.name, new.description);
            END;

            CREATE TRIGGER IF NOT EXISTS scenarios_fts_delete AFTER DELETE ON scenarios BEGIN
                DELETE FROM scenarios_fts WHERE scenario_id = old.scenario_id;
            END;

            CREATE TRIGGER IF NOT EXISTS scenarios_fts_update AFTER UPDATE ON scenarios BEGIN
                DELETE FROM scenarios_fts WHERE scenario_id = old.scenario_id;
                INSERT INTO scenarios_fts(scenario_id, name, description)
                VALUES (new.scenario_id, new.name, new.description);
            END;
        `);

    // Module backgrounds table - for module/briefing level information
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS module_backgrounds (
                module_id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                background TEXT,
                story_outline TEXT,
                module_notes TEXT,
                keeper_guidance TEXT,
                module_limitations TEXT,
                initial_game_time TEXT,
                initial_scenario_npcs TEXT, -- JSON array of NPC names
                introduction TEXT,
                tags TEXT -- JSON array
            );
        `);
    // Backfill for module_limitations if table already existed
    try {
      if (!this.hasColumn("module_backgrounds", "module_limitations")) {
        this.db.exec(
          "ALTER TABLE module_backgrounds ADD COLUMN module_limitations TEXT;"
        );
      }
    } catch {
      // ignore if column already exists or cannot be added
    }
    // Backfill for initial_game_time if table already existed
    try {
      if (!this.hasColumn("module_backgrounds", "initial_game_time")) {
        this.db.exec(
          "ALTER TABLE module_backgrounds ADD COLUMN initial_game_time TEXT;"
        );
      }
    } catch {
      // ignore if column already exists or cannot be added
    }
    // Backfill for introduction if table already existed
    try {
      if (!this.hasColumn("module_backgrounds", "introduction")) {
        this.db.exec(
          "ALTER TABLE module_backgrounds ADD COLUMN introduction TEXT;"
        );
      }
    } catch {
      // ignore if column already exists or cannot be added
    }
    // Backfill for initial_scenario_npcs if table already existed
    try {
      if (!this.hasColumn("module_backgrounds", "initial_scenario_npcs")) {
        this.db.exec(
          "ALTER TABLE module_backgrounds ADD COLUMN initial_scenario_npcs TEXT;"
        );
      }
    } catch {
      // ignore if column already exists or cannot be added
    }

    // Full-text search for module backgrounds
    this.db.exec(`
            CREATE VIRTUAL TABLE IF NOT EXISTS module_backgrounds_fts USING fts5(
                module_id UNINDEXED,
                title,
                background,
                story_outline,
                module_notes,
                keeper_guidance,
                module_limitations,
                content='module_backgrounds',
                content_rowid='rowid'
            );

            CREATE TRIGGER IF NOT EXISTS module_backgrounds_fts_insert AFTER INSERT ON module_backgrounds BEGIN
                INSERT INTO module_backgrounds_fts(module_id, title, background, story_outline, module_notes, keeper_guidance, module_limitations)
                VALUES (new.module_id, new.title, new.background, new.story_outline, new.module_notes, new.keeper_guidance, new.module_limitations);
            END;

            CREATE TRIGGER IF NOT EXISTS module_backgrounds_fts_delete AFTER DELETE ON module_backgrounds BEGIN
                DELETE FROM module_backgrounds_fts WHERE module_id = old.module_id;
            END;

            CREATE TRIGGER IF NOT EXISTS module_backgrounds_fts_update AFTER UPDATE ON module_backgrounds BEGIN
                DELETE FROM module_backgrounds_fts WHERE module_id = old.module_id;
                INSERT INTO module_backgrounds_fts(module_id, title, background, story_outline, module_notes, keeper_guidance, module_limitations)
                VALUES (new.module_id, new.title, new.background, new.story_outline, new.module_notes, new.keeper_guidance, new.module_limitations);
            END;
        `);

    // Sessions table - tracks game sessions
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                mod_name TEXT,
                character_id TEXT,
                character_name TEXT,
                started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_activity_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'completed' | 'paused'
                metadata TEXT, -- JSON blob for additional session data
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
            CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);
        `);

    // Game Checkpoints table - unified checkpoint storage for save/load functionality
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS game_checkpoints (
                checkpoint_id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                checkpoint_name TEXT NOT NULL,
                checkpoint_type TEXT NOT NULL DEFAULT 'auto', -- 'auto' | 'manual' | 'scene_transition'
                description TEXT,
                game_state TEXT NOT NULL, -- Complete GameState as JSON
                screenshot_data TEXT, -- Optional: base64 encoded screenshot or scene description
                game_day INTEGER,
                game_time TEXT, -- Time of day in game
                current_scene_name TEXT,
                current_location TEXT,
                player_hp INTEGER,
                player_sanity INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(session_id)
            );
            CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON game_checkpoints(session_id);
            CREATE INDEX IF NOT EXISTS idx_checkpoints_type ON game_checkpoints(checkpoint_type);
            CREATE INDEX IF NOT EXISTS idx_checkpoints_created ON game_checkpoints(created_at);
            CREATE INDEX IF NOT EXISTS idx_checkpoints_game_day ON game_checkpoints(game_day);
            CREATE INDEX IF NOT EXISTS idx_checkpoints_scene_name ON game_checkpoints(current_scene_name);
            CREATE INDEX IF NOT EXISTS idx_checkpoints_session_scene ON game_checkpoints(session_id, current_scene_name);
        `);
  }

  getDatabase(): DBInstance {
    return this.db;
  }

  close(): void {
    this.db.close();
  }

  // Execute a transaction
  transaction<T>(fn: () => T): T {
    const txn = this.db.transaction(fn);
    return txn();
  }

  /**
   * Ensure a session exists in the sessions table, create it if it doesn't
   * This is required before inserting checkpoints due to foreign key constraint
   */
  private ensureSessionExists(
    sessionId: string,
    gameState: any
  ): void {
    const database = this.db;
    
    // Check if session exists
    const checkStmt = database.prepare(`
      SELECT session_id FROM sessions WHERE session_id = ?
    `);
    const existing = checkStmt.get(sessionId);
    
    if (!existing) {
      // Create session if it doesn't exist
      const insertStmt = database.prepare(`
        INSERT INTO sessions (
          session_id, mod_name, character_id, character_name, status
        ) VALUES (?, ?, ?, ?, 'active')
      `);
      
      insertStmt.run(
        sessionId,
        null, // mod_name - can be extracted from gameState if available
        gameState.playerCharacter?.id || null,
        gameState.playerCharacter?.name || null
      );
    } else {
      // Update last_activity_at if session exists
      const updateStmt = database.prepare(`
        UPDATE sessions 
        SET last_activity_at = CURRENT_TIMESTAMP 
        WHERE session_id = ?
      `);
      updateStmt.run(sessionId);
    }
  }

  /**
   * Save a game checkpoint (complete game state snapshot)
   */
  saveCheckpoint(
    checkpointId: string,
    sessionId: string,
    checkpointName: string,
    gameState: any, // GameState object
    checkpointType: 'auto' | 'manual' | 'scene_transition' = 'auto',
    description?: string
  ): void {
    const database = this.db;
    
    // Ensure session exists before inserting checkpoint (required by foreign key constraint)
    this.ensureSessionExists(sessionId, gameState);
    
    // Extract metadata for quick queries
    const gameDay = gameState.gameDay || 1;
    const gameTime = gameState.timeOfDay || null;
    const currentSceneName = gameState.currentScenario?.name || null;
    const currentLocation = gameState.currentScenario?.location || null;
    const playerHp = gameState.playerCharacter?.status?.hp || null;
    const playerSanity = gameState.playerCharacter?.status?.sanity || null;

    const stmt = database.prepare(`
      INSERT INTO game_checkpoints (
        checkpoint_id, session_id, checkpoint_name, checkpoint_type, description,
        game_state, game_day, game_time, current_scene_name, current_location,
        player_hp, player_sanity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      checkpointId,
      sessionId,
      checkpointName,
      checkpointType,
      description || null,
      JSON.stringify(gameState),
      gameDay,
      gameTime,
      currentSceneName,
      currentLocation,
      playerHp,
      playerSanity
    );
  }

  /**
   * Load a game checkpoint by ID
   */
  loadCheckpoint(checkpointId: string): any | null {
    const database = this.db;
    const stmt = database.prepare(`
      SELECT * FROM game_checkpoints WHERE checkpoint_id = ?
    `);
    
    const row = stmt.get(checkpointId) as any;
    if (!row) return null;

    return {
      checkpointId: row.checkpoint_id,
      sessionId: row.session_id,
      checkpointName: row.checkpoint_name,
      checkpointType: row.checkpoint_type,
      description: row.description,
      gameState: JSON.parse(row.game_state),
      metadata: {
        gameDay: row.game_day,
        gameTime: row.game_time,
        currentSceneName: row.current_scene_name,
        currentLocation: row.current_location,
        playerHp: row.player_hp,
        playerSanity: row.player_sanity,
        createdAt: row.created_at,
      }
    };
  }

  /**
   * List all checkpoints for a session
   */
  listCheckpoints(sessionId: string, limit = 50): any[] {
    const database = this.db;
    const stmt = database.prepare(`
      SELECT 
        checkpoint_id, checkpoint_name, checkpoint_type, description,
        game_day, game_time, current_scene_name, current_location,
        player_hp, player_sanity, created_at
      FROM game_checkpoints 
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    
    return stmt.all(sessionId, limit) as any[];
  }

  /**
   * Find the latest checkpoint for a specific scenario
   * Returns the most recent checkpoint where current_scene_name matches the scenario name
   * or where the scenario snapshot ID matches
   */
  findLatestCheckpointForScenario(
    sessionId: string, 
    scenarioName: string, 
    scenarioSnapshotId?: string
  ): any | null {
    const database = this.db;
    
    // First try to find by scenario name
    let stmt = database.prepare(`
      SELECT 
        checkpoint_id, checkpoint_name, checkpoint_type, description,
        game_day, game_time, current_scene_name, current_location,
        player_hp, player_sanity, created_at, game_state
      FROM game_checkpoints 
      WHERE session_id = ? AND current_scene_name = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);
    
    let row = stmt.get(sessionId, scenarioName) as any;
    
    // If not found by name and we have snapshot ID, try to find by matching snapshot ID in game_state
    if (!row && scenarioSnapshotId) {
      // Get all checkpoints for this session and filter by snapshot ID
      const allCheckpoints = database.prepare(`
        SELECT 
          checkpoint_id, checkpoint_name, checkpoint_type, description,
          game_day, game_time, current_scene_name, current_location,
          player_hp, player_sanity, created_at, game_state
        FROM game_checkpoints 
        WHERE session_id = ?
        ORDER BY created_at DESC
      `).all(sessionId) as any[];
      
      // Find checkpoint where the scenario snapshot ID matches
      for (const checkpointRow of allCheckpoints) {
        try {
          const gameState = JSON.parse(checkpointRow.game_state);
          if (gameState.currentScenario?.id === scenarioSnapshotId) {
            row = checkpointRow;
            break;
          }
        } catch (e) {
          // Skip invalid JSON
          continue;
        }
      }
    }
    
    if (!row) return null;

    return {
      checkpointId: row.checkpoint_id,
      sessionId: sessionId,
      checkpointName: row.checkpoint_name,
      checkpointType: row.checkpoint_type,
      description: row.description,
      gameState: JSON.parse(row.game_state),
      metadata: {
        gameDay: row.game_day,
        gameTime: row.game_time,
        currentSceneName: row.current_scene_name,
        currentLocation: row.current_location,
        playerHp: row.player_hp,
        playerSanity: row.player_sanity,
        createdAt: row.created_at,
      }
    };
  }

  /**
   * Delete a checkpoint
   */
  deleteCheckpoint(checkpointId: string): void {
    const database = this.db;
    database.prepare("DELETE FROM game_checkpoints WHERE checkpoint_id = ?").run(checkpointId);
  }

  /**
   * Delete old auto-save checkpoints (keep only the most recent N)
   */
  cleanupAutoCheckpoints(sessionId: string, keepCount = 10): void {
    const database = this.db;
    database.prepare(`
      DELETE FROM game_checkpoints 
      WHERE session_id = ? 
        AND checkpoint_type = 'auto'
        AND checkpoint_id NOT IN (
          SELECT checkpoint_id 
          FROM game_checkpoints 
          WHERE session_id = ? AND checkpoint_type = 'auto'
          ORDER BY created_at DESC 
          LIMIT ?
        )
    `).run(sessionId, sessionId, keepCount);
  }

  /**
   * Create a new game turn (when character sends input)
   */
  createTurn(
    turnId: string,
    sessionId: string,
    turnNumber: number,
    characterInput: string,
    characterId?: string,
    characterName?: string,
    sceneId?: string,
    sceneName?: string,
    location?: string,
    isSimulated?: boolean
  ): void {
    const database = this.db;
    
    // Add is_simulated column if it doesn't exist (for backward compatibility)
    if (!this.hasColumn('game_turns', 'is_simulated')) {
      try {
        database.exec(`ALTER TABLE game_turns ADD COLUMN is_simulated INTEGER DEFAULT 0`);
        console.log('✓ Added is_simulated column to game_turns table');
      } catch (error) {
        // Column might already exist, ignore error
        console.log('Note: is_simulated column may already exist');
      }
    }
    
    const stmt = database.prepare(`
      INSERT INTO game_turns (
        turn_id, session_id, turn_number, character_input, character_id, character_name,
        scene_id, scene_name, location, status, started_at, is_simulated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'processing', CURRENT_TIMESTAMP, ?)
    `);
    
    stmt.run(
      turnId,
      sessionId,
      turnNumber,
      characterInput,
      characterId || null,
      characterName || null,
      sceneId || null,
      sceneName || null,
      location || null,
      isSimulated ? 1 : 0
    );
  }

  /**
   * Update turn with processing results
   */
  updateTurnProcessing(
    turnId: string,
    actionAnalysis?: any,
    actionResults?: any[],
    directorDecision?: any
  ): void {
    const database = this.db;
    const stmt = database.prepare(`
      UPDATE game_turns 
      SET action_analysis = ?,
          action_results = ?,
          director_decision = ?
      WHERE turn_id = ?
    `);
    
    stmt.run(
      actionAnalysis ? JSON.stringify(actionAnalysis) : null,
      actionResults ? JSON.stringify(actionResults) : null,
      directorDecision ? JSON.stringify(directorDecision) : null,
      turnId
    );
  }

  /**
   * Complete a turn with Keeper's narrative
   */
  completeTurn(
    turnId: string,
    keeperNarrative: string,
    clueRevelations?: any
  ): void {
    const database = this.db;
    const stmt = database.prepare(`
      UPDATE game_turns 
      SET keeper_narrative = ?,
          clue_revelations = ?,
          status = 'completed',
          completed_at = CURRENT_TIMESTAMP
      WHERE turn_id = ?
    `);
    
    stmt.run(
      keeperNarrative,
      clueRevelations ? JSON.stringify(clueRevelations) : null,
      turnId
    );
  }

  /**
   * Mark a turn as error
   */
  markTurnError(turnId: string, errorMessage: string): void {
    const database = this.db;
    database.prepare(`
      UPDATE game_turns 
      SET status = 'error',
          error_message = ?,
          completed_at = CURRENT_TIMESTAMP
      WHERE turn_id = ?
    `).run(errorMessage, turnId);
  }

  /**
   * Get a turn by ID
   */
  getTurn(turnId: string): any | null {
    const database = this.db;
    const stmt = database.prepare(`
      SELECT * FROM game_turns WHERE turn_id = ?
    `);
    
    const row = stmt.get(turnId) as any;
    if (!row) return null;

    return {
      turnId: row.turn_id,
      sessionId: row.session_id,
      turnNumber: row.turn_number,
      characterInput: row.character_input,
      characterId: row.character_id,
      characterName: row.character_name,
      keeperNarrative: row.keeper_narrative,
      status: row.status,
      errorMessage: row.error_message,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      sceneId: row.scene_id,
      sceneName: row.scene_name,
      location: row.location,
      actionAnalysis: row.action_analysis ? JSON.parse(row.action_analysis) : null,
      actionResults: row.action_results ? JSON.parse(row.action_results) : null,
      directorDecision: row.director_decision ? JSON.parse(row.director_decision) : null,
      clueRevelations: row.clue_revelations ? JSON.parse(row.clue_revelations) : null,
      isSimulated: row.is_simulated === 1 || row.is_simulated === true,
    };
  }

  /**
   * Get turn history for a session
   */
  getTurnHistory(sessionId: string, limit = 50, afterTurnNumber?: number): any[] {
    const database = this.db;

    let sql = `
      SELECT * FROM game_turns
      WHERE session_id = ?
    `;

    const params: any[] = [sessionId];

    // Add filter for turns after a specific turn number
    if (afterTurnNumber !== undefined) {
      sql += ` AND turn_number > ?`;
      params.push(afterTurnNumber);
    }

    sql += `
      ORDER BY turn_number DESC
      LIMIT ?
    `;
    params.push(limit);

    const stmt = database.prepare(sql);
    const rows = stmt.all(...params) as any[];
    return rows.map(row => ({
      turnId: row.turn_id,
      sessionId: row.session_id,
      turnNumber: row.turn_number,
      characterInput: row.character_input,
      characterId: row.character_id,
      characterName: row.character_name,
      keeperNarrative: row.keeper_narrative,
      status: row.status,
      errorMessage: row.error_message,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      sceneId: row.scene_id,
      sceneName: row.scene_name,
      location: row.location,
      actionAnalysis: row.action_analysis ? JSON.parse(row.action_analysis) : null,
      actionResults: row.action_results ? JSON.parse(row.action_results) : null,
      directorDecision: row.director_decision ? JSON.parse(row.director_decision) : null,
      clueRevelations: row.clue_revelations ? JSON.parse(row.clue_revelations) : null,
      isSimulated: row.is_simulated === 1 || row.is_simulated === true,
    }));
  }

  /**
   * Get the latest turn for a session
   */
  getLatestTurn(sessionId: string): any | null {
    const database = this.db;
    const stmt = database.prepare(`
      SELECT * FROM game_turns 
      WHERE session_id = ?
      ORDER BY turn_number DESC
      LIMIT 1
    `);
    
    const row = stmt.get(sessionId) as any;
    if (!row) return null;

    return {
      turnId: row.turn_id,
      sessionId: row.session_id,
      turnNumber: row.turn_number,
      characterInput: row.character_input,
      characterId: row.character_id,
      characterName: row.character_name,
      keeperNarrative: row.keeper_narrative,
      status: row.status,
      errorMessage: row.error_message,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      sceneId: row.scene_id,
      sceneName: row.scene_name,
      location: row.location,
      actionAnalysis: row.action_analysis ? JSON.parse(row.action_analysis) : null,
      actionResults: row.action_results ? JSON.parse(row.action_results) : null,
      directorDecision: row.director_decision ? JSON.parse(row.director_decision) : null,
      clueRevelations: row.clue_revelations ? JSON.parse(row.clue_revelations) : null,
      isSimulated: row.is_simulated === 1 || row.is_simulated === true,
    };
  }

  /**
   * Get next turn number for a session
   */
  getNextTurnNumber(sessionId: string): number {
    const database = this.db;
    const stmt = database.prepare(`
      SELECT MAX(turn_number) as max_turn FROM game_turns WHERE session_id = ?
    `);
    
    const row = stmt.get(sessionId) as any;
    return (row?.max_turn || 0) + 1;
  }

  /**
   * Get pending (processing) turns for a session
   */
  getPendingTurns(sessionId: string): any[] {
    const database = this.db;
    const stmt = database.prepare(`
      SELECT * FROM game_turns 
      WHERE session_id = ? AND status = 'processing'
      ORDER BY turn_number ASC
    `);
    
    const rows = stmt.all(sessionId) as any[];
    return rows.map(row => ({
      turnId: row.turn_id,
      sessionId: row.session_id,
      turnNumber: row.turn_number,
      characterInput: row.character_input,
      keeperNarrative: row.keeper_narrative,
      status: row.status,
      errorMessage: row.error_message,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      sceneId: row.scene_id,
      sceneName: row.scene_name,
      location: row.location,
      actionAnalysis: row.action_analysis ? JSON.parse(row.action_analysis) : null,
      actionResults: row.action_results ? JSON.parse(row.action_results) : null,
      directorDecision: row.director_decision ? JSON.parse(row.director_decision) : null,
      clueRevelations: row.clue_revelations ? JSON.parse(row.clue_revelations) : null,
    }));
  }

  /**
   * Update or insert a single NPC relationship
   * Used for incremental relationship updates during gameplay
   */
  upsertNPCRelationship(
    sourceNpcId: string,
    targetId: string,
    targetName: string,
    relationshipType: string,
    attitude: number,
    sessionId: string,
    description?: string,
    history?: string
  ): void {
    const database = this.db;
    const relId = `${sourceNpcId}-rel-${targetId}-${sessionId}`;
    
    const stmt = database.prepare(`
      INSERT INTO npc_relationships (
        id, session_id, source_id, target_id, target_name, relationship_type, attitude, description, history
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        target_name = excluded.target_name,
        relationship_type = excluded.relationship_type,
        attitude = excluded.attitude,
        description = excluded.description,
        history = excluded.history
    `);
    
    stmt.run(
      relId,
      sessionId,
      sourceNpcId,
      targetId,
      targetName,
      relationshipType,
      attitude,
      description || null,
      history || null
    );
  }

  /**
   * Batch update multiple NPC relationships
   * More efficient for updating many relationships at once
   */
  batchUpsertNPCRelationships(relationships: Array<{
    sourceNpcId: string;
    targetId: string;
    targetName: string;
    relationshipType: string;
    attitude: number;
    sessionId: string;
    description?: string;
    history?: string;
  }>): void {
    if (relationships.length === 0) return;
    
    const database = this.db;
    const stmt = database.prepare(`
      INSERT INTO npc_relationships (
        id, session_id, source_id, target_id, target_name, relationship_type, attitude, description, history
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        target_name = excluded.target_name,
        relationship_type = excluded.relationship_type,
        attitude = excluded.attitude,
        description = excluded.description,
        history = excluded.history
    `);
    
    const transaction = this.db.transaction(() => {
      for (const rel of relationships) {
        const relId = `${rel.sourceNpcId}-rel-${rel.targetId}-${rel.sessionId}`;
        stmt.run(
          relId,
          rel.sessionId,
          rel.sourceNpcId,
          rel.targetId,
          rel.targetName,
          rel.relationshipType,
          rel.attitude,
          rel.description || null,
          rel.history || null
        );
      }
    });
    
    transaction();
  }
}
