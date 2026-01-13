/**
 * Difficulty Modifiers
 */
export type Difficulty = "regular" | "hard" | "extreme";

/**
 * Weapon Data
 */
export interface WeaponData {
  name: string;
  skill: string;
  damage: string;
  range: string;
  attacksPerRound: number;
  ammo?: number;
  malfunction?: number;
  era?: string;
}

export interface Skill {
  name: string;
  baseValue: number;
  description: string;
  category: string;
  uncommon: boolean;
  examples?: string[];
}

/**
 * Character Attributes and Status
 */
export interface CharacterAttributes {
  STR: number;
  CON: number;
  DEX: number;
  APP: number;
  POW: number;
  SIZ: number;
  INT: number;
  EDU: number;
  [key: string]: number;
}

export interface CharacterStatus {
  hp: number;
  maxHp: number;
  sanity: number;
  maxSanity: number;
  luck: number;
  mp?: number;
  conditions: string[];
  notes?: string;
  /**
   * Damage bonus (e.g., "0", "+1d4", "+1d6", "-1d4")
   */
  damageBonus?: string;
  /**
   * Build value derived from STR+SIZ (e.g., -2, -1, 0, 1, 2, ...)
   */
  build?: number;
  /**
   * Movement rate
   */
  mov?: number;
  [key: string]: number | string[] | string | undefined;
}

export interface ActionLogEntry {
  time: string;
  location: string;
  summary: string;
}

/**
 * Inventory Item - Represents an item in a character's inventory
 */
export interface InventoryItem {
  name: string;                    // Item name (required)
  quantity?: number;                // Quantity (default: 1)
  properties?: Record<string, any>; // Additional properties (weight, durability, description, etc.)
}

/**
 * Utility functions for inventory management
 */
export class InventoryUtils {
  /**
   * Normalize inventory to InventoryItem[] format
   */
  static normalizeInventory(inventory: InventoryItem[] | undefined | null): InventoryItem[] {
    if (!inventory || !Array.isArray(inventory)) return [];
    return inventory.filter((item): item is InventoryItem => 
      item && typeof item === 'object' && 'name' in item && typeof item.name === 'string'
    );
  }

  /**
   * Convert InventoryItem[] to string[] (for simple display or legacy compatibility)
   */
  static toSimpleList(inventory: InventoryItem[]): string[] {
    return inventory.map(item => {
      if (item.quantity && item.quantity > 1) {
        return `${item.name} (x${item.quantity})`;
      }
      return item.name;
    });
  }

  /**
   * Find an item in inventory by name (case-insensitive)
   */
  static findItem(inventory: InventoryItem[], itemName: string): InventoryItem | undefined {
    const normalizedName = itemName.toLowerCase().trim();
    return inventory.find(item => item.name.toLowerCase().trim() === normalizedName);
  }

  /**
   * Add items to inventory, merging quantities if item already exists
   */
  static addItems(inventory: InventoryItem[], items: InventoryItem[]): InventoryItem[] {
    const newInventory = [...inventory];
    
    for (const itemToAdd of items) {
      const existingIndex = newInventory.findIndex(
        invItem => invItem.name.toLowerCase().trim() === itemToAdd.name.toLowerCase().trim()
      );
      
      if (existingIndex >= 0) {
        // Merge quantities if item exists
        const existing = newInventory[existingIndex];
        newInventory[existingIndex] = {
          ...existing,
          quantity: (existing.quantity || 1) + (itemToAdd.quantity || 1),
          // Merge properties if both have them
          properties: existing.properties || itemToAdd.properties
            ? { ...existing.properties, ...itemToAdd.properties }
            : undefined
        };
      } else {
        // Add new item
        newInventory.push({
          name: itemToAdd.name,
          quantity: itemToAdd.quantity || 1,
          properties: itemToAdd.properties
        });
      }
    }
    
    return newInventory;
  }

  /**
   * Remove items from inventory
   */
  static removeItems(inventory: InventoryItem[], itemsToRemove: InventoryItem[]): InventoryItem[] {
    const removeNames = itemsToRemove.map(item => item.name.toLowerCase().trim());
    
    return inventory
      .map(item => {
        const itemName = item.name.toLowerCase().trim();
        const index = removeNames.indexOf(itemName);
        
        if (index >= 0) {
          const removeItem = itemsToRemove[index];
          const removeQuantity = removeItem.quantity || 1;
          const currentQuantity = item.quantity || 1;
          
          if (currentQuantity > removeQuantity) {
            // Reduce quantity
            return { ...item, quantity: currentQuantity - removeQuantity };
          } else {
            // Remove completely
            return null;
          }
        }
        
        return item;
      })
      .filter((item): item is InventoryItem => item !== null);
  }
}

export interface CharacterProfile {
  id: string;
  name: string;
  attributes: CharacterAttributes;
  status: CharacterStatus;
  inventory: InventoryItem[];       // Changed from string[] to InventoryItem[]
  skills: Record<string, number>;
  notes?: string;
  actionLog?: ActionLogEntry[];
}

/**
 * NPC Clue - Information that the NPC knows or can reveal
 */
export interface NPCClue {
  id: string;
  clueText: string;
  category?: "knowledge" | "observation" | "rumor" | "secret";
  difficulty?: Difficulty; // difficulty to extract this clue
  revealed: boolean;
  relatedTo?: string[]; // related character or location IDs
}

/**
 * NPC Relationship - Connection between NPCs or PC and NPC
 */
export interface NPCRelationship {
  targetId: string; // ID of the related character
  targetName: string;
  relationshipType:
    | "ally"
    | "enemy"
    | "neutral"
    | "family"
    | "friend"
    | "rival"
    | "employer"
    | "employee"
    | "stranger";
  attitude: number; // -100 to 100, negative is hostile, positive is friendly
  description?: string;
  history?: string; // backstory of this relationship
}

/**
 * NPC Profile - Extended character profile with NPC-specific data
 */
export interface NPCProfile extends CharacterProfile {
  occupation?: string;
  age?: number;
  gender?: string;
  appearance?: string;
  personality?: string;
  background?: string;
  goals?: string[];
  secrets?: string[];
  clues: NPCClue[];
  relationships: NPCRelationship[];
  isNPC: true; // flag to distinguish from player characters
  currentLocation?: string; // NPC的当前地点
  sessionId?: string; // 游戏会话ID,用于多会话隔离
}

/**
 * Parsed NPC data from document
 */
export interface ParsedNPCData {
  name: string;
  occupation?: string;
  age?: number;
  gender?: string;
  appearance?: string;
  personality?: string;
  background?: string;
  goals?: string[];
  secrets?: string[];
  attributes?: Partial<CharacterAttributes>;
  status?: Partial<CharacterStatus>;
  skills?: Record<string, number>;
  inventory?: InventoryItem[];
  clues?: Omit<NPCClue, "id" | "revealed">[];
  relationships?: Omit<NPCRelationship, "targetId">[];
  notes?: string;
  currentLocation?: string; // NPC的当前地点
}
