/**
 * Scenario Loader
 * Loads scenario data from documents and stores them in the database
 */

import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import type { CoCDatabase } from "../database/schema.js";
import type {
  ScenarioProfile,
  ScenarioSnapshot,
  ScenarioCharacter,
  ScenarioClue,
  ScenarioCondition,
  ParsedScenarioData,
  ScenarioQuery,
  ScenarioSearchResult,
} from "../../models/scenarioTypes.js";
import { ScenarioDocumentParser } from "./scenarioDocumentParser.js";

/**
 * Scenario Loader class
 */
export class ScenarioLoader {
  private db: CoCDatabase;
  private parser: ScenarioDocumentParser;

  constructor(db: CoCDatabase, parser?: ScenarioDocumentParser) {
    this.db = db;
    this.parser = parser || new ScenarioDocumentParser();
  }

  /**
   * Check if any files in directory have changed since last load
   */
  private checkForChanges(dirPath: string): { hasChanges: boolean; currentFiles: Map<string, number> } {
    if (!fs.existsSync(dirPath)) {
      return { hasChanges: false, currentFiles: new Map() };
    }

    const currentFiles = new Map<string, number>();
    const files = fs.readdirSync(dirPath).filter(file => 
      file.endsWith('.docx') || file.endsWith('.pdf')
    );

    // Get modification times for all relevant files
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      currentFiles.set(file, stats.mtime.getTime());
    }

    // Check if we have existing scenarios
    const existingScenarios = this.getAllScenarios();
    
    // If no scenarios exist, we need to load
    if (existingScenarios.length === 0) {
      return { hasChanges: true, currentFiles };
    }

    // Check timestamp file
    const lastLoadFile = path.join(dirPath, '.last_scenario_load_timestamp');
    let lastLoadTime = 0;
    
    if (fs.existsSync(lastLoadFile)) {
      try {
        lastLoadTime = parseInt(fs.readFileSync(lastLoadFile, 'utf8'));
      } catch {
        return { hasChanges: true, currentFiles };
      }
    }

    // Check if any file is newer than last load
    const hasChanges = Array.from(currentFiles.values()).some(mtime => mtime > lastLoadTime);
    
