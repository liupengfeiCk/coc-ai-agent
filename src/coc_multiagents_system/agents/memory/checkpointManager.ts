/**
 * Checkpoint Manager - Unified game state save/load system
 * 
 * This module provides a simple interface for saving and loading complete game states.
 * All game data is stored in a single JSON blob in the game_checkpoints table,
 * making it easy to implement save/load functionality.
 */

import type { CoCDatabase } from "./database/index.js";
import type { GameState } from "../../../state.js";
import { NPCLoader } from "../character/npcloader/npcLoader.js";

export interface CheckpointMetadata {
  checkpointId: string;
  checkpointName: string;
  checkpointType: 'auto' | 'manual' | 'scene_transition';
  description: string | null;
  gameDay: number | null;
  gameTime: string | null;
  currentSceneName: string | null;
  currentLocation: string | null;
  playerHp: number | null;
  playerSanity: number | null;
  createdAt: string;
}

export class CheckpointManager {
  private db: CoCDatabase;

  constructor(db: CoCDatabase) {
    this.db = db;
  }

  /**
   * Save a manual checkpoint with custom name
   */
  saveManual(
    gameState: GameState,
    checkpointName: string,
    description?: string
  ): string {
    const checkpointId = `manual-${Date.now()}`;
    
    this.db.saveCheckpoint(
      checkpointId,
      gameState.sessionId,
      checkpointName,
      gameState,
      'manual',
      description
    );

    console.log(`✓ Manual checkpoint saved: "${checkpointName}" (ID: ${checkpointId})`);
    return checkpointId;
  }

  /**
   * Save an auto checkpoint (usually triggered by game events)
   */
  saveAuto(
    gameState: GameState,
    checkpointName?: string
  ): string {
    const checkpointId = `auto-${Date.now()}`;
    const name = checkpointName || this.generateAutoCheckpointName(gameState);
    
    this.db.saveCheckpoint(
      checkpointId,
      gameState.sessionId,
      name,
      gameState,
      'auto',
      'Auto-saved by system'
    );

    // Clean up old auto-saves (keep only 10 most recent)
    this.db.cleanupAutoCheckpoints(gameState.sessionId, 10);

    return checkpointId;
  }

  /**
   * Load a checkpoint and restore game state
   */
  load(checkpointId: string): GameState | null {
    const checkpoint = this.db.loadCheckpoint(checkpointId);
    
    if (!checkpoint) {
      console.error(`Checkpoint not found: ${checkpointId}`);
      return null;
    }

    console.log(`✓ Loaded checkpoint: "${checkpoint.checkpointName}" from ${checkpoint.metadata.createdAt}`);
    
    const restoredGameState = checkpoint.gameState as GameState;
    
    // CRITICAL FIX: Reload all NPCs from database to ensure no NPCs are missing
    try {
      const npcLoader = new NPCLoader(this.db);
      const allNPCsFromDB = npcLoader.getAllNPCs();
      
      if (allNPCsFromDB.length > 0) {
        const checkpointNPCIds = new Set(restoredGameState.npcCharacters.map(npc => npc.id));
        const missingNPCs = allNPCsFromDB.filter(dbNpc => !checkpointNPCIds.has(dbNpc.id));
        
        if (missingNPCs.length > 0) {
          console.log(`   ⚠️  Checkpoint was missing ${missingNPCs.length} NPCs, adding them now:`);
          console.log(`      ${missingNPCs.slice(0, 5).map(npc => npc.name).join(', ')}${missingNPCs.length > 5 ? '...' : ''}`);
          restoredGameState.npcCharacters.push(...missingNPCs);
        }
        
        console.log(`   ✓ Total NPCs after restore: ${restoredGameState.npcCharacters.length}`);
      }
    } catch (error) {
      console.error(`   ⚠️  Failed to load missing NPCs from database:`, error);
      console.log(`   → Continuing with checkpoint NPCs only (${restoredGameState.npcCharacters.length} NPCs)`);
    }
    
    return restoredGameState;
  }

  /**
   * List all checkpoints for a session
   */
  list(sessionId: string, limit = 20): CheckpointMetadata[] {
    return this.db.listCheckpoints(sessionId, limit) as CheckpointMetadata[];
  }

  /**
   * List only manual checkpoints (user saves)
   */
  listManual(sessionId: string, limit = 20): CheckpointMetadata[] {
    const all = this.list(sessionId, limit * 2); // Get more to filter
    return all.filter(cp => cp.checkpointType === 'manual').slice(0, limit);
  }

  /**
   * List only auto checkpoints
   */
  listAuto(sessionId: string, limit = 10): CheckpointMetadata[] {
    const all = this.list(sessionId, limit * 2);
    return all.filter(cp => cp.checkpointType === 'auto').slice(0, limit);
  }

