import { ModelClass } from "../../../models/types.js";
import { generateText } from "../../../models/index.js";
import { GameState, NPCResponseAnalysis, ActionType } from "../../../state.js";
import type { CharacterProfile, NPCProfile } from "../models/gameTypes.js";
import { getCharacterTemplate } from "./characterTemplate.js";
import { getCharacterSimulatedTemplate } from "./characterSimulatedTemplate.js";
import { composeTemplate } from "../../../template.js";
import type { CoCDatabase } from "../memory/database/index.js";

/**
 * Character Agent class - handles NPC response analysis
 */
export class CharacterAgent {
  private db: CoCDatabase | null = null;

  /**
   * Set database instance for persistence
   */
  setDatabase(db: CoCDatabase): void {
    this.db = db;
  }

  /**
   * Analyze NPC responses to simulated queries (from Director Agent)
   * This method is used when the Director generates simulated story events
   * It doesn't require action results or action analysis
   */
  async analyzeNPCResponsesFromSimulatedQuery(
    runtime: any,
    gameState: GameState,
    simulatedQuery: string
  ): Promise<NPCResponseAnalysis[]> {
    const template = getCharacterSimulatedTemplate();

    // 1. Get current scenario information
    const scenarioInfo = this.extractScenarioInfo(gameState);

    // 2. Get player character information
    const playerCharacter = this.extractCharacterInfo(gameState.playerCharacter);

    // 3. Get NPCs in current scene location (with full details including goals)
    const sceneNpcs = this.extractSceneNPCs(gameState);

    // If no NPCs in scene, return empty array
    if (sceneNpcs.length === 0) {
      console.log("📝 [Character Agent] No NPCs in current scene for simulated query, skipping analysis");
      return [];
    }

    // Build template context
    const templateContext = {
      simulatedQuery,
      scenarioInfoJson: JSON.stringify(scenarioInfo, null, 2),
      playerCharacterJson: JSON.stringify(playerCharacter, null, 2),
      sceneNpcsJson: JSON.stringify(sceneNpcs, null, 2)
    };

    const context = composeTemplate(template, {}, templateContext, "handlebars");

    console.log("\n🎭 [Character Agent] Analyzing NPC responses to simulated query...");
    console.log(`   Simulated Query: "${simulatedQuery.substring(0, 100)}${simulatedQuery.length > 100 ? '...' : ''}"`);
    console.log(`   Scene: ${scenarioInfo.location || "Unknown"}`);
    console.log(`   NPCs to analyze: ${sceneNpcs.length}`);
    
    const promptChars = context.length;
    console.log(`\n📝 [Character Agent - Simulated] LLM请求统计:`);
    console.log(`   Prompt字符数: ${promptChars} chars`);

    // Call LLM
    const llmStart = Date.now();
    const response = await generateText({
      runtime,
      context,
      modelClass: ModelClass.SMALL,
    });
    const llmDuration = Date.now() - llmStart;
    
    console.log(`   Response字符数: ${response.length} chars`);
    console.log(`   总字符数: ${promptChars + response.length} chars`);
    console.log(`   LLM耗时: ${llmDuration}ms\n`);

    // Parse and validate response (reuse existing parsing logic)
    return this.parseNPCResponseAnalyses(response);
  }

