/**
 * Template NPC Loader
 * 专门用于将模组NPC导入到模板表 (module_npcs)
 */

import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import type { CoCDatabase } from "../../../agents/memory/database/schema.js";

export class TemplateNPCLoader {
  private db: CoCDatabase;

  constructor(db: CoCDatabase) {
    this.db = db;
  }

  /**
   * 从JSON目录加载NPC到模板表
   * @param dirPath JSON文件目录
   * @param moduleName 模组名称
   */
  async loadNPCsToTemplate(dirPath: string, moduleName: string): Promise<void> {
    console.log(`\n📦 [TemplateNPCLoader] 加载NPC到模板表: ${moduleName}`);

    if (!fs.existsSync(dirPath)) {
      console.log(`❌ 目录不存在: ${dirPath}`);
      return;
    }

    const files = fs.readdirSync(dirPath);
    const jsonFiles = files.filter((f) => f.toLowerCase().endsWith(".json"));

    if (jsonFiles.length === 0) {
      console.log("⚠️  未找到JSON文件");
      return;
    }

    console.log(`📋 找到 ${jsonFiles.length} 个NPC文件`);

    const database = this.db.getDatabase();

    // 先删除该模组的旧NPC数据
    this.db.transaction(() => {
      database.prepare("DELETE FROM module_npcs WHERE module_name = ?").run(moduleName);
    });

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < jsonFiles.length; i++) {
      const file = jsonFiles[i];
      try {
        console.log(`  [${i + 1}/${jsonFiles.length}] 加载: ${file}`);
        const filePath = path.join(dirPath, file);
        const fileContent = fs.readFileSync(filePath, "utf-8");
        const jsonData = JSON.parse(fileContent);

        const npcs = Array.isArray(jsonData) ? jsonData : [jsonData];

        for (const npcData of npcs) {
          try {
            this.saveNPCToTemplate(npcData, moduleName);
            successCount++;
            console.log(`    ✓ ${npcData.name || '未命名'}`);
          } catch (error) {
            errorCount++;
            console.error(`    ✗ 失败: ${npcData.name}`, error);
          }
        }
      } catch (error) {
        errorCount++;
        console.error(`  ✗ 文件解析失败: ${file}`, error);
      }
    }

    console.log(`\n✅ NPC导入完成: 成功 ${successCount}, 失败 ${errorCount}\n`);
  }

  /**
   * 保存NPC到模板表
   */
  private saveNPCToTemplate(npcData: any, moduleName: string): void {
    const database = this.db.getDatabase();
    const templateNpcId = `template-npc-${randomUUID()}`;

    const stmt = database.prepare(`
      INSERT INTO module_npcs (
        template_npc_id, module_name, name, occupation, age, gender,
        appearance, description, personality, background, goals, secrets, 
        attributes, status, skills, inventory, relationships, clues, notes,
        combat, special_abilities, encounter_notes, weaknesses, sanity_loss, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      templateNpcId,
      moduleName,
      npcData.name || "未命名NPC",
      npcData.occupation || null,
      npcData.age || null,
      npcData.gender || null,
      npcData.appearance || null,
      npcData.description || null,
      npcData.personality || null,
      npcData.background || null,
      JSON.stringify(npcData.goals || []),
      JSON.stringify(npcData.secrets || []),
      JSON.stringify(npcData.attributes || {}),
      JSON.stringify(npcData.status || {}),
      JSON.stringify(npcData.skills || {}),
      JSON.stringify(npcData.inventory || []),
      JSON.stringify(npcData.relationships || []),
      JSON.stringify(npcData.clues || []),
      npcData.notes || null,
      JSON.stringify(npcData.combat || null),
      JSON.stringify(npcData.special_abilities || null),
      npcData.encounter_notes || null,
      JSON.stringify(npcData.weaknesses || null),
      JSON.stringify(npcData.sanity_loss || null),
      JSON.stringify({
        createdAt: new Date().toISOString(),
        source: "module",
      })
    );
  }
}
