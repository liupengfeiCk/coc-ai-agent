import { ModelClass } from "../../../models/types.js";
import { generateText } from "../../../models/index.js";
import { GameStateManager, GameState, ActionResult, ActionAnalysis, SceneChangeRequest, NPCResponseAnalysis, ActionType } from "../../../state.js";
import type { CharacterProfile, ActionLogEntry, NPCProfile } from "../models/gameTypes.js";
import { actionTypeTemplates } from "./example.js";
import type { ScenarioLoader } from "../memory/scenarioloader/scenarioLoader.js";


/**
 * Action Agent class - handles action resolution and skill checks
 */
export class ActionAgent {
  private scenarioLoader?: ScenarioLoader;

  constructor(scenarioLoader?: ScenarioLoader) {
    this.scenarioLoader = scenarioLoader;
  }

  /**
   * Unified method to process any character's action (player or NPC)
   */
  private async processCharacterAction(
    runtime: any,
    gameState: GameState,
    character: CharacterProfile,
    actionDescription: string,
    options: {
      isNPC: boolean;
      npcResponse?: NPCResponseAnalysis;
      targetCharacter?: CharacterProfile | null;
    }
  ): Promise<GameState> {
    const { isNPC, npcResponse, targetCharacter } = options;

    // Pre-roll dice
    const preRolledDice = this.preRollDice();

    const baseSystemPrompt = `

PRE-ROLLED DICE AVAILABLE:
${JSON.stringify(preRolledDice, null, 2)}

USAGE:
- 1d100: Use for single skill checks, attribute checks, luck rolls (compare against character's skill percentage)
- 1d100_opposed: Use for opposed checks (the second character's roll)
- 1d3, 1d4, 1d6, 2d6, 1d8, 1d10, 1d20: Use for damage, sanity loss, etc.
- Dice with modifiers: You can add modifiers to pre-rolled dice (e.g., 1d3+1, 1d6+2 for damage bonus/STR bonus)
- You can choose to use these dice OR not use any if the action doesn't require dice
- When you use a die, record which die you used and the result in your response
- Examples: "1d3: 2 + 1 (DB) = 3 (unarmed damage)", "1d6: 4 + 2 (STR bonus) = 6 (knife damage)"

!!! Important: Always follow the 7th edition rules of Call of Cthulhu.

DiceUsed field (使用中文格式):
- Record dice rolls you perform during action execution
- MUST use CHINESE format for better frontend display:
  * Skill check: "[行为]: 1d100=[结果] (目标[技能值]) → [成功/失败/大成功/大失败]"
  * Combat: "对 [目标] 进行 [行为]: 1d100=[结果] ([技能名] [技能值]) → [成功/失败]"
  * Damage: "对 [目标] 造成伤害: [骰子]+[修正]=[骰子]+[修正]=[总计]"
  * Simple: "[用途]: [骰子]=[结果] ([说明])"
- Examples:
  * "侦查检定: 1d100=35 (目标70) → 成功" ✓
  * "对 藤蔓怪物 进行 攻击: 1d100=35 (斗殴 71) → 成功" ✓
  * "对 藤蔓怪物 造成伤害: 1d6+2=4+2=6" ✓
  * "随机事件: 1d20=15 (事件判定)" ✓
- Use Chinese: 成功/失败/大成功/大失败
- Include target names for combat/damage
- If no dice: []

Include "scenarioUpdate" if the action permanently changes the environment. "scenarioUpdate" can include:
- description: updated scene flavor text
- conditions: array of environmental condition objects
- events: array of event strings
- exits: array of exit objects
- permanentChanges: array of strings describing lasting structural/environment changes (these will be stored permanently)
${!isNPC ? '' : '\nDo NOT include clues here; the Keeper determines clue revelations.'}

INVENTORY UPDATES:
If the action involves picking up, dropping, receiving, giving, or losing items, include "inventory" in stateUpdate.playerCharacter or stateUpdate.npcCharacters:
- Inventory items are objects with: { name: string, quantity?: number, properties?: Record<string, any> }
- To add items: "inventory": { "add": [{ "name": "item name 1", "quantity": 1 }, { "name": "item name 2" }] }
- To remove items: "inventory": { "remove": [{ "name": "item name", "quantity": 1 }] }
- To replace entire inventory: "inventory": [{ "name": "item1" }, { "name": "item2", "quantity": 3, "properties": { "weight": 2.5 } }]
- For item transfers between characters: update BOTH the giver and receiver
  * Giver: "inventory": { "remove": [{ "name": "item name" }] }
  * Receiver: "inventory": { "add": [{ "name": "item name" }] }

TIME ESTIMATION:
Estimate how many minutes this action realistically takes in game time. Consider the nature and complexity of the action:
- Quick actions: 1-10 minutes (glancing, brief conversation, opening doors)
- Standard actions: 10-30 minutes (searching, examining, skill checks)
- Extended actions: 30-120 minutes (combat, lengthy conversations, research)
- Long activities: 2-8 hours (travel, surveillance, extended tasks)
- Very long activities: 8+ hours (sleeping, all-day journeys)

Be realistic and use your judgment. Include "timeElapsedMinutes" in your response.

SCENE CHANGE DETECTION:
1. Determine if the character intends to move to a new location (entering/exiting rooms, moving between areas, climbing/crossing obstacles)
2. **IMPORTANT**: Movement with dialogue intent (e.g., "和XX去某地谈话", "跟随XX到某地") also counts as scene change
3. If movement requires a skill check (locked door, difficult terrain, stealth entry), call roll_dice first and base scene change on the result
4. If movement is unobstructed (open door, clear path), directly return sceneChange with shouldChange: true
5. If any movement intent detected (including conversational movement), return sceneChange with shouldChange: true
CRITICAL: When returning sceneChange with shouldChange: true, you MUST:
- Select the targetSceneName from the AVAILABLE SCENES list provided below
- Use the EXACT scene name from that list (match by name OR location description)
- Do not make up scene names or use paraphrased versions

You MUST respond with a JSON result:

RESPONSE FORMAT - Return a JSON object with this exact structure:
Example:
{
  "summary": "Brief description of what happened (1-2 sentences)",

  "diceUsed": [
    // Array of dice rolls you performed (empty array if no dice needed)
    // IMPORTANT: Use CHINESE format for better readability!
    // 
    // Format options:
    // 
    // 1. SKILL CHECK (技能检定):
    //    "[行为]: 1d100=[结果] (目标[技能值]) → [成功/失败/大成功/大失败]"
    //    Examples:
    //    "侦查检定: 1d100=35 (目标70) → 成功"
    //    "闪避检定: 1d100=88 (目标50) → 失败"
    //
    // 2. COMBAT CHECK (战斗检定):
    //    "对 [目标] 进行 [行为]: 1d100=[结果] ([技能名] [技能值]) → [成功/失败]"
    //    Examples:
    //    "对 藤蔓怪物 进行 攻击: 1d100=35 (斗殴 71) → 成功"
    //
    // 3. DAMAGE ROLL (伤害骰):
    //    "对 [目标] 造成伤害: [骰子]+[修正]=[骰子结果]+[修正]=[总计]"
    //    Examples:
    //    "对 藤蔓怪物 造成伤害: 1d6+2=4+2=6"
    //
    // 4. SIMPLE ROLL (简单投骰):
    //    "[用途]: [骰子]=[结果] ([说明])"
    //    Examples:
    //    "随机事件: 1d20=15 (事件判定)"
  ],

  "stateUpdate": {
    // Optional: Update character states (HP, sanity, inventory, etc.)
    "playerCharacter": {
      "name": "Character Name",  // MUST match the acting character's name
      "status": {
        "hp": -3,              // HP change (negative for damage, positive for healing)
        "sanity": 0,           // Sanity change
        "magic": 0,            // Magic points change
        "luck": 0              // Luck change
      },
      "inventory": {           // Optional: only if inventory changes
        "add": [{"name": "item name", "quantity": 1}],
        "remove": [{"name": "item name", "quantity": 1}]
      }
    },
    "npcCharacters": [         // Optional: only if NPC states change
      {
        "id": "npc-id",        // MUST use exact NPC id
        "name": "NPC Name",
        "status": {"hp": -4, "sanity": 0}
      }
    ]
  },

  "scenarioUpdate": {          // Optional: only if environment permanently changes
    "description": "Updated scene description",
    "conditions": [{"type": "lighting", "description": "...", "mechanicalEffect": "..."}],
    "events": ["Event description"],
    "exits": [{"direction": "north", "destination": "...", "description": "...", "condition": "open"}],
    "permanentChanges": ["Permanent change description"]
  },

  "sceneChange": {
    "shouldChange": false,     // true if moving to new location
    "targetSceneName": null,   // Scene name from AVAILABLE SCENES or null
    "reason": "Reason for scene change or staying"
  },

  "timeElapsedMinutes": 5,
  "timeConsumption": "short"
}
`;

    const actionTypeTemplate = this.getActionTypeTemplate(gameState, isNPC, npcResponse);

    const systemPrompt = baseSystemPrompt + actionTypeTemplate;

    // Single call - no tool loop needed with pre-rolled dice
    const context = this.buildContext(gameState, character, { isNPC, npcResponse, targetCharacter });
    const fullPrompt = systemPrompt + context + `\n\nCharacter action: ${actionDescription}`;
    
    const agentName = isNPC ? `Action Agent (NPC: ${character.name})` : 'Action Agent (Player)';
    const promptChars = fullPrompt.length;
    console.log(`\n📝 [${agentName}] LLM请求统计:`);
    console.log(`   Prompt字符数: ${promptChars} chars`);

    const llmStart = Date.now();
    const response = await generateText({
      runtime,
      context: fullPrompt,
      modelClass: ModelClass.SMALL,
    });
    const llmDuration = Date.now() - llmStart;
    
    console.log(`   Response字符数: ${response.length} chars`);
    console.log(`   总字符数: ${promptChars + response.length} chars`);
    console.log(`   LLM耗时: ${llmDuration}ms\n`);

    // Parse JSON response
    let parsed;
    try {
      let jsonText = response.trim();

      const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1].trim();
        console.log(`📝 [Action Agent] Detected markdown code block, extracted JSON content`);
      }

