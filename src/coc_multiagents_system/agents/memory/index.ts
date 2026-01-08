/**
 * Memory Agent Module Exports
 * 导出内存管理相关的所有类和接口
 */

// 数据库和Schema
export { CoCDatabase } from "./database/schema.js";

// 模组导入和游戏实例管理 (新架构)
export { ModuleImporter } from "./moduleImporter.js";
export { GameInstanceManager } from "./gameInstanceManager.js";
export type { ModuleInfo } from "./moduleImporter.js";

// Turn管理
export { TurnManager } from "./turnManager.js";
export type { 
  TurnInput, 
  TurnProcessing, 
  TurnOutput, 
  GameTurn 
} from "./turnManager.js";

// Memory Agent 核心函数
export * from "./memoryAgent.js";
