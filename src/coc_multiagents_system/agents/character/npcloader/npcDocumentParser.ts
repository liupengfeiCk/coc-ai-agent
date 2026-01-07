/**
 * NPC Document Parser
 * Extracts NPC information from DOCX and PDF files using LLM
 */

import fs from "fs";
import path from "path";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import type { ParsedNPCData, InventoryItem } from "../../models/gameTypes.js";
import { createChatModel, ModelProviderName, ModelClass } from "../../../../models/index.js";
import e from "cors";

/**
 * Supported document formats
 */
export type SupportedFormat = "docx" | "pdf";

/**
 * Document parser for NPC information extraction
 */
export class NPCDocumentParser {
  private llm: ChatOpenAI | ChatGoogleGenerativeAI;

  constructor(model?: ChatOpenAI | ChatGoogleGenerativeAI) {
    // Use provided model or create one using the unified model configuration system
    if (!model) {
      const geminiApiKey = process.env.GOOGLE_API_KEY;
      const openaiApiKey = process.env.OPENAI_API_KEY;
      const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
      
      if (geminiApiKey) {
        // Use small model for document parsing (cost-effective for this task)
        this.llm = createChatModel(ModelProviderName.GOOGLE, ModelClass.SMALL);
      } else if (openaiApiKey) {
        this.llm = createChatModel(ModelProviderName.OPENAI, ModelClass.MEDIUM);
      } else if (deepseekApiKey) {
        this.llm = createChatModel(ModelProviderName.DEEPSEEK, ModelClass.MEDIUM);
      } else {
        throw new Error("No API key found. Please set either GOOGLE_API_KEY or OPENAI_API_KEY environment variable.");
      }
    } else {
      this.llm = model;
    }
  }

  /**
   * Parse a document and extract NPC data
   */
  async parseDocument(filePath: string): Promise<ParsedNPCData[]> {
    const ext = path
      .extname(filePath)
      .toLowerCase()
      .slice(1) as SupportedFormat;

    if (!["docx", "pdf"].includes(ext)) {
      throw new Error(
        `Unsupported file format: ${ext}. Only .docx and .pdf are supported.`
      );
    }

    // Extract text from document
    const text = await this.extractText(filePath, ext);

    // Use LLM to parse structured data from text
    const npcData = await this.extractNPCData(text, path.basename(filePath));

    return npcData;
  }

  /**
   * Extract text content from document
   */
  private async extractText(
    filePath: string,
    format: SupportedFormat
  ): Promise<string> {
    const buffer = fs.readFileSync(filePath);

    if (format === "docx") {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } else if (format === "pdf") {
      const data = await pdfParse(buffer);
      return data.text;
    }

    throw new Error(`Unsupported format: ${format}`);
  }

  /**
   * Use LLM to extract structured NPC data from raw text.
   */
  private async extractNPCData(
    text: string,
    fileName: string
  ): Promise<ParsedNPCData[]> {
    const CHUNK_SIZE = 5000;
    const OVERLAP = 1000;

    if (text.length <= CHUNK_SIZE) {
      return this.extractNPCDataFromText(text, fileName);
    }

    const chunks = this.splitTextWithOverlap(text, CHUNK_SIZE, OVERLAP);
    let merged: ParsedNPCData[] = [];
    const errors: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const partName = `${fileName} (part ${i + 1}/${chunks.length})`;
      console.log(
        `Chunking ${fileName}: processing part ${i + 1}/${chunks.length} (${chunks[i].length} chars)`
      );
      try {
        const partial = await this.extractNPCDataFromText(chunks[i], partName);
        merged = this.mergeNPCResults(merged, partial);
      } catch (err) {
        const detail =
          err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
        errors.push(`Part ${i + 1}/${chunks.length}: ${detail}`);
        console.warn(
          `Skipping failed chunk ${i + 1}/${chunks.length} for ${fileName}: ${detail}`
        );
        continue;
      }
    }

    if (merged.length === 0) {
      throw new Error(
        `Failed to parse any chunks for ${fileName}. Errors: ${errors.join(" | ")}`
      );
    }