      if (!jsonText.startsWith('{') && !jsonText.startsWith('[')) {
        const jsonObjectMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonObjectMatch) {
          jsonText = jsonObjectMatch[0];
          console.log(`📝 [Action Agent] Extracted JSON object from text`);
        }
      }

      parsed = JSON.parse(jsonText);
    } catch (error) {
      console.error(`❌ [Action Agent] JSON parsing error:`, error);
      console.error(`   Error type: ${error instanceof Error ? error.constructor.name : typeof error}`);
      console.error(`   Error message: ${error instanceof Error ? error.message : String(error)}`);
      console.error(`   Original response (first 500 chars): ${response.substring(0, 500)}${response.length > 500 ? '...' : ''}`);
      console.error(`   Original response length: ${response.length} characters`);
      return this.buildErrorResult(gameState, character, `Invalid JSON response from model: ${error instanceof Error ? error.message : String(error)}`, [], isNPC);
    }

    // Extract dice usage from response
    const diceUsed = parsed.diceUsed || [];

    // Return final result
    return this.buildFinalResult(gameState, character, parsed, diceUsed, { isNPC, npcResponse });
  }

  /**
   * Process character action and resolve with dice rolls and state updates
   */
  async processAction(runtime: any, gameState: GameState, userMessage: string): Promise<GameState> {
    const actionAnalysis = gameState.temporaryInfo.currentActionAnalysis;
    const targetCharacter = this.findTargetCharacter(gameState, actionAnalysis);

    return this.processCharacterAction(
      runtime,
      gameState,
      gameState.playerCharacter,
      userMessage,
      {
        isNPC: false,
        targetCharacter
      }
    );
  }

  /**
   * Pre-roll common dice expressions
   */
  private preRollDice() {
    const rollDice = (sides: number, count: number = 1): number[] => {
      return Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
    };

    // Pre-roll all common dice types
    const d100_1 = rollDice(100)[0];
    const d100_2 = rollDice(100)[0];
    const d20 = rollDice(20)[0];
    const d10 = rollDice(10)[0];
    const d8 = rollDice(8)[0];
    const d6_1 = rollDice(6)[0];
    const d6_2 = rollDice(6)[0];
    const d4 = rollDice(4)[0];
    const d3 = rollDice(3)[0];

    return {
      "1d100": d100_1,        // For single skill checks
      "1d100_opposed": d100_2, // For opposed checks (second roll)
      "1d20": d20,
      "1d10": d10,
      "1d8": d8,
      "1d6": d6_1,
      "2d6": d6_1 + d6_2,
      "1d4": d4,
      "1d3": d3
    };
  }

  private executeDiceRoll(expression: string) {
    try {
      const { count, sides, modifier } = this.parseDiceExpression(expression);

      const rolls = Array.from(
        { length: count },
        () => Math.floor(Math.random() * sides) + 1
      );

      const rollTotal = rolls.reduce((a, b) => a + b, 0);
      const finalTotal = rollTotal + modifier;

      return {
        expression,
        rolls,
        rollTotal,
        modifier,
        total: finalTotal,
        breakdown: `${rolls.join('+')}${modifier !== 0 ? `${modifier >= 0 ? '+' : ''}${modifier}` : ''} = ${finalTotal}`
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  private parseDiceExpression(expression: string): { count: number; sides: number; modifier: number } {
    const cleaned = expression.toLowerCase().replace(/\s/g, '');
    const match = cleaned.match(/^(\d*)d(\d+)(([+-])(\d+))?$/);
    
    if (!match) {
      throw new Error(`Invalid dice expression: ${expression}`);
    }
    
    const count = parseInt(match[1] || '1');
    const sides = parseInt(match[2]);
    const modifierSign = match[4] || '+';
    const modifierValue = parseInt(match[5] || '0');
    const modifier = modifierSign === '+' ? modifierValue : -modifierValue;
    
    return { count, sides, modifier };
  }

  /**
   * Find target character based on action analysis or NPC response
   */
  private findTargetCharacter(
    gameState: GameState,
    actionAnalysis?: ActionAnalysis | null,
    npcResponse?: NPCResponseAnalysis
  ): CharacterProfile | null {
    let targetName: string | null = null;

    if (npcResponse?.targetCharacter) {
      targetName = npcResponse.targetCharacter;
    } else if (actionAnalysis?.target?.name) {
      targetName = actionAnalysis.target.name;
    }

    if (!targetName) {
      return null;
    }

    const targetLower = targetName.toLowerCase();

    // Check if target is player
    if (gameState.playerCharacter.name.toLowerCase().includes(targetLower)) {
      return gameState.playerCharacter;
    }

    // Check NPCs
    const targetNpc = gameState.npcCharacters.find(npc =>
      npc.name.toLowerCase().includes(targetLower) ||
      npc.id.toLowerCase().includes(targetLower)
    );

    return targetNpc || null;
  }

  private getActionTypeTemplate(
    gameState: GameState,
    isNPC: boolean = false,
    npcResponse?: NPCResponseAnalysis
  ): string {
    let actionType: string | undefined;

    if (isNPC && npcResponse?.responseType) {
      actionType = npcResponse.responseType;
    } else {
      const actionAnalysis = gameState.temporaryInfo.currentActionAnalysis;
      actionType = actionAnalysis?.actionType;
    }

    if (!actionType) {
      return `
{
  "type": "result",
  "summary": "Action completed",
  "stateUpdate": {
    "playerCharacter": {
      "name": "Character Name",
      "status": { "hp": 0 }
    }
  },
  "log": ["Action log entry"]
}`;
    }

    const template =
      actionTypeTemplates[actionType as keyof typeof actionTypeTemplates];
    return template || actionTypeTemplates.exploration; // fallback to exploration
  }

  /**
   * Unified method to build context for any character action
   */
  private buildContext(
    gameState: GameState,
    character: CharacterProfile,
    options: {
      isNPC: boolean;
      npcResponse?: NPCResponseAnalysis;
      targetCharacter?: CharacterProfile | null;
    }
  ): string {
    const { isNPC, npcResponse } = options;
    let { targetCharacter } = options;

    let context = "\n\nCurrent Scenario:\n";
    if (gameState.currentScenario) {
      const scenarioInfo = {
        name: gameState.currentScenario.name,
        location: gameState.currentScenario.location,
        description: gameState.currentScenario.description,
        conditions: gameState.currentScenario.conditions,
        permanentChanges: gameState.currentScenario.permanentChanges,
        exits: gameState.currentScenario.exits || []
      };
      context += JSON.stringify(scenarioInfo, null, 2);
    } else {
      context += "No current scenario";
    }

    // Add all available scene names for scene change selection
    if (this.scenarioLoader) {
      const allScenarios = this.scenarioLoader.getAllScenarios();
      if (allScenarios.length > 0) {
        context += "\n\n=== AVAILABLE SCENES FOR SCENE CHANGE ===";
        context += `\nIf the ${isNPC ? 'NPC' : 'player'} wants to move to a new location, you MUST select one of these scene names (use EXACT name):\n`;
        
        // Format with location info to help LLM match natural language
        for (const scenario of allScenarios) {
          const name = scenario.snapshot.name;
          const location = scenario.snapshot.location || "未知位置";
          const description = scenario.snapshot.description ? 
            (scenario.snapshot.description.substring(0, 50) + "...") : "";
          
          if (name) {
            context += `\n- "${name}" @ ${location}`;
            if (description) {
              context += ` (${description})`;
            }
          }
        }
        context += "\n=== END OF AVAILABLE SCENES ===\n";
      }
    }

    // Add last keeper narrative if available (only for player actions)
    if (!isNPC) {
      const conversationHistory = (gameState.temporaryInfo.contextualData?.conversationHistory as Array<{
        turnNumber: number;
        characterInput: string;
        keeperNarrative: string | null;
      }>) || [];

      if (conversationHistory.length > 0) {
        const lastTurnWithNarrative = [...conversationHistory]
          .reverse()
          .find(turn => turn.keeperNarrative);

        if (lastTurnWithNarrative && lastTurnWithNarrative.keeperNarrative) {
          context += "\n\n=== PREVIOUS KEEPER NARRATIVE ===";
          context += `\nThe Keeper's last narrative description:\n"${lastTurnWithNarrative.keeperNarrative}"`;
          context += "\n=== END OF PREVIOUS NARRATIVE ===\n";
        }
      }
    }

    // Add temporary rules if any
    if (gameState.temporaryInfo.rules.length > 0) {
      context += "\n\nTemporary Rules:\n";
      gameState.temporaryInfo.rules.forEach((rule, index) => {
        context += `${index + 1}. ${rule}\n`;
      });
    }

    // Add acting character
    context += `\n\n${isNPC ? 'NPC (acting character)' : 'Character'}:\n` + JSON.stringify(character, null, 2);

    // Add target character if applicable
    if (targetCharacter) {
      const isPlayerTarget = targetCharacter.id === gameState.playerCharacter.id ||
        targetCharacter.name === gameState.playerCharacter.name;
      context += `\n\nTarget ${isPlayerTarget ? 'Character (Player)' : 'NPC'}:\n` + JSON.stringify(targetCharacter, null, 2);
    }

    // Add NPC response context if NPC action
    if (isNPC && npcResponse) {
      context += "\n\nNPC Response Context:\n";
      context += JSON.stringify({
        responseDescription: npcResponse.responseDescription,
        executionOrder: npcResponse.executionOrder
      }, null, 2);
    }

    return context;
  }

  /**
   * Unified method to build final result for any character action
   */
  private buildFinalResult(
    gameState: GameState,
    character: CharacterProfile,
    parsed: any,
    toolLogs: string[],
    options: {
      isNPC: boolean;
      npcResponse?: NPCResponseAnalysis;
    }
  ): GameState {
    const { isNPC, npcResponse } = options;
    const stateManager = new GameStateManager(gameState);
    
    // Apply the state update from LLM result
    if (parsed.stateUpdate) {
      stateManager.applyActionUpdate(parsed.stateUpdate);
    }

    // Handle scene change request
    if (parsed.sceneChange) {
      if (isNPC && parsed.sceneChange.shouldChange && parsed.sceneChange.targetSceneName) {
        // NPC scene change: update NPC location
        const targetSceneName = parsed.sceneChange.targetSceneName;
        console.log(`\n📍 [Action Agent] NPC ${character.name} requested scene transition: ${targetSceneName}`);

        if (this.scenarioLoader) {
          const searchResult = this.scenarioLoader.searchScenarios({ name: targetSceneName });

          if (searchResult.scenarios.length > 0) {
            const targetScenario = searchResult.scenarios[0];
            const targetLocation = targetScenario.snapshot.location;

            const currentState = stateManager.getGameState();
            const npcInState = currentState.npcCharacters.find(n => n.id === character.id) as NPCProfile | undefined;

            if (npcInState) {
              const oldLocation = npcInState.currentLocation || null;
              npcInState.currentLocation = targetLocation;

              if (oldLocation !== targetLocation) {
                console.log(`   ✓ NPC ${character.name} location updated: ${oldLocation || "Unknown"} → ${targetLocation}`);
              } else {
                console.log(`   - NPC ${character.name} already at target location ${targetLocation}`);
              }
            } else {
              console.warn(`   ⚠️  NPC ${character.name} (ID: ${character.id}) not found in gameState`);
            }
          } else {
            console.warn(`   ⚠️  Scene "${targetSceneName}" not found, unable to update NPC location`);
          }
        } else {
          console.warn(`   ⚠️  ScenarioLoader not initialized, unable to find scene location`);
        }

        // If NPC targets player, trigger scene change for player too
        const isPlayerTarget = npcResponse?.targetCharacter &&
          gameState.playerCharacter.name.toLowerCase().includes(npcResponse.targetCharacter.toLowerCase());

        if (isPlayerTarget) {
          const sceneChangeRequest: SceneChangeRequest = {
            shouldChange: true,
            targetSceneName,
            reason: `NPC ${character.name} moved the investigator`,
            timestamp: new Date()
          };
          stateManager.setSceneChangeRequest(sceneChangeRequest);
          console.log(`   ✓ NPC triggered player scene change:`, sceneChangeRequest);
        }
      } else {
        // Player scene change: direct scene change request
        const sceneChangeRequest: SceneChangeRequest = {
          shouldChange: parsed.sceneChange.shouldChange || false,
          targetSceneName: parsed.sceneChange.targetSceneName || null,
          reason: parsed.sceneChange.reason || "Action-driven scene change",
          timestamp: new Date()
        };
        
        // Only set scene change request if it's a positive request OR no existing request
        const existingRequest = gameState.temporaryInfo.sceneChangeRequest;
        const shouldOverwrite = sceneChangeRequest.shouldChange || !existingRequest?.shouldChange;
        
        if (shouldOverwrite) {
          stateManager.setSceneChangeRequest(sceneChangeRequest);
          console.log(`Action Agent: Scene change request - `, sceneChangeRequest);
        } else {
          console.log(`Action Agent: Keeping existing scene change request (not overwriting with shouldChange=false)`);
        }
      }
    }

    // Apply scenario updates if provided (clues handled by Keeper)
    const scenarioChanges: string[] = [];
    const scenarioUpdate = parsed.scenarioUpdate ? { ...parsed.scenarioUpdate } : null;
    if (scenarioUpdate && "clues" in scenarioUpdate) {
      delete scenarioUpdate.clues;
    }
    if (scenarioUpdate) {
      stateManager.updateScenarioState(scenarioUpdate);
      
      // Generate scenario change descriptions for action results
      if (scenarioUpdate.description) {
        scenarioChanges.push("Environment description updated");
      }
      
      if (scenarioUpdate.conditions && scenarioUpdate.conditions.length > 0) {
        scenarioChanges.push(`Environmental conditions changed: ${scenarioUpdate.conditions.map((c: any) => c.description).join(', ')}`);
      }
      
      if (scenarioUpdate.events && scenarioUpdate.events.length > 0) {
        scenarioChanges.push(`New events recorded: ${scenarioUpdate.events.join(', ')}`);
      }
      
      if (scenarioUpdate.permanentChanges && scenarioUpdate.permanentChanges.length > 0) {
        scenarioUpdate.permanentChanges.forEach((change: string) => {
          scenarioChanges.push(`Permanent change: ${change}`);
          stateManager.addPermanentScenarioChange(change);
        });
      }

      if (scenarioUpdate.exits && scenarioUpdate.exits.length > 0) {
        scenarioUpdate.exits.forEach((exit: any) => {
          const changeDesc = `Exit ${exit.direction} to ${exit.destination}: ${exit.condition || 'modified'}`;
          scenarioChanges.push(changeDesc);
          // Record structural changes as permanent
          stateManager.addPermanentScenarioChange(`${parsed.stateUpdate?.playerCharacter?.name || 'Character'} modified ${exit.direction} exit - ${changeDesc}`);
        });
      }
    }
    
    // Create structured action result
    const actionResult: ActionResult = {
      timestamp: new Date(),
      gameTime: gameState.timeOfDay || "Unknown time",
      timeElapsedMinutes: parsed.timeElapsedMinutes || 0,
      location: gameState.currentScenario?.location || "Unknown location",
      character: character.name,
      result: parsed.summary || (isNPC && npcResponse?.responseDescription) || "performed an action",
      // Use diceUsed from parsed response (AI-formatted) with character prefix
      diceRolls: (parsed.diceUsed || []).map((roll: string) => {
        // Add character name prefix if not already present
        if (!roll.startsWith(character.name)) {
          return `${character.name} ${roll}`;
        }
        return roll;
      }),
      timeConsumption: parsed.timeConsumption || "instant", // Default to instant if not specified
      scenarioChanges: scenarioChanges.length > 0 ? scenarioChanges : undefined
    };
    
    // Add to action results
    stateManager.addActionResult(actionResult);

    // Log detailed action result
    const logPrefix = isNPC ? `📊 [NPC Action Result] ${character.name}` : `📊 [Action Result] Detailed execution result`;
    console.log(`\n${logPrefix}:`);
    if (!isNPC) {
      console.log(`   Character: ${actionResult.character}`);
      console.log(`   Location: ${actionResult.location}`);
      console.log(`   Game Time: ${actionResult.gameTime}`);
      console.log(`   Time Elapsed: ${actionResult.timeElapsedMinutes || 0} minutes`);
      console.log(`   Time Consumption: ${actionResult.timeConsumption}`);
    }
    console.log(`   Result: ${actionResult.result}`);
    if (isNPC && npcResponse) {
      console.log(`   Type: ${npcResponse.responseType}`);
    }
    if (actionResult.diceRolls && actionResult.diceRolls.length > 0) {
      console.log(`   Dice Rolls${isNPC ? '' : ` (${actionResult.diceRolls.length})`}: ${isNPC ? actionResult.diceRolls.join(', ') : ''}`);
      if (!isNPC) {
        actionResult.diceRolls.forEach((roll, index) => {
          console.log(`     [${index + 1}] ${roll}`);
        });
      }
    } else if (!isNPC) {
      console.log(`   Dice Rolls: None`);
    }
    if (actionResult.scenarioChanges && actionResult.scenarioChanges.length > 0 && !isNPC) {
      console.log(`   Scenario Changes (${actionResult.scenarioChanges.length}):`);
      actionResult.scenarioChanges.forEach((change, index) => {
        console.log(`     [${index + 1}] ${change}`);
      });
    }

    // Update game time based on elapsed time
    // IMPORTANT: Only player actions advance game time, NPC reactions do not
    if (actionResult.timeElapsedMinutes && actionResult.timeElapsedMinutes > 0) {
      if (!isNPC) {
        // Only advance time for player actions
        const oldDay = gameState.gameDay;
        const oldTime = gameState.timeOfDay;
        stateManager.updateGameTime(actionResult.timeElapsedMinutes);
        const updatedState = stateManager.getGameState();
        const newDay = updatedState.gameDay;
        const newTime = updatedState.timeOfDay;
        const fullTime = stateManager.getFullGameTime();

        console.log(`⏰ Time advanced by ${actionResult.timeElapsedMinutes} minutes (Player action)`);
        if (newDay > oldDay) {
          console.log(`   Day ${oldDay}, ${oldTime} → ${fullTime} 🌅`);
        } else {
          console.log(`   ${oldTime} → ${fullTime}`);
        }
      } else {
        // NPC actions have time elapsed but don't advance game time
        console.log(`⏰ NPC action time: ${actionResult.timeElapsedMinutes} minutes (not counted in game time)`);
      }
    }

    // Append summary to action logs for actor and target (if any)
    // Use full game time from state manager
    const fullTime = stateManager.getFullGameTime();
    const logEntry: ActionLogEntry = {
      time: fullTime,
      location: actionResult.location,
      summary: actionResult.result,
    };
    const updatedState = stateManager.getGameState() as GameState;

    const appendLog = (character: CharacterProfile | undefined) => {
      if (!character) return;
      if (!character.actionLog) {
        character.actionLog = [];
      }
      character.actionLog.push(logEntry);
    };

    // Acting character (player or NPC)
    const actorInState = isNPC
      ? updatedState.npcCharacters.find(npc => npc.id === character.id)
      : updatedState.playerCharacter;
    appendLog(actorInState);

    // Target character (if present)
    const targetName = isNPC ? npcResponse?.targetCharacter : gameState.temporaryInfo.currentActionAnalysis?.target?.name;
    if (targetName) {
      const targetLower = targetName.toLowerCase();
      if (updatedState.playerCharacter.name.toLowerCase().includes(targetLower)) {
        appendLog(updatedState.playerCharacter);
      } else {
        const targetNpc = updatedState.npcCharacters.find((npc) =>
          npc.name.toLowerCase().includes(targetLower)
        );
        appendLog(targetNpc);
      }
    }
    
    // Return the updated game state
    return stateManager.getGameState() as GameState;
  }


  /**
   * Unified method to build error result for any character action
   */
  private buildErrorResult(
    gameState: GameState,
    character: CharacterProfile,
    errorMessage: string,
    toolLogs: string[],
    isNPC: boolean
  ): GameState {
    const logPrefix = isNPC ? `NPC action processing error (${character.name})` : `Error handling`;
    console.error(`\n❌ [Action Agent] ${logPrefix}: ${errorMessage}`);
    console.error(`   Current game state: Day ${gameState.gameDay}, ${gameState.timeOfDay}`);
    console.error(`   Location: ${gameState.currentScenario?.location || "Unknown"}`);
    console.error(`   Character: ${character.name}`);
    if (toolLogs.length > 0) {
      console.error(`   Executed tool calls (${toolLogs.length}):`);
      toolLogs.forEach((log, index) => {
        console.error(`     [${index + 1}] ${log}`);
      });
    }

    const stateManager = new GameStateManager(gameState);

    // Create an error action result to record the failure
    const errorActionResult: ActionResult = {
      timestamp: new Date(),
      gameTime: gameState.timeOfDay || "Unknown time",
      timeElapsedMinutes: 0, // No time elapsed on error
      location: gameState.currentScenario?.location || "Unknown location",
      character: character.name,
      result: `[Error] ${isNPC ? 'NPC ' : ''}action processing failed: ${errorMessage}`,
      diceRolls: toolLogs.length > 0 ? toolLogs : [],
      timeConsumption: "instant",
      scenarioChanges: [`Error: ${errorMessage}`]
    };

    // Add error result to action results
    stateManager.addActionResult(errorActionResult);

    console.error(`\n📊 [Action Result] Error result recorded:`);
    console.error(`   Character: ${errorActionResult.character}`);
    console.error(`   Location: ${errorActionResult.location}`);
    console.error(`   Error: ${errorActionResult.result}`);

    // Return valid GameState with error recorded
    return stateManager.getGameState() as GameState;
  }

  /**
   * Process NPC actions based on response analyses
   * Processes all NPCs that have willRespond=true in npcResponseAnalyses
   */
  async processNPCActions(runtime: any, gameState: GameState): Promise<GameState> {
    const npcResponseAnalyses = gameState.temporaryInfo.npcResponseAnalyses || [];

    // Filter NPCs that will respond and sort by executionOrder
    const respondingNPCs = npcResponseAnalyses
      .filter(analysis => analysis.willRespond && analysis.responseType && analysis.responseType !== "none")
      .sort((a, b) => a.executionOrder - b.executionOrder);

    if (respondingNPCs.length === 0) {
      console.log("📝 [Action Agent] No NPCs will respond, skipping NPC action processing");
      return gameState;
    }

    console.log(`\n🎭 [Action Agent] Processing ${respondingNPCs.length} NPC actions in order...`);

    let currentState = gameState;

    // Process each NPC action sequentially in executionOrder
    for (const npcResponse of respondingNPCs) {
      const npc = currentState.npcCharacters.find(n => 
        n.name.toLowerCase() === npcResponse.npcName.toLowerCase()
      );
      
      if (!npc) {
        console.warn(`⚠️ [Action Agent] NPC not found: ${npcResponse.npcName}`);
        continue;
      }
      
      console.log(`\n🎭 [Action Agent] Processing NPC action [${npcResponse.executionOrder}]: ${npcResponse.npcName} (${npcResponse.responseType})`);
      
      // Process this NPC's action
      currentState = await this.processSingleNPCAction(
        runtime,
        currentState,
        npc,
        npcResponse
      );
    }
    
    console.log(`\n✅ [Action Agent] Completed processing ${respondingNPCs.length} NPC actions`);
    
    return currentState;
  }

  /**
   * Process a single NPC action
   */
  private async processSingleNPCAction(
    runtime: any,
    gameState: GameState,
    npc: CharacterProfile,
    npcResponse: NPCResponseAnalysis
  ): Promise<GameState> {
    const npcActionDescription = npcResponse.responseDescription || `${npc.name} performs a ${npcResponse.responseType} action`;
    const targetCharacter = this.findTargetCharacter(gameState, null, npcResponse);

    return this.processCharacterAction(
      runtime,
      gameState,
      npc,
      npcActionDescription,
      {
        isNPC: true,
        npcResponse,
        targetCharacter
      }
    );
  }
}