  /**
   * Analyze NPC responses to character actions
   */
  async analyzeNPCResponses(
    runtime: any,
    gameState: GameState,
    characterInput: string
  ): Promise<NPCResponseAnalysis[]> {
    const template = getCharacterTemplate();
    
    // 1. Get latest action result
    const latestActionResult = this.getLatestActionResult(gameState);
    
    // 2. Get current scenario information
    const scenarioInfo = this.extractScenarioInfo(gameState);
    
    // 3. Get player character information
    const playerCharacter = this.extractCharacterInfo(gameState.playerCharacter);
    
    // 4. Get NPCs in current scene location
    const sceneNpcs = this.extractSceneNPCs(gameState);
    
    // If no NPCs in scene, return empty array
    if (sceneNpcs.length === 0) {
      console.log("📝 [Character Agent] No NPCs in current scene, skipping response analysis");
      return [];
    }
    
    // 5. Get target information from action analysis to determine if action is targeted
    const actionAnalysis = gameState.temporaryInfo.currentActionAnalysis;
    const actionTarget = actionAnalysis?.target || null;
    
    // 6. Filter NPCs based on relationship response probability
    const { respondingNpcs, hasFirstTimeInteraction } = this.filterRespondingNPCs(
      sceneNpcs,
      actionTarget,
      gameState.playerCharacter.name
    );
    
    // If no NPCs will respond, return empty array
    if (respondingNpcs.length === 0) {
      console.log("📝 [Character Agent] No NPCs will respond (filtered by relationship probability)");
      return [];
    }
    
    console.log(`📝 [Character Agent] NPCs filtered: ${sceneNpcs.length} → ${respondingNpcs.length} (probability-based)`);
    if (hasFirstTimeInteraction) {
      console.log(`   ℹ️  Contains first-time interaction (guaranteed response)`);
    }
    
    // 7. Pre-calculate first-time interaction flags for each NPC
    const npcsWithInteractionFlags = respondingNpcs.map(npc => {
      const hasRelationship = (npc.relationships || []).some((rel: any) =>
        this.isNameSimilar(rel.targetName, gameState.playerCharacter.name)
      );
      return {
        ...npc,
        isFirstTimeInteraction: !hasRelationship  // Add flag for LLM
      };
    });
    
    // Build template context
    const templateContext = {
      characterInput,
      latestActionResultJson: latestActionResult ? JSON.stringify(latestActionResult, null, 2) : "No action result available yet.",
      scenarioInfoJson: JSON.stringify(scenarioInfo, null, 2),
      playerCharacterJson: JSON.stringify(playerCharacter, null, 2),
      sceneNpcsJson: JSON.stringify(npcsWithInteractionFlags, null, 2),
      actionTargetJson: actionTarget ? JSON.stringify(actionTarget, null, 2) : null
    };
    
    const context = composeTemplate(template, {}, templateContext, "handlebars");
    
    console.log("\n🎭 [Character Agent] Analyzing NPC responses...");
    console.log(`   Scene: ${scenarioInfo.location || "Unknown"}`);
    console.log(`   NPCs to analyze: ${npcsWithInteractionFlags.length}`);
    
    // DEBUG: Log NPC first-time interaction flags
    for (const npc of npcsWithInteractionFlags) {
      console.log(`   [DEBUG] ${npc.name}: isFirstTimeInteraction=${npc.isFirstTimeInteraction}`);
    }
    
    const promptChars = context.length;
    console.log(`\n📝 [Character Agent] LLM请求统计:`);
    console.log(`   Prompt字符数: ${promptChars} chars`);
    
    // Call LLM
    const llmStart = Date.now();
    const response = await generateText({
      runtime,
      context,
      modelClass: ModelClass.SMALL,
    });
    const llmDuration = Date.now() - llmStart;
    
    console.log(`   Response字符数: ${response.length} chars`);
    console.log(`   总字符数: ${promptChars + response.length} chars`);
    console.log(`   LLM耗时: ${llmDuration}ms\n`);

    // Parse and validate response
    const analyses = this.parseNPCResponseAnalyses(response);
    
    // Apply relationship changes
    this.applyRelationshipChanges(analyses, gameState);
    
    return analyses;
  }
  
  /**
   * Get latest action result
   */
  private getLatestActionResult(gameState: GameState): any | null {
    const actionResults = gameState.temporaryInfo.actionResults;
    
    if (!actionResults || actionResults.length === 0) {
      return null;
    }
    
    const latest = actionResults[actionResults.length - 1];
    
    return {
      gameTime: latest.gameTime,
      timeElapsedMinutes: latest.timeElapsedMinutes,
      location: latest.location,
      character: latest.character,
      result: latest.result,
      timeConsumption: latest.timeConsumption,
      scenarioChanges: latest.scenarioChanges || []
    };
  }
  
  /**
   * Extract scenario information
   */
  private extractScenarioInfo(gameState: GameState): any {
    const currentScenario = gameState.currentScenario;
    
    if (!currentScenario) {
      return {
        hasScenario: false,
        message: "No current scenario loaded"
      };
    }
    
    return {
      id: currentScenario.id,
      name: currentScenario.name,
      location: currentScenario.location,
      description: currentScenario.description,
      characters: currentScenario.characters || [],
      clues: currentScenario.clues || [],
      conditions: currentScenario.conditions || [],
      events: currentScenario.events || [],
      exits: currentScenario.exits || [],
      permanentChanges: currentScenario.permanentChanges || []
    };
  }
  
