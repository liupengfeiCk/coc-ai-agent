import { getActionDrivenSceneChangeTemplate, getNarrativeDirectionTemplate, getPlayerIntentAnalysisTemplate } from "./directorTemplate.js";
import { composeTemplate } from "../../../template.js";
import type { GameStateManager } from "../../../state.js";
import type { ScenarioSnapshot } from "../models/scenarioTypes.js";
import { ScenarioLoader } from "../memory/scenarioloader/scenarioLoader.js";
import { updateCurrentScenarioWithCheckpoint } from "../memory/index.js";
import type { CoCDatabase } from "../memory/database/index.js";
import { ModuleLoader } from "../memory/moduleloader/index.js";
import type { ActionResult } from "../../../state.js";
import {
  ModelProviderName,
  ModelClass,
  generateText,
} from "../../../models/index.js";
import * as fs from "fs";
import * as path from "path";

interface DirectorRuntime {
  modelProvider: ModelProviderName;
  getSetting: (key: string) => string | undefined;
}

const createRuntime = (): DirectorRuntime => ({
  modelProvider: (process.env.MODEL_PROVIDER as ModelProviderName) || ModelProviderName.OPENAI,
  getSetting: (key: string) => process.env[key],
});

/**
 * Director Agent - Story progression and scene transition director
 * Responsible for monitoring game progress and advancing story development
 */
export class DirectorAgent {
  private scenarioLoader: ScenarioLoader;
  private db: CoCDatabase;

  constructor(scenarioLoader: ScenarioLoader, db: CoCDatabase) {
    this.scenarioLoader = scenarioLoader;
    this.db = db;
  }
  /**
   * Load map information
   */
  private loadMapData(): any | null {
    try {
      const mapPath = path.join(process.cwd(), "data", "Mods", "Cassandra's Black Carnival", "map.json");
      if (!fs.existsSync(mapPath)) {
        console.warn(`Map file not found at: ${mapPath}`);
        return null;
      }
      const mapContent = fs.readFileSync(mapPath, "utf-8");
      return JSON.parse(mapContent);
    } catch (error) {
      console.error("Error loading map data:", error);
      return null;
    }
  }

  /**
   * Get all scenarios with their snapshots (including timeRestriction)
   */
  private getAllScenariosWithSnapshots(): Array<{
    scenarioName: string;
    scenarioId: string;
    snapshots: Array<{
      snapshotId: string;
      snapshotName: string;
      location: string;
      timeRestriction: string | null;
    }>;
  }> {
    const database = this.db.getDatabase();
    const allScenarios = this.scenarioLoader.getAllScenarios();
    
    const scenariosWithSnapshots = allScenarios.map(scenario => {
      // Get all snapshots for this scenario from database
      const snapshots = database
        .prepare(`SELECT snapshot_id, snapshot_name, location, time_restriction 
                  FROM scenario_snapshots 
                  WHERE scenario_id = ? 
                  ORDER BY 
                    CASE 
                      WHEN time_restriction IS NULL THEN 0 
                      ELSE 1 
                    END,
                    snapshot_id`)
        .all(scenario.id) as Array<{
          snapshot_id: string;
          snapshot_name: string;
          location: string;
          time_restriction: string | null;
        }>;
      
      return {
        scenarioName: scenario.name,
        scenarioId: scenario.id,
        snapshots: snapshots.map(snap => ({
          snapshotId: snap.snapshot_id,
          snapshotName: snap.snapshot_name || scenario.name,
          location: snap.location,
          timeRestriction: snap.time_restriction
        }))
      };
    });
    
    return scenariosWithSnapshots;
  }

  // Time progression removed - scenarios are now static snapshots without timeline

