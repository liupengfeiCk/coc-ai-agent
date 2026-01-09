import { Router } from 'express';
import { container } from '../container.js';
import { CoCDatabase } from '../../src/coc_multiagents_system/agents/memory/database/index.js';
import { GameInstanceManager, ModuleImporter } from '../../src/coc_multiagents_system/agents/memory/index.js';
import path from 'path';
import fs from "fs";
import { TemplateScenarioLoader } from '../../src/coc_multiagents_system/agents/memory/scenarioloader/templateScenarioLoader.js';
import { TemplateNPCLoader } from '../../src/coc_multiagents_system/agents/character/npcloader/templateNPCLoader.js';

const moduleRouter = Router();
moduleRouter.get("/", (req, res) => {
  try {
    // Initialize database if not already initialized
    let db = container.resolve("db") as CoCDatabase;

    const moduleImporter = new ModuleImporter(db);
    
    const modules = moduleImporter.listModules();
    
    res.json({
      success: true,
      modules,
      count: modules.length
    });
  } catch (error) {
    console.error("Error listing modules:", error);
    res.status(500).json({ error: "Failed to list modules: " + (error as Error).message });
  }
});

/**
 * 标准化名称（用于模糊匹配）
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ")
    .trim();
}

// POST /api/modules/import - 导入/覆盖导入模组
// POST /api/modules/import - 导入模组到模板表
moduleRouter.post("/import", async (req, res) => {
  try {
    // Initialize database if not already initialized
    let db = container.resolve("db") as CoCDatabase;

    const { moduleName, forceReimport = false } = req.body;
    
    if (!moduleName) {
      return res.status(400).json({ error: "moduleName is required" });
    }

    // 查找模组目录
    const modsDir = path.join(process.cwd(), "data", "Mods");
    const moduleDirs = fs.readdirSync(modsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    
    const matchedDir = moduleDirs.find(dir => 
      normalizeName(dir) === normalizeName(moduleName) ||
      dir.toLowerCase().includes(moduleName.toLowerCase())
    );
    
    if (!matchedDir) {
      return res.status(404).json({ error: `Module ${moduleName} not found in Mods directory` });
    }

    // Check if module already imported (if not forcing reimport)
    if (!forceReimport) {
      const database = db.getDatabase();
      const existingScenarios = database.prepare(
        "SELECT COUNT(*) as count FROM module_scenarios WHERE module_name = ?"
      ).get(matchedDir) as { count: number };
      
      const existingNPCs = database.prepare(
        "SELECT COUNT(*) as count FROM module_npcs WHERE module_name = ?"
      ).get(matchedDir) as { count: number };

      if (existingScenarios.count > 0 || existingNPCs.count > 0) {
        console.log(`✓ Module ${matchedDir} already imported (${existingScenarios.count} scenarios, ${existingNPCs.count} NPCs), skipping...`);
        return res.json({
          success: true,
          message: `Module ${matchedDir} already imported, skipped`,
          moduleName: matchedDir,
          scenarioCount: existingScenarios.count,
          npcCount: existingNPCs.count,
          alreadyImported: true
        });
      }
    }
    
    const modulePath = path.join(modsDir, matchedDir);
    
    // 扫描子目录查找场景和NPC文件
    const subdirs = fs.readdirSync(modulePath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    console.log(`📂 Scanning module subdirectories: ${subdirs.join(", ")}`);

    // 查找场景目录
    const scenarioDirs = subdirs.filter(name => 
      name.toLowerCase().includes("scenario")
    );
    
    // 查找NPC目录
    const npcDirs = subdirs.filter(name => 
      name.toLowerCase().includes("npc")
    );

    // 使用已测试过的Loader导入
    const scenarioLoader = new TemplateScenarioLoader(db);
    const npcLoader = new TemplateNPCLoader(db);
    
    let scenarioCount = 0;
    let npcCount = 0;
    
    // 加载场景
    if (scenarioDirs.length > 0) {
      for (const scenarioDirName of scenarioDirs) {
        const scenariosDir = path.join(modulePath, scenarioDirName);
        await scenarioLoader.loadScenariosToTemplate(scenariosDir, matchedDir);
        const files = fs.readdirSync(scenariosDir).filter(f => f.endsWith(".json"));
        scenarioCount += files.length;
      }
    }
    
    // 加载NPC
    if (npcDirs.length > 0) {
      for (const npcDirName of npcDirs) {
        const npcsDir = path.join(modulePath, npcDirName);
        await npcLoader.loadNPCsToTemplate(npcsDir, matchedDir);
        const files = fs.readdirSync(npcsDir).filter(f => f.endsWith(".json"));
        npcCount += files.length;
      }
    }
    
    res.json({
      success: true,
      message: `Module ${matchedDir} imported successfully`,
      moduleName: matchedDir,
      scenarioCount: scenarioCount,
      npcCount: npcCount,
      alreadyImported: false
    });
  } catch (error) {
    console.error("Error importing module:", error);
    res.status(500).json({ error: "Failed to import module: " + (error as Error).message });
  }
});

// POST /api/game/create-instance - 从模板表创建游戏实例
moduleRouter.post("/create-instance", async (req, res) => {
  try {
    // Initialize database if not already initialized
    let db = container.resolve("db") as CoCDatabase;

    const { sessionId, moduleName, characterId } = req.body;
    
    if (!sessionId || !moduleName || !characterId) {
      return res.status(400).json({ 
        error: "sessionId, moduleName and characterId are required" 
      });
    }

    // 使用GameInstanceManager创建实例
    const gameInstanceManager = new GameInstanceManager(db);
    
    console.log(`Creating game instance: session=${sessionId}, module=${moduleName}, character=${characterId}`);
    
    await gameInstanceManager.createGameInstance(sessionId, moduleName, characterId);
    
    res.json({
      success: true,
      message: `Game instance created successfully`,
      sessionId,
      moduleName,
      characterId
    });
  } catch (error) {
    console.error("Error creating game instance:", error);
    res.status(500).json({ 
      error: "Failed to create game instance: " + (error as Error).message 
    });
  }
});

// DELETE /api/modules/:moduleName - 删除模组模板
moduleRouter.delete("/:moduleName", async (req, res) => {
  try {
    // Initialize database if not already initialized
    let db = container.resolve("db") as CoCDatabase;

    const { moduleName } = req.params;
    
    if (!moduleName) {
      return res.status(400).json({ error: "moduleName is required" });
    }

    const moduleImporter = new ModuleImporter(db);
    
    await moduleImporter.deleteModule(moduleName);
    
    res.json({
      success: true,
      message: `Module ${moduleName} deleted successfully`,
      moduleName
    });
  } catch (error) {
    console.error("Error deleting module:", error);
    res.status(500).json({ error: "Failed to delete module: " + (error as Error).message });
  }
});

export default moduleRouter;