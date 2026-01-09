import { Router } from 'express';
import { container } from '../container.js';
import { GameState } from '../../src/state.js';
import { CoCDatabase } from '../../src/coc_multiagents_system/agents/memory/database/index.js';
import { TurnManager } from '../../src/coc_multiagents_system/agents/memory/index.js';
import { HumanMessage } from 'langchain';
import { GraphState } from '../../src/graph.js';

const turnRouter = Router();

async function processGameTurn(turnId: string, userInput: string, gameState: GameState, graph: any) {
  try {
    console.log(`[${new Date().toISOString()}] Processing turn ${turnId}...`);

    // Create initial messages for the graph
    const initialMessages = [new HumanMessage(userInput)];

    // Invoke the graph with turnId in state
    const result = (await graph.invoke({
      messages: initialMessages,
      gameState: gameState,
      turnId: turnId,  // Pass turnId to graph
    })) as unknown as GraphState;

    console.log(`[${new Date().toISOString()}] Turn ${turnId} completed successfully`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Turn ${turnId} failed:`, error);
    throw error;
  }
}

turnRouter.post("/", async (req, res) => {
  try {
    let persistentGameState = container.resolve("gameState") as GameState;
    if (!persistentGameState) {
      return res.status(400).json({ 
        error: "Game not started. Please start the game first by calling /api/game/start" 
      });
    }

    // Initialize TurnManager if not already initialized
    let turnManager = container.resolve("turnManager") as TurnManager;

    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required" });
    }

    // Create turn record in database
    const turnId = turnManager.createTurnFromGameState(
      persistentGameState.sessionId,
      message,
      persistentGameState
    );

    console.log(`[${new Date().toISOString()}] Turn created: ${turnId} for message: ${message}`);

    // Start async processing (don't wait for it)
    processGameTurn(turnId, message, persistentGameState, container.resolve("graph"))
      .catch((error) => {
        console.error(`Error processing turn ${turnId}:`, error);
        if (turnManager) {
          turnManager.markError(turnId, error);
        }
      });

    // Immediately return the turnId
    res.json({
      success: true,
      turnId: turnId,
      status: 'processing',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error creating turn:", error);
    res.status(500).json({ error: "Failed to create turn: " + (error as Error).message });
  }
});

turnRouter.get("/:turnId", async (req, res) => {
  try {
    let turnManager = container.resolve("turnManager") as TurnManager;
    if (!turnManager) {
      return res.status(400).json({ error: "Game not initialized" });
    }

    const { turnId } = req.params;
    const waitForCompletion = req.query.wait === 'true';
    const maxWaitTime = 60000; // 60 seconds max wait time
    const checkInterval = 500; // Check every 500ms
    const startTime = Date.now();

    // Long polling: wait until turn is completed
    if (waitForCompletion) {
      while (Date.now() - startTime < maxWaitTime) {
        const turn = turnManager.getTurn(turnId);
        
        if (!turn) {
          return res.status(404).json({ error: "Turn not found" });
        }

        // If turn is completed or error, return immediately
        if (turn.status === 'completed' || turn.status === 'error') {
          console.log(`📖 [API] 获取 Turn ${turnId}: status=${turn.status}, keeperNarrative=${turn.keeperNarrative ? `${turn.keeperNarrative.length} 字符` : 'null'}`);
          
          return res.json({
            success: true,
            turn: {
              turnId: turn.turnId,
              turnNumber: turn.turnNumber,
              characterInput: turn.characterInput,
              keeperNarrative: turn.keeperNarrative,
              status: turn.status,
              errorMessage: turn.errorMessage,
              startedAt: turn.startedAt,
              completedAt: turn.completedAt,
              sceneId: turn.sceneId,
              sceneName: turn.sceneName,
              location: turn.location,
            },
          });
        }

        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }

      // Timeout: return current status
      const turn = turnManager.getTurn(turnId);
      if (!turn) {
        return res.status(404).json({ error: "Turn not found" });
      }

      console.log(`📖 [API] 获取 Turn ${turnId}: timeout, status=${turn.status}`);
      return res.json({
        success: true,
        turn: {
          turnId: turn.turnId,
          turnNumber: turn.turnNumber,
          characterInput: turn.characterInput,
          keeperNarrative: turn.keeperNarrative,
          status: turn.status,
          errorMessage: turn.errorMessage,
          startedAt: turn.startedAt,
          completedAt: turn.completedAt,
          sceneId: turn.sceneId,
          sceneName: turn.sceneName,
          location: turn.location,
        },
      });
    }

    // Immediate return (no waiting)
    const turn = turnManager.getTurn(turnId);

    if (!turn) {
      return res.status(404).json({ error: "Turn not found" });
    }

    console.log(`📖 [API] 获取 Turn ${turnId}: status=${turn.status}, keeperNarrative=${turn.keeperNarrative ? `${turn.keeperNarrative.length} 字符` : 'null'}`);

    res.json({
      success: true,
      turn: {
        turnId: turn.turnId,
        turnNumber: turn.turnNumber,
        characterInput: turn.characterInput,
        keeperNarrative: turn.keeperNarrative,
        status: turn.status,
        errorMessage: turn.errorMessage,
        startedAt: turn.startedAt,
        completedAt: turn.completedAt,
        sceneId: turn.sceneId,
        sceneName: turn.sceneName,
        location: turn.location,
        isSimulated: turn.isSimulated || false,
      },
    });
  } catch (error) {
    console.error("Error fetching turn:", error);
    res.status(500).json({ error: "Failed to fetch turn" });
  }
});
export default turnRouter;