  /**
   * Execute scenario progression - update current scenario based on target scene ID
   * Supports scenarios with multiple snapshots by searching in the database
   */
  private async executeScenarioProgression(
    targetSnapshotId: string, 
    gameStateManager: GameStateManager,
    estimatedShortActions: number | null = null
  ): Promise<void> {
    try {
      // First try to find in scenario loader's default snapshots (backward compatibility)
      const allScenarios = this.scenarioLoader.getAllScenarios();
      let targetSnapshot: ScenarioSnapshot | null = null;
      let scenarioName = "";

      // Search for target snapshot in all scenarios' default snapshots first
      for (const scenario of allScenarios) {
        if (scenario.snapshot.id === targetSnapshotId) {
          targetSnapshot = scenario.snapshot;
          scenarioName = scenario.name;
          break;
        }
      }

      // If not found in default snapshots, search in database for all snapshots
      if (!targetSnapshot) {
        const database = this.db.getDatabase();
        const snapshotRow = database
          .prepare(`SELECT snapshot_id, scenario_id FROM scenario_snapshots WHERE snapshot_id = ?`)
          .get(targetSnapshotId) as { snapshot_id: string; scenario_id: string } | undefined;

        if (snapshotRow) {
          // Find the scenario name
          const scenario = allScenarios.find(s => s.id === snapshotRow.scenario_id);
          if (scenario) {
            scenarioName = scenario.name;
            // Build complete snapshot object from database
            targetSnapshot = await this.buildSnapshotFromRow(targetSnapshotId);
            if (!targetSnapshot) {
              console.warn(`Director Agent: Failed to build snapshot object for ID "${targetSnapshotId}"`);
              return;
            }
          }
        }
      }

      if (targetSnapshot && scenarioName) {
        // Attach short action estimate to target scenario snapshot for subsequent state tracking
        if (estimatedShortActions && estimatedShortActions > 0) {
          targetSnapshot.estimatedShortActions = estimatedShortActions;
        } else {
          targetSnapshot.estimatedShortActions = undefined;
        }

        // Execute scene update (with checkpoint save)
        await updateCurrentScenarioWithCheckpoint(
          gameStateManager,
          {
            snapshot: targetSnapshot,
            scenarioName: scenarioName
          },
          this.db
        );
        
        console.log(`Director Agent: Progressed to scenario "${scenarioName}" snapshot "${targetSnapshotId}" (checkpoint created)`);
      } else {
        console.warn(`Director Agent: Could not find target snapshot "${targetSnapshotId}" in any scenario`);
      }
    } catch (error) {
      console.error("Error executing scenario progression:", error);
    }
  }

  /**
   * Select snapshot based on current game time
   */
  private selectSnapshotByTime(
    snapshots: Array<{ snapshot_id: string; snapshot_name: string; location: string; description: string; time_restriction: string | null }>,
    currentDay: number,
    currentTime: string
  ): typeof snapshots[0] | null {
    // First, try to find snapshots without time restriction
    const noRestriction = snapshots.find(s => !s.time_restriction);
    if (noRestriction) {
      return noRestriction;
    }
    
    // Then, try to find snapshots that match current time
    const matchingTime = snapshots.find(s => {
      if (!s.time_restriction) return false;
      const restriction = s.time_restriction.toLowerCase();
      
      // Check for "dayX (after)" format - available from day X onwards
      const afterMatch = restriction.match(/day\s*(\d+)\s*\(after\)/i);
      if (afterMatch) {
        const requiredDay = parseInt(afterMatch[1]);
        return currentDay >= requiredDay;
      }
      
      // Check for "dayX evening" format - only available on day X evening
      const eveningMatch = restriction.match(/day\s*(\d+)\s*evening/i);
      if (eveningMatch) {
        const requiredDay = parseInt(eveningMatch[1]);
        return currentDay === requiredDay && (currentTime.includes("evening") || parseInt(currentTime.split(":")[0]) >= 18);
      }
      
      // Check for exact "dayX" match
      const dayMatch = restriction.match(/day\s*(\d+)/i);
      if (dayMatch) {
        const requiredDay = parseInt(dayMatch[1]);
        return currentDay === requiredDay;
      }
      
      return false;
    });
    
    if (matchingTime) {
      return matchingTime;
    }
    
    // If no match, return the first snapshot (fallback)
    return snapshots[0] || null;
  }

