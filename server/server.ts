import "dotenv/config";
import { container } from "./container.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import express from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { CoCDatabase, seedDatabase } from "../src/coc_multiagents_system/agents/memory/database/index.js";
import { RagManager } from "../src/coc_multiagents_system/agents/memory/RagManager.js";
import { type GraphState } from "../src/graph.js";
import { type GameState } from "../src/state.js";
import { TurnManager } from "../src/coc_multiagents_system/agents/memory/index.js";
import { GameStateManager } from "../src/state.js";
import { enrichMemoryContext } from "../src/coc_multiagents_system/agents/memory/memoryAgent.js";
import apiRouter from "./route/apiRouter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lazy-loaded components (initialized only when needed)
let db: CoCDatabase = container.resolve('db') as CoCDatabase;
let listenerGraph: any = null;  // Separate graph for listener/progression checking
let ragManager: RagManager | null = null;
let turnManager: TurnManager | null = null;

// **PERSISTENT GAME STATE** - will be initialized when user starts the game
let persistentGameState: GameState | null = null;

// WebSocket connection management
interface WSClient {
  ws: WebSocket;
  sessionId: string;
  lastHeartbeat: Date;
}

const wsClients = new Map<string, WSClient>();
let progressionCheckInterval: NodeJS.Timeout | null = null;
const CHECK_INTERVAL_MS = 60000; // Check every 60 seconds
const HEARTBEAT_INTERVAL_MS = 60000; // Send heartbeat every 60 seconds

console.log("✅ Frontend server ready (nothing initialized yet)");


const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve frontend build (client/dist) if present
const distDir = path.join(__dirname, "dist");
const staticDir = fs.existsSync(path.join(distDir, "index.html")) ? distDir : __dirname;
app.use(express.static(staticDir));

// SPA fallback
app.get("/", (_req, res) => {
  const indexPath = path.join(staticDir, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res
      .status(500)
      .send("Frontend not built. Run `pnpm --filter coc-investigator-sheet build` inside client/ to generate dist/.");
  }
});

app.use("/api", apiRouter);


// ==================== TURN API ENDPOINTS ====================

/**
 * Check if simulate should be triggered based on TIME threshold only (3 minutes idle)
 * Uses the listener graph to check progression and process simulate queries
 */
async function checkAndTriggerSimulate(sessionId: string): Promise<boolean> {
  if (!persistentGameState || !listenerGraph || !turnManager || !db || persistentGameState.sessionId !== sessionId) {
    return false;
  }

  try {
    const gsm = new GameStateManager(persistentGameState);
    
    // Only check time threshold (3 minutes), not turn count
    const minutesSinceInput = gsm.getMinutesSinceLastInput();
    
    if (minutesSinceInput < 3) {
      // Time threshold not met, no need to trigger
      return false;
    }
    
    console.log(`⏰ [WebSocket] Time threshold reached (${minutesSinceInput} min idle) for session ${sessionId}`);
    
    // Enrich game state with conversation history before invoking listener graph
    // This ensures conversationHistory is available for checkStoryProgression and subsequent nodes
    const enrichedGameState = await enrichMemoryContext(
      persistentGameState,
      null, // No action analysis for progression check
      ragManager || undefined,
      db,
      undefined // No character input for progression check
    );
    
    // Invoke listener graph - entry node will enrich again when simulate is triggered (to include latest turn)
    const result = (await listenerGraph.invoke({
      messages: [],
      gameState: enrichedGameState, // Use enriched state for progression check
      isSimulatedQuery: false,
      simulatedQueryCount: 0,
    })) as unknown as GraphState;
    
    // Check if simulate was triggered and processed
    if (result.turnId && result.messages.length > 0) {
      const keeperMessage = result.messages[result.messages.length - 1];
      const keeperNarrative = keeperMessage ? keeperMessage.content.toString() : null;

      console.log(`🔔 [WebSocket] Simulate processed for session ${sessionId}`);

      // Update persistent state
      persistentGameState = result.gameState as GameState;

      // Reset the idle timer after listener executes successfully
      const gsmReset = new GameStateManager(persistentGameState);
      gsmReset.updatePlayerInputTime();
      persistentGameState = gsmReset.getGameState() as GameState;
      console.log(`⏰ [WebSocket] Idle timer reset for session ${sessionId}`);

      // Get the completed turn to send to client
      const completedTurn = turnManager.getTurn(result.turnId);

      // Notify WebSocket clients
      notifyClients(sessionId, {
        type: 'simulate_triggered',
        turnId: result.turnId,
        simulatedQuery: result.messages[0]?.content.toString() || null,
        keeperNarrative: completedTurn?.keeperNarrative || keeperNarrative,
        timestamp: new Date().toISOString()
      });

      return true;
    } else {
      // Listener executed but didn't trigger simulate (no event to advance story)
      // Still reset the timer to avoid immediate re-checking
      const gsmReset = new GameStateManager(result.gameState as GameState);
      gsmReset.updatePlayerInputTime();
      persistentGameState = gsmReset.getGameState() as GameState;
      console.log(`⏰ [WebSocket] Idle timer reset for session ${sessionId} (no simulate triggered)`);
    }

    return false;
  } catch (error) {
    console.error(`[WebSocket] Error checking progression for session ${sessionId}:`, error);
    return false;
  }
}

