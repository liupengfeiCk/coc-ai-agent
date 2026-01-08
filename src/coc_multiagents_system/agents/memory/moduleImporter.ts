/**
 * 模组导入器 (Module Importer)
 * 负责将模组数据导入到模板表 (module_* tables)
 * 支持覆盖导入和模组管理
 */

import type { CoCDatabase } from "./database/schema.js";

type DatabaseInstance = ReturnType<CoCDatabase["getDatabase"]>;

export interface ModuleInfo {
  moduleName: string;
  importedAt: string;
  lastUpdated: string;
  scenarioCount: number;
  npcCount: number;
  clueCount: number;
}

export class ModuleImporter {
  private db: DatabaseInstance;

  constructor(database: CoCDatabase) {
    this.db = database.getDatabase();
  }

  /**
   * 导入模组到模板表 (支持重复覆盖导入)
   * @param moduleName 模组名称
   * @param scenarios 场景数据
   * @param npcs NPC数据
   * @param forceReimport 是否强制重新导入 (默认true,覆盖已有模组)
   */
  async importModule(
    moduleName: string,
    scenarios: any[],
    npcs: any[],
    forceReimport = true
  ): Promise<void> {
    console.log(`📦 开始导入模组: ${moduleName}`);

    // 1. 检查是否已导入
    const isImported = this.isModuleImported(moduleName);

    if (isImported) {
      if (!forceReimport) {
        console.log(`✅ 模组 ${moduleName} 已存在,跳过导入`);
        return;
      }

      // 覆盖导入:先删除旧模组
      console.log(`🔄 模组 ${moduleName} 已存在,执行覆盖导入...`);
      await this.deleteModuleTemplate(moduleName);
    }

    // 2. 插入模板表 (所有数据都在JSON中,包括快照、线索等)
    const scenarioCount = await this.insertScenarioTemplates(moduleName, scenarios);
    const npcCount = await this.insertNPCTemplates(moduleName, npcs);

    console.log(
      `✅ 模组 ${moduleName} 导入完成 (场景:${scenarioCount}, NPC:${npcCount})`
    );
  }

  /**
   * 列出所有已导入的模组
   */
  listModules(): ModuleInfo[] {
    const stmt = this.db.prepare(`
      SELECT 
        s.module_name,
        MIN(s.created_at) as imported_at,
        MAX(s.created_at) as last_updated,
        COUNT(DISTINCT s.template_scenario_id) as scenario_count,
        COUNT(DISTINCT n.template_npc_id) as npc_count
      FROM module_scenarios s
      LEFT JOIN module_npcs n ON s.module_name = n.module_name
      GROUP BY s.module_name
      ORDER BY last_updated DESC
    `);
    
    const rows = stmt.all() as any[];
    return rows.map(row => ({
      moduleName: row.module_name,
      importedAt: row.imported_at,
      lastUpdated: row.last_updated,
      scenarioCount: row.scenario_count,
      npcCount: row.npc_count,
      clueCount: 0 // 线索存在JSON中,不单独统计
    }));
  }