    return merged;
  }

  /**
   * Core extraction for a single text chunk
   */
  private async extractNPCDataFromText(
    text: string,
    fileName: string
  ): Promise<ParsedNPCData[]> {
    const prompt = `You are an NPC data extractor for a Call of Cthulhu 7th Edition TRPG game.

Extract NPC information from the following document and return it as a JSON array of NPC objects. The document may describe multiple NPCs; include every NPC you find. If there is only one, still return a single-element array.

The JSON array entries should follow this structure:
[
  {
    "name": "NPC name",
    "occupation": "NPC occupation",
    "age": number,
    "gender": "male" | "female" | "other",
    "appearance": "physical description",
    "personality": "personality traits",
    "background": "backstory",
    "goals": ["goal 1", "goal 2"],
    "secrets": ["secret 1", "secret 2"],
    "attributes": {
      "STR": number (0-100),
      "CON": number,
      "DEX": number,
      "APP": number,
      "POW": number,
      "SIZ": number,
      "INT": number,
      "EDU": number
    },
    "status": {
      "hp": number,
      "maxHp": number,
      "sanity": number,
      "maxSanity": number,
      "luck": number,
      "mp": number,
      "conditions": []
    },
    "skills": {
      "skill name": value (0-100)
    },
    "inventory": ["item 1", "item 2"],
    "clues": [
      {
        "clueText": "information this NPC knows",
        "category": "knowledge" | "observation" | "rumor" | "secret",
        "difficulty": "regular" | "hard" | "extreme",
        "relatedTo": ["related character or location"]
      }
    ],
    "relationships": [
      {
        "targetName": "related character name",
        "relationshipType": "ally" | "enemy" | "neutral" | "family" | "friend" | "rival" | "employer" | "employee" | "stranger",
        "attitude": number (-100 to 100),
        "description": "relationship description",
        "history": "relationship backstory"
      }
    ],
    "notes": "additional notes"
  }
]

Important notes:
1. Only include fields that are present in the document
2. For missing numerical attributes, you can infer reasonable values based on the NPC description
3. If skills are not specified, include only the most relevant skills for this NPC
4. Extract all clues and relationships mentioned in the document
5. Ensure all numerical values are within valid CoC 7e ranges (attributes: 0-Infinity, hp: derived from CON+SIZ/10, sanity: typically POW*5, luck: typically 50-99)
6. Return a JSON ARRAY only. Do not wrap in an object or add extra keys.
7. The text you see may be only a fragment of the full NPC data. If information is missing or incomplete, leave the field empty/omit it—do NOT fabricate details.
8. Status fields: if provided, include hp/maxHp/sanity/maxSanity/luck/mp and, if available, damageBonus/build/mov. If not provided, leave them blank; they will be derived later.

Document content:
---
${text}
---

File name: ${fileName}

Return ONLY the JSON array, no additional text.`;
    let lastError: unknown;
    
    const promptChars = prompt.length;
    console.log(`\n📝 [NPC Document Parser] LLM请求统计:`);
    console.log(`   File: ${fileName}`);
    console.log(`   Prompt字符数: ${promptChars} chars`);

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const llmStart = Date.now();
        const response = await this.llm.invoke(prompt);
        const llmDuration = Date.now() - llmStart;
        const content = response.content as string;
        
        if (attempt === 1) {
          console.log(`   Response字符数: ${content.length} chars`);
          console.log(`   总字符数: ${promptChars + content.length} chars`);
          console.log(`   LLM耗时: ${llmDuration}ms\n`);
        }

        // Extract JSON from response (in case LLM wraps it in markdown code blocks)
        const jsonText =
          content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ||
          content.match(/\[[\s\S]*\]/)?.[0] ||
          content.match(/\{[\s\S]*\}/)?.[0];

        if (!jsonText) {
          throw new Error(`Failed to extract JSON from LLM response: ${content}`);
        }

        const parsed = (() => {
          try {
            return JSON.parse(jsonText) as unknown;
          } catch (err) {
            const details = err instanceof Error ? err.message : String(err);
            const snippet = jsonText.slice(0, 500);
            throw new Error(
              `Failed to parse LLM JSON for ${fileName}: ${details}. Raw extract (truncated): ${snippet}`
            );
          }
        })();
        let npcArray: ParsedNPCData[];

        if (Array.isArray(parsed)) {
          npcArray = parsed as ParsedNPCData[];
        } else if (
          parsed &&
          typeof parsed === "object" &&
          "npcs" in parsed &&
          Array.isArray((parsed as { npcs?: ParsedNPCData[] }).npcs)
        ) {
          npcArray = (parsed as { npcs: ParsedNPCData[] }).npcs;
        } else {
          npcArray = [parsed as ParsedNPCData];
        }

        // Validate required field
        npcArray.forEach((npc, index) => {
          if (!npc.name) {
            throw new Error(
              `NPC name is required but not found in document: ${fileName} (entry index ${index})`
            );
          }
        });

        return npcArray;
      } catch (err) {
        lastError = err;
        const detail =
          err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
        console.warn(
          `Retry ${attempt}/3 for ${fileName} due to error: ${detail}`
        );
        if (attempt === 3) {
          throw err;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  /**
   * Parse multiple documents from a directory
   */
  async parseDirectory(dirPath: string): Promise<ParsedNPCData[]> {
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory does not exist: ${dirPath}`);
    }

    const files = fs.readdirSync(dirPath);
    const npcFiles = files.filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return ext === ".docx" || ext === ".pdf";
    });

    const results: ParsedNPCData[] = [];

    for (const file of npcFiles) {
      try {
        const filePath = path.join(dirPath, file);
        console.log(`Parsing NPC document: ${file}...`);
        const npcData = await this.parseDocument(filePath);
        results.push(...npcData);
        console.log(`✓ Successfully parsed ${npcData.length} NPC(s) from: ${file}`);
      } catch (error) {
        console.error(`✗ Failed to parse ${file}:`, error);
      }
    }

    return results;
  }

  /**
   * Split text into overlapping chunks to preserve context across boundaries
   */
  private splitTextWithOverlap(
    text: string,
    chunkSize: number,
    overlap: number
  ): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      let chunk = text.slice(start, end);

      // Try to end on a paragraph boundary if possible
      if (end < text.length) {
        const boundary = chunk.lastIndexOf("\n\n");
        if (boundary > 0 && boundary > chunkSize - 1500) {
          chunk = chunk.slice(0, boundary);
        }
      }

      chunks.push(chunk);
      if (end >= text.length) break;
      start += chunk.length - overlap;
      if (start < 0) start = 0;
    }

    return chunks;
  }

  /**
   * Merge NPC arrays by name, combining fields where possible
   */
  private mergeNPCResults(
    existing: ParsedNPCData[],
    incoming: ParsedNPCData[]
  ): ParsedNPCData[] {
    const byName = new Map<string, ParsedNPCData>();

    const mergeFields = (
      base: ParsedNPCData,
      next: ParsedNPCData
    ): ParsedNPCData => {
      const merged: ParsedNPCData = { ...base };

      merged.occupation = merged.occupation || next.occupation;
      merged.age = merged.age ?? next.age;
      merged.appearance = this.pickLonger(merged.appearance, next.appearance);
      merged.personality = this.pickLonger(merged.personality, next.personality);
      merged.background = this.pickLonger(merged.background, next.background);
      merged.notes = this.pickLonger(merged.notes, next.notes);

      merged.goals = this.mergeStringArrays(merged.goals, next.goals);
      merged.secrets = this.mergeStringArrays(merged.secrets, next.secrets);
      merged.inventory = this.mergeInventoryArrays(
        merged.inventory,
        next.inventory
      );

      merged.attributes = { ...(merged.attributes || {}), ...(next.attributes || {}) };
      merged.status = { ...(merged.status || {}), ...(next.status || {}) };
      merged.skills = { ...(merged.skills || {}), ...(next.skills || {}) };

      merged.clues = this.mergeByKey(
        merged.clues,
        next.clues,
        (c) => c.clueText
      );
      merged.relationships = this.mergeByKey(
        merged.relationships,
        next.relationships,
        (r) => `${r.targetName}-${r.relationshipType}-${r.attitude}`
      );

      return merged;
    };

    const addAll = (arr: ParsedNPCData[]) => {
      for (const npc of arr) {
        const key = npc.name.trim();
        if (byName.has(key)) {
          const merged = mergeFields(byName.get(key)!, npc);
          byName.set(key, merged);
        } else {
          byName.set(key, { ...npc });
        }
      }
    };

    addAll(existing);
    addAll(incoming);

    return Array.from(byName.values());
  }

  private pickLonger(
    a?: string,
    b?: string
  ): string | undefined {
    if (a && b) {
      return b.length > a.length ? b : a;
    }
    return a || b;
  }

  private mergeStringArrays(
    a?: string[],
    b?: string[]
  ): string[] | undefined {
    const merged = new Set<string>();
    (a || []).forEach((v) => merged.add(v));
    (b || []).forEach((v) => merged.add(v));
    return merged.size ? Array.from(merged) : undefined;
  }

  private mergeInventoryArrays(
    a?: InventoryItem[],
    b?: InventoryItem[]
  ): InventoryItem[] | undefined {
    const merged = new Map<string, InventoryItem>();
    
    // Add items from first array, using name as key
    (a || []).forEach((item) => {
      merged.set(item.name.toLowerCase(), item);
    });
    
    // Add items from second array, merging quantities if item already exists
    (b || []).forEach((item) => {
      const key = item.name.toLowerCase();
      const existing = merged.get(key);
      if (existing) {
        // Merge quantities if both have quantities
        const quantity = (existing.quantity || 1) + (item.quantity || 1);
        merged.set(key, {
          ...existing,
          quantity,
          // Merge properties if both exist
          properties: { ...(existing.properties || {}), ...(item.properties || {}) }
        });
      } else {
        merged.set(key, item);
      }
    });
    
    return merged.size ? Array.from(merged.values()) : undefined;
  }

  private mergeByKey<T extends Record<string, any>>(
    a: T[] | undefined,
    b: T[] | undefined,
    keyFn: (item: T) => string
  ): T[] {
    const map = new Map<string, T>();
    (a || []).forEach((item) => map.set(keyFn(item), item));
    (b || []).forEach((item) => {
      const key = keyFn(item);
      if (!map.has(key)) {
        map.set(key, item);
      }
    });
    return Array.from(map.values());
  }
}
