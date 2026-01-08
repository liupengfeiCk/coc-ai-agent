/**
 * 游戏实例管理器 (Game Instance Manager)
 * 负责从模板创建游戏实例,管理游戏会话数据
 */

import type { CoCDatabase } from "./database/schema.js";
import type Database from "better-sqlite3";

export class GameInstanceManager {
  private db: Database.Database;

  constructor(database: CoCDatabase) {
    this.db = database.getDatabase();
  }

  /**
   * 从模板创建游戏实例
   * @param sessionId 会话ID
   * @param moduleName 选择的模组名称
   * @param characterId 选择的角色ID
   */
  async createGameInstance(
    sessionId: string,
    moduleName: string,
    characterId: string
  ): Promise<void> {
    console.log(`\n🎮 为会话 ${sessionId} 创建游戏实例 (模组: ${moduleName})`);

    // 1. 检查是否已有实例(避免重复创建)
    if (this.hasGameInstance(sessionId)) {
      console.log(`⚠️  会话 ${sessionId} 已有游戏实例,跳过创建`);
      return;
    }

    // 2. 检查模组是否存在
    if (!this.moduleExists(moduleName)) {
      throw new Error(`模组 ${moduleName} 不存在,请先导入模组`);
    }

    // 3. 确保session存在 (外键约束要求)
    this.ensureSessionExists(sessionId, characterId);

    // 4. 事务保证原子性 - 从模板复制到实例表
    const transaction = this.db.transaction(() => {
      console.log(`  📋 复制场景...`);
      const scenarioCount = this.copyScenarios(sessionId, moduleName);
      console.log(`    ✓ 复制了 ${scenarioCount} 个场景`);
      
      console.log(`  📸 创建场景快照...`);
      const snapshotCount = this.copyScenarioSnapshots(sessionId, moduleName);
      console.log(`    ✓ 创建了 ${snapshotCount} 个快照`);
      
      console.log(`  👥 复制NPC...`);
      const npcCount = this.copyNPCs(sessionId, moduleName);
      console.log(`    ✓ 复制了 ${npcCount} 个NPC`);
      
      console.log(`  🔍 复制线索...`);
      const clueCount = this.copyClues(sessionId, moduleName);
      console.log(`    ✓ 复制了 ${clueCount} 个线索`);
      
      console.log(`  🔗 创建NPC关系...`);
      const relationshipCount = this.copyNPCRelationships(sessionId, moduleName);
      console.log(`    ✓ 创建了 ${relationshipCount} 个关系`);
    });

    transaction();

    console.log(`✅ 游戏实例创建完成 (session: ${sessionId})\n`);
  }

  /**
   * 确保session存在 (满足外键约束)
   */
  private ensureSessionExists(sessionId: string, characterId: string): void {
    const exists = this.db
      .prepare("SELECT COUNT(*) as count FROM sessions WHERE session_id = ?")
      .get(sessionId) as { count: number };

    if (exists.count === 0) {
      this.db
        .prepare(
          `
        INSERT INTO sessions (session_id, character_id, status)
        VALUES (?, ?, 'active')
      `
        )
        .run(sessionId, characterId);
      console.log(`  ✓ 创建session: ${sessionId}`);
    }
  }

