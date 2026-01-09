import { Router } from 'express';
import path from "path";
import fs from "fs";
import { CoCDatabase, seedDatabase } from "../../src/coc_multiagents_system/agents/memory/database/index.js";
import { container } from '../container.js';
import { TemplateScenarioLoader } from '../../src/coc_multiagents_system/agents/memory/scenarioloader/templateScenarioLoader.js';
import { TemplateNPCLoader } from '../../src/coc_multiagents_system/agents/character/npcloader/templateNPCLoader.js';
import { ModuleLoader } from '../../src/coc_multiagents_system/agents/memory/moduleloader/index.js';
import express from "express";

const modRouter = Router();

function sendProgress(res: express.Response, useSSE: boolean, stage: string, progress: number, message: string) {
  if (useSSE) {
    res.write(`data: ${JSON.stringify({ stage, progress, message })}\n\n`);
  }
}


modRouter.post("/load", async (req, res) => {
  // Check if client wants SSE streaming (via Accept header or query param)
  const useSSE = req.headers.accept?.includes('text/event-stream') || req.query.stream === 'true';
  let db = container.resolve('db') as CoCDatabase
  
  if (useSSE) {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering in nginx
  }

  try {
    const { modName } = req.body;

    if (!modName || typeof modName !== 'string') {
      if (useSSE) {
        sendProgress(res, useSSE, "错误", 0, "modName 参数必需");
        res.end();
      } else {
        return res.status(400).json({ error: "modName is required" });
      }
      return;
    }

    console.log(`[${new Date().toISOString()}] Loading mod data: ${modName}`);

    sendProgress(res, useSSE, "初始化", 5, "正在初始化数据库...");

    sendProgress(res, useSSE, "初始化", 10, "正在初始化加载器...");

    // 使用新架构的模板加载器
    const templateScenarioLoader = container.resolve('templateScenarioLoader') as TemplateScenarioLoader;
    const templateNpcLoader = container.resolve('templateNpcLoader') as TemplateNPCLoader;
    const moduleLoader = container.resolve('moduleLoader') as ModuleLoader;

    const modsDir = path.join(process.cwd(), "data", "Mods");
    if (!fs.existsSync(modsDir)) {
      const error = "Mods directory does not exist";
      if (useSSE) {
        sendProgress(res, useSSE, "错误", 0, error);
        res.end();
      } else {
        return res.status(404).json({ error });
      }
      return;
    }

    const dirs = fs.readdirSync(modsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory() && !dirent.name.startsWith('.'))
      .map(dirent => dirent.name);
    const modDir = dirs.find(d => d === modName);
    if (!modDir) {
      const error = `Mod "${modName}" not found`;
      if (useSSE) {
        sendProgress(res, useSSE, "错误", 0, error);
        res.end();
      } else {
        return res.status(404).json({ error });
      }
      return;
    }

    const modPath = path.join(modsDir, modDir);

    sendProgress(res, useSSE, "扫描", 15, "正在扫描模组文件夹...");

    // Scan subdirectories and match by name patterns
    const subdirs = fs.readdirSync(modPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    console.log(`📂 扫描模组子文件夹: ${subdirs.join(", ")}`);

      // Find directories by name patterns (case-insensitive)
      const scenarioDirs = subdirs.filter(name => 
        name.toLowerCase().includes("scenario")
      );
      const npcDirs = subdirs.filter(name => 
        name.toLowerCase().includes("npc")
      );
      const backgroundDirs = subdirs.filter(name => 
        name.toLowerCase().includes("background") ||
        name.toLowerCase().includes("module") ||
        name.toLowerCase().includes("briefing")
      );
      const knowledgeDirs = subdirs.filter(name => 
        name.toLowerCase() === "knowledge"
      );

    let scenariosLoaded = 0;
    let npcsLoaded = 0;
    let modulesLoaded = 0;

    const totalSteps = (scenarioDirs.length > 0 ? 1 : 0) + 
                       (npcDirs.length > 0 ? 1 : 0) + 
                       (backgroundDirs.length > 0 ? 1 : 0) + 
                       (knowledgeDirs.length > 0 ? 1 : 0);
    let currentStep = 0;

    // Load scenarios
    if (scenarioDirs.length > 0) {
      currentStep++;
      const stepProgress = 15 + (currentStep / (totalSteps + 1)) * 65;
      sendProgress(res, useSSE, "加载场景", stepProgress, "正在加载场景数据...");
      console.log(`\n📋 [1/${totalSteps}] 加载场景数据到模板表...`);
      for (const scenarioDirName of scenarioDirs) {
        const scenariosDir = path.join(modPath, scenarioDirName);
        console.log(`   → 从文件夹加载场景: ${scenarioDirName}`);
        try {
          await templateScenarioLoader.loadScenariosToTemplate(scenariosDir, modName);
          console.log(`   ✓ 场景已加载到模板表`);
          sendProgress(res, useSSE, "加载场景", stepProgress, `场景已加载到模板表`);
        } catch (error) {
          console.error(`   ✗ 加载场景失败 ${scenarioDirName}:`, error);
        }
      }
    } else {
      console.log(`\n📋 [1/${totalSteps}] 未找到场景文件夹（包含"scenario"的文件夹）`);
    }

    // Load NPCs to template table
    if (npcDirs.length > 0) {
      currentStep++;
      const stepProgress = 15 + (currentStep / (totalSteps + 1)) * 65;
      sendProgress(res, useSSE, "加载NPC", stepProgress, "正在加载NPC数据...");
      console.log(`\n👥 [2/${totalSteps}] 加载NPC数据到模板表...`);
      for (const npcDirName of npcDirs) {
        const npcsDir = path.join(modPath, npcDirName);
        console.log(`   → 从文件夹加载NPC: ${npcDirName}`);
        try {
          await templateNpcLoader.loadNPCsToTemplate(npcsDir, modName);
          console.log(`   ✓ NPC已加载到模板表`);
          sendProgress(res, useSSE, "加载NPC", stepProgress, `NPC已加载到模板表`);
        } catch (error) {
          console.error(`   ✗ 加载NPC失败 ${npcDirName}:`, error);
        }
      }
    } else {
      console.log(`\n👥 [2/${totalSteps}] 未找到NPC文件夹（包含"npc"的文件夹）`);
    }

      // Load modules/background
      if (backgroundDirs.length > 0) {
        currentStep++;
        const stepProgress = 15 + (currentStep / (totalSteps + 1)) * 65;
        sendProgress(res, useSSE, "加载模块", stepProgress, "正在加载模块数据...");
        console.log(`\n📚 [3/${totalSteps}] 加载模块数据...`);
        for (const backgroundDirName of backgroundDirs) {
          const moduleDir = path.join(modPath, backgroundDirName);
          console.log(`   → 从文件夹加载模块: ${backgroundDirName}`);
          try {
            const jsonFiles = fs.readdirSync(moduleDir).filter(f => f.toLowerCase().endsWith('.json'));
            let modules: any[] = [];
            if (jsonFiles.length > 0) {
              modules = await moduleLoader.loadModulesFromJSONDirectory(moduleDir, false); // false = don't force reload
            } else {
              modules = await moduleLoader.loadModulesFromDirectory(moduleDir, false); // false = don't force reload
            }
          modulesLoaded += modules.length;
          console.log(`   ✓ 已加载 ${modules.length} 个模块`);
          sendProgress(res, useSSE, "加载模块", stepProgress, `已加载 ${modulesLoaded} 个模块`);
        } catch (error) {
          console.error(`   ✗ 加载模块失败 ${backgroundDirName}:`, error);
        }
      }
    } else {
      console.log(`\n📚 [3/${totalSteps}] 未找到模块文件夹（包含"background"或"module"的文件夹）`);
    }

      // RAG 知识库由 RagManager 构建，不再处理 legacy knowledge 目录

    console.log(`\n${"=".repeat(60)}`);
    console.log(`✅ 模组数据加载完成！`);
    console.log(`   - 场景: ${scenariosLoaded}`);
    console.log(`   - NPC: ${npcsLoaded}`);
    console.log(`   - 模块: ${modulesLoaded}`);
    console.log(`   - RAG知识库: ${knowledgeDirs.length > 0 ? "已处理" : "未找到"}`);
    console.log(`${"=".repeat(60)}\n`);

    const result = {
      success: true,
      message: `模组数据加载完成：${scenariosLoaded} 个场景，${npcsLoaded} 个NPC，${modulesLoaded} 个模块`,
      scenariosLoaded,
      npcsLoaded,
      modulesLoaded,
      timestamp: new Date().toISOString(),
    };

    if (useSSE) {
      sendProgress(res, useSSE, "完成", 100, `已加载 ${scenariosLoaded} 个场景，${npcsLoaded} 个NPC，${modulesLoaded} 个模块`);
      res.write(`data: ${JSON.stringify({ ...result, stage: "完成", progress: 100 })}\n\n`);
      res.end();
    } else {
      res.json(result);
    }
  } catch (error) {
    console.error("Error loading mod data:", error);
    const errorMessage = "Failed to load mod data: " + (error as Error).message;
    if (useSSE) {
      sendProgress(res, useSSE, "错误", 0, errorMessage);
      res.end();
    } else {
      res.status(500).json({ error: errorMessage });
    }
  }
});

modRouter.get("/introduction", async (req, res) => {
  try {
    let db = container.resolve('db') as CoCDatabase
    const { modName } = req.query;

    if (!modName || typeof modName !== 'string') {
      return res.status(400).json({ error: "modName is required" });
    }

    console.log(`[${new Date().toISOString()}] Getting module introduction for: ${modName}`);

    // Load module data
    const moduleLoader = container.resolve('moduleLoader') as ModuleLoader;

    const modsDir = path.join(process.cwd(), "data", "Mods");
    if (!fs.existsSync(modsDir)) {
      return res.status(404).json({ error: "Mods directory does not exist" });
    }

    const dirs = fs.readdirSync(modsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory() && !dirent.name.startsWith('.'))
      .map(dirent => dirent.name);
    const modDir = dirs.find(d => d === modName);
    if (!modDir) {
      return res.status(404).json({ error: `Mod "${modName}" not found` });
    }

    const modPath = path.join(modsDir, modDir);

    // Scan subdirectories and match by name patterns
    const subdirs = fs.readdirSync(modPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    // Try to load module_digest.json first
    const moduleDigestPath = path.join(modPath, "module_digest.json");
    if (fs.existsSync(moduleDigestPath)) {
      console.log(`📚 Loading module from: ${moduleDigestPath}`);
      await moduleLoader.loadModuleFromJSON(moduleDigestPath);
    } else {
      // Fallback to loading from directory
      const backgroundDirs = subdirs.filter(name =>
        name.toLowerCase().includes("background") ||
        name.toLowerCase().includes("module") ||
        name.toLowerCase().includes("briefing")
      );

      if (backgroundDirs.length > 0) {
        const backgroundPath = path.join(modPath, backgroundDirs[0]);
        console.log(`📚 Loading module from: ${backgroundPath}`);
        await moduleLoader.loadModulesFromDirectory(backgroundPath);
      }
    }

    // Get module and generate introduction
    const modules = moduleLoader.getAllModules();
    if (modules.length === 0) {
      return res.status(404).json({ error: "No module data found" });
    }

    const module = modules[0];
    console.log(`   → 使用模组: ${module.title}`);

    // Get introduction and moduleNotes from module (generated automatically during load)
    const moduleIntroduction: { introduction: string; moduleNotes: string } | null = 
      module.introduction ? { 
        introduction: module.introduction,
        moduleNotes: module.moduleNotes || ""
      } : null;
    res.json({
      success: true,
      moduleIntroduction: moduleIntroduction,
      moduleTitle: module.title,
    });
  } catch (error) {
    console.error("Error getting module introduction:", error);
    res.status(500).json({ error: "Failed to get module introduction: " + (error as Error).message });
  }
});

export default modRouter;