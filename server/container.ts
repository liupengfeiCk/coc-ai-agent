import path from "path";
import fs from "fs";
import { CoCDatabase, seedDatabase } from "../src/coc_multiagents_system/agents/memory/database";
import { ScenarioLoader } from "../src/coc_multiagents_system/agents/memory/scenarioloader/scenarioLoader";
import { NPCLoader } from "../src/coc_multiagents_system/agents/character/npcloader/npcLoader";
import { ModuleLoader } from "../src/coc_multiagents_system/agents/memory/moduleloader/moduleLoader";
import { createBgeSqliteRagManager, RagManager } from "../src/coc_multiagents_system/agents/memory/RagManager";
import { initialGameState } from "../src/state";
import { buildGraph, buildListenerGraph } from "../src/graph";
import { TurnManager } from "../src/coc_multiagents_system/agents/memory/turnManager";
import { TemplateScenarioLoader } from "../src/coc_multiagents_system/agents/memory/scenarioloader/templateScenarioLoader";
import { TemplateNPCLoader } from "../src/coc_multiagents_system/agents/character/npcloader/templateNPCLoader";

class Container {
  private instances: Map<string, any> = new Map();

  register(name: string, instance: any) {
    this.instances.set(name, instance);
  }

  resolve<T>(name: string): T {
    const instance = this.instances.get(name);
    if (!instance) {
      throw new Error(`No instance registered for ${name}`);
    }
    return instance;
  }
}
const container = new Container()

let db: CoCDatabase | null = null;
if (!db) {
  try {
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    db = new CoCDatabase();
    seedDatabase(db);
    console.log("Database initialized");
  } catch (error) {
    console.error("❌ Fatal: Database initialization failed:", error);
    console.error("Server cannot start without database. Exiting...");
    process.exit(1);
  }
}
container.register('db', db);

let graph: any = null;
let ragManager: RagManager | null = null;
let scenarioLoader: ScenarioLoader | null = null;
let npcLoader: NPCLoader | null = null;
let moduleLoader: ModuleLoader | null = null;
let listenerGraph: any = null;
let turnManager: TurnManager | null = null;

console.log(`[${new Date().toISOString()}] Initializing multi-agent system...`);
// Initialize loaders for reading instance data
if (!scenarioLoader) scenarioLoader = new ScenarioLoader(db);
container.register('scenarioLoader', scenarioLoader);
if (!npcLoader) npcLoader = new NPCLoader(db);
container.register('npcLoader', npcLoader);
if (!moduleLoader) moduleLoader = new ModuleLoader(db);
container.register('moduleLoader', moduleLoader);

// Initialize RAG Manager (using base RAG - checkpoint_id IS NULL)
ragManager = createBgeSqliteRagManager(db);
container.register('ragManager', ragManager);
const SKIP_RAG = process.env.SKIP_RAG === 'true';

if (!SKIP_RAG) {
// Check if base knowledge base is already built (from previous game session)
const isBaseKbBuilt = RagManager.isBaseKnowledgeBaseBuilt(db);

if (!isBaseKbBuilt) {
    console.log(`[${new Date().toISOString()}] Base RAG knowledge base not found, building from loaded data...`);
    console.log(`[${new Date().toISOString()}] This will be saved as the base knowledge base for future games.`);
    // Build KB from loaded data only if base doesn't exist
    const scenarioProfiles = scenarioLoader.getAllScenarios();
    const npcProfiles = npcLoader.getAllNPCs();
    await ragManager.buildKnowledgeBase(
    {
        scenarios: scenarioProfiles.map((s: any) => s.snapshot),
        npcs: npcProfiles,
        clues: [],
        rules: [],
        playerInventory: initialGameState.playerCharacter.inventory,
        playerId: initialGameState.playerCharacter.id,
        playerName: initialGameState.playerCharacter.name,
    },
    {
        moduleName: "default-module",
        mode: "keeper",
        enableNodeEmbeddings: true,
        enableKnnEdges: true,
    }
    );
    console.log(`[${new Date().toISOString()}] Base RAG knowledge base built successfully (checkpoint_id IS NULL)`);
    console.log(`[${new Date().toISOString()}] Future games will reuse this base knowledge base.`);
} else {
    console.log(`[${new Date().toISOString()}] Base RAG knowledge base already exists, reusing it (no rebuild needed)`);
}
} else {
console.log(`[${new Date().toISOString()}] RAG知识库构建已跳过 (SKIP_RAG = true)`);
}
// Initialize TurnManager
turnManager = new TurnManager(db);
container.register('turnManager', turnManager);

// Build the multi-agent graph
graph = buildGraph(db, scenarioLoader, turnManager, ragManager);
container.register('graph', graph);

// Build the listener graph for progression checking
listenerGraph = buildListenerGraph(db, scenarioLoader, turnManager, ragManager);
container.register('listenerGraph', listenerGraph);


console.log(`[${new Date().toISOString()}] Multi-agent system loaded successfully`);

// Load scenarios to template table (新架构)
let templateScenarioLoader = new TemplateScenarioLoader(db);
container.register('templateScenarioLoader',templateScenarioLoader);

let templateNpcLoader = new TemplateNPCLoader(db);
container.register('templateNpcLoader',templateNpcLoader);


export { container };