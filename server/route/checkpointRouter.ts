import { Router } from 'express';
import { container } from '../container.js';
import { CoCDatabase, TurnManager } from '../../src/coc_multiagents_system/agents/memory/index.js';
import { GameState } from '../../src/state.js';
import { saveManualCheckpoint, loadCheckpoint, listAvailableCheckpoints } from "../../src/coc_multiagents_system/agents/memory/memoryAgent.js";
import { ScenarioLoader } from '../../src/coc_multiagents_system/agents/memory/scenarioloader/index.js';
import { NPCLoader } from '../../src/coc_multiagents_system/agents/character/npcloader/index.js';
import { ModuleLoader } from '../../src/coc_multiagents_system/agents/memory/moduleloader/index.js';
import { createBgeSqliteRagManager, RagManager } from "../../src/coc_multiagents_system/agents/memory/RagManager.js";
import { buildGraph, buildListenerGraph, type GraphState } from "../../src/graph.js";


const checkpointRouter = Router();

checkpointRouter.post("/save", async (req, res) => {
  try {
    let db = container.resolve("db") as CoCDatabase;
    let persistentGameState = container.resolve("gameState") as GameState;
    if (!persistentGameState) {
      return res.status(400).json({ 
        error: "Game not started. Please start the game first." 
      });
    }

    const currentScenario = persistentGameState.currentScenario;
    if (!currentScenario) {
      return res.status(400).json({ 
        error: "No current scenario. Cannot save checkpoint." 
      });
    }

    // Generate checkpoint name: scenario name + current date
    const currentDate = new Date().toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const checkpointName = `${currentScenario.name} - ${currentDate}`;
    const description = `Manual save at ${currentScenario.location}`;

    const checkpointId = saveManualCheckpoint(
      persistentGameState,
      db,
      checkpointName,
      description
    );

    let ragManager = container.resolve("ragManager") as RagManager;
    // Save RAG state to checkpoint if RAG Manager is initialized
    if (ragManager) {
      try {
        await ragManager.saveToCheckpoint(checkpointId);
        console.log(`[${new Date().toISOString()}] RAG state saved to checkpoint: ${checkpointId}`);
      } catch (error) {
        console.warn(`[${new Date().toISOString()}] Failed to save RAG state to checkpoint:`, error);
        // Don't fail the checkpoint save if RAG save fails
      }
    }

    console.log(`[${new Date().toISOString()}] Checkpoint saved: ${checkpointName} (${checkpointId})`);

    res.json({
      success: true,
      checkpointId: checkpointId,
      checkpointName: checkpointName,
      message: "存档成功",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error saving checkpoint:", error);
    res.status(500).json({ error: "Failed to save checkpoint: " + (error as Error).message });
  }
});

// GET /api/checkpoints/list - List all available checkpoints
checkpointRouter.get("/list", (req, res) => {
  try {
    // Initialize database if not already initialized
    let db = container.resolve("db") as CoCDatabase;

    const sessionId = req.query.sessionId as string;
    const limit = parseInt(req.query.limit as string) || 50;

    let checkpoints: any[] = [];

    if (sessionId && sessionId !== "all") {
      // List checkpoints for specific session
      checkpoints = listAvailableCheckpoints(sessionId, db, limit);
    } else {
      // List all checkpoints from all sessions
      const database = db.getDatabase();
      const stmt = database.prepare(`
        SELECT 
          checkpoint_id, checkpoint_name, checkpoint_type, description,
          game_day, game_time, current_scene_name, current_location,
          player_hp, player_sanity, created_at, session_id
        FROM game_checkpoints 
        ORDER BY created_at DESC
        LIMIT ?
      `);
      checkpoints = stmt.all(limit) as any[];
    }

    // Convert snake_case field names to camelCase for frontend compatibility
    const normalizedCheckpoints = checkpoints.map((cp: any) => ({
      checkpointId: cp.checkpoint_id || cp.checkpointId,
      checkpointName: cp.checkpoint_name || cp.checkpointName,
      checkpointType: cp.checkpoint_type || cp.checkpointType,
      description: cp.description,
      gameDay: cp.game_day || cp.gameDay,
      gameTime: cp.game_time || cp.gameTime,
      currentSceneName: cp.current_scene_name || cp.currentSceneName,
      currentLocation: cp.current_location || cp.currentLocation,
      playerHp: cp.player_hp || cp.playerHp,
      playerSanity: cp.player_sanity || cp.playerSanity,
      createdAt: cp.created_at || cp.createdAt,
      sessionId: cp.session_id || cp.sessionId,
    }));

    res.json({
      success: true,
      checkpoints: normalizedCheckpoints,
    });
  } catch (error) {
    console.error("Error listing checkpoints:", error);
    res.status(500).json({ error: "Failed to list checkpoints: " + (error as Error).message });
  }
});

// DELETE /api/checkpoints/:checkpointId - Delete a checkpoint
checkpointRouter.delete("/:checkpointId", (req, res) => {
  try {
    // Initialize database if not already initialized
    let db = container.resolve("db") as CoCDatabase;

    const { checkpointId } = req.params;
    if (!checkpointId) {
      return res.status(400).json({ error: "checkpointId is required" });
    }

    // Check if checkpoint exists before deletion
    const database = db.getDatabase();
    const checkStmt = database.prepare("SELECT checkpoint_id FROM game_checkpoints WHERE checkpoint_id = ?");
    const checkpoint = checkStmt.get(checkpointId);

    if (!checkpoint) {
      return res.status(404).json({ error: "Checkpoint not found" });
    }

    // Delete the checkpoint using database method
    db.deleteCheckpoint(checkpointId);
    console.log(`✓ Checkpoint deleted: ${checkpointId}`);

    res.json({
      success: true,
      message: "Checkpoint deleted successfully",
      checkpointId,
    });
  } catch (error) {
    console.error("Error deleting checkpoint:", error);
    res.status(500).json({ error: "Failed to delete checkpoint: " + (error as Error).message });
  }
});

// POST /api/checkpoints/load - Load a checkpoint and restore game state
checkpointRouter.post("/load", async (req, res) => {
  try {
    // Initialize database if not already initialized
    let db = container.resolve("db") as CoCDatabase;

    const { checkpointId } = req.body;
    if (!checkpointId) {
      return res.status(400).json({ error: "checkpointId is required" });
    }

    const gameState = loadCheckpoint(checkpointId, db);
    if (!gameState) {
      return res.status(404).json({ error: "Checkpoint not found" });
    }

    // Restore persistent game state
    container.register("gameState", gameState);

    // Initialize TurnManager if not already initialized (needed for fetching conversation history)
    let turnManager = container.resolve("turnManager") as TurnManager;

    // Fetch conversation history for this session
    let conversationHistory: Array<{
      role: 'character' | 'keeper';
      content: string;
      timestamp: string;
      turnNumber: number;
    }> = [];
    
    try {
      conversationHistory = turnManager.getConversation(gameState.sessionId, 50);
      console.log(`[${new Date().toISOString()}] Loaded ${conversationHistory.length} conversation messages from history`);
    } catch (error) {
      console.warn("Failed to load conversation history:", error);
      // Continue without history - not a critical error
    }

    // Reinitialize graph and other components with the loaded game state
    // We need to reinitialize the graph with the loaded mod
    if (gameState.currentScenario) {
      // Extract mod name from scenario if available, or use a default
      // The mod should be loaded when the checkpoint was created
      // For now, we'll just restore the state - the graph should work with existing state
      console.log(`[${new Date().toISOString()}] Restoring game state from checkpoint: ${checkpointId}`);
    }

    console.log(`[${new Date().toISOString()}] Checkpoint loaded: ${checkpointId}`);

    res.json({
      success: true,
      sessionId: gameState.sessionId,
      gameState: gameState,
      conversationHistory: conversationHistory,
      message: "存档加载成功",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error loading checkpoint:", error);
    res.status(500).json({ error: "Failed to load checkpoint: " + (error as Error).message });
  }
});

export default checkpointRouter;