import { container } from "../container.js";
import { Router } from 'express';
import express from "express";
import { CoCDatabase, seedDatabase } from "../../src/coc_multiagents_system/agents/memory/database/index.js";
import path from "path";
import fs from "fs";
import { TemplateScenarioLoader } from '../../src/coc_multiagents_system/agents/memory/scenarioloader/templateScenarioLoader.js';
import { TemplateNPCLoader } from '../../src/coc_multiagents_system/agents/character/npcloader/templateNPCLoader.js';
import { ModuleLoader } from '../../src/coc_multiagents_system/agents/memory/moduleloader/index.js';
import { ScenarioLoader } from "../../src/coc_multiagents_system/agents/memory/scenarioloader/index.js";
import { NPCLoader } from "../../src/coc_multiagents_system/agents/character/npcloader/index.js";
import { createBgeSqliteRagManager, RagManager } from "../../src/coc_multiagents_system/agents/memory/RagManager.js";
import { initialGameState, type GameState } from "../../src/state.js";
import { buildGraph, buildListenerGraph, type GraphState } from "../../src/graph.js";
import { TurnManager } from "../../src/coc_multiagents_system/agents/memory/index.js";
import { randomUUID, createHash } from "crypto";
import { GameInstanceManager } from "../../src/coc_multiagents_system/agents/memory/gameInstanceManager.js";
import type { ScenarioProfile } from "../../src/coc_multiagents_system/agents/models/scenarioTypes.js";


const gameRouter = Router();
const db = container.resolve('db') as CoCDatabase
// TODO: 暂时跳过RAG环节
const SKIP_RAG = true; // 设置为 false 以启用 RAG
let graph = container.resolve('graph') as any;
let ragManager = container.resolve('ragManager') as any;
let scenarioLoader = container.resolve('scenarioLoader') as any;
let npcLoader = container.resolve('npcLoader') as any;
let moduleLoader = container.resolve('moduleLoader') as any;
let listenerGraph = container.resolve('listenerGraph') as any;
let turnManager = container.resolve('turnManager') as any;
let templateScenarioLoader = container.resolve('templateScenarioLoader') as any;
let templateNpcLoader = container.resolve('templateNpcLoader') as any;