  /**
   * Build complete snapshot object from database row
   */
  private async buildSnapshotFromRow(snapshotId: string): Promise<ScenarioSnapshot | null> {
    const database = this.db.getDatabase();
    
    const snap = database
      .prepare(`SELECT * FROM scenario_snapshots WHERE snapshot_id = ?`)
      .get(snapshotId) as any;
    
    if (!snap) {
      return null;
    }
    
    // Get characters, clues, conditions for this snapshot
    const characters = database
      .prepare(`SELECT * FROM scenario_characters WHERE snapshot_id = ?`)
      .all(snapshotId) as any[];
    
    const clues = database
      .prepare(`SELECT * FROM scenario_clues WHERE snapshot_id = ?`)
      .all(snapshotId) as any[];
    
    const conditions = database
      .prepare(`SELECT * FROM scenario_conditions WHERE snapshot_id = ?`)
      .all(snapshotId) as any[];
    
    // Get scenario for permanent changes
    const scenario = database
      .prepare(`SELECT permanent_changes FROM scenarios WHERE scenario_id = ?`)
      .get(snap.scenario_id) as any;
    
    const snapshot: ScenarioSnapshot = {
      id: snap.snapshot_id,
      name: snap.snapshot_name,
      location: snap.location,
      description: snap.description,
      characters: characters.map((c) => ({
        id: c.id,
        name: c.character_name,
        role: c.character_role,
        status: c.character_status,
        location: c.character_location,
        notes: c.character_notes,
      })),
      clues: clues.map((c) => ({
        id: c.clue_id,
        clueText: c.clue_text,
        category: c.category,
        difficulty: c.difficulty,
        location: c.clue_location,
        discoveryMethod: c.discovery_method,
        reveals: c.reveals ? JSON.parse(c.reveals) : [],
        discovered: c.discovered === 1,
        discoveryDetails: c.discovery_details ? JSON.parse(c.discovery_details) : undefined,
      })),
      conditions: conditions.map((c) => ({
        type: c.condition_type,
        description: c.description,
        mechanicalEffect: c.mechanical_effect,
      })),
      events: snap.events ? JSON.parse(snap.events) : [],
      exits: snap.exits ? JSON.parse(snap.exits) : [],
      permanentChanges: scenario?.permanent_changes ? JSON.parse(scenario.permanent_changes) : [],
      keeperNotes: snap.keeper_notes,
      timeRestriction: snap.time_restriction || undefined,
    };
    
    return snapshot;
  }

  /**
   * Execute scene transition (shared logic)
   */
  private async executeSceneTransition(
    targetSnapshot: ScenarioSnapshot,
    scenarioName: string,
    gameStateManager: GameStateManager
  ): Promise<void> {
    const gameState = gameStateManager.getGameState();
    
    console.log(`\n🔄 [Executing Scene Transition]:`);
    console.log(`   To: ${targetSnapshot.name}`);
    console.log(`   Location: ${targetSnapshot.location}`);
    
    // Check if we're returning to a previously visited scenario
    const wasVisited = gameState.visitedScenarios.some(
      v => v.id === targetSnapshot.id || v.name === scenarioName
    );
    
    if (wasVisited) {
      console.log(`   📂 This is a previously visited scene, will restore historical state`);
    } else {
      console.log(`   🆕 This is a first-time visit scene`);
    }
    
    try {
      await updateCurrentScenarioWithCheckpoint(
        gameStateManager,
        {
          snapshot: targetSnapshot,
          scenarioName: scenarioName
        },
        this.db
      );
      
      const updatedState = gameStateManager.getGameState();
      
      console.log(`   ✓ Scene transition completed successfully`);
      console.log(`\n📍 [Post-Transition State]:`);
      console.log(`   Current Scene: ${updatedState.currentScenario?.name || 'None'}`);
      console.log(`   Scene ID: ${updatedState.currentScenario?.id || 'None'}`);
      console.log(`   Location: ${updatedState.currentScenario?.location || 'None'}`);
      console.log(`   Visited Scenarios Count: ${updatedState.visitedScenarios.length}`);
      
      console.log(`\n✅ [Director Agent] Scene transition completed`);
      console.log(`🎬 [Director Agent] ========================================\n`);
      
    } catch (error) {
      console.error(`   ❌ Scene transition failed:`, error);
      throw error;
    }
  }