  /**
   * List scene transition checkpoints
   */
  listSceneTransitions(sessionId: string, limit = 20): CheckpointMetadata[] {
    const all = this.list(sessionId, limit * 2);
    return all.filter(cp => cp.checkpointType === 'scene_transition').slice(0, limit);
  }

  /**
   * Delete a checkpoint
   */
  delete(checkpointId: string): void {
    this.db.deleteCheckpoint(checkpointId);
    console.log(`✓ Deleted checkpoint: ${checkpointId}`);
  }

  /**
   * Get the most recent checkpoint
   */
  getLatest(sessionId: string): CheckpointMetadata | null {
    const checkpoints = this.list(sessionId, 1);
    return checkpoints.length > 0 ? checkpoints[0] : null;
  }

  /**
   * Generate a descriptive name for auto-checkpoints
   */
  private generateAutoCheckpointName(gameState: GameState): string {
    if (gameState.currentScenario) {
      const scene = gameState.currentScenario;
      return `${scene.name}`;
    }
    return `Auto-save - ${new Date().toLocaleString()}`;
  }

  /**
   * Print a formatted list of checkpoints (for CLI)
   */
  printCheckpointList(sessionId: string): void {
    const checkpoints = this.list(sessionId, 20);
    
    if (checkpoints.length === 0) {
      console.log("No checkpoints found.");
      return;
    }

    console.log("\n=== Available Checkpoints ===\n");
    
    checkpoints.forEach((cp, index) => {
      const typeIcon = cp.checkpointType === 'manual' ? '💾' : 
                       cp.checkpointType === 'scene_transition' ? '🚪' : '⏱️';
      
      console.log(`${index + 1}. ${typeIcon} ${cp.checkpointName}`);
      console.log(`   ID: ${cp.checkpointId}`);
      console.log(`   Location: ${cp.currentLocation || 'Unknown'}`);
      console.log(`   Player: HP ${cp.playerHp}/${cp.playerSanity} Sanity`);
      console.log(`   Saved: ${new Date(cp.createdAt).toLocaleString()}`);
      if (cp.description) {
        console.log(`   Note: ${cp.description}`);
      }
      console.log();
    });
  }

  /**
   * Export checkpoint to JSON file (for backup/sharing)
   */
  exportToJson(checkpointId: string): string | null {
    const checkpoint = this.db.loadCheckpoint(checkpointId);
    if (!checkpoint) return null;
    
    return JSON.stringify(checkpoint, null, 2);
  }

  /**
   * Import checkpoint from JSON (for restore/sharing)
   */
  importFromJson(jsonString: string): string | null {
    try {
      const checkpoint = JSON.parse(jsonString);
      const newId = `imported-${Date.now()}`;
      
      this.db.saveCheckpoint(
        newId,
        checkpoint.sessionId,
        `[Imported] ${checkpoint.checkpointName}`,
        checkpoint.gameState,
        'manual',
        `Imported from external source on ${new Date().toLocaleString()}`
      );
      
      console.log(`✓ Imported checkpoint: ${newId}`);
      return newId;
    } catch (error) {
      console.error("Failed to import checkpoint:", error);
      return null;
    }
  }
}

/**
 * Quick save/load utilities for convenience
 */
export class QuickSaveManager {
  private checkpointManager: CheckpointManager;
  private quickSaveSlots = 3; // Number of quick save slots

  constructor(db: CoCDatabase) {
    this.checkpointManager = new CheckpointManager(db);
  }

  /**
   * Quick save to a numbered slot (1-3)
   */
  quickSave(gameState: GameState, slot: number): string {
    if (slot < 1 || slot > this.quickSaveSlots) {
      throw new Error(`Quick save slot must be between 1 and ${this.quickSaveSlots}`);
    }

    const checkpointName = `Quick Save ${slot}`;
    const checkpointId = this.checkpointManager.saveManual(
      gameState,
      checkpointName,
      `Quick save slot ${slot}`
    );

    console.log(`✓ Quick saved to slot ${slot}`);
    return checkpointId;
  }

  /**
   * Quick load from a numbered slot (1-3)
   */
  quickLoad(slot: number): GameState | null {
    if (slot < 1 || slot > this.quickSaveSlots) {
      throw new Error(`Quick save slot must be between 1 and ${this.quickSaveSlots}`);
    }

    const checkpointId = `quicksave-slot${slot}`;
    return this.checkpointManager.load(checkpointId);
  }

  /**
   * Check if a quick save slot has data
   */
  hasQuickSave(slot: number): boolean {
    const checkpointId = `quicksave-slot${slot}`;
    const checkpoint = this.checkpointManager.load(checkpointId);
    return checkpoint !== null;
  }
}

