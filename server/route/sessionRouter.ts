import { Router } from 'express';
import { container } from '../container.js';
import { TurnManager } from '../../src/coc_multiagents_system/agents/memory/index.js';


const sessionRouter = Router();
sessionRouter.get("/:sessionId/conversation", (req, res) => {
  try {
    let turnManager = container.resolve("turnManager") as TurnManager;
    if (!turnManager) {
      return res.status(400).json({ error: "Game not initialized" });
    }

    const { sessionId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    const conversation = turnManager.getConversation(sessionId, limit);

    res.json({
      success: true,
      conversation: conversation,
    });
  } catch (error) {
    console.error("Error fetching conversation:", error);
    res.status(500).json({ error: "Failed to fetch conversation" });
  }
});

sessionRouter.get("/:sessionId/turns", (req, res) => {
  try {
    let turnManager = container.resolve("turnManager") as TurnManager;
    if (!turnManager) {
      return res.status(400).json({ error: "Game not initialized" });
    }

    const { sessionId } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;
    const after = req.query.after ? parseInt(req.query.after as string) : undefined;

    const turns = turnManager.getHistory(sessionId, limit, after);

    res.json({
      success: true,
      turns: turns,
      hasMore: turns.length === limit, // Indicate if there might be more turns
    });
  } catch (error) {
    console.error("Error fetching turns:", error);
    res.status(500).json({ error: "Failed to fetch turns" });
  }
});

export default sessionRouter;