  /**
   * Handle scene change request initiated by Action Agent
   * Use map data and LLM to validate and select target scene
   */
  async handleActionDrivenSceneChange(
    gameStateManager: GameStateManager,
    targetSceneName: string,
    reason: string
  ): Promise<void> {
    console.log(`\n🎬 [Director Agent] ========================================`);
    console.log(`🎬 [Director Agent] Starting to process Action-driven scene transition`);
    console.log(`🎬 [Director Agent] ========================================`);

    const gameState = gameStateManager.getGameState();
    const currentScenario = gameState.currentScenario;

    // Log current state
    console.log(`\n📍 [Current Scene State]:`);
    if (currentScenario) {
      console.log(`   Scene Name: ${currentScenario.name}`);
      console.log(`   Scene ID: ${currentScenario.id}`);
      console.log(`   Location: ${currentScenario.location}`);
      console.log(`   Description: ${currentScenario.description ? currentScenario.description.substring(0, 100) + '...' : 'None'}`);
    } else {
      console.log(`   ⚠️  No current scene`);
    }

    // Log target scene request
    console.log(`\n🎯 [Scene Transition Request]:`);
    console.log(`   Target Scene Name: ${targetSceneName}`);
    console.log(`   Transition Reason: ${reason}`);

    // Load map data
    const mapData = this.loadMapData();

    // Get conversation history to extract previous narrative and current character input
    const conversationHistory = (gameState.temporaryInfo.contextualData?.conversationHistory as Array<{
      turnNumber: number;
      characterInput: string;
      keeperNarrative: string | null;
    }>) || [];

    // Get previous round narrative (last completed turn with narrative)
    let previousNarrative: string | null = null;
    if (conversationHistory.length > 0) {
      const lastTurnWithNarrative = [...conversationHistory]
        .reverse()
        .find(turn => turn.keeperNarrative);
      if (lastTurnWithNarrative && lastTurnWithNarrative.keeperNarrative) {
        previousNarrative = lastTurnWithNarrative.keeperNarrative;
      }
    }

    // Get current round character input (latest turn without narrative yet, or from the latest turn)
    let characterInput: string | null = null;
    if (conversationHistory.length > 0) {
      // Get the latest turn that has characterInput but no narrative yet
      const latestTurn = conversationHistory[conversationHistory.length - 1];
      if (latestTurn && latestTurn.characterInput && !latestTurn.keeperNarrative) {
        characterInput = latestTurn.characterInput;
      } else {
        // Fallback: get the latest characterInput from any turn
        const latestWithInput = [...conversationHistory]
          .reverse()
          .find(turn => turn.characterInput);
        if (latestWithInput && latestWithInput.characterInput) {
          characterInput = latestWithInput.characterInput;
        }
      }
    }

    // Get all scenarios with their snapshots (including timeRestriction)
    const allScenariosWithSnapshots = this.getAllScenariosWithSnapshots();

    // Get current game time
    const currentGameTime = {
      gameDay: gameState.gameDay,
      timeOfDay: gameState.timeOfDay
    };

    // Use LLM to validate and select target snapshot based on map
    console.log(`\n🤖 [Using LLM to Select Target Snapshot Based on Map]:`);
    const runtime = createRuntime();
    const template = getActionDrivenSceneChangeTemplate();

    const templateContext = {
      currentScene: currentScenario ? {
        name: currentScenario.name,
        location: currentScenario.location
      } : null,
      mapData,
      previousNarrative,
      characterInput,
      scenariosWithSnapshots: allScenariosWithSnapshots,
      currentGameTime
    };

    const prompt = composeTemplate(template, {}, templateContext, "handlebars");
    
    const promptChars = prompt.length;
    console.log(`\n📝 [Director Agent - Scene Change] LLM请求统计:`);
    console.log(`   Prompt字符数: ${promptChars} chars`);

    try {
      const llmStart = Date.now();
      const response = await generateText({
        runtime,
        context: prompt,
        modelClass: ModelClass.SMALL,
      });
      const llmDuration = Date.now() - llmStart;
      
      console.log(`   Response字符数: ${response.length} chars`);
      console.log(`   总字符数: ${promptChars + response.length} chars`);
      console.log(`   LLM耗时: ${llmDuration}ms\n`);

      // Parse LLM response
      let parsedResponse: {
        targetSnapshotId?: string;
        reasoning?: string;
      };
      try {
        // Extract JSON from markdown code blocks if present
        let jsonText = response.trim();

        // Try to extract JSON from markdown code blocks
        const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (codeBlockMatch) {
          jsonText = codeBlockMatch[1].trim();
          console.log(`   📝 Detected markdown code block, extracted JSON content`);
        }

        // Try to extract JSON object if wrapped in other text
        if (!jsonText.startsWith('{') && !jsonText.startsWith('[')) {
          const jsonObjectMatch = jsonText.match(/\{[\s\S]*\}/);
          if (jsonObjectMatch) {
            jsonText = jsonObjectMatch[0];
            console.log(`   📝 Extracted JSON object from text`);
          }
        }

        parsedResponse = JSON.parse(jsonText);
      } catch (error) {
        console.error("Failed to parse LLM response as JSON:", error);
        console.error("Raw response:", response);
        return;
      }

      // Validate and execute scene change
      if (parsedResponse?.targetSnapshotId) {
        console.log(`   ✓ LLM returned snapshot ID: ${parsedResponse.targetSnapshotId}`);
        if (parsedResponse.reasoning) {
          console.log(`   ✓ LLM reasoning: ${parsedResponse.reasoning}`);
        }

        // Execute scene progression using snapshot ID
        await this.executeScenarioProgression(
          parsedResponse.targetSnapshotId,
          gameStateManager,
          null
        );
      } else {
        console.error(`   ❌ No targetSnapshotId in LLM response`);
      }
    } catch (error) {
      console.error(`   ❌ LLM call failed:`, error);
    }
  }

