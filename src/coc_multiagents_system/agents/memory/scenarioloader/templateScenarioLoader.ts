/**
 * Template Scenario Loader
 * 专门用于将模组场景导入到模板表 (module_scenarios)
 * 场景的全部信息存储在一个表中
 */

import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import type { CoCDatabase } from "../database/schema.js";
import type {
  ParsedScenarioData,
} from "../../models/scenarioTypes.js";
import { ScenarioDocumentParser } from "./scenarioDocumentParser.js";

export class TemplateScenarioLoader {
  private db: CoCDatabase;
  private parser: ScenarioDocumentParser;

  constructor(db: CoCDatabase, parser?: ScenarioDocumentParser) {
    this.db = db;
    this.parser = parser || new ScenarioDocumentParser();
  }

  /**
   * 从JSON目录加载场景到模板表
   * @param dirPath JSON文件目录
   * @param moduleName 模组名称
   */
  async loadScenariosToTemplate(dirPath: string, moduleName: string): Promise<void> {
    console.log(`\n📦 [TemplateLoader] 加载场景到模板表: ${moduleName}`);

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

    console.log(`📋 找到 ${jsonFiles.length} 个场景文件`);

    const database = this.db.getDatabase();

    // 先删除该模组的旧场景数据
    this.db.transaction(() => {
      database.prepare("DELETE FROM module_scenarios WHERE module_name = ?").run(moduleName);
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

        const scenarios: ParsedScenarioData[] = Array.isArray(jsonData) ? jsonData : [jsonData];

        for (const parsedData of scenarios) {
          try {
            this.saveScenarioToTemplate(parsedData, moduleName);
            successCount++;
            console.log(`    ✓ ${parsedData.name}`);
          } catch (error) {
            errorCount++;
            console.error(`    ✗ 失败: ${parsedData.name}`, error);
          }
        }
      } catch (error) {
        errorCount++;
        console.error(`  ✗ 文件解析失败: ${file}`, error);
      }
    }

    console.log(`\n✅ 场景导入完成: 成功 ${successCount}, 失败 ${errorCount}\n`);
  }

  /**
   * 保存场景到模板表 - 所有信息存在一个表
   */
  private saveScenarioToTemplate(parsedData: ParsedScenarioData, moduleName: string): void {
    const database = this.db.getDatabase();
    const templateScenarioId = `template-scenario-${randomUUID()}`;

    // 处理快照数据,取默认快照的信息(或第一个快照)
    let snapshotData: any;
    if (parsedData.snapshots && parsedData.snapshots.length > 0) {
      // 优先取没有时间限制的快照
      snapshotData = parsedData.snapshots.find((s: any) => !s.timeRestriction) || parsedData.snapshots[0];
    } else if (parsedData.snapshot) {
      snapshotData = parsedData.snapshot;
    } else {
      throw new Error(`场景 "${parsedData.name}" 没有快照数据`);
    }

    // 合并所有快照的线索(去重)
    const allClues: any[] = [];
    const clueTexts = new Set<string>();
    
    if (parsedData.snapshots && parsedData.snapshots.length > 0) {
      for (const snapshot of parsedData.snapshots) {
        if (snapshot.clues) {
          for (const clue of snapshot.clues) {
            const text = clue.text || clue.clueText; // 兼容两种字段名
            if (text && text.trim() !== '' && !clueTexts.has(text)) {
              clueTexts.add(text);
              allClues.push({
                text: text,
                category: clue.category,
                difficulty: clue.difficulty,
                location: clue.location,
                discoveryMethod: clue.discoveryMethod,
                reveals: clue.reveals,
              });
            }
          }
        }
      }
    } else if (snapshotData.clues) {
      for (const clue of snapshotData.clues) {
        const text = clue.text || clue.clueText; // 兼容两种字段名
        if (text && text.trim() !== '') {
          allClues.push({
            text: text,
            category: clue.category,
            difficulty: clue.difficulty,
            location: clue.location,
            discoveryMethod: clue.discoveryMethod,
            reveals: clue.reveals,
          });
        }
      }
    }

    this.db.transaction(() => {
      // 插入场景到 module_scenarios - 包含所有信息
      const scenarioStmt = database.prepare(`
        INSERT INTO module_scenarios (
          template_scenario_id, module_name, name, location, description,
          characters, clues, conditions, events, exits, keeper_notes,
          tags, connections, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      scenarioStmt.run(
        templateScenarioId,
        moduleName,
        parsedData.name,
        snapshotData.location || parsedData.name,
        snapshotData.description || parsedData.description,
        JSON.stringify(snapshotData.characters || []),
        JSON.stringify(allClues),
        JSON.stringify(snapshotData.conditions || []),
        JSON.stringify(snapshotData.events || []),
        JSON.stringify(snapshotData.exits || []),
        snapshotData.keeperNotes || null,
        JSON.stringify(parsedData.tags || []),
        JSON.stringify(parsedData.connections || []),
        JSON.stringify({
          createdAt: new Date().toISOString(),
          gameSystem: "CoC 7e",
          hasMultipleSnapshots: parsedData.snapshots && parsedData.snapshots.length > 1,
          snapshotCount: parsedData.snapshots ? parsedData.snapshots.length : 1,
        })
      );
    });
  }
}
