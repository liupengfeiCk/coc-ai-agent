import { getOrchestratorTemplate } from "./orchestratorTemplate.js";
import { composeTemplate } from "../../../template.js";
import type { ActionAnalysis, GameStateManager, ActionType } from "../../../state.js";
import {
  ModelProviderName,
  ModelClass,
  generateText,
} from "../../../models/index.js";
import type { CoCDatabase } from "../memory/database/index.js";
import { extractRecentConversationHistory } from "../memory/memoryAgent.js";

interface OrchestratorRuntime {
  modelProvider: ModelProviderName;
  getSetting: (key: string) => string | undefined;
}

const createRuntime = (): OrchestratorRuntime => ({
  modelProvider: (process.env.MODEL_PROVIDER as ModelProviderName) || ModelProviderName.OPENAI,
  getSetting: (key: string) => process.env[key],
});

/**
 * Orchestrator Agent - Routes user queries to appropriate agents
 */
export class OrchestratorAgent {
  
  /**
   * Process input (user query, agent result, or instruction) and determine which agent to route to
   */
  async processInput(input: string, gameStateManager: GameStateManager, db?: CoCDatabase): Promise<string> {
    const runtime = createRuntime();
    const gameState = gameStateManager.getGameState();
    
    // Get the template
    const template = getOrchestratorTemplate();
    
    // Extract context from game state
    const characterName = gameState.playerCharacter?.name || "Unknown";
    const scenarioLocation = gameState.currentScenario?.location || "Unknown location";
    const npcNames = gameState.npcCharacters?.map(npc => npc.name).join(", ") || "None";
    
    // Get conversation history directly from database to extract previous narrative
    // This ensures we get the latest completed turns even if memory agent hasn't run yet
    let previousNarrative: string | null = null;
    if (db) {
      try {
        const conversationHistory = await extractRecentConversationHistory(
          db,
          gameState.sessionId,
          1
        );
        
        // Get previous round narrative (last completed turn with narrative)
        if (conversationHistory.length > 0) {
          const lastTurnWithNarrative = [...conversationHistory]
            .reverse()
            .find(turn => turn.keeperNarrative);
          if (lastTurnWithNarrative && lastTurnWithNarrative.keeperNarrative) {
            previousNarrative = lastTurnWithNarrative.keeperNarrative;
            console.log(`📜 [Orchestrator Agent] Retrieved last round's Keeper Narrative from database (Turn #${lastTurnWithNarrative.turnNumber})`);
          }
        }
      } catch (error) {
        console.warn("[Orchestrator Agent] Failed to retrieve conversation history from database:", error);
        // Fallback to gameState if database access fails
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
            previousNarrative = lastTurnWithNarrative.keeperNarrative;
          }
        }
      }
    } else {
      // Fallback to gameState if db is not provided
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
          previousNarrative = lastTurnWithNarrative.keeperNarrative;
        }
      }
    }
    
    // Compose the prompt with input and game context
    const prompt = composeTemplate(template, {}, {
      input,
      characterName,
      scenarioLocation,
      npcNames,
      previousNarrative
    });
    
    const promptChars = prompt.length;
    console.log(`\n📝 [Orchestrator Agent] LLM请求统计:`);
    console.log(`   Prompt字符数: ${promptChars} chars`);

    // Generate response using LLM
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

    // Parse the response and store action analysis
    try {
      // Extract JSON from response (in case LLM wraps it in markdown code blocks)
      const jsonText =
        response.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ||
        response.match(/\{[\s\S]*\}/)?.[0];

      if (!jsonText) {
        console.warn("Failed to extract JSON from orchestrator response");
      } else {
        const parsedResponse = JSON.parse(jsonText);
        if (parsedResponse.actionAnalysis) {
          const normalizedActionAnalysis = this.normalizeActionAnalysis(
            parsedResponse.actionAnalysis,
            characterName
          );
          gameStateManager.setActionAnalysis(normalizedActionAnalysis);
        }
      }
    } catch (error) {
      console.warn("Failed to parse orchestrator response for action analysis:", error);
      console.warn("Response content:", response.substring(0, 200));
    }

    return response;
  }

  private normalizeActionAnalysis(rawAnalysis: any, fallbackCharacterName: string): ActionAnalysis {
    const actionType = rawAnalysis.actionType as ActionType | undefined;
    return {
      character: rawAnalysis.character || rawAnalysis.player || fallbackCharacterName,
      action: rawAnalysis.action || "",
      actionType: actionType || "narrative",
      target: {
        name: rawAnalysis.target?.name ?? null,
        intent: rawAnalysis.target?.intent || ""
      },
      requiresDice: Boolean(rawAnalysis.requiresDice)
    };
  }

}
