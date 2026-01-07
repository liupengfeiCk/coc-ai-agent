/**
 * Player Document Parser
 * Parses player character sheets from documents (PDF, TXT, MD, etc.)
 * Simpler than NPC parser - no chunking needed since players upload complete character sheets
 */

import fs from "fs";
import path from "path";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type {
  CharacterAttributes,
  CharacterStatus,
  CharacterProfile,
} from "../../models/gameTypes.js";
import {
  createChatModel,
  ModelClass,
  ModelProviderName,
} from "../../../../models/index.js";

/**
 * Parsed Player Character data from document
 */
export interface ParsedPlayerData {
  name: string;
  occupation?: string;
  age?: number;
  appearance?: string;
  background?: string;
  attributes: Partial<CharacterAttributes>;
  status: Partial<CharacterStatus>;
  skills: Record<string, number>;
  inventory: string[];
  notes?: string;
}

/**
 * Player Document Parser class
 */
export class PlayerDocumentParser {
  private model: ChatOpenAI | ChatGoogleGenerativeAI;

  constructor(model?: ChatOpenAI | ChatGoogleGenerativeAI) {
    this.model = model || this.createParserModel();
  }

  /**
   * Parse a single player character document
   */
  async parseDocument(filePath: string): Promise<ParsedPlayerData | null> {
    console.log(`\n=== Parsing player document: ${path.basename(filePath)} ===`);

    if (!fs.existsSync(filePath)) {
      console.log(`File does not exist: ${filePath}`);
      return null;
    }

    const content = await this.readDocumentContent(filePath);
    if (!content.trim()) {
      console.log(`Empty or unreadable document: ${filePath}`);
      return null;
    }

    try {
      const parsedData = await this.extractPlayerData(content, filePath);
      if (!parsedData.name) {
        console.log(`No character name found in document: ${filePath}`);
        return null;
      }

      console.log(`✓ Parsed player: ${parsedData.name}`);
      return parsedData;
    } catch (error) {
      console.error(`✗ Failed to parse player document ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Parse all player documents in a directory
   */
  async parseDirectory(dirPath: string): Promise<ParsedPlayerData[]> {
    if (!fs.existsSync(dirPath)) {
      console.log(`Directory does not exist: ${dirPath}`);
      return [];
    }

    const files = fs.readdirSync(dirPath);
    const documentFiles = files.filter((file) => this.isDocumentFile(file));

    if (documentFiles.length === 0) {
      console.log(`No document files found in directory: ${dirPath}`);
      return [];
    }

    const results: ParsedPlayerData[] = [];

    for (const file of documentFiles) {
      const filePath = path.join(dirPath, file);
      const parsed = await this.parseDocument(filePath);
      if (parsed) {
        results.push(parsed);
      }
    }

    return results;
  }

  /**
   * Read document content based on file type
   */
  private async readDocumentContent(filePath: string): Promise<string> {
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
      case ".txt":
      case ".md":
      case ".text":
        return fs.readFileSync(filePath, "utf-8");
      
      case ".json":
        try {
          const jsonContent = JSON.parse(fs.readFileSync(filePath, "utf-8"));
          return JSON.stringify(jsonContent, null, 2);
        } catch {
          return fs.readFileSync(filePath, "utf-8");
        }

      default:
        // For other formats, read as text and let the model handle it
        return fs.readFileSync(filePath, "utf-8");
    }
  }

  /**
   * Extract player character data using LLM
   */
  private async extractPlayerData(
    content: string,
    filePath: string
  ): Promise<ParsedPlayerData> {
    const prompt = `You are extracting player character data from a Call of Cthulhu character sheet.
Extract the following information from the document and return it as JSON:

REQUIRED FIELDS:
- name: Character's name (string, required)
- attributes: Character attributes as numbers (STR, CON, DEX, APP, POW, SIZ, INT, EDU)
- skills: Skills with numerical values (e.g., {"Accounting": 45, "Anthropology": 20})

OPTIONAL FIELDS:
- occupation: Character's profession/job (string)
- age: Character's age (number)
- appearance: Physical description (string)
- background: Character backstory (string) 
- status: Current status values (hp, maxHp, sanity, maxSanity, luck, mp, etc.)
- inventory: List of equipment/items (array of strings)
- notes: Any additional character notes, special abilities, roleplay notes, etc. (string)

RULES:
1. Return ONLY valid JSON, no extra text
2. If a field is not found or unclear, omit it or use null
3. For skills, only include ones with numerical values
4. For attributes, use standard CoC 7e attribute names
5. Character name is required - if not found, use "Unknown Character"
6. Include any character notes, special rules, or roleplay information in the notes field

Example output:
{
  "name": "Dr. Alice Thompson",
  "occupation": "Professor of Archaeology", 
  "age": 35,
  "appearance": "Tall woman with graying hair and wire-rimmed glasses",
  "background": "Born in London, studied at Oxford...",
  "attributes": {
    "STR": 45,
    "CON": 60,
    "DEX": 55,
    "APP": 70,
    "POW": 80,
    "SIZ": 50,
    "INT": 85,
    "EDU": 90
  },
  "status": {
    "hp": 11,
    "maxHp": 11,
    "sanity": 80,
    "maxSanity": 80,
    "luck": 65,
    "mp": 16
  },
  "skills": {
    "Accounting": 5,
    "Anthropology": 20,
    "Archaeology": 70,
    "History": 60,
    "Library Use": 80,
    "Spot Hidden": 45
  },
  "inventory": [
    "Magnifying glass",
    "Field notebook",
    "Excavation tools",
    ".32 Revolver"
  ],
  "notes": "Specialized in ancient civilizations. Has contacts in academic circles. Suffers from mild claustrophobia."
}

Document content:
${content}

Return JSON:`;

    let lastError: unknown;
    
    const promptChars = prompt.length;
    console.log(`\n📝 [Player Document Parser] LLM请求统计:`);
    console.log(`   Prompt字符数: ${promptChars} chars`);
    
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const llmStart = Date.now();
        const response = await this.model.invoke(prompt);
        const llmDuration = Date.now() - llmStart;
        const content = response.content as string;
        
        if (attempt === 1) {
          console.log(`   Response字符数: ${content.length} chars`);
          console.log(`   总字符数: ${promptChars + content.length} chars`);
          console.log(`   LLM耗时: ${llmDuration}ms\n`);
        }
        
        // Extract JSON from response
        const jsonText =
          content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ||
          content.match(/\{[\s\S]*\}/)?.[0];

        if (!jsonText) {
          throw new Error(`No JSON found in LLM response: ${content}`);
        }

        const parsed = JSON.parse(jsonText) as any;
        
        // Validate and normalize the result
        const playerData: ParsedPlayerData = {
          name: parsed.name || "Unknown Character",
          occupation: parsed.occupation || undefined,
          age: typeof parsed.age === "number" ? parsed.age : undefined,
          appearance: parsed.appearance || undefined,
          background: parsed.background || undefined,
          attributes: this.normalizeAttributes(parsed.attributes || {}),
          status: this.normalizeStatus(parsed.status || {}),
          skills: this.normalizeSkills(parsed.skills || {}),
          inventory: Array.isArray(parsed.inventory) ? parsed.inventory.filter(Boolean) : [],
          notes: parsed.notes || undefined,
        };

        return playerData;
      } catch (err) {
        lastError = err;
        const detail =
          err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
        console.warn(
          `Retry ${attempt}/3 for player parsing (${path.basename(filePath)}) due to error: ${detail}`
        );
        if (attempt === 3) {
          throw err;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  /**
   * Normalize and validate attributes
   */
  private normalizeAttributes(attrs: any): Partial<CharacterAttributes> {
    const result: Partial<CharacterAttributes> = {};
    const validAttrs = ["STR", "CON", "DEX", "APP", "POW", "SIZ", "INT", "EDU"];

    for (const attr of validAttrs) {
      const value = attrs[attr] || attrs[attr.toLowerCase()];
      if (typeof value === "number" && value >= 0 && value <= 100) {
        result[attr as keyof CharacterAttributes] = value;
      }
    }

    return result;
  }

  /**
   * Normalize and validate status
   */
  private normalizeStatus(status: any): Partial<CharacterStatus> {
    const result: Partial<CharacterStatus> = {};

    const numericFields = ["hp", "maxHp", "sanity", "maxSanity", "luck", "mp", "mov", "build"];
    for (const field of numericFields) {
      if (typeof status[field] === "number" && status[field] >= 0) {
        result[field as keyof CharacterStatus] = status[field];
      }
    }

    if (typeof status.damageBonus === "string") {
      result.damageBonus = status.damageBonus;
    }

    if (Array.isArray(status.conditions)) {
      result.conditions = status.conditions.filter((c: any) => typeof c === "string");
    }

    if (typeof status.notes === "string") {
      result.notes = status.notes;
    }

    return result;
  }

  /**
   * Normalize and validate skills
   */
  private normalizeSkills(skills: any): Record<string, number> {
    const result: Record<string, number> = {};

    if (typeof skills === "object" && skills !== null) {
      for (const [skillName, value] of Object.entries(skills)) {
        if (typeof value === "number" && value >= 0 && value <= 100) {
          result[skillName] = value;
        }
      }
    }

    return result;
  }

  /**
   * Check if file is a supported document type
   */
  private isDocumentFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    const supportedExts = [".txt", ".md", ".text", ".json"];
    return supportedExts.includes(ext);
  }

  /**
   * Create parser model for document processing
   */
  private createParserModel(): ChatOpenAI | ChatGoogleGenerativeAI {
    const geminiApiKey = process.env.GOOGLE_API_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
      
    if (geminiApiKey) {
      // Use small model for document parsing (cost-effective for this task)
      return createChatModel(ModelProviderName.GOOGLE, ModelClass.MEDIUM);
    } else if (openaiApiKey) {
      return createChatModel(ModelProviderName.OPENAI, ModelClass.MEDIUM);
    } else if (deepseekApiKey) {
      return createChatModel(ModelProviderName.DEEPSEEK, ModelClass.MEDIUM);
    } else {
      throw new Error("No API key found. Please set either GOOGLE_API_KEY or OPENAI_API_KEY environment variable.");
    }
  }
}