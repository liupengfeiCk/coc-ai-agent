import { Router } from 'express';
import path from "path";
import fs from "fs";
import modRouter from './modRouter.js';
import gameRouter from './gameRouter.js';
import { container } from '../container.js';
import { GameState } from '../../src/state.js';
import { HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { GraphState } from '../../src/graph.js';
import characterRouter from './characterRouter.js';
import turnRouter from './turnRouter.js';
import sessionRouter from './sessionRouter.js';
import checkpointRouter from './checkpointRouter.js';
import moduleRouter from './moduleRouter.js';

const apiRouter = Router();

apiRouter.use("/mod", modRouter)
apiRouter.use("/game", gameRouter);
apiRouter.use("/characters", characterRouter)
apiRouter.use("/turns", turnRouter)
apiRouter.use("/sessions", sessionRouter)
apiRouter.use("/checkpoints", checkpointRouter)
apiRouter.use("/modules", moduleRouter)


apiRouter.get("/occupations", (req, res) => {
  try {
    const occupationsFile = path.join(process.cwd(), "src", "coc_multiagents_system", "agents", "character", "Character occupation.json");

    if (!fs.existsSync(occupationsFile)) {
      return res.status(404).json({ error: "Occupations file not found" });
    }

    const occupationsData = JSON.parse(fs.readFileSync(occupationsFile, "utf-8"));

    res.json({
      success: true,
      occupations: occupationsData,
    });
  } catch (error) {
    console.error("Error fetching occupations:", error);
    res.status(500).json({ error: "Failed to fetch occupations: " + (error as Error).message });
  }
});

apiRouter.get("/mods", (req, res) => {
  try {
    const modsDir = path.join(process.cwd(), "data", "Mods");
    if (!fs.existsSync(modsDir)) {
      return res.json({ success: true, mods: [] });
    }

    const dirs = fs.readdirSync(modsDir, { withFileTypes: true });
    const mods = dirs
      .filter(dirent => dirent.isDirectory())
      .map(dirent => ({
        name: dirent.name,
        path: path.join(modsDir, dirent.name),
      }));

    res.json({
      success: true,
      mods: mods,
    });
  } catch (error) {
    console.error("Error fetching mods:", error);
    res.status(500).json({ error: "Failed to fetch mods: " + (error as Error).message });
  }
});

// API endpoint to process user query
apiRouter.post("/message", async (req, res) => {
  try {
    let persistentGameState = container.resolve("gameState") as GameState;
    // Check if game is initialized
    if (!persistentGameState) {
      return res.status(400).json({ 
        error: "Game not started. Please start the game first by calling /api/game/start" 
      });
    }
    let graph = container.resolve("graph") as any;

    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required" });
    }

    console.log(`[${new Date().toISOString()}] User query: ${message}`);

    // Create initial messages for the graph
    const initialMessages = [new HumanMessage(message)];

    // Invoke the graph with persistent state
    console.log("🚀 [API] 开始执行 Graph 流程...");
    const result = (await graph.invoke({
      messages: initialMessages,
      gameState: persistentGameState,
    })) as unknown as GraphState;
    console.log("✅ [API] Graph 流程执行完成");

    // Update container's gameState in-place (preserve reference)
    const updatedState = result.gameState as GameState;
    const containerGameState = container.resolve('gameState') as GameState;
    
    // Copy all properties from updated state to container's gameState
    Object.assign(containerGameState, updatedState);
    persistentGameState = containerGameState;
    
    console.log("💾 [API] 游戏状态已原地更新");
    console.log(`   - 当前场景: ${persistentGameState.currentScenario?.name || '无'}`);
    console.log(`   - 当前位置: ${persistentGameState.currentScenario?.location || '未知'}`);
    console.log(`   - 游戏时间: ${persistentGameState.timeOfDay}`);

    // Extract the keeper's response (last AI message)
    const agentMessages = (result.messages as BaseMessage[]).filter(
      (msg: any) => msg._getType && msg._getType() === "ai"
    );
    const lastResponse = agentMessages.length > 0 
      ? agentMessages[agentMessages.length - 1].content 
      : "No response generated.";

    console.log(`📤 [API] Keeper 响应已提取 (${typeof lastResponse === 'string' ? lastResponse.length : 0} 字符)`);
    console.log(`📤 [API] 准备返回响应给客户端`);

    res.json({
      success: true,
      eventId: null,
      timestamp: new Date().toISOString(),
      userMessage: message,
      response: lastResponse,
      gameState: {
        phase: persistentGameState.phase,
        currentScenario: persistentGameState.currentScenario,
        timeOfDay: persistentGameState.timeOfDay,
        tension: persistentGameState.tension,
        playerCharacter: persistentGameState.playerCharacter,
        npcCharacters: persistentGameState.npcCharacters,
      },
    });
  } catch (error) {
    console.error("Error processing message:", error);
    res.status(500).json({ error: "Failed to process message: " + (error as Error).message });
  }
});

apiRouter.get("/gamestate", (req, res) => {
  try {
    let persistentGameState = container.resolve("gameState") as GameState;
    if (!persistentGameState) {
      return res.json({
        success: true,
        gameState: null,
        initialized: false,
        message: "Game not started yet",
      });
    }

    res.json({
      success: true,
      gameState: persistentGameState,
      initialized: true,
    });
  } catch (error) {
    console.error("Error fetching game state:", error);
    res.status(500).json({ error: "Failed to fetch game state" });
  }
});

export default apiRouter;