  /**
   * 检查session_id是否已有游戏实例
   */
  hasGameInstance(sessionId: string): boolean {
    const stmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM scenarios WHERE session_id = ?"
    );
    const result = stmt.get(sessionId) as { count: number };
    return result.count > 0;
  }

  /**
   * 检查模组是否存在
   */
  private moduleExists(moduleName: string): boolean {
    const stmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM module_scenarios WHERE module_name = ?"
    );
    const result = stmt.get(moduleName) as { count: number };
    return result.count > 0;
  }

  /**
   * 删除指定session_id的所有游戏实例数据
   * (当该会话的所有checkpoint都被删除时调用)
   */
  async deleteGameInstance(sessionId: string): Promise<void> {
    console.log(`🗑️  删除会话 ${sessionId} 的游戏实例数据`);

    const transaction = this.db.transaction(() => {
      // 级联删除 (顺序很重要,先删子表)
      this.db.prepare("DELETE FROM npc_clues WHERE session_id = ?").run(sessionId);
      this.db.prepare("DELETE FROM npc_relationships WHERE session_id = ?").run(sessionId);
      this.db.prepare("DELETE FROM scenario_clues WHERE session_id = ?").run(sessionId);
      this.db.prepare("DELETE FROM scenario_conditions WHERE session_id = ?").run(sessionId);
      this.db.prepare("DELETE FROM scenario_characters WHERE session_id = ?").run(sessionId);
      this.db.prepare("DELETE FROM scenario_snapshots WHERE session_id = ?").run(sessionId);
      this.db.prepare("DELETE FROM scenarios WHERE session_id = ?").run(sessionId);
      this.db.prepare("DELETE FROM characters WHERE session_id = ?").run(sessionId);
    });

    transaction();

    console.log(`✅ 游戏实例数据已清理 (session: ${sessionId})`);
  }

  /**
   * 复制场景模板到实例表
   * 新架构: module_scenarios已包含所有信息,无需join
   */
  private copyScenarios(sessionId: string, moduleName: string): number {
    const result = this.db
      .prepare(
        `
      INSERT INTO scenarios (
        scenario_id, session_id, template_scenario_id, 
        name, description, tags, connections, permanent_changes, metadata
      )
      SELECT 
        'game-' || template_scenario_id || '-' || ?,
        ?,
        template_scenario_id,
        name, description, tags, connections, NULL, metadata
      FROM module_scenarios
      WHERE module_name = ?
    `
      )
      .run(sessionId, sessionId, moduleName);
    return result.changes;
  }

  /**
   * 从场景模板创建场景快照实例
   * 新架构: 场景模板本身就是初始快照,无需单独复制
   * 快照数据来自scenario实例的初始状态
   */
  private copyScenarioSnapshots(sessionId: string, moduleName: string): number {
    // 从已创建的scenario实例生成初始快照
    const result = this.db
      .prepare(
        `
      INSERT INTO scenario_snapshots (
        snapshot_id, session_id, scenario_id, template_snapshot_id,
        snapshot_name, location, description, characters, clues, conditions,
        events, exits, keeper_notes, time_restriction
      )
      SELECT 
        'snapshot-' || s.template_scenario_id || '-' || ?,
        s.session_id,
        s.scenario_id,
        s.template_scenario_id,
        s.name,
        ms.location,
        s.description,
        ms.characters,
        ms.clues,
        ms.conditions,
        ms.events,
        ms.exits,
        ms.keeper_notes,
        NULL
      FROM scenarios s
      JOIN module_scenarios ms ON s.template_scenario_id = ms.template_scenario_id
      WHERE s.session_id = ? AND ms.module_name = ?
    `
      )
      .run(sessionId, sessionId, moduleName);
    return result.changes;
  }

  /**
   * 复制NPC模板到实例表
   * 新架构: module_npcs已包含所有NPC信息
   */
  private copyNPCs(sessionId: string, moduleName: string): number {
    const result = this.db
      .prepare(
        `
      INSERT INTO characters (
        character_id, session_id, template_npc_id, name, occupation, age, gender,
        appearance, description, personality, background, goals, secrets,
        attributes, status, skills, inventory, notes,
        combat, special_abilities, encounter_notes, weaknesses, sanity_loss,
        current_location, is_npc
      )
      SELECT 
        'npc-' || template_npc_id || '-' || ?,
        ?,
        template_npc_id,
        name, occupation, age, gender,
        appearance, description, personality, background, goals, secrets,
        attributes,
        COALESCE(status, json_object('hp', 10, 'sanity', 50, 'luck', 50)),
        skills,
        COALESCE(inventory, '[]'),
        notes,
        combat, special_abilities, encounter_notes, weaknesses, sanity_loss,
        NULL, 1
      FROM module_npcs
      WHERE module_name = ?
    `
      )
      .run(sessionId, sessionId, moduleName);
    return result.changes;
  }

  /**
   * 从场景模板中解析并创建线索实例
   * 新架构: 线索存储在module_scenarios的clues字段(JSON)中
   */
  private copyClues(sessionId: string, moduleName: string): number {
    // 读取所有场景及其线索
    const scenarios = this.db
      .prepare(
        `
      SELECT template_scenario_id, location, clues
      FROM module_scenarios
      WHERE module_name = ?
    `
      )
      .all(moduleName) as Array<{
        template_scenario_id: string;
        location: string;
        clues: string;
      }>;

    let totalClues = 0;
    const insertStmt = this.db.prepare(`
      INSERT INTO scenario_clues (
        clue_id, session_id, snapshot_id, template_clue_id,
        clue_text, category, difficulty, clue_location, discovered
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    for (const scenario of scenarios) {
      if (!scenario.clues) continue;

      try {
        const clues = JSON.parse(scenario.clues) as Array<{
          text: string;
          category?: string;
          difficulty?: string;
          relatedTo?: string;
        }>;

        const snapshotId = `snapshot-${scenario.template_scenario_id}-${sessionId}`;

        for (let i = 0; i < clues.length; i++) {
          const clue = clues[i];
          if (!clue.text || clue.text.trim() === "") continue;

          const clueId = `clue-${scenario.template_scenario_id}-${i}-${sessionId}`;
          insertStmt.run(
            clueId,
            sessionId,
            snapshotId,
            `${scenario.template_scenario_id}-clue-${i}`,
            clue.text,
            clue.category || "general",
            clue.difficulty || "medium",
            scenario.location
          );
          totalClues++;
        }
      } catch (error) {
        console.error(`  ⚠️  解析场景 ${scenario.template_scenario_id} 的线索失败:`, error);
      }
    }

    return totalClues;
  }

  /**
   * 从NPC模板中解析并创建NPC关系实例
   * 新架构: NPC关系存储在module_npcs的relationships字段(JSON)中
   */
  private copyNPCRelationships(sessionId: string, moduleName: string): number {
    // 读取所有NPC及其关系
    const npcs = this.db
      .prepare(
        `
      SELECT template_npc_id, name, relationships
      FROM module_npcs
      WHERE module_name = ?
    `
      )
      .all(moduleName) as Array<{
        template_npc_id: string;
        name: string;
        relationships: string;
      }>;

    let totalRelationships = 0;
    const insertStmt = this.db.prepare(`
      INSERT INTO npc_relationships (
        id, session_id, source_id, target_id, target_name,
        relationship_type, attitude, description, history
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const npc of npcs) {
      if (!npc.relationships) continue;

      try {
        const relationshipsData = JSON.parse(npc.relationships);
        
        // 检查是数组还是对象格式
        let relationshipsList: Array<{
          targetName: string;
          relationshipType: string;
          attitude?: number;
          description?: string;
          history?: string;
        }> = [];

        if (Array.isArray(relationshipsData)) {
          // 标准数组格式: [{targetName, relationshipType, ...}]
          relationshipsList = relationshipsData;
        } else if (typeof relationshipsData === 'object' && relationshipsData !== null) {
          // 神话实体对象格式: {allies: [...], enemies: [...], neutral: [...]}
          // 转换为数组格式
          for (const [relationType, targets] of Object.entries(relationshipsData)) {
            if (Array.isArray(targets)) {
              for (const targetName of targets) {
                relationshipsList.push({
                  targetName: String(targetName),
                  relationshipType: relationType,
                  attitude: relationType === 'allies' ? 50 : relationType === 'enemies' ? -50 : 0,
                });
              }
            }
          }
        }

        const sourceId = `npc-${npc.template_npc_id}-${sessionId}`;

        for (const rel of relationshipsList) {
          const targetId = rel.targetName;
          const relType = rel.relationshipType || "acquaintance";
          
          // 跳过没有目标的关系
          if (!targetId) {
            console.warn(`  ⚠️  NPC ${npc.name} 的关系缺少目标ID,已跳过`);
            continue;
          }
          
          const relId = `rel-${npc.template_npc_id}-${targetId}-${sessionId}`;
          insertStmt.run(
            relId,
            sessionId,
            sourceId,
            targetId, // 目标可能是NPC ID或名称
            targetId,
            relType,
            rel.attitude || 0,
            rel.description || null,
            rel.history || null
          );
          totalRelationships++;
        }
      } catch (error) {
        console.error(`  ⚠️  解析NPC ${npc.name} 的关系失败:`, error);
      }
    }

    return totalRelationships;
  }

  /**
   * 获取session_id的游戏实例统计信息
   */
  getInstanceStats(sessionId: string): {
    scenarioCount: number;
    npcCount: number;
    clueCount: number;
    discoveredClueCount: number;
  } {
    const scenarios = this.db
      .prepare("SELECT COUNT(*) as count FROM scenarios WHERE session_id = ?")
      .get(sessionId) as { count: number };

    const npcs = this.db
      .prepare("SELECT COUNT(*) as count FROM characters WHERE session_id = ? AND is_npc = 1")
      .get(sessionId) as { count: number };

    const clues = this.db
      .prepare("SELECT COUNT(*) as count FROM scenario_clues WHERE session_id = ?")
      .get(sessionId) as { count: number };

    const discoveredClues = this.db
      .prepare("SELECT COUNT(*) as count FROM scenario_clues WHERE session_id = ? AND discovered = 1")
      .get(sessionId) as { count: number };

    return {
      scenarioCount: scenarios.count,
      npcCount: npcs.count,
      clueCount: clues.count,
      discoveredClueCount: discoveredClues.count
    };
  }
}