    return { hasChanges, currentFiles };
  }

  /**
   * Update the last load timestamp
   */
  private updateLastLoadTimestamp(dirPath: string): void {
    const lastLoadFile = path.join(dirPath, '.last_scenario_load_timestamp');
    const currentTime = Date.now().toString();
    fs.writeFileSync(lastLoadFile, currentTime, 'utf8');
  }

  /**
   * Load scenarios from JSON files in a directory (skip document parsing)
   */
  async loadScenariosFromJSONDirectory(dirPath: string, forceReload = false): Promise<ScenarioProfile[]> {
    console.log(`\n=== Loading Scenarios from JSON directory: ${dirPath} ===`);

    if (!fs.existsSync(dirPath)) {
      console.log(`Directory does not exist: ${dirPath}`);
      return [];
    }

    // Check for file changes unless forced reload
    if (!forceReload) {
      const { hasChanges } = this.checkForJSONChanges(dirPath);
      if (!hasChanges) {
        const existingScenarios = this.getAllScenarios();
        console.log(`No changes detected. Using ${existingScenarios.length} existing scenarios from database.`);
        return existingScenarios;
      }
    }

    console.log(`Loading Scenarios from JSON files in directory: ${dirPath}`);

    const files = fs.readdirSync(dirPath);
    const jsonFiles = files.filter((f) => f.toLowerCase().endsWith(".json"));

    if (jsonFiles.length === 0) {
      console.log("No JSON files found in directory.");
      this.updateLastLoadTimestamp(dirPath);
      return [];
    }

    const scenarioProfiles: ScenarioProfile[] = [];

    console.log(`📦 找到 ${jsonFiles.length} 个场景JSON文件，开始加载...`);
    for (let i = 0; i < jsonFiles.length; i++) {
      const file = jsonFiles[i];
      try {
        console.log(`  [${i + 1}/${jsonFiles.length}] 正在加载: ${file}`);
        const filePath = path.join(dirPath, file);
        const fileContent = fs.readFileSync(filePath, "utf-8");
        const jsonData = JSON.parse(fileContent);

        // Handle both array of scenarios and single scenario object
        const scenarios: ParsedScenarioData[] = Array.isArray(jsonData) ? jsonData : [jsonData];

        for (const parsedData of scenarios) {
          try {
            const scenarioProfile = this.convertToScenarioProfile(parsedData);
            this.saveScenarioToDatabase(scenarioProfile);
            scenarioProfiles.push(scenarioProfile);
            console.log(`    ✓ 已加载场景: ${scenarioProfile.name}`);
          } catch (error) {
            console.error(`    ✗ 加载场景失败 ${parsedData.name} from ${file}:`, error);
          }
        }
        console.log(`  ✓ 已加载 ${scenarios.length} 个场景从文件: ${file}`);
      } catch (error) {
        console.error(`  ✗ 解析JSON文件失败 ${file}:`, error);
      }
    }

    // Update timestamp after successful load
    this.updateLastLoadTimestamp(dirPath);

    console.log(`\n=== Successfully loaded ${scenarioProfiles.length} scenarios from JSON files ===\n`);
    return scenarioProfiles;
  }

  /**
   * Check if any JSON files in directory have changed since last load
   */
  private checkForJSONChanges(dirPath: string): { hasChanges: boolean; currentFiles: Map<string, number> } {
    if (!fs.existsSync(dirPath)) {
      return { hasChanges: false, currentFiles: new Map() };
    }

    const currentFiles = new Map<string, number>();
    const files = fs.readdirSync(dirPath).filter(file => file.toLowerCase().endsWith(".json"));

    // Get modification times for all JSON files
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      currentFiles.set(file, stats.mtime.getTime());
    }

    // Check if we have existing scenarios
    const existingScenarios = this.getAllScenarios();
    
    // If no scenarios exist, we need to load
    if (existingScenarios.length === 0) {
      return { hasChanges: true, currentFiles };
    }

    // Check timestamp file
    const lastLoadFile = path.join(dirPath, '.last_scenario_load_timestamp');
    let lastLoadTime = 0;
    
    if (fs.existsSync(lastLoadFile)) {
      try {
        lastLoadTime = parseInt(fs.readFileSync(lastLoadFile, 'utf8'));
      } catch {
        return { hasChanges: true, currentFiles };
      }
    }

    // Check if any file is newer than last load
    const hasChanges = Array.from(currentFiles.values()).some(mtime => mtime > lastLoadTime);
    
    return { hasChanges, currentFiles };
  }

  /**
   * Load scenarios from a directory (only if files have changed)
   */
  async loadScenariosFromDirectory(dirPath: string, forceReload = false): Promise<ScenarioProfile[]> {
    console.log(`\n=== Checking Scenarios in directory: ${dirPath} ===`);

    if (!fs.existsSync(dirPath)) {
      console.log(`Directory does not exist, creating: ${dirPath}`);
      fs.mkdirSync(dirPath, { recursive: true });
      return [];
    }

    // Check for file changes unless forced reload
    if (!forceReload) {
      const { hasChanges } = this.checkForChanges(dirPath);
      if (!hasChanges) {
        const existingScenarios = this.getAllScenarios();
        console.log(`No changes detected. Using ${existingScenarios.length} existing scenarios from database.`);
        return existingScenarios;
      }
    }

    console.log(`Loading Scenarios from directory: ${dirPath}`);

    // Parse all documents in the directory
    const parsedScenarios = await this.parser.parseDirectory(dirPath);

    if (parsedScenarios.length === 0) {
      console.log("No scenario documents found in directory.");
      this.updateLastLoadTimestamp(dirPath);
      return [];
    }

    // Convert and store each scenario
    const scenarioProfiles: ScenarioProfile[] = [];
    for (const parsedData of parsedScenarios) {
      try {
        const scenarioProfile = this.convertToScenarioProfile(parsedData);
        this.saveScenarioToDatabase(scenarioProfile);
        scenarioProfiles.push(scenarioProfile);
        console.log(`✓ Loaded Scenario: ${scenarioProfile.name} (${scenarioProfile.id})`);
      } catch (error) {
        console.error(`✗ Failed to load scenario ${parsedData.name}:`, error);
      }
    }

    // Update timestamp after successful load
    this.updateLastLoadTimestamp(dirPath);

    console.log(`\n=== Successfully loaded ${scenarioProfiles.length} scenarios ===\n`);
    return scenarioProfiles;
  }

  /**
   * Convert a single parsed snapshot to ScenarioSnapshot
   */
  private convertSnapshot(
    snapshotData: import("../../models/scenarioTypes.js").ParsedScenarioSnapshot,
    scenarioId: string,
    snapshotIndex: number,
    scenarioName: string
  ): ScenarioSnapshot {
    const snapshotId = snapshotIndex === 0 
      ? `${scenarioId}-snapshot` 
      : `${scenarioId}-snapshot-${snapshotIndex}`;

    // Convert characters
    const characters: ScenarioCharacter[] = (snapshotData.characters || []).map((char, charIndex) => ({
      id: `${snapshotId}-char-${charIndex}`,
      name: char.name,
      role: char.role || "unknown",
      status: char.status || "unknown",
      location: char.location,
      notes: char.notes,
    }));

    // Convert clues
    const clues: ScenarioClue[] = (snapshotData.clues || []).map((clue, clueIndex) => ({
      id: `${snapshotId}-clue-${clueIndex}`,
      clueText: clue.clueText,
      category: (clue.category as any) || "observation",
      difficulty: (clue.difficulty as any) || "regular",
      location: clue.location || snapshotData.location,
      discoveryMethod: clue.discoveryMethod,
      reveals: clue.reveals || [],
      discovered: false,
    }));

    // Convert conditions
    const conditions: ScenarioCondition[] = (snapshotData.conditions || []).map((cond) => ({
      type: (cond.type as any) || "other",
      description: cond.description,
      mechanicalEffect: cond.mechanicalEffect,
    }));

    const snapshot: ScenarioSnapshot = {
      id: snapshotId,
      name: snapshotData.name || scenarioName,
      location: snapshotData.location,
      description: snapshotData.description,
      characters,
      clues,
      conditions,
      events: snapshotData.events || [],
      exits: snapshotData.exits || [],
      permanentChanges: snapshotData.permanentChanges || [],
      keeperNotes: snapshotData.keeperNotes,
      timeRestriction: snapshotData.timeRestriction,
    };

    return snapshot;
  }

  /**
   * Convert ParsedScenarioData to ScenarioProfile
   * Supports both single snapshot and multiple snapshots
   */
  private convertToScenarioProfile(parsedData: ParsedScenarioData): ScenarioProfile {
    const scenarioId = this.generateScenarioId(parsedData.name);

    // Handle both single snapshot (legacy) and multiple snapshots (new format)
    let snapshots: ScenarioSnapshot[];
    if (parsedData.snapshots && parsedData.snapshots.length > 0) {
      // Multiple snapshots
      snapshots = parsedData.snapshots.map((snapshotData, index) =>
        this.convertSnapshot(snapshotData, scenarioId, index, parsedData.name)
      );
    } else if (parsedData.snapshot) {
      // Single snapshot (legacy format)
      snapshots = [this.convertSnapshot(parsedData.snapshot, scenarioId, 0, parsedData.name)];
    } else {
      throw new Error(`Scenario "${parsedData.name}" has no snapshot or snapshots`);
    }

    // Use the first snapshot as the default snapshot for backward compatibility
    // (or the one without timeRestriction if available)
    const defaultSnapshot = snapshots.find(s => !s.timeRestriction) || snapshots[0];

    const scenarioProfile: ScenarioProfile = {
      id: scenarioId,
      name: parsedData.name,
      description: parsedData.description,
      snapshot: defaultSnapshot,
      tags: parsedData.tags || [],
      connections: parsedData.connections?.map((conn) => ({
        scenarioId: this.generateScenarioId(conn.scenarioName),
        relationshipType: conn.relationshipType as any,
        description: conn.description,
      })) || [],
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        gameSystem: "CoC 7e",
      },
    };

    // Store all snapshots for saving to database
    (scenarioProfile as any).__allSnapshots = snapshots;

    return scenarioProfile;
  }

  /**
   * Generate a unique ID for a scenario based on its name
   */
  private generateScenarioId(name: string): string {
    return `scenario-${name.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "")}-${randomUUID().slice(0, 8)}`;
  }

  /**
   * Save scenario to database
   */
  private saveScenarioToDatabase(scenario: ScenarioProfile): void {
    const database = this.db.getDatabase();
    const hasCategoryColumn = this.db.hasColumn("scenarios", "category");
    const hasTimeOrderColumn = this.db.hasColumn("scenario_snapshots", "time_order");

    this.db.transaction(() => {
      // Insert or update scenario (including scenario-level permanent_changes)
      const scenarioColumns = ["scenario_id", "name", "description", "tags", "connections", "permanent_changes", "metadata"];
      const scenarioValues: any[] = [
        scenario.id,
        scenario.name,
        scenario.description,
        JSON.stringify(scenario.tags),
        JSON.stringify(scenario.connections),
        scenario.snapshot.permanentChanges ? JSON.stringify(scenario.snapshot.permanentChanges) : null,
        JSON.stringify(scenario.metadata),
      ];

      if (hasCategoryColumn) {
        // Backward compatibility: older DBs may have category
        scenarioColumns.splice(2, 0, "category");
        scenarioValues.splice(2, 0, "location");
      }

      const scenarioStmt = database.prepare(
        `INSERT OR REPLACE INTO scenarios (${scenarioColumns.join(", ")}) VALUES (${scenarioColumns
          .map(() => "?")
          .join(", ")})`
      );

      scenarioStmt.run(...scenarioValues);

      // Delete existing related data
      database.prepare("DELETE FROM scenario_snapshots WHERE scenario_id = ?").run(scenario.id);
      // Note: Foreign key constraints will cascade delete related characters, clues, and conditions

      // Get all snapshots to save (support multiple snapshots)
      const allSnapshots: ScenarioSnapshot[] = (scenario as any).__allSnapshots || [scenario.snapshot];

      // Insert all snapshots
      for (const snapshot of allSnapshots) {
        // Insert snapshot (with time_restriction field)
        const snapshotColumns = [
          "snapshot_id",
          "scenario_id",
          "snapshot_name",
          "location",
          "description",
          "events",
          "exits",
          "keeper_notes",
          "time_restriction",
        ];
        const snapshotValues: any[] = [
          snapshot.id,
          scenario.id,
          snapshot.name,
          snapshot.location,
          snapshot.description,
          JSON.stringify(snapshot.events),
          JSON.stringify(snapshot.exits),
          snapshot.keeperNotes || null,
          snapshot.timeRestriction || null,
        ];

        const snapshotStmt = database.prepare(
          `INSERT INTO scenario_snapshots (${snapshotColumns.join(", ")}) VALUES (${snapshotColumns
            .map(() => "?")
            .join(", ")})`
        );

        snapshotStmt.run(...snapshotValues);

        // Insert characters for this snapshot
        if (snapshot.characters.length > 0) {
          const charStmt = database.prepare(`
                        INSERT INTO scenario_characters (
                            id, snapshot_id, character_name, character_role, character_status,
                            character_location, character_notes
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    `);

          for (const char of snapshot.characters) {
            charStmt.run(
              char.id,
              snapshot.id,
              char.name,
              char.role,
              char.status,
              char.location || null,
              char.notes || null
            );
          }
        }

        // Insert clues for this snapshot
        if (snapshot.clues.length > 0) {
          const clueStmt = database.prepare(`
                        INSERT INTO scenario_clues (
                            clue_id, snapshot_id, clue_text, category, difficulty,
                            clue_location, discovery_method, reveals, discovered, discovery_details
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `);

          for (const clue of snapshot.clues) {
            clueStmt.run(
              clue.id,
              snapshot.id,
              clue.clueText,
              clue.category,
              clue.difficulty,
              clue.location,
              clue.discoveryMethod || null,
              JSON.stringify(clue.reveals),
              clue.discovered ? 1 : 0,
              clue.discoveryDetails ? JSON.stringify(clue.discoveryDetails) : null
            );
          }
        }

        // Insert conditions for this snapshot
        if (snapshot.conditions.length > 0) {
          const condStmt = database.prepare(`
                        INSERT INTO scenario_conditions (
                            condition_id, snapshot_id, condition_type, description, mechanical_effect
                        ) VALUES (?, ?, ?, ?, ?)
                    `);

          for (const cond of snapshot.conditions) {
            const condId = `${snapshot.id}-cond-${randomUUID().slice(0, 8)}`;
            condStmt.run(
              condId,
              snapshot.id,
              cond.type,
              cond.description,
              cond.mechanicalEffect || null
            );
          }
        }
      }
    });
  }

  /**
   * Get a scenario from the database by ID
   */
  getScenarioById(scenarioId: string): ScenarioProfile | null {
    const database = this.db.getDatabase();

    // Get scenario data
    const scenario = database
      .prepare(`SELECT * FROM scenarios WHERE scenario_id = ?`)
      .get(scenarioId) as any;

    if (!scenario) {
      return null;
    }

    // Get snapshot (single snapshot per scenario)
    const snap = database
      .prepare(`SELECT * FROM scenario_snapshots WHERE scenario_id = ? LIMIT 1`)
      .get(scenarioId) as any;

    if (!snap) {
      console.warn(`No snapshot found for scenario ${scenarioId}`);
      return null;
    }

    // Parse JSON fields from snapshot
    const characters = snap.characters ? JSON.parse(snap.characters) : [];
    const clues = snap.clues ? JSON.parse(snap.clues) : [];
    const conditions = snap.conditions ? JSON.parse(snap.conditions) : [];

    const snapshot: ScenarioSnapshot = {
      id: snap.snapshot_id,
      name: snap.snapshot_name,
      location: snap.location,
      description: snap.description,
      characters: characters,
      clues: clues.map((c: any) => ({
        id: c.id || `clue-${Math.random()}`,
        clueText: c.text || c.clueText,
        category: c.category || "general",
        difficulty: c.difficulty || "medium",
        location: c.location,
        discoveryMethod: c.discoveryMethod,
        reveals: c.reveals || [],
        discovered: false,
      })),
      conditions: conditions,
      events: snap.events ? JSON.parse(snap.events) : [],
      exits: snap.exits ? JSON.parse(snap.exits) : [],
      permanentChanges: scenario.permanent_changes ? JSON.parse(scenario.permanent_changes) : [],
      keeperNotes: snap.keeper_notes,
      timeRestriction: snap.time_restriction || undefined,
    };

    const scenarioProfile: ScenarioProfile = {
      id: scenario.scenario_id,
      name: scenario.name,
      description: scenario.description,
      snapshot,
      tags: JSON.parse(scenario.tags || "[]"),
      connections: JSON.parse(scenario.connections || "[]"),
      metadata: JSON.parse(scenario.metadata),
    };

    return scenarioProfile;
  }

  /**
   * Get all scenarios from the database
   */
  getAllScenarios(): ScenarioProfile[] {
    const database = this.db.getDatabase();

    const scenarios = database
      .prepare(`SELECT scenario_id FROM scenarios`)
      .all() as any[];

    return scenarios
      .map((s) => this.getScenarioById(s.scenario_id))
      .filter((scenario) => scenario !== null) as ScenarioProfile[];
  }

  /**
   * Find initial scenario by scanning scenario directory for files containing "initial_scenario" in filename
   */
  findInitialScenarioByFileName(scenarioDir: string): ScenarioProfile | null {
    if (!fs.existsSync(scenarioDir)) {
      return null;
    }

    const files = fs.readdirSync(scenarioDir);
    const jsonFiles = files.filter((f) => f.toLowerCase().endsWith(".json"));

    // Find file containing "initial_scenario" in filename (case-insensitive)
    const initialScenarioFile = jsonFiles.find((file) =>
      file.toLowerCase().includes("initial_scenario")
    );

    if (!initialScenarioFile) {
      return null;
    }

    try {
      const filePath = path.join(scenarioDir, initialScenarioFile);
      const fileContent = fs.readFileSync(filePath, "utf-8");
      const jsonData = JSON.parse(fileContent);

      // Handle both array of scenarios and single scenario object
      const scenarios: ParsedScenarioData[] = Array.isArray(jsonData) ? jsonData : [jsonData];

      if (scenarios.length === 0) {
        return null;
      }

      // Get the first scenario from the file
      const initialScenarioData = scenarios[0];
      const scenarioName = initialScenarioData.name || initialScenarioData.snapshot?.name;

      if (!scenarioName) {
        console.warn(`⚠️  初始场景文件 "${initialScenarioFile}" 中未找到场景名称`);
        return null;
      }

      // Find the scenario in loaded scenarios by name
      const allScenarios = this.getAllScenarios();
      const foundScenario = allScenarios.find(
        (s) => s.name.toLowerCase().trim() === scenarioName.toLowerCase().trim()
      );

      if (foundScenario) {
        console.log(`   ✓ 根据文件名找到初始场景: ${foundScenario.name} (来自文件: ${initialScenarioFile})`);
        return foundScenario;
      } else {
        console.warn(`⚠️  在已加载的场景中未找到名为 "${scenarioName}" 的场景（来自文件: ${initialScenarioFile}）`);
        return null;
      }
    } catch (error) {
      console.error(`   ✗ 读取初始场景文件失败 "${initialScenarioFile}":`, error);
      return null;
    }
  }

  /**
   * Search scenarios based on query with fuzzy matching
   * Returns only the best matching scenario
   */
  searchScenarios(query: ScenarioQuery): ScenarioSearchResult {
    const database = this.db.getDatabase();
    let sqlQuery = `SELECT scenario_id, name FROM scenarios WHERE 1=1`;
    const params: any[] = [];

    if (query.name) {
      // Use very loose matching - match if ANY word from search term appears
      // Then use scoring to find the best match
      const searchTerm = query.name.trim().toLowerCase();
      const words = searchTerm.split(/\s+/).filter(w => w.length > 0);
      
      if (words.length > 0) {
        // Match if any word appears (very loose, will filter by score later)
        const wordConditions = words.map(() => `LOWER(name) LIKE ?`).join(' OR ');
        sqlQuery += ` AND (${wordConditions})`;
        words.forEach(word => params.push(`%${word}%`));
      } else {
        // Fallback: simple contains match
        sqlQuery += ` AND LOWER(name) LIKE ?`;
        params.push(`%${searchTerm}%`);
      }
    }

    if (query.tags && query.tags.length > 0) {
      for (const tag of query.tags) {
        sqlQuery += ` AND tags LIKE ?`;
        params.push(`%"${tag}"%`);
      }
    }

    const results = database.prepare(sqlQuery).all(params) as any[];

    if (results.length === 0) {
      return {
        scenarios: [],
        totalCount: 0,
      };
    }

    // Find the best match by similarity score
    const searchTerm = query.name ? query.name.trim().toLowerCase() : '';
    const normalizedSearch = searchTerm.replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
    const searchWords = searchTerm.split(/\s+/).filter(w => w.length > 0);

    let bestMatch = results[0];
    let bestScore = 0;

    for (const result of results) {
      const name = result.name.toLowerCase();
      const normalizedName = name.replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
      const nameWords = name.split(/\s+/).filter((w: string) => w.length > 0);
      
      let score = 0;
      
      // Exact match gets highest score
      if (name === searchTerm) {
        score = 1000;
      }
      // Contains search term (higher priority than starts with)
      else if (name.includes(searchTerm)) {
        score = 500;
      }
      // Starts with search term
      else if (name.startsWith(searchTerm)) {
        score = 300;
      }
      // Normalized exact match
      else if (normalizedName === normalizedSearch) {
        score = 200;
      }
      // Normalized contains
      else if (normalizedName.includes(normalizedSearch)) {
        score = 100;
      }
      // Word-based matching: count how many search words appear in the name
      else if (searchWords.length > 0) {
        const matchedWords = searchWords.filter((word: string) => name.includes(word)).length;
        const matchRatio = matchedWords / searchWords.length;
        // Score based on how many words match
        score = matchRatio * 150; // Max 150 for partial word matches
        // Bonus if key words match (like "train", "station")
        if (matchedWords >= 2) {
          score += 50; // Bonus for multiple word matches
        }
      }
      // Calculate similarity based on common characters
      else {
        const commonChars = normalizedSearch.split('').filter(char => normalizedName.includes(char)).length;
        score = (commonChars / Math.max(normalizedSearch.length, normalizedName.length)) * 50;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = result;
      }
    }

    // Return only the best matching scenario
    const bestScenario = this.getScenarioById(bestMatch.scenario_id);
    const scenarios = bestScenario ? [bestScenario] : [];

    return {
      scenarios,
      totalCount: scenarios.length,
    };
  }

  /**
   * Check if scenario already exists in database
   */
  scenarioExists(scenarioId: string): boolean {
    const database = this.db.getDatabase();
    const result = database
      .prepare(`SELECT COUNT(*) as count FROM scenarios WHERE scenario_id = ?`)
      .get(scenarioId) as any;
    return result.count > 0;
  }

  /**
   * Mark a clue as discovered
   */
  discoverClue(
    clueId: string,
    discoveredBy: string,
    method: string,
    timestamp: string = new Date().toISOString()
  ): void {
    const database = this.db.getDatabase();

    const discoveryDetails = {
      discoveredBy,
      discoveredAt: timestamp,
      method,
    };

    database
      .prepare(`
            UPDATE scenario_clues 
            SET discovered = 1, discovery_details = ?
            WHERE clue_id = ?
        `)
      .run(JSON.stringify(discoveryDetails), clueId);
  }

  /**
   * Get undiscovered clues for a scenario or snapshot
   */
  getUndiscoveredClues(scenarioId?: string, snapshotId?: string): ScenarioClue[] {
    const database = this.db.getDatabase();

    let query: string;
    let params: any[];

    if (snapshotId) {
      query = `
                SELECT * FROM scenario_clues 
                WHERE snapshot_id = ? AND discovered = 0
            `;
      params = [snapshotId];
    } else if (scenarioId) {
      query = `
                SELECT sc.* FROM scenario_clues sc
                JOIN scenario_snapshots ss ON sc.snapshot_id = ss.snapshot_id
                WHERE ss.scenario_id = ? AND sc.discovered = 0
            `;
      params = [scenarioId];
    } else {
      query = `SELECT * FROM scenario_clues WHERE discovered = 0`;
      params = [];
    }

    const results = database.prepare(query).all(params) as any[];

    return results.map((c) => ({
      id: c.clue_id,
      clueText: c.clue_text,
      category: c.category,
      difficulty: c.difficulty,
      location: c.clue_location,
      discoveryMethod: c.discovery_method,
      reveals: c.reveals ? JSON.parse(c.reveals) : [],
      discovered: false,
    }));
  }
}