  /**
   * Check if story progression should trigger and generate simulated player intent query
   * 🔧 CONFIGURABLE: Set ENABLE_AUTO_PROGRESSION=true in .env to enable (default: false)
   */
  async checkStoryProgression(
    gameStateManager: GameStateManager
  ): Promise<{ shouldTrigger: boolean; simulatedQuery: string | null }> {
    const gameState = gameStateManager.getGameState();

    // Get metrics
    const turnsInScene = gameStateManager.getTurnsInCurrentScene();
    const threshold = gameStateManager.getProgressionThreshold();
    const minutesSinceInput = gameStateManager.getMinutesSinceLastInput();

    // 🔧 Check if auto-progression is enabled (default: false)
    const autoProgressionEnabled = process.env.ENABLE_AUTO_PROGRESSION === 'true';

    console.log(`\n🎬 [Director Agent] Story Progression Check`);
    console.log(`   Auto-progression: ${autoProgressionEnabled ? '✅ ENABLED' : '🔒 DISABLED'}`);
    console.log(`   Turns in scene: ${turnsInScene} / ${threshold}`);
    console.log(`   Minutes since input: ${minutesSinceInput} / 3`);
    console.log(`   Tension: ${gameState.tension}/10`);

    // If auto-progression is disabled, return early
    if (!autoProgressionEnabled) {
      console.log(`   🔒 Auto-progression is disabled (set ENABLE_AUTO_PROGRESSION=true to enable)`);
      return { shouldTrigger: false, simulatedQuery: null };
    }

    // Check if either threshold is reached
    const shouldTrigger = gameStateManager.shouldTriggerProgression();

    if (!shouldTrigger) {
      console.log(`   ✓ No trigger conditions met`);
      return { shouldTrigger: false, simulatedQuery: null };
    }

    // Log which condition triggered
    if (turnsInScene >= threshold) {
      console.log(`   ⚠️ Turn threshold reached! Analyzing player intent...`);
    } else if (minutesSinceInput >= 3) {
      console.log(`   ⚠️ Time threshold reached (3 min idle)! Analyzing player intent...`);
    }

    // Get recent conversation history
    const conversationHistory = (gameState.temporaryInfo.contextualData?.conversationHistory as Array<{
      turnNumber: number;
      characterInput: string;
      keeperNarrative: string | null;
      actionAnalysis?: any;
    }>) || [];

    // Get last 3 turns
    const recentActions = conversationHistory.slice(-3).map(turn => ({
      turnNumber: turn.turnNumber,
      characterInput: turn.characterInput,
      actionAnalysis: turn.actionAnalysis ? JSON.stringify(turn.actionAnalysis, null, 2) : null
    }));

    // Get current scenario info
    const currentScenario = gameState.currentScenario;
    const scenarioInfo = currentScenario ? {
      name: currentScenario.name,
      location: currentScenario.location,
      description: currentScenario.description
    } : null;

    // Prepare template context
    const runtime = createRuntime();
    const template = getPlayerIntentAnalysisTemplate();

    const templateContext = {
      playerName: gameState.playerCharacter.name,
      scenarioInfoJson: scenarioInfo ? JSON.stringify(scenarioInfo, null, 2) : "No current scene",
      recentActions,
      tension: gameState.tension
    };

    const prompt = composeTemplate(template, {}, templateContext, "handlebars");
    
    const promptChars = prompt.length;
    console.log(`\n📝 [Director Agent - Scene Change] LLM请求统计:`);
    console.log(`   Prompt字符数: ${promptChars} chars`);

    try {
      const llmStart = Date.now();
      const response = await generateText({
        runtime,
        context: prompt,
        modelClass: ModelClass.SMALL,
      });
      const llmDuration = Date.now() - llmStart;
      
      console.log(`   Response字符数: ${response.length} chars`);
      console.log(`   总字符数: ${promptChars + response.length} chars`);
      console.log(`   LLM耗时: ${llmDuration}ms\n`);

      // Parse response
      let parsed;
      try {
        // Extract JSON from markdown code blocks if present
        let jsonText = response.trim();

        // Try to extract JSON from markdown code blocks
        const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (codeBlockMatch) {
          jsonText = codeBlockMatch[1].trim();
        }

        // Try to extract JSON object if wrapped in other text
        if (!jsonText.startsWith('{') && !jsonText.startsWith('[')) {
          const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            jsonText = jsonMatch[0];
          }
        }

        parsed = JSON.parse(jsonText);
      } catch (error) {
        console.error("Failed to parse player intent analysis:", error);
        return { shouldTrigger: false, simulatedQuery: null };
      }

      if (parsed.query) {
        console.log(`   ✓ Generated simulated query: "${parsed.query}"`);
        return { shouldTrigger: true, simulatedQuery: parsed.query };
      } else {
        console.warn(`   ⚠️ No query in response`);
        return { shouldTrigger: false, simulatedQuery: null };
      }

    } catch (error) {
      console.error("Error generating player intent analysis:", error);
      return { shouldTrigger: false, simulatedQuery: null };
    }
  }

  /**
   * 生成叙事方向指导
   * 基于模块约束、keeper指导、模块笔记、角色输入和行动结果，生成给 Keeper Agent 的叙事方向指导
   */
  async generateNarrativeDirection(
    gameStateManager: GameStateManager,
    characterInput: string,
    actionResults: ActionResult[]
  ): Promise<string> {
    const runtime = createRuntime();
    const gameState = gameStateManager.getGameState();
    
    // 获取模块信息
    const moduleLoader = new ModuleLoader(this.db);
    const modules = moduleLoader.getAllModules();
    const module = modules.length > 0 ? modules[0] : null;
    
    // 获取模板
    const template = getNarrativeDirectionTemplate();
    
    // 准备模板上下文
    const templateContext = {
      moduleLimitations: gameState.moduleLimitations || null,
      keeperGuidance: gameState.keeperGuidance || null,
      moduleNotes: module?.moduleNotes || null,
      characterInput,
      actionResults: actionResults || []
    };
    
    // 使用模板和LLM生成叙事方向指导
    const prompt = composeTemplate(template, {}, templateContext, "handlebars");
    
    const promptChars = prompt.length;
    console.log(`\n📝 [Director Agent - Narrative Direction] LLM请求统计:`);
    console.log(`   Prompt字符数: ${promptChars} chars`);
    
    try {
      const llmStart = Date.now();
      const response = await generateText({
        runtime,
        context: prompt,
        modelClass: ModelClass.SMALL,
      });
      const llmDuration = Date.now() - llmStart;
      
      console.log(`   Response字符数: ${response.length} chars`);
      console.log(`   总字符数: ${promptChars + response.length} chars`);
      console.log(`   LLM耗时: ${llmDuration}ms\n`);
      
      // 解析LLM的JSON响应
      let parsedResponse;
      try {
        // Extract JSON from markdown code blocks if present
        let jsonText = response.trim();

        // Try to extract JSON from markdown code blocks
        const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (codeBlockMatch) {
          jsonText = codeBlockMatch[1].trim();
        }

        // Try to extract JSON object if wrapped in other text
        if (!jsonText.startsWith('{') && !jsonText.startsWith('[')) {
          const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            jsonText = jsonMatch[0];
          }
        }

        parsedResponse = JSON.parse(jsonText);
      } catch (error) {
        console.error("Failed to parse narrative direction response as JSON:", error);
        console.error("Raw response:", response);
        // 如果解析失败，返回原始响应（去掉可能的代码块标记）
        return response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      }
      
      return parsedResponse.narrativeDirection || "Generate narrative based on current context while respecting module constraints.";
    } catch (error) {
      console.error("Failed to generate narrative direction:", error);
      return "Generate narrative based on current context while respecting module constraints.";
    }
  }
}