/**
 * Notify WebSocket clients about events
 */
function notifyClients(sessionId: string, message: any) {
  const client = wsClients.get(sessionId);
  if (client && client.ws.readyState === WebSocket.OPEN) {
    try {
      client.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error(`[WebSocket] Error sending message to client ${sessionId}:`, error);
    }
  }
}

/**
 * Periodic check for progression triggers
 */
function startProgressionChecker() {
  if (progressionCheckInterval) {
    clearInterval(progressionCheckInterval);
  }
  
  progressionCheckInterval = setInterval(() => {
    // Check all active sessions
    for (const [sessionId, client] of wsClients.entries()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        checkAndTriggerSimulate(sessionId).catch(error => {
          console.error(`[WebSocket] Error in progression check for ${sessionId}:`, error);
        });
      }
    }
  }, CHECK_INTERVAL_MS);
  
  console.log(`🔄 [WebSocket] Progression checker started (interval: ${CHECK_INTERVAL_MS}ms)`);
}

/**
 * Stop progression checker
 */
function stopProgressionChecker() {
  if (progressionCheckInterval) {
    clearInterval(progressionCheckInterval);
    progressionCheckInterval = null;
    console.log(`🛑 [WebSocket] Progression checker stopped`);
  }
}

// Create HTTP server and attach Express app
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ 
  server,
  path: '/ws'
});

// WebSocket connection handling
wss.on('connection', (ws: WebSocket, req) => {
  const sessionId = req.url?.split('sessionId=')[1]?.split('&')[0] || persistentGameState?.sessionId || 'unknown';
  
  console.log(`🔌 [WebSocket] Client connected: ${sessionId}`);
  
  // Store client connection
  const client: WSClient = {
    ws,
    sessionId,
    lastHeartbeat: new Date()
  };
  wsClients.set(sessionId, client);
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    sessionId: sessionId,
    timestamp: new Date().toISOString()
  }));
  
  // Handle messages from client
  ws.on('message', (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'ping') {
        // Heartbeat ping
        client.lastHeartbeat = new Date();
        ws.send(JSON.stringify({
          type: 'pong',
          timestamp: new Date().toISOString()
        }));
      } else if (message.type === 'check_progression') {
        // Client requests immediate progression check
        console.log(`📨 [WebSocket] Received check_progression request from ${sessionId}`);
        checkAndTriggerSimulate(sessionId).then(triggered => {
          if (triggered) {
            console.log(`✅ [WebSocket] Simulate triggered via check_progression request`);
          } else {
            console.log(`⏸️  [WebSocket] No simulate trigger needed (conditions not met)`);
            // Notify client that check was performed but no trigger
            ws.send(JSON.stringify({
              type: 'progression_check_result',
              triggered: false,
              timestamp: new Date().toISOString()
            }));
          }
        }).catch(error => {
          console.error(`[WebSocket] Error handling check_progression:`, error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Failed to check progression',
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString()
          }));
        });
      } else {
        console.log(`⚠️  [WebSocket] Unknown message type from ${sessionId}: ${message.type}`);
      }
    } catch (error) {
      console.error(`[WebSocket] Error parsing message from ${sessionId}:`, error);
    }
  });
  
  // Handle client disconnect
  ws.on('close', () => {
    console.log(`🔌 [WebSocket] Client disconnected: ${sessionId}`);
    wsClients.delete(sessionId);
    
    // Stop checker if no clients connected
    if (wsClients.size === 0) {
      stopProgressionChecker();
    }
  });
  
  // Handle errors
  ws.on('error', (error) => {
    console.error(`[WebSocket] Error for client ${sessionId}:`, error);
  });
  
  // Start progression checker if this is the first client
  if (wsClients.size === 1) {
    startProgressionChecker();
  }
});


// Heartbeat to keep connections alive and detect dead connections
setInterval(() => {
  const now = new Date();
  for (const [sessionId, client] of wsClients.entries()) {
    if (client.ws.readyState === WebSocket.OPEN) {
      // Send ping to check if connection is alive
      try {
        client.ws.ping();
      } catch (error) {
        console.error(`[WebSocket] Error sending ping to ${sessionId}:`, error);
        wsClients.delete(sessionId);
      }
    } else {
      // Remove dead connections
      wsClients.delete(sessionId);
    }
  }
  
  // Stop checker if no clients
  if (wsClients.size === 0) {
    stopProgressionChecker();
  }
}, HEARTBEAT_INTERVAL_MS);

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket server ready on ws://localhost:${PORT}/ws`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down gracefully...");
  stopProgressionChecker();
  
  // Close all WebSocket connections
  for (const [sessionId, client] of wsClients.entries()) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.close();
    }
  }
  wsClients.clear();
  
  // Close WebSocket server
  wss.close(() => {
    console.log("WebSocket server closed");
  });
  
  if (db) {
    db.close();
  }
  
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});