gameRouter.post("/import-data", async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] Starting data import...`);

    // Helper function to find Cassandra mod directory (handles different quote characters)
    const findCassandraModDir = (): string | null => {
      const modsDir = path.join(process.cwd(), "data", "Mods");
      if (!fs.existsSync(modsDir)) {
        return null;
      }
      const dirs = fs.readdirSync(modsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory() && !dirent.name.startsWith('.'))
        .map(dirent => dirent.name);
      const cassandraDir = dirs.find(d => d.includes("Cassandra") && d.includes("Black Carnival"));
      return cassandraDir ? path.join(modsDir, cassandraDir) : null;
    };

    const cassandraModDir = findCassandraModDir();

    let scenariosLoaded = 0;
    if (cassandraModDir) {
      const cassandraScenariosDir = path.join(cassandraModDir, "Cassandra's_Scenarios");
      if (fs.existsSync(cassandraScenariosDir)) {
        const modName = "Cassandra's Black Carnival";
        await templateScenarioLoader.loadScenariosToTemplate(cassandraScenariosDir, modName);
        console.log(`Scenarios loaded to template table`);
      } else {
        console.log("Cassandra's_Scenarios directory not found, skipping scenario import");
      }
    } else {
      console.log("Cassandra mod directory not found, skipping scenario import");
    }

    let npcsLoaded = 0;
    if (cassandraModDir) {
      const cassandraNPCsDir = path.join(cassandraModDir, "Cassandra's_npc");
      if (fs.existsSync(cassandraNPCsDir)) {
        const modName = "Cassandra's Black Carnival";
        await templateNpcLoader.loadNPCsToTemplate(cassandraNPCsDir, modName);
        console.log(`NPCs loaded to template table`);
        console.log(`Loaded ${npcsLoaded} NPCs`);
      } else {
        console.log("Cassandra's_npc directory not found, skipping NPC import");
      }
    } else {
      console.log("Cassandra mod directory not found, skipping NPC import");
    }

    // Load modules from JSON files (skip document parsing if JSON exists)
    let modulesLoaded = 0;
    if (cassandraModDir) {
      // Try to load module_digest.json first
      const moduleDigestPath = path.join(cassandraModDir, "module_digest.json");
      if (fs.existsSync(moduleDigestPath)) {
        const modules = await moduleLoader.loadModuleFromJSON(moduleDigestPath);
        modulesLoaded = modules.length;
        console.log(`Loaded ${modulesLoaded} modules from module_digest.json`);
      } else {
        // Fallback to loading from background directory
        const moduleDir = path.join(cassandraModDir, "background");
        if (fs.existsSync(moduleDir)) {
          // Try JSON files, fallback to document parsing
          const jsonFiles = fs.readdirSync(moduleDir).filter(f => f.toLowerCase().endsWith('.json'));
          if (jsonFiles.length > 0) {
            const modules = await moduleLoader.loadModulesFromJSONDirectory(moduleDir);
            modulesLoaded = modules.length;
            console.log(`Loaded ${modulesLoaded} modules from JSON files`);
          } else {
            const modules = await moduleLoader.loadModulesFromDirectory(moduleDir);
            modulesLoaded = modules.length;
            console.log(`Loaded ${modulesLoaded} modules from documents`);
          }
        } else {
          console.log("Module directory not found, skipping module import");
        }
      }
    } else {
      console.log("Cassandra mod directory not found, skipping module import");
    }

    res.json({
      success: true,
      message: `数据导入完成：${scenariosLoaded} 个场景，${npcsLoaded} 个NPC，${modulesLoaded} 个模块`,
      scenariosLoaded,
      npcsLoaded,
      modulesLoaded,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error importing data:", error);
    res.status(500).json({ error: "Failed to import data: " + (error as Error).message });
  }
});

function getClientIp(req: express.Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = forwarded
    ? (typeof forwarded === "string" ? forwarded.split(",")[0] : forwarded[0])
    : req.socket.remoteAddress || req.ip || "127.0.0.1";
  return ip.trim();
}

function generateSessionIdFromIp(ip: string): string {
  // Create a unique sessionId for each game by combining IP and timestamp
  // This ensures each new game gets a unique session even from the same IP
  const uniqueString = `${ip}-${Date.now()}-${Math.random()}`;
  const hash = createHash("sha256").update(uniqueString).digest("hex").slice(0, 16);
  return `session-ip-${hash}`;
}

/**
 * 标准化名称（用于模糊匹配）
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

/**
 * 判断两个名称是否相似（相似度 >= 80%）
 */
function isNameSimilar(name1: string, name2: string): boolean {
  const na = normalizeName(name1);
  const nb = normalizeName(name2);
  if (!na || !nb) return false;
  if (na === nb) return true;

  // 如果首词相同，认为相似
  const tokensA = na.split(/\s+/);
  const tokensB = nb.split(/\s+/);
  if (tokensA[0] && tokensA[0] === tokensB[0]) return true;

  // 计算Levenshtein距离并转换为相似度
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return false;
  const similarity = 1 - dist / maxLen;
  return similarity >= 0.8; // 80%相似度阈值
}

gameRouter.post("/start", async (req, res) => {
  try {
    const { characterId, modName, moduleName } = req.body;
    const effectiveModuleName = moduleName || modName; // Support both field names

    console.log(`[${new Date().toISOString()}] Initializing multi-agent system...`);

    // Load mod data if modName is provided

    if (modName) {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`🎮 开始加载模组: ${modName}`);
      console.log(`${"=".repeat(60)}\n`);
    
      const modsDir = path.join(process.cwd(), "data", "Mods");
      if (!fs.existsSync(modsDir)) {
        throw new Error("Mods directory does not exist");
      }

      const dirs = fs.readdirSync(modsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory() && !dirent.name.startsWith('.'))
        .map(dirent => dirent.name);
      const modDir = dirs.find(d => d === modName);
      if (!modDir) {
        throw new Error(`Mod "${modName}" not found`);
      }

      const modPath = path.join(modsDir, modDir);

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
        name.toLowerCase().includes("module")
      );

      // Load scenarios to template table (新架构)
      if (scenarioDirs.length > 0) {
        console.log(`\n📋 [1/3] 检查场景数据...`);
        for (const scenarioDirName of scenarioDirs) {
          const scenariosDir = path.join(modPath, scenarioDirName);
          console.log(`   → 检查场景文件夹: ${scenarioDirName}`);
          try {
            await templateScenarioLoader.loadScenariosToTemplate(scenariosDir, modName);
          } catch (error) {
            console.error(`   ✗ 加载场景失败 ${scenarioDirName}:`, error);
          }
        }
      } else {
        console.log(`\n📋 [1/3] 未找到场景文件夹（包含"scenario"的文件夹）`);
      }

      // Load NPCs to template table (新架构)
      if (npcDirs.length > 0) {
        console.log(`\n👥 [2/3] 检查NPC数据...`);
        for (const npcDirName of npcDirs) {
          const npcsDir = path.join(modPath, npcDirName);
          console.log(`   → 检查NPC文件夹: ${npcDirName}`);
          try {
            await templateNpcLoader.loadNPCsToTemplate(npcsDir, modName);
          } catch (error) {
            console.error(`   ✗ 加载NPC失败 ${npcDirName}:`, error);
          }
        }
      } else {
        console.log(`\n👥 [2/3] 未找到NPC文件夹（包含"npc"的文件夹）`);
      }

      // Load modules/background (loader will check for changes and skip if already loaded)
      console.log(`\n📚 [3/3] 检查模块数据...`);
      const moduleDigestPath = path.join(modPath, "module_digest.json");
      if (fs.existsSync(moduleDigestPath)) {
        console.log(`   → 检查模块摘要文件: module_digest.json`);
        try {
          await moduleLoader.loadModuleFromJSON(moduleDigestPath);
        } catch (error) {
          console.error(`   ✗ 加载模块失败:`, error);
        }
      } else if (backgroundDirs.length > 0) {
        for (const backgroundDirName of backgroundDirs) {
          const moduleDir = path.join(modPath, backgroundDirName);
          console.log(`   → 检查模块文件夹: ${backgroundDirName}`);
          try {
            const jsonFiles = fs.readdirSync(moduleDir).filter(f => f.toLowerCase().endsWith('.json'));
            if (jsonFiles.length > 0) {
              await moduleLoader.loadModulesFromJSONDirectory(moduleDir, false); // false = don't force reload
            } else {
              await moduleLoader.loadModulesFromDirectory(moduleDir, false); // false = don't force reload
            }
          } catch (error) {
            console.error(`   ✗ 加载模块失败 ${backgroundDirName}:`, error);
          }
        }
      } else {
        console.log(`   ✗ 未找到模块文件（module_digest.json 或包含"background"或"module"的文件夹）`);
      }

      console.log(`\n${"=".repeat(60)}`);
      console.log(`✅ 模组数据加载完成！`);
      console.log(`${"=".repeat(60)}\n`);
    } else {
        console.error(`   ✗ 加载模块失败,模组名称未指定`);
        throw new Error("Mod name not specified");
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log(`✅ 游戏数据加载完成！`);
    console.log(`${"=".repeat(60)}\n`);

    // Check if character exists
    if (characterId) {
      const database = db.getDatabase();
      const character = database.prepare(`
        SELECT character_id, name, attributes, status, skills, inventory, notes
        FROM characters
        WHERE character_id = ? AND is_npc = 0
      `).get(characterId) as {
        character_id: string;
        name: string;
        attributes: string;
        status: string;
        skills: string;
        inventory: string;
        notes: string;
      } | undefined;

      if (!character) {
        return res.status(404).json({ error: "Character not found" });
      }

      // Parse character data and create game state with this character
      console.log(`\n${"=".repeat(60)}`);
      console.log(`🎲 初始化游戏状态...`);
      console.log(`${"=".repeat(60)}\n`);

      const parsedAttributes = JSON.parse(character.attributes);
      const parsedStatus = JSON.parse(character.status);
      const parsedSkillsRaw = JSON.parse(character.skills);
      const parsedInventory = JSON.parse(character.inventory);

      // Convert skills to simple number format for game use
      // Support both new format (object with value) and old format (simple number)
      const parsedSkills: Record<string, number> = {};
      for (const [skillName, skillData] of Object.entries(parsedSkillsRaw)) {
        if (typeof skillData === 'object' && skillData !== null && 'value' in skillData) {
          // New format: extract value
          parsedSkills[skillName] = (skillData as any).value;
        } else {
          // Old format or simple number: use as is
          parsedSkills[skillName] = typeof skillData === 'number' ? skillData : 0;
        }
      }

      console.log(`📝 [1/4] 创建游戏实例...`);
      // Generate sessionId based on client IP
      const clientIp = getClientIp(req);
      const sessionId = generateSessionIdFromIp(clientIp);
      console.log(`   - 客户端 IP: ${clientIp}`);
      console.log(`   - Session ID: ${sessionId}`);
      
      // Create game instance from template tables
      if (effectiveModuleName) {
        const gameInstanceManager = new GameInstanceManager(db);
        console.log(`   → 从模板表创建游戏实例 (模组: ${effectiveModuleName})`);
        await gameInstanceManager.createGameInstance(sessionId, effectiveModuleName, characterId);
        console.log(`   ✓ 游戏实例创建完成`);
      }
      
      console.log(`\n📝 [2/4] 创建基础游戏状态...`);
      let gameState: GameState = {
        ...JSON.parse(JSON.stringify(initialGameState)),
        sessionId: sessionId,
        playerCharacter: {
          id: character.character_id,
          name: character.name,
          attributes: parsedAttributes,
          status: parsedStatus,
          skills: parsedSkills,
          inventory: parsedInventory,
          notes: character.notes || "",
          actionLog: [],
        },
      };
      console.log(`   ✓ 基础状态已创建`);
      console.log(`   - 角色: ${character.name}`);
      console.log(`   - 阶段: ${gameState.phase}`);
      console.log(`   - 游戏时间: 第${gameState.gameDay}天 ${gameState.timeOfDay}`);
      
      // Load all NPCs for this session into game state
      console.log(`   → 加载当前session的所有NPC到游戏状态...`);
      const allSessionNPCs = npcLoader.getAllNPCsBySession(sessionId);
      gameState.npcCharacters = allSessionNPCs;
      console.log(`   ✓ 已加载 ${allSessionNPCs.length} 个NPC到游戏状态`);

      // Load module data and set keeper guidance and initial scenario
      console.log(`\n📚 [3/4] 加载模组配置到游戏状态...`);
      const modules = moduleLoader.getAllModules();
      let moduleIntroduction: { introduction: string; moduleNotes: string } | null = null;
      
      if (modules.length > 0) {
        const module = modules[0]; // Use the first/latest module
        console.log(`   → 使用模组: ${module.title}`);
        
        // Get introduction and moduleNotes from module (generated automatically during load)
        if (module.introduction) {
          moduleIntroduction = { 
            introduction: module.introduction,
            moduleNotes: module.moduleNotes || ""
          };
          console.log(`   ✓ 导入叙事已加载 (介绍: ${moduleIntroduction.introduction.length} 字符)`);
        }
        

        // Load initial scenario by scanning scenario directory for files containing "initial_scenario"
        console.log(`   → 查找初始场景（根据文件名包含"initial_scenario"）`);
        let initialScenarioProfile: ScenarioProfile | null = null;
        
        // Find scenario directory - we need to get modPath from request context
        // For this endpoint, we need to determine the mod path
        const modsDir = path.join(process.cwd(), "data", "Mods");
        if (fs.existsSync(modsDir)) {
          const dirs = fs.readdirSync(modsDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory() && !dirent.name.startsWith('.'))
            .map(dirent => dirent.name);
          if (dirs.length > 0) {
            const modDir = dirs[0]; // Use first mod directory
            const modPath = path.join(modsDir, modDir);
            const subdirs = fs.readdirSync(modPath, { withFileTypes: true })
              .filter(dirent => dirent.isDirectory())
              .map(dirent => dirent.name);
            const scenarioDirs = subdirs.filter(name => 
              name.toLowerCase().includes("scenario")
            );
            
            if (scenarioDirs.length > 0) {
              const scenariosDir = path.join(modPath, scenarioDirs[0]);
              initialScenarioProfile = scenarioLoader.findInitialScenarioByFileName(scenariosDir);
            }
          }
        }
        
        if (initialScenarioProfile) {
            gameState.currentScenario = {
              ...initialScenarioProfile.snapshot,
              characters: initialScenarioProfile.snapshot.characters || []
            };
            const scenarioLocation = initialScenarioProfile.snapshot.location;
            console.log(`   ✓ 已匹配并注入初始场景到游戏状态: ${initialScenarioProfile.name}`);
            console.log(`     - 场景ID: ${initialScenarioProfile.snapshot.id}`);
            console.log(`     - 位置: ${scenarioLocation || "未指定"}`);
            console.log(`     - 描述: ${initialScenarioProfile.snapshot.description ? initialScenarioProfile.snapshot.description.substring(0, 100) + "..." : "无"}`);
            console.log(`     - 角色数: ${initialScenarioProfile.snapshot.characters?.length || 0}`);
            console.log(`     - 线索数: ${initialScenarioProfile.snapshot.clues?.length || 0}`);
            console.log(`     - 出口数: ${initialScenarioProfile.snapshot.exits?.length || 0}`);
            console.log(`     - 事件数: ${initialScenarioProfile.snapshot.events?.length || 0}`);

            // Update initial scenario NPCs' location in game state
            if (scenarioLocation) {
              const npcNamesToPlace = new Set<string>();
              
              // Collect character names from scenario
              if (initialScenarioProfile.snapshot.characters && initialScenarioProfile.snapshot.characters.length > 0) {
                initialScenarioProfile.snapshot.characters.forEach(c => npcNamesToPlace.add(c.name));
              }
              
              // Also collect NPCs from module.initialScenarioNPCs
              if (module.initialScenarioNPCs && module.initialScenarioNPCs.length > 0) {
                module.initialScenarioNPCs.forEach(name => npcNamesToPlace.add(name));
              }
              
              if (npcNamesToPlace.size > 0) {
                console.log(`   → 设置初始场景NPC位置 (${npcNamesToPlace.size} 个):`);
                const database = db.getDatabase();
                let updatedCount = 0;
                
                for (const charName of npcNamesToPlace) {
                  // Find matching NPC in gameState (already loaded all NPCs)
                  const matchingNpc = gameState.npcCharacters.find(npc => isNameSimilar(npc.name, charName)) as any;
                  
                  if (matchingNpc) {
                    const oldLocation = matchingNpc.currentLocation || null;
                    matchingNpc.currentLocation = scenarioLocation;
                    
                    if (oldLocation !== scenarioLocation) {
                      console.log(`     ✓ ${matchingNpc.name}: ${oldLocation || "Unknown"} → ${scenarioLocation}`);
                      updatedCount++;
                      
                      // Update NPC location in database
                      database.prepare(`
                        UPDATE characters 
                        SET current_location = ? 
                        WHERE character_id = ? AND is_npc = 1
                      `).run(scenarioLocation, matchingNpc.id);
                    } else {
                      console.log(`     - ${matchingNpc.name}: 已在 ${scenarioLocation} (无需更新)`);
                    }
                    
                    // Update scenario.characters
                    if (gameState.currentScenario) {
                      const scenarioCharacters = gameState.currentScenario.characters || [];
                      const existingIndex = scenarioCharacters.findIndex(c => 
                        c.id === matchingNpc.id || c.name.toLowerCase() === matchingNpc.name.toLowerCase()
                      );
                      
                      if (existingIndex >= 0) {
                        scenarioCharacters[existingIndex].location = scenarioLocation;
                        scenarioCharacters[existingIndex].status = scenarioCharacters[existingIndex].status || 'present';
                      } else {
                        scenarioCharacters.push({
                          id: matchingNpc.id,
                          name: matchingNpc.name,
                          role: matchingNpc.occupation || 'npc',
                          status: 'present',
                          location: scenarioLocation,
                          notes: matchingNpc.background ? matchingNpc.background.substring(0, 100) : undefined
                        });
                      }
                      
                      gameState.currentScenario.characters = scenarioCharacters;
                    }
                  } else {
                    console.warn(`     ⚠️  NPC "${charName}" 未在已加载的NPC中找到`);
                  }
                }
                
                console.log(`   ✓ 已设置 ${updatedCount} 个NPC的初始位置`);
              } else {
                console.log(`   → 场景和模组配置中均未指定NPC，跳过位置设置`);
              }
            } else {
              console.warn(`   ⚠️  场景位置未指定，无法设置场景NPC位置`);
            }
        } else {
          console.warn(`   ⚠️  未找到包含"initial_scenario"的场景文件，将不设置初始场景`);
        }

        // Load keeper guidance and module limitations from module
        if (module.keeperGuidance) {
          gameState.keeperGuidance = module.keeperGuidance;
          console.log(`   ✓ 已加载守秘人指导 (${module.keeperGuidance.length} 字符)`);
        } else {
          console.log(`   ⚠️  模组未提供守秘人指导`);
        }

        if (module.moduleLimitations) {
          gameState.moduleLimitations = module.moduleLimitations;
          console.log(`   ✓ 已加载模组限制 (${module.moduleLimitations.length} 字符)`);
        } else {
          console.log(`   ⚠️  模组未提供模组限制`);
        }

        // Load initial game time if specified
        if (module.initialGameTime) {
          console.log(`   → 设置初始游戏时间: "${module.initialGameTime}"`);
          // Parse time format: "HH:MM" or "Day X HH:MM"
          const timeMatch = module.initialGameTime.match(/(?:Day\s*(\d+)\s+)?(\d{1,2}):(\d{2})/i);
          if (timeMatch) {
            const day = timeMatch[1] ? parseInt(timeMatch[1], 10) : 1;
            const hours = timeMatch[2];
            const minutes = timeMatch[3];
            gameState.gameDay = day;
            gameState.timeOfDay = `${hours.padStart(2, '0')}:${minutes}`;
            gameState.scenarioTimeState.sceneStartTime = gameState.timeOfDay;
            console.log(`   ✓ 已设置初始游戏时间: 第${day}天 ${gameState.timeOfDay}`);
          } else {
            // Try simple HH:MM format
            const simpleTimeMatch = module.initialGameTime.match(/(\d{1,2}):(\d{2})/);
            if (simpleTimeMatch) {
              const hours = simpleTimeMatch[1];
              const minutes = simpleTimeMatch[2];
              gameState.timeOfDay = `${hours.padStart(2, '0')}:${minutes}`;
              gameState.scenarioTimeState.sceneStartTime = gameState.timeOfDay;
              console.log(`   ✓ 已设置初始游戏时间: ${gameState.timeOfDay}`);
            } else {
              console.warn(`   ⚠️  无法解析初始游戏时间格式: "${module.initialGameTime}"`);
            }
          }
        } else {
          console.log(`   ⚠️  模组未指定初始游戏时间，使用默认时间`);
        }
      } else {
        console.log(`   ⚠️  未找到模组数据，使用默认配置`);
      }

      console.log(`\n💾 [4/4] 保存游戏状态...`);
      const persistentGameState = gameState;
      container.register('gameState', persistentGameState);
      console.log(`   ✓ 游戏状态已保存`);
      console.log(`   - Session ID: ${gameState.sessionId}`);
      console.log(`   - 当前场景: ${gameState.currentScenario ? gameState.currentScenario.name : "无"}`);
      console.log(`   - 游戏时间: 第${gameState.gameDay}天 ${gameState.timeOfDay}`);
      console.log(`   - 守秘人指导: ${gameState.keeperGuidance ? "已设置" : "未设置"}`);
      console.log(`\n${"=".repeat(60)}`);
      console.log(`✅ 游戏状态初始化完成！`);
      console.log(`${"=".repeat(60)}\n`);

      console.log(`[${new Date().toISOString()}] Game started with character: ${character.name} (${characterId})`);
      
      if (!persistentGameState) {
        throw new Error("Failed to initialize game state");
      }

      // Create introduction turn if module introduction is available and turnManager is initialized
      if (moduleIntroduction && turnManager && db) {
        try {
          // Check if introduction turn already exists for this session
          const database = db.getDatabase();
          const existingIntro = database.prepare(`
            SELECT turn_id FROM game_turns 
            WHERE session_id = ? AND turn_number = 0 AND character_input = ''
          `).get(persistentGameState.sessionId);
          
          if (!existingIntro) {
            // Only save introduction, not characterGuidance
            const introContent = moduleIntroduction.introduction;
            
            const introTurnId = `turn-intro-${Date.now()}-${randomUUID().slice(0, 8)}`;
            
            // Create a special turn with turnNumber 0 for introduction
            database.prepare(`
              INSERT INTO game_turns (
                turn_id, session_id, turn_number, character_input, character_id, character_name,
                keeper_narrative, status, started_at, completed_at, created_at
              ) VALUES (?, ?, 0, '', ?, ?, ?, 'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `).run(
              introTurnId,
              persistentGameState.sessionId,
              character.character_id,
              character.name,
              introContent
            );
            
            console.log(`✓ Introduction turn created: ${introTurnId}`);
          } else {
            console.log(`✓ Introduction turn already exists for this session`);
          }
        } catch (error) {
          console.error("Failed to create introduction turn:", error);
          // Don't fail the game start if introduction turn creation fails
        }
      }

      res.json({
        success: true,
        message: `游戏已开始！欢迎，${character.name}！`,
        sessionId: persistentGameState.sessionId,
        characterId: character.character_id,
        characterName: character.name,
        moduleIntroduction: moduleIntroduction, // Include module introduction for frontend display
        gameState: {
          phase: persistentGameState.phase,
          playerCharacter: persistentGameState.playerCharacter,
          timeOfDay: persistentGameState.timeOfDay,
          tension: persistentGameState.tension,
          currentScenario: persistentGameState.currentScenario,
        },
        timestamp: new Date().toISOString(),
      });
    } else {
      // Start with default character
      console.log(`\n${"=".repeat(60)}`);
      console.log(`🎲 初始化游戏状态（使用默认角色）...`);
      console.log(`${"=".repeat(60)}\n`);

      console.log(`📝 [1/4] 创建游戏实例...`);
      // Generate sessionId based on client IP
      const clientIp = getClientIp(req);
      const sessionId = generateSessionIdFromIp(clientIp);
      console.log(`   - 客户端 IP: ${clientIp}`);
      console.log(`   - Session ID: ${sessionId}`);
      
      // Create game instance from template tables
      if (effectiveModuleName) {
        const gameInstanceManager = new GameInstanceManager(db);
        console.log(`   → 从模板表创建游戏实例 (模组: ${effectiveModuleName})`);
        await gameInstanceManager.createGameInstance(sessionId, effectiveModuleName, characterId);
        console.log(`   ✓ 游戏实例创建完成`);
      }
      
      console.log(`\n📝 [2/4] 创建基础游戏状态...`);
      let gameState: GameState = {
        ...JSON.parse(JSON.stringify(initialGameState)),
        sessionId: sessionId,
      };
      console.log(`   ✓ 基础状态已创建`);
      console.log(`   - 角色: ${gameState.playerCharacter.name}`);
      console.log(`   - 阶段: ${gameState.phase}`);
      console.log(`   - 游戏时间: 第${gameState.gameDay}天 ${gameState.timeOfDay}`);

      // Load module data and set keeper guidance and initial scenario
      console.log(`\n📚 [2/3] 加载模组配置到游戏状态...`);
      const modules = moduleLoader.getAllModules();
      let moduleIntroduction: { introduction: string; moduleNotes: string } | null = null;
      
      if (modules.length > 0) {
        const module = modules[0]; // Use the first/latest module
        console.log(`   → 使用模组: ${module.title}`);
        
        // Get introduction and moduleNotes from module (generated automatically during load)
        if (module.introduction) {
          moduleIntroduction = {
            introduction: module.introduction,
            moduleNotes: module.moduleNotes || ""
          };
        }

        // Set module limitations
        if (module.moduleLimitations) {
          gameState.moduleLimitations = module.moduleLimitations;
          console.log(`   ✓ 已设置模组限制 (长度: ${module.moduleLimitations.length} 字符)`);
        } else {
          console.log(`   ⚠️  模组未提供限制条件`);
        }

        // Load initial scenario by scanning scenario directory for files containing "initial_scenario"
        console.log(`   → 查找初始场景（根据文件名包含"initial_scenario"）`);
        let initialScenarioProfile: ScenarioProfile | null = null;
        
        // Find scenario directory using modName from request
        if (modName) {
          const modsDir = path.join(process.cwd(), "data", "Mods");
          if (fs.existsSync(modsDir)) {
            const dirs = fs.readdirSync(modsDir, { withFileTypes: true })
              .filter(dirent => dirent.isDirectory() && !dirent.name.startsWith('.'))
              .map(dirent => dirent.name);
            const modDir = dirs.find(d => d === modName);
            if (modDir) {
              const modPath = path.join(modsDir, modDir);
              const subdirs = fs.readdirSync(modPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);
              const scenarioDirs = subdirs.filter(name => 
                name.toLowerCase().includes("scenario")
              );
              
              if (scenarioDirs.length > 0) {
                const scenariosDir = path.join(modPath, scenarioDirs[0]);
                initialScenarioProfile = scenarioLoader.findInitialScenarioByFileName(scenariosDir);
              }
            }
          }
        }
        
        if (initialScenarioProfile) {
            gameState.currentScenario = {
              ...initialScenarioProfile.snapshot,
              characters: initialScenarioProfile.snapshot.characters || []
            };
            const scenarioLocation = initialScenarioProfile.snapshot.location;
            console.log(`   ✓ 已匹配并注入初始场景到游戏状态: ${initialScenarioProfile.name}`);
            console.log(`     - 场景ID: ${initialScenarioProfile.snapshot.id}`);
            console.log(`     - 位置: ${scenarioLocation || "未指定"}`);
            console.log(`     - 描述: ${initialScenarioProfile.snapshot.description ? initialScenarioProfile.snapshot.description.substring(0, 100) + "..." : "无"}`);
            console.log(`     - 角色数: ${initialScenarioProfile.snapshot.characters?.length || 0}`);
            console.log(`     - 线索数: ${initialScenarioProfile.snapshot.clues?.length || 0}`);
            console.log(`     - 出口数: ${initialScenarioProfile.snapshot.exits?.length || 0}`);
            console.log(`     - 事件数: ${initialScenarioProfile.snapshot.events?.length || 0}`);

            // Update initial scenario NPCs' location in game state
            if (scenarioLocation) {
              const npcNamesToPlace = new Set<string>();
              
              // Collect character names from scenario
              if (initialScenarioProfile.snapshot.characters && initialScenarioProfile.snapshot.characters.length > 0) {
                initialScenarioProfile.snapshot.characters.forEach(c => npcNamesToPlace.add(c.name));
              }
              
              // Also collect NPCs from module.initialScenarioNPCs
              if (module.initialScenarioNPCs && module.initialScenarioNPCs.length > 0) {
                module.initialScenarioNPCs.forEach(name => npcNamesToPlace.add(name));
              }
              
              if (npcNamesToPlace.size > 0) {
                console.log(`   → 设置初始场景NPC位置 (${npcNamesToPlace.size} 个):`);
                const database = db.getDatabase();
                let updatedCount = 0;
                
                for (const charName of npcNamesToPlace) {
                  // Find matching NPC in gameState (already loaded all NPCs)
                  const matchingNpc = gameState.npcCharacters.find(npc => isNameSimilar(npc.name, charName)) as any;
                  
                  if (matchingNpc) {
                    const oldLocation = matchingNpc.currentLocation || null;
                    matchingNpc.currentLocation = scenarioLocation;
                    
                    if (oldLocation !== scenarioLocation) {
                      console.log(`     ✓ ${matchingNpc.name}: ${oldLocation || "Unknown"} → ${scenarioLocation}`);
                      updatedCount++;
                      
                      // Update NPC location in database
                      database.prepare(`
                        UPDATE characters 
                        SET current_location = ? 
                        WHERE character_id = ? AND is_npc = 1
                      `).run(scenarioLocation, matchingNpc.id);
                    } else {
                      console.log(`     - ${matchingNpc.name}: 已在 ${scenarioLocation} (无需更新)`);
                    }
                    
                    // Update scenario.characters
                    if (gameState.currentScenario) {
                      const scenarioCharacters = gameState.currentScenario.characters || [];
                      const existingIndex = scenarioCharacters.findIndex(c => 
                        c.id === matchingNpc.id || c.name.toLowerCase() === matchingNpc.name.toLowerCase()
                      );
                      
                      if (existingIndex >= 0) {
                        scenarioCharacters[existingIndex].location = scenarioLocation;
                        scenarioCharacters[existingIndex].status = scenarioCharacters[existingIndex].status || 'present';
                      } else {
                        scenarioCharacters.push({
                          id: matchingNpc.id,
                          name: matchingNpc.name,
                          role: matchingNpc.occupation || 'npc',
                          status: 'present',
                          location: scenarioLocation,
                          notes: matchingNpc.background ? matchingNpc.background.substring(0, 100) : undefined
                        });
                      }
                      
                      gameState.currentScenario.characters = scenarioCharacters;
                    }
                  } else {
                    console.warn(`     ⚠️  NPC "${charName}" 未在已加载的NPC中找到`);
                  }
                }
                
                console.log(`   ✓ 已设置 ${updatedCount} 个NPC的初始位置`);
              } else {
                console.log(`   → 场景和模组配置中均未指定NPC，跳过位置设置`);
              }
            } else {
              console.warn(`   ⚠️  场景位置未指定，无法设置场景NPC位置`);
            }
        } else {
          console.warn(`   ⚠️  未找到包含"initial_scenario"的场景文件，将不设置初始场景`);
        }

        // Load keeper guidance and module limitations from module
        if (module.keeperGuidance) {
          gameState.keeperGuidance = module.keeperGuidance;
          console.log(`   ✓ 已加载守秘人指导 (${module.keeperGuidance.length} 字符)`);
        } else {
          console.log(`   ⚠️  模组未提供守秘人指导`);
        }

        if (module.moduleLimitations) {
          gameState.moduleLimitations = module.moduleLimitations;
          console.log(`   ✓ 已加载模组限制 (${module.moduleLimitations.length} 字符)`);
        } else {
          console.log(`   ⚠️  模组未提供模组限制`);
        }

        // Load initial game time if specified
        if (module.initialGameTime) {
          console.log(`   → 设置初始游戏时间: "${module.initialGameTime}"`);
          // Parse time format: "HH:MM" or "Day X HH:MM"
          const timeMatch = module.initialGameTime.match(/(?:Day\s*(\d+)\s+)?(\d{1,2}):(\d{2})/i);
          if (timeMatch) {
            const day = timeMatch[1] ? parseInt(timeMatch[1], 10) : 1;
            const hours = timeMatch[2];
            const minutes = timeMatch[3];
            gameState.gameDay = day;
            gameState.timeOfDay = `${hours.padStart(2, '0')}:${minutes}`;
            gameState.scenarioTimeState.sceneStartTime = gameState.timeOfDay;
            console.log(`   ✓ 已设置初始游戏时间: 第${day}天 ${gameState.timeOfDay}`);
          } else {
            // Try simple HH:MM format
            const simpleTimeMatch = module.initialGameTime.match(/(\d{1,2}):(\d{2})/);
            if (simpleTimeMatch) {
              const hours = simpleTimeMatch[1];
              const minutes = simpleTimeMatch[2];
              gameState.timeOfDay = `${hours.padStart(2, '0')}:${minutes}`;
              gameState.scenarioTimeState.sceneStartTime = gameState.timeOfDay;
              console.log(`   ✓ 已设置初始游戏时间: ${gameState.timeOfDay}`);
            } else {
              console.warn(`   ⚠️  无法解析初始游戏时间格式: "${module.initialGameTime}"`);
            }
          }
        } else {
          console.log(`   ⚠️  模组未指定初始游戏时间，使用默认时间`);
        }
      } else {
        console.log(`   ⚠️  未找到模组数据，使用默认配置`);
      }

      console.log(`\n💾 [4/4] 保存游戏状态...`);
      const persistentGameState = gameState;
      container.register("gameState", persistentGameState);
      console.log(`   ✓ 游戏状态已保存`);
      console.log(`   - Session ID: ${gameState.sessionId}`);
      console.log(`   - 当前场景: ${gameState.currentScenario ? gameState.currentScenario.name : "无"}`);
      console.log(`   - 游戏时间: 第${gameState.gameDay}天 ${gameState.timeOfDay}`);
      console.log(`   - 守秘人指导: ${gameState.keeperGuidance ? "已设置" : "未设置"}`);
      console.log(`\n${"=".repeat(60)}`);
      console.log(`✅ 游戏状态初始化完成！`);
      console.log(`${"=".repeat(60)}\n`);

      console.log(`[${new Date().toISOString()}] Game started with default character`);
      
      if (!persistentGameState) {
        throw new Error("Failed to initialize game state");
      }

      // Create introduction turn if module introduction is available and turnManager is initialized
      if (moduleIntroduction && turnManager && db) {
        try {
          // Check if introduction turn already exists for this session
          const database = db.getDatabase();
          const existingIntro = database.prepare(`
            SELECT turn_id FROM game_turns 
            WHERE session_id = ? AND turn_number = 0 AND character_input = ''
          `).get(persistentGameState.sessionId);
          
          if (!existingIntro) {
            // Only save introduction, not characterGuidance
            const introContent = moduleIntroduction.introduction;
            
            const introTurnId = `turn-intro-${Date.now()}-${randomUUID().slice(0, 8)}`;
            
            // Create a special turn with turnNumber 0 for introduction
            database.prepare(`
              INSERT INTO game_turns (
                turn_id, session_id, turn_number, character_input, character_id, character_name,
                keeper_narrative, status, started_at, completed_at, created_at
              ) VALUES (?, ?, 0, '', ?, ?, ?, 'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `).run(
              introTurnId,
              persistentGameState.sessionId,
              persistentGameState.playerCharacter.id,
              persistentGameState.playerCharacter.name,
              introContent
            );
            
            console.log(`✓ Introduction turn created: ${introTurnId}`);
          } else {
            console.log(`✓ Introduction turn already exists for this session`);
          }
        } catch (error) {
          console.error("Failed to create introduction turn:", error);
          // Don't fail the game start if introduction turn creation fails
        }
      }

      res.json({
        success: true,
        message: "游戏已开始！使用默认角色。",
        sessionId: persistentGameState.sessionId,
        characterId: persistentGameState.playerCharacter.id,
        characterName: persistentGameState.playerCharacter.name,
        moduleIntroduction: moduleIntroduction, // Include module introduction for frontend display
        gameState: {
          phase: persistentGameState.phase,
          playerCharacter: persistentGameState.playerCharacter,
          timeOfDay: persistentGameState.timeOfDay,
          tension: persistentGameState.tension,
          currentScenario: persistentGameState.currentScenario,
        },
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("Error starting game:", error);
    res.status(500).json({ error: "Failed to start game: " + (error as Error).message });
  }
});

// API endpoint to reset/stop game
gameRouter.post("/stop", (req, res) => {
  try {
    let persistentGameState = container.resolve("gameState");
    if (!persistentGameState) {
      return res.json({
        success: true,
        message: "Game was not running",
        timestamp: new Date().toISOString(),
      });
    }

    // Clear the game state
    persistentGameState = null;
    
    console.log(`[${new Date().toISOString()}] Game stopped and state cleared`);
    
    res.json({
      success: true,
      message: "游戏已停止，状态已清空",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error stopping game:", error);
    res.status(500).json({ error: "Failed to stop game" });
  }
});
export default gameRouter;