  /**
   * Extract character information (basic attributes)
   */
  private extractCharacterInfo(character: CharacterProfile): any {
    return {
      id: character.id,
      name: character.name,
      attributes: character.attributes,
      status: character.status,
      skills: character.skills,
      inventory: character.inventory || [],
      notes: character.notes || ""
    };
  }
  
  /**
   * Normalize name (for fuzzy matching)
   */
  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ")
      .trim();
  }

  /**
   * Calculate Levenshtein distance (edit distance) between two strings
   */
  private levenshtein(a: string, b: string): number {
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
   * Determine if two names are similar (similarity >= 80%)
   */
  private isNameSimilar(name1: string, name2: string): boolean {
    const na = this.normalizeName(name1);
    const nb = this.normalizeName(name2);
    if (!na || !nb) return false;
    if (na === nb) return true;

    // Check if one name is a prefix of the other (handles "南希" vs "南希夏洛特")
    if (na.startsWith(nb) || nb.startsWith(na)) return true;

    // If first word is the same, consider similar
    const tokensA = na.split(/\s+/);
    const tokensB = nb.split(/\s+/);
    if (tokensA[0] && tokensA[0] === tokensB[0]) return true;

    // Check if any token from shorter name appears in longer name
    const shorterTokens = tokensA.length <= tokensB.length ? tokensA : tokensB;
    const longerTokens = tokensA.length > tokensB.length ? tokensA : tokensB;
    if (shorterTokens.some(token => longerTokens.includes(token) && token.length >= 2)) {
      return true;
    }

    // Calculate Levenshtein distance and convert to similarity
    const dist = this.levenshtein(na, nb);
    const maxLen = Math.max(na.length, nb.length);
    if (maxLen === 0) return false;
    const similarity = 1 - dist / maxLen;
    return similarity >= 0.8; // 80% similarity threshold
  }

  /**
   * Extract NPCs in current scene location
   */
  private extractSceneNPCs(gameState: GameState): any[] {
    const currentScenario = gameState.currentScenario;
    
    if (!currentScenario || !currentScenario.location) {
      return [];
    }
    
    const scenarioLocation = currentScenario.location;
    const sceneNpcs: any[] = [];

    console.log(`\n🔍 [Extract Scene NPCs] Current location: "${scenarioLocation}"`);
    console.log(`🔍 [Extract Scene NPCs] Scenario characters list: ${currentScenario.characters?.map(c => c.name).join(', ') || 'none'}`);
    console.log(`🔍 [Extract Scene NPCs] Total NPCs in game: ${gameState.npcCharacters.length}`);

    // First, add NPCs explicitly listed in scenario (using 80% similarity fuzzy matching)
    for (const scenarioChar of currentScenario.characters || []) {
      const matchingNpc = gameState.npcCharacters.find(npc =>
        this.isNameSimilar(npc.name, scenarioChar.name)
      );

      if (matchingNpc) {
        sceneNpcs.push(this.extractNPCInfo(matchingNpc));
        console.log(`   ✓ Added from scenario.characters: "${matchingNpc.name}" (matched "${scenarioChar.name}")`);
      } else {
        console.log(`   ⚠️  No match found for scenario character: "${scenarioChar.name}"`);
      }
    }

    // Then, add NPCs with matching currentLocation
    let addedByLocation = 0;
    for (const npc of gameState.npcCharacters) {
      const npcProfile = npc as NPCProfile;

      if (npcProfile.currentLocation &&
          npcProfile.currentLocation.toLowerCase() === scenarioLocation.toLowerCase()) {

        // Check if already added (avoid duplicates using fuzzy matching for consistency)
        const alreadyAdded = sceneNpcs.some(sn =>
          this.isNameSimilar(sn.name, npc.name)
        );

        if (!alreadyAdded) {
          sceneNpcs.push(this.extractNPCInfo(npc));
          console.log(`   ✓ Added by currentLocation: "${npc.name}" (location: "${npcProfile.currentLocation}")`);
          addedByLocation++;
        } else {
          console.log(`   - Skipped duplicate: "${npc.name}" (already in scene)`);
        }
      }
    }

    console.log(`\n📊 [Extract Scene NPCs] Summary:`);
    console.log(`   From scenario.characters: ${sceneNpcs.length - addedByLocation}`);
    console.log(`   From currentLocation match: ${addedByLocation}`);
    console.log(`   Total NPCs in scene: ${sceneNpcs.length}\n`);

    return sceneNpcs;
  }
  
  /**
   * Extract NPC information (basic attributes)
   */
  private extractNPCInfo(npc: CharacterProfile): any {
    const npcProfile = npc as NPCProfile;
    
    return {
      id: npc.id,
      name: npc.name,
      occupation: npcProfile.occupation || "Unknown",
      age: npcProfile.age || "Unknown",
      appearance: npcProfile.appearance || "No description",
      personality: npcProfile.personality || "Unknown personality",
      background: npcProfile.background || "Unknown background",
      goals: npcProfile.goals || [],
      secrets: npcProfile.secrets || [],
      attributes: npc.attributes,
      status: npc.status,
      skills: npc.skills,
      inventory: npc.inventory || [],
      clues: npcProfile.clues || [],
      relationships: npcProfile.relationships || [],
      currentLocation: npcProfile.currentLocation || null,
      notes: npc.notes || ""
    };
  }

  /**
   * Parse and validate NPC response analyses from LLM response
   * Shared by both analyzeNPCResponses and analyzeNPCResponsesFromSimulatedQuery
   */
  private parseNPCResponseAnalyses(response: string): NPCResponseAnalysis[] {
    // Parse JSON response
    let parsed;
    try {
      // Extract JSON from markdown code blocks if present
      let jsonText = response.trim();

      // Try to extract JSON from markdown code blocks
      const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1].trim();
        console.log(`📝 [Character Agent] Detected markdown code block, extracted JSON content`);
      }

      // Try to extract JSON object if wrapped in other text
      if (!jsonText.startsWith('{') && !jsonText.startsWith('[')) {
        const jsonObjectMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonObjectMatch) {
          jsonText = jsonObjectMatch[0];
          console.log(`📝 [Character Agent] Extracted JSON object from text`);
        }
      }

      parsed = JSON.parse(jsonText);
    } catch (error) {
      console.error(`❌ [Character Agent] JSON parsing error:`, error);
      console.error(`   Original response (first 500 chars): ${response.substring(0, 500)}${response.length > 500 ? '...' : ''}`);
      return [];
    }

    // Extract and validate NPC response analyses
    const analyses: NPCResponseAnalysis[] = [];

    // Valid action types
    const validActionTypes: ActionType[] = [
      "exploration", "social", "stealth", "combat",
      "chase", "mental", "environmental", "narrative"
    ];

    if (parsed.npcResponseAnalyses && Array.isArray(parsed.npcResponseAnalyses)) {
      for (const analysis of parsed.npcResponseAnalyses) {
        // Validate required fields
        if (analysis.npcName && typeof analysis.willRespond === 'boolean') {
          // Validate responseType
          let responseType: ActionType | "none" | null = null;
          if (analysis.willRespond) {
            if (analysis.responseType === "none") {
              responseType = "none";
            } else if (analysis.responseType && validActionTypes.includes(analysis.responseType as ActionType)) {
              responseType = analysis.responseType as ActionType;
            } else {
              console.warn(`⚠️ [Character Agent] Invalid responseType for ${analysis.npcName}: ${analysis.responseType}, defaulting to null`);
              responseType = null;
            }
          }

          const validated: NPCResponseAnalysis = {
            npcName: analysis.npcName,
            willRespond: analysis.willRespond,
            responseType: responseType,
            responseDescription: analysis.responseDescription || "",
            executionOrder: typeof analysis.executionOrder === 'number' ? analysis.executionOrder : 999,
            targetCharacter: analysis.targetCharacter || null,
            isFirstInteraction: analysis.isFirstInteraction || false,
            initialRelationship: analysis.initialRelationship || undefined,
            attitudeChange: typeof analysis.attitudeChange === 'number' ? analysis.attitudeChange : undefined
          };

          analyses.push(validated);

          console.log(`   ✓ ${validated.npcName}: ${validated.willRespond ? validated.responseType : 'no response'}`);
          
          // DEBUG: Log relationship fields
          if (validated.isFirstInteraction) {
            console.log(`      [DEBUG] isFirstInteraction=true, initialRelationship=${JSON.stringify(validated.initialRelationship)}`);
          }
          if (validated.attitudeChange !== undefined) {
            console.log(`      [DEBUG] attitudeChange=${validated.attitudeChange}`);
          }
        }
      }
    }

    console.log(`\n✅ [Character Agent] Analyzed ${analyses.length} NPC responses`);

    return analyses;
  }

  /**
   * Determine if an NPC should respond based on relationship attitude
   * @param npc - NPC info
   * @param actionTarget - Action target (null if non-targeted)
   * @param playerName - Player character name
   * @returns true if NPC should respond (based on probability)
   */
  private shouldNPCRespond(
    npc: any,
    actionTarget: { name: string | null } | null,
    playerName: string
  ): boolean {
    // If this is a direct action (targeted at this NPC), always respond (100%)
    if (actionTarget && actionTarget.name && this.isNameSimilar(actionTarget.name, npc.name)) {
      console.log(`   🎯 [Relationship Filter] ${npc.name}: DIRECT TARGET → RESPOND (100%)`);
      return true;
    }

    // Check if NPC has a relationship with the player
    const relationship = (npc.relationships || []).find((rel: any) =>
      this.isNameSimilar(rel.targetName, playerName)
    );

    // Debug: log NPC relationship status
    if (!relationship) {
      console.log(`   🆕 [Relationship Filter] ${npc.name}: NO relationship with ${playerName} → RESPOND (100%, establish initial)`);
    } else {
      console.log(`   📋 [Relationship Filter] ${npc.name}: HAS relationship with ${playerName} (type=${relationship.relationshipType}, attitude=${relationship.attitude})`);
    }

    // If no relationship exists, respond (100% - to establish initial relationship)
    if (!relationship) {
      return true;
    }

    // If relationship exists, use |attitude|% probability
    const attitude = relationship.attitude || 0;
    const absAttitude = Math.abs(attitude);
    const responseChance = absAttitude / 100;

    // Roll the dice
    const roll = Math.random();
    const willRespond = roll < responseChance;

    console.log(`   🎲 [Relationship Filter] ${npc.name}: attitude=${attitude}, chance=${(responseChance * 100).toFixed(0)}%, roll=${(roll * 100).toFixed(0)}% → ${willRespond ? 'RESPOND' : 'SKIP'}`);

    return willRespond;
  }

  /**
   * Filter NPCs based on relationship response probability
   * @param sceneNpcs - All NPCs in the scene
   * @param actionTarget - Action target (null if non-targeted)
   * @param playerName - Player character name
   * @returns Filtered NPCs and flag indicating if there's a first-time interaction
   */
  private filterRespondingNPCs(
    sceneNpcs: any[],
    actionTarget: { name: string | null } | null,
    playerName: string
  ): { respondingNpcs: any[]; hasFirstTimeInteraction: boolean } {
    const respondingNpcs: any[] = [];
    let hasFirstTimeInteraction = false;

    for (const npc of sceneNpcs) {
      if (this.shouldNPCRespond(npc, actionTarget, playerName)) {
        respondingNpcs.push(npc);

        // Check if this is a first-time interaction
        const relationship = (npc.relationships || []).find((rel: any) =>
          this.isNameSimilar(rel.targetName, playerName)
        );
        if (!relationship) {
          hasFirstTimeInteraction = true;
        }
      }
    }

    return { respondingNpcs, hasFirstTimeInteraction };
  }

  /**
   * Apply relationship changes from NPC response analyses to game state
   * @param analyses - NPC response analyses from LLM
   * @param gameState - Current game state
   */
  private applyRelationshipChanges(
    analyses: NPCResponseAnalysis[],
    gameState: GameState
  ): void {
    const playerName = gameState.playerCharacter.name;
    const playerId = gameState.playerCharacter.id;
    const relationshipsToSave: Array<{
      sourceNpcId: string;
      targetId: string;
      targetName: string;
      relationshipType: string;
      attitude: number;
      sessionId: string;
      description?: string;
    }> = [];

    for (const analysis of analyses) {
      // Find the NPC in game state (both in npcCharacters array for memory update)
      const npc = gameState.npcCharacters.find(npc =>
        this.isNameSimilar(npc.name, analysis.npcName)
      );

      if (!npc) {
        console.warn(`⚠️ [Relationship Manager] NPC not found in gameState: ${analysis.npcName}`);
        continue;
      }

      const npcProfile = npc as NPCProfile;

      // Ensure relationships array exists
      if (!npcProfile.relationships) {
        npcProfile.relationships = [];
      }

      // Find existing relationship with player
      let relationship = npcProfile.relationships.find(rel =>
        this.isNameSimilar(rel.targetName, playerName)
      );

      // Handle first-time interaction
      if (!relationship && analysis.isFirstInteraction && analysis.initialRelationship) {
        const initial = analysis.initialRelationship;
        const newRelationship: NPCProfile["relationships"][0] = {
          targetId: playerId,
          targetName: playerName,
          relationshipType: initial.relationshipType,
          attitude: initial.attitude,
          description: initial.description
        };
        
        // ✅ CRITICAL: Update memory (gameState.npcCharacters)
        npcProfile.relationships.push(newRelationship);

        console.log(`✨ [Relationship Manager] ${analysis.npcName} → ${playerName}: NEW relationship (memory updated)`);
        console.log(`   Type: ${initial.relationshipType}, Attitude: ${initial.attitude}, Description: "${initial.description}"`);
        
        // Queue for database save
        relationshipsToSave.push({
          sourceNpcId: npcProfile.id,
          targetId: playerId,
          targetName: playerName,
          relationshipType: initial.relationshipType,
          attitude: initial.attitude,
          sessionId: gameState.sessionId,
          description: initial.description
        });
        continue;
      }
      
      // DEBUG: Log why relationship wasn't created
      if (!relationship && !analysis.isFirstInteraction) {
        console.log(`   ⚠️  [DEBUG] ${analysis.npcName}: NO relationship but isFirstInteraction=false (LLM未设置)`);
      }
      if (!relationship && analysis.isFirstInteraction && !analysis.initialRelationship) {
        console.log(`   ⚠️  [DEBUG] ${analysis.npcName}: isFirstInteraction=true but initialRelationship missing (LLM未提供)`);
      }

      // Handle attitude change for existing relationship
      if (relationship && analysis.attitudeChange !== undefined) {
        const oldAttitude = relationship.attitude || 0;
        let newAttitude = oldAttitude + analysis.attitudeChange;

        // Clamp attitude to [-100, +100]
        newAttitude = Math.max(-100, Math.min(100, newAttitude));

        // ✅ CRITICAL: Update memory (gameState.npcCharacters)
        relationship.attitude = newAttitude;

        console.log(`📊 [Relationship Manager] ${analysis.npcName} → ${playerName}: attitude ${oldAttitude} → ${newAttitude} (${analysis.attitudeChange >= 0 ? '+' : ''}${analysis.attitudeChange}) (memory updated)`);
        
        // Queue for database save
        relationshipsToSave.push({
          sourceNpcId: npcProfile.id,
          targetId: relationship.targetId,
          targetName: relationship.targetName,
          relationshipType: relationship.relationshipType,
          attitude: newAttitude,
          sessionId: gameState.sessionId,
          description: relationship.description
        });
      }
    }

    // Batch save to database if database is available
    if (this.db && relationshipsToSave.length > 0) {
      try {
        this.db.batchUpsertNPCRelationships(relationshipsToSave);
        console.log(`💾 [Relationship Manager] 已保存 ${relationshipsToSave.length} 个关系变更到数据库 (DB + memory双写完成)`);
      } catch (error) {
        console.error(`❌ [Relationship Manager] 保存关系到数据库失败:`, error);
      }
    } else if (relationshipsToSave.length > 0) {
      console.warn(`⚠️  [Relationship Manager] 数据库未设置,${relationshipsToSave.length} 个关系变更仅更新内存未持久化`);
    }
  }
}