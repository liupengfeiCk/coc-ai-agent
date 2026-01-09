import { Router } from 'express';
import { container } from '../container.js';
import { generateRandomAttributes } from "../../src/coc_multiagents_system/agents/character/characterBuilder.js";
import { CoCDatabase } from '../../src/coc_multiagents_system/agents/memory/database/index.js';

const characterRouter = Router();

characterRouter.get("/", (req, res) => {
  try {
    let db = container.resolve("db") as CoCDatabase;
    const database = db.getDatabase();
    const characters = database.prepare(`
      SELECT character_id, name, occupation, age, is_npc, appearance
      FROM characters
      WHERE is_npc = 0 OR is_npc IS NULL
      ORDER BY updated_at DESC
    `).all();

    res.json({
      success: true,
      characters: characters,
    });
  } catch (error) {
    console.error("Error fetching characters:", error);
    res.status(500).json({ error: "Failed to fetch characters" });
  }
});

characterRouter.post("/random-attributes", (req, res) => {
  try {
    const { age } = req.body;

    // Generate random attributes
    const attributes = generateRandomAttributes(age);

    console.log(`[${new Date().toISOString()}] Generated random attributes${age ? ` for age ${age}` : ''}`);

    res.json({
      success: true,
      attributes: attributes,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error generating random attributes:", error);
    res.status(500).json({ error: "Failed to generate random attributes: " + (error as Error).message });
  }
});

characterRouter.post("/save", (req, res) => {
  try {
    // Initialize database if not already initialized
    let db = container.resolve("db") as CoCDatabase;
    

    const characterData = req.body;

    if (!characterData || !characterData.identity?.name) {
      return res.status(400).json({ error: "Character name is required" });
    }

    // Generate character ID
    const characterId = `char-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Prepare character data for database
    const dbCharacter = {
      character_id: characterId,
      name: characterData.identity.name,
      attributes: JSON.stringify(characterData.attributes || {}),
      status: JSON.stringify({
        hp: characterData.derived?.HP || 10,
        maxHp: characterData.derived?.HP || 10,
        sanity: characterData.derived?.SAN || (characterData.attributes?.POW || 60),
        maxSanity: 99, // COC规则：最大理智值固定为99
        luck: characterData.derived?.LUCK || characterData.attributes?.LCK || 50,
        mp: characterData.derived?.MP || (characterData.attributes?.POW ? Math.floor(characterData.attributes.POW / 5) : 10),
        damageBonus: characterData.derived?.DB || "0",
        build: characterData.derived?.BUILD || 0,
        mov: characterData.derived?.MOV || 8,
        conditions: [],
      }),
      inventory: JSON.stringify(
        (characterData.weapons || [])
          .filter((w: any) => w.name)
          .map((w: any) => w.name)
      ),
      skills: JSON.stringify(
        Object.entries(characterData.skills || {}).reduce((acc: any, [name, data]: [string, any]) => {
          // Support both old format (data.value) and new format (data.total with breakdown)
          if (typeof data === 'object' && data.total !== undefined) {
            // New format: store complete skill data with breakdown
            acc[name] = {
              value: data.total,
              base: data.base || 0,
              occupationalPoints: data.occupationalPoints || 0,
              interestPoints: data.interestPoints || 0
            };
          } else {
            // Old format or simple value: store as is
            acc[name] = typeof data === 'object' ? (data.value || 0) : data;
          }
          return acc;
        }, {})
      ),
      notes: JSON.stringify({
        era: characterData.identity?.era || "",
        gender: characterData.identity?.gender || "",
        residence: characterData.identity?.residence || "",
        birthplace: characterData.identity?.birthplace || "",
        appearance: characterData.notes?.appearance || "",
        ideology: characterData.notes?.ideology || "",
        people: characterData.notes?.people || "",
        gear: characterData.notes?.gear || "",
        backstory: characterData.notes?.backstory || "",
        weapons: characterData.weapons || [],
      }),
      is_npc: 0, // Player character
      occupation: characterData.identity?.occupation || null,
      age: characterData.identity?.age || null,
      appearance: characterData.notes?.appearance || null,
      personality: characterData.notes?.ideology || null,
      background: characterData.notes?.backstory || null,
      goals: null,
      secrets: null,
    };

    // Insert into database
    const database = db.getDatabase();
    const insertStmt = database.prepare(`
      INSERT INTO characters (
        character_id, name, attributes, status, inventory, skills, notes,
        is_npc, occupation, age, appearance, personality, background, goals, secrets
      ) VALUES (
        @character_id, @name, @attributes, @status, @inventory, @skills, @notes,
        @is_npc, @occupation, @age, @appearance, @personality, @background, @goals, @secrets
      )
    `);

    insertStmt.run(dbCharacter);

    console.log(`[${new Date().toISOString()}] Character created: ${characterData.identity.name} (${characterId})`);

    res.json({
      success: true,
      characterId: characterId,
      message: `角色 ${characterData.identity.name} 创建成功！`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error creating character:", error);
    res.status(500).json({ error: "Failed to create character: " + (error as Error).message });
  }
});

export default characterRouter;