  /**
   * 检查模组是否已导入
   */
  private isModuleImported(moduleName: string): boolean {
    const stmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM module_scenarios WHERE module_name = ?"
    );
    const result = stmt.get(moduleName) as { count: number };
    return result.count > 0;
  }

  /**
   * 删除模组模板 (仅删除模板,不影响已创建的游戏实例)
   * ⚠️ 注意:已创建的游戏实例不受影响,可以继续游戏
   */
  private async deleteModuleTemplate(moduleName: string): Promise<void> {
    // 只需要删除两张主表
    this.db.prepare("DELETE FROM module_scenarios WHERE module_name = ?").run(moduleName);
    this.db.prepare("DELETE FROM module_npcs WHERE module_name = ?").run(moduleName);

    console.log(`🗑️  模组模板 ${moduleName} 已删除`);
  }

  /**
   * 公开的删除接口 (用户主动删除模组)
   */
  async deleteModule(moduleName: string): Promise<void> {
    // 检查是否有游戏实例依赖此模组
    const instanceCount = this.getModuleInstanceCount(moduleName);

    if (instanceCount > 0) {
      console.warn(`⚠️  警告: 模组 ${moduleName} 有 ${instanceCount} 个游戏实例正在使用`);
      console.warn(`删除模板不会影响已创建的游戏,但无法再创建新游戏`);
    }

    await this.deleteModuleTemplate(moduleName);
  }

  /**
   * 获取使用该模组的游戏实例数量
   */
  private getModuleInstanceCount(moduleName: string): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(DISTINCT session_id) as count 
      FROM scenarios 
      WHERE template_scenario_id IN (
        SELECT template_scenario_id 
        FROM module_scenarios 
        WHERE module_name = ?
      )
    `);
    const result = stmt.get(moduleName) as { count: number };
    return result.count;
  }

  /**
   * 插入场景模板 (包含快照、线索等所有数据在JSON中)
   */
  private async insertScenarioTemplates(moduleName: string, scenarios: any[]): Promise<number> {
    if (!scenarios || scenarios.length === 0) return 0;

    const stmt = this.db.prepare(`
      INSERT INTO module_scenarios (
        template_scenario_id, module_name, name, location, description, 
        characters, clues, conditions, events, exits, keeper_notes, 
        tags, connections, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let count = 0;
    for (const scenario of scenarios) {
      // 场景数据可能有两种结构:
      // 1. 直接包含所有字段
      // 2. 部分字段在snapshot子对象中
      const snapshot = scenario.snapshot || {};
      
      stmt.run(
        scenario.id,
        moduleName,
        scenario.name || snapshot.name || "未命名场景",
        snapshot.location || "",
        scenario.description || snapshot.description || "",
        JSON.stringify(snapshot.characters || []),
        JSON.stringify(snapshot.clues || []),
        JSON.stringify(snapshot.conditions || []),
        JSON.stringify(snapshot.events || []),
        JSON.stringify(snapshot.exits || []),
        snapshot.keeperNotes || snapshot.keeper_notes || null,
        JSON.stringify(scenario.tags || []),
        JSON.stringify(scenario.connections || []),
        JSON.stringify(scenario.metadata || {})
      );
      count++;
    }

    return count;
  }

  /**
   * 插入NPC模板
   */
  private async insertNPCTemplates(moduleName: string, npcs: any[]): Promise<number> {
    if (!npcs || npcs.length === 0) return 0;

    const stmt = this.db.prepare(`
      INSERT INTO module_npcs (
        template_npc_id, module_name, name, occupation, age, gender,
        appearance, description, personality, background, goals, secrets,
        attributes, status, skills, inventory, relationships, clues, notes,
        combat, special_abilities, encounter_notes, weaknesses, sanity_loss, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let count = 0;
    for (const npc of npcs) {
      stmt.run(
        npc.id,
        moduleName,
        npc.name,
        npc.occupation || null,
        npc.age || null,
        npc.gender || null,
        npc.appearance || null,
        npc.description || null,
        npc.personality || null,
        npc.background || null,
        JSON.stringify(npc.goals || []),
        JSON.stringify(npc.secrets || []),
        JSON.stringify(npc.attributes || {}),
        JSON.stringify(npc.status || {}),
        JSON.stringify(npc.skills || {}),
        JSON.stringify(npc.inventory || []),
        JSON.stringify(npc.relationships || []),
        JSON.stringify(npc.clues || []),
        npc.notes || null,
        JSON.stringify(npc.combat || null),
        JSON.stringify(npc.special_abilities || null),
        npc.encounter_notes || null,
        JSON.stringify(npc.weaknesses || null),
        JSON.stringify(npc.sanity_loss || null),
        JSON.stringify(npc.metadata || {})
      );
      count++;
    }

    return count;
  }
}
