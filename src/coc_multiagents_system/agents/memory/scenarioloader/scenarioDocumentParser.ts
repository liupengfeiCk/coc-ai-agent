/**
 * Scenario Document Parser
 * Extracts scenario information from DOCX and PDF files using LLM
 */

import fs from "fs";
import path from "path";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { createChatModel, ModelProviderName, ModelClass } from "../../../../models/index.js";
import type { ParsedScenarioData, ParsedScenarioSnapshot } from "../../models/scenarioTypes.js";

/**
 * Supported document formats
 */
export type SupportedFormat = "docx" | "pdf";

/**
 * Document parser for scenario information extraction
 */
export class ScenarioDocumentParser {
  private llm: ChatOpenAI | ChatGoogleGenerativeAI;

  constructor(model?: ChatOpenAI | ChatGoogleGenerativeAI) {
    // Use provided model or create one using the unified model configuration system
    if (!model) {
      const geminiApiKey = process.env.GOOGLE_API_KEY;
      const openaiApiKey = process.env.OPENAI_API_KEY;
      const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
      
      if (geminiApiKey) {
        // Use small model for document parsing (cost-effective for this task)
        this.llm = createChatModel(ModelProviderName.GOOGLE, ModelClass.MEDIUM);
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
   * Parse a document and extract scenario data (supports multiple scenarios per document)
   */
  async parseDocument(filePath: string): Promise<ParsedScenarioData[]> {
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

    console.log(`📄 Document size: ${text.length} characters`);

    // Use LLM to parse structured data from text (now returns array)
    const scenarioDataArray = await this.extractScenarioData(text, path.basename(filePath));

    return scenarioDataArray;
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
   * Use LLM to extract structured scenario data from raw text.
   * Now processes the entire document at once using Large model, returning multiple scenarios if found.
   */
  private async extractScenarioData(
    text: string,
    fileName: string
  ): Promise<ParsedScenarioData[]> {
    // With Large model, we can handle much larger inputs (up to ~50,000 characters)
    // Only chunk if document is extremely large (>100,000 chars)
    const MAX_SIZE = 100000;

    if (text.length > MAX_SIZE) {
      console.warn(`⚠️  Document is very large (${text.length} chars). Consider splitting into separate files.`);
      // For extremely large documents, still use chunking but with larger chunks
      return this.extractWithChunking(text, fileName);
    }

    console.log(`🤖 Processing entire document with Large model (${text.length} chars)...`);
    return this.extractScenariosFromText(text, fileName);
  }

  /**
   * Fallback method for extremely large documents (>100k chars)
   */
  private async extractWithChunking(
    text: string,
    fileName: string
  ): Promise<ParsedScenarioData[]> {
    const CHUNK_SIZE = 50000; // Much larger chunks with Large model
    const OVERLAP = 2000;
    
    const chunks = this.splitTextWithOverlap(text, CHUNK_SIZE, OVERLAP);
    const allScenarios: ParsedScenarioData[] = [];

    for (let i = 0; i < chunks.length; i++) {
      console.log(
        `📄 Processing chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`
      );
      const partName = `${fileName} (part ${i + 1}/${chunks.length})`;
      const scenarios = await this.extractScenariosFromText(chunks[i], partName);
      allScenarios.push(...scenarios);
    }

    // Deduplicate scenarios by name (keep first occurrence)
    const uniqueScenarios = new Map<string, ParsedScenarioData>();
    for (const scenario of allScenarios) {
      if (!uniqueScenarios.has(scenario.name)) {
        uniqueScenarios.set(scenario.name, scenario);
      }
    }

    return Array.from(uniqueScenarios.values());
  }

  /**
   * Core extraction - returns array of scenarios from text
   */
  private async extractScenariosFromText(
    text: string,
    fileName: string
  ): Promise<ParsedScenarioData[]> {
    const prompt = `You are a scenario data extractor for a Call of Cthulhu 7th Edition TRPG game.

Extract ALL scenarios from the following document and return them as a JSON array.

**IMPORTANT**: If the document contains multiple locations/scenarios (e.g., a bar, hospital, train station, etc.), 
extract each as a SEPARATE object in the array. Each unique location = one scenario object.

The JSON array should contain objects following this structure:
{
  "name": "Scenario Location Name (e.g., 'AAA Hospital', 'BBB Factory', 'CCC Plaza')",
  "description": "Overall scenario description (the environment as a whole)",
  "snapshot": {
      "name": "Scene name (optional, can be same as scenario name)",
      "location": "Primary location description",
      "description": "Detailed scene description",
      "timeRestriction": "Optional time restriction (e.g., 'day1 evening', 'day2 (after)')",
      "characters": [
        {
          "name": "Character name",
          "role": "Role in scene (witness, victim, suspect, etc.)",
          "status": "Character status (alive, missing, unconscious, etc.)",
          "location": "Character's specific location",
          "notes": "Notes about character in this scene"
        }
      ],
      "clues": [
        {
          "clueText": "Description of the clue",
          "category": "physical" | "witness" | "document" | "environment" | "knowledge" | "observation",
          "difficulty": "automatic" | "regular" | "hard" | "extreme",
          "location": "Where clue can be found",
          "discoveryMethod": "Required skill or method (optional)",
          "reveals": ["What this clue points to"]
        }
      ],
      "conditions": [
        {
          "type": "weather" | "lighting" | "sound" | "smell" | "temperature" | "other",
          "description": "Environmental condition description",
          "mechanicalEffect": "Game mechanical effect if any"
        }
      ],
      "events": ["List of notable events"],
      "exits": [
        {
          "direction": "Direction or exit name",
          "destination": "Where it leads",
          "description": "Exit description",
          "condition": "locked/hidden/etc (optional)"
        }
      ],
      "keeperNotes": "Notes for the Keeper",
      "permanentChanges": ["Any permanent changes to the scenario"]
    },
  "snapshots": [
    {
      "name": "Scene name (optional)",
      "location": "Primary location description",
      "description": "Detailed scene description",
      "timeRestriction": "Optional time restriction (e.g., 'day1 evening', 'day2 (after)')",
      "characters": [...],
      "clues": [...],
      "conditions": [...],
      "events": [...],
      "exits": [...],
      "keeperNotes": "...",
      "permanentChanges": [...]
    }
  ],
  "tags": ["tag1", "tag2", "descriptive tags"],
  "connections": [
    {
      "scenarioName": "Related scenario name",
      "relationshipType": "leads_to" | "concurrent" | "prerequisite" | "alternate",
      "description": "How they're connected"
    }
  ]
}

Important extraction guidelines:
1. **Multiple Scenarios**: If the document describes multiple distinct locations (bar, hospital, church, train station, etc.), create SEPARATE scenario objects for each
2. **Single or Multiple Snapshots**: Each scenario can have either a single "snapshot" object (legacy format) or multiple "snapshots" array (new format). Use "snapshots" array if the scenario has different states at different times (e.g., before/after an event, different time periods)
3. **Time Restrictions**: If a snapshot is only valid at a specific time, include "timeRestriction" field (e.g., "day1 evening", "day2 (after)")
3. **Character Information**: Document all characters present in each scenario with their status
4. **Clue Scope**: Only include clues discoverable in the scene/location. Do NOT include clues belonging solely to NPC private knowledge
5. **Partial Inputs**: If information is missing, leave the field blank or omit it—do NOT fabricate details
6. **Scene Granularity**: Treat a scene as a whole area/building (e.g., hotel, plaza, hospital). Do NOT split into individual rooms; fold room-level details into the description/clues of the parent location
7. **Location-First**: Each scenario maps to one location/environment. The snapshot captures the state of that location
8. **Connections**: When scenarios reference other scenarios in the document, include them in the "connections" array

Pay special attention to:
- Characters present and their status
- Clues available in the location
- Environmental/atmospheric conditions
- Notable events or activities
- Connections to other locations

Document content:
---
${text}
---

File name: ${fileName}

Return ONLY a JSON array of scenario objects. Even if there's only one scenario, wrap it in an array: [{"name": "...", ...}]
Do not include any additional text, explanations, or markdown formatting.`;

    let lastError: unknown;
    
    const promptChars = prompt.length;
    console.log(`\n📝 [Scenario Document Parser] LLM请求统计:`);
    console.log(`   File: ${fileName}`);
    console.log(`   Prompt字符数: ${promptChars} chars`);

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const llmStart = Date.now();
        const response = await this.llm.invoke(prompt);
        const llmDuration = Date.now() - llmStart;
        const content =
          typeof response.content === "string"
            ? response.content
            : JSON.stringify(response.content, null, 2);
        
        if (attempt === 1) {
          console.log(`   Response字符数: ${content.length} chars`);
          console.log(`   总字符数: ${promptChars + content.length} chars`);
          console.log(`   LLM耗时: ${llmDuration}ms\n`);
        }

        // Save raw LLM response to JSON file for debugging/auditing
        try {
          const rawDir = path.join(
            process.cwd(),
            "data",
            "scenarios",
            "raw_responses"
          );
          fs.mkdirSync(rawDir, { recursive: true });

          const safeFileName = fileName.replace(/[^\w.-]+/g, "_");
          const rawPath = path.join(
            rawDir,
            `${safeFileName}-${Date.now()}.json`
          );

          const rawPayload = {
            fileName,
            attempt,
            timestamp: new Date().toISOString(),
            promptLength: prompt.length,
            content,
          };

          fs.writeFileSync(rawPath, JSON.stringify(rawPayload, null, 2), "utf8");
        } catch (saveErr) {
          console.warn("⚠️ Failed to save raw LLM response:", saveErr);
        }

        // Extract JSON from response (support both array and single object wrapped in code blocks)
        const jsonText =
          content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ||
          content.match(/\[[\s\S]*\]/)?.[0] ||
          content.match(/\{[\s\S]*\}/)?.[0];

        if (!jsonText) {
          throw new Error(`Failed to extract JSON from LLM response: ${content.substring(0, 500)}...`);
        }

        let parsedData = JSON.parse(jsonText);

        // Ensure we always return an array
        const scenariosArray: ParsedScenarioData[] = Array.isArray(parsedData) 
          ? parsedData 
          : [parsedData];

        // Validate each scenario
        for (const scenario of scenariosArray) {
          if (!scenario.name) {
            throw new Error(
              `Scenario name is required but not found in one of the scenarios in: ${fileName}`
            );
          }

          if (!scenario.snapshot) {
            throw new Error(
              `Scenario snapshot is required for scenario "${scenario.name}" in: ${fileName}`
            );
          }
        }

        console.log(`✓ Extracted ${scenariosArray.length} scenario(s) from ${fileName}`);
        scenariosArray.forEach((s, i) => console.log(`  ${i + 1}. ${s.name}`));

        return scenariosArray;
      } catch (err) {
        lastError = err;
        const detail =
          err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
        console.warn(
          `⚠️  Retry ${attempt}/3 for ${fileName} due to error: ${detail}`
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
  async parseDirectory(dirPath: string): Promise<ParsedScenarioData[]> {
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory does not exist: ${dirPath}`);
    }

    const files = fs.readdirSync(dirPath);
    const scenarioFiles = files.filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return ext === ".docx" || ext === ".pdf";
    });

    const results: ParsedScenarioData[] = [];

    for (const file of scenarioFiles) {
      try {
        const filePath = path.join(dirPath, file);
        console.log(`\n📖 Parsing scenario document: ${file}...`);
        const scenariosFromFile = await this.parseDocument(filePath);
        results.push(...scenariosFromFile); // Spread the array
        console.log(`✓ Successfully parsed ${scenariosFromFile.length} scenario(s) from ${file}`);
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

      if (end < text.length) {
        const boundary = chunk.lastIndexOf("\n\n");
        if (boundary > 0 && boundary > chunkSize - 800) {
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
   * LEGACY: Merge scenario results from multiple chunks
   * Note: This is now only used for extremely large documents (>100k chars)
   * Regular documents are processed in one shot with Large model
   */
  private mergeScenarioResults(
    base: ParsedScenarioData,
    incoming: ParsedScenarioData
  ): ParsedScenarioData {
    // Merge snapshots - handle both single snapshot and multiple snapshots
    let mergedSnapshot: ParsedScenarioSnapshot | undefined;
    let mergedSnapshots: ParsedScenarioSnapshot[] | undefined;

    if (base.snapshots || incoming.snapshots) {
      // Both have snapshots arrays - merge them
      const baseSnapshots = base.snapshots || (base.snapshot ? [base.snapshot] : []);
      const incomingSnapshots = incoming.snapshots || (incoming.snapshot ? [incoming.snapshot] : []);
      mergedSnapshots = [...baseSnapshots, ...incomingSnapshots];
    } else if (base.snapshot || incoming.snapshot) {
      // Both have single snapshot - merge them
      mergedSnapshot = this.mergeSnapshot(base.snapshot, incoming.snapshot);
    }

    const merged: ParsedScenarioData = {
      name: base.name || incoming.name,
      description: this.pickLonger(base.description, incoming.description) || "",
      snapshot: mergedSnapshot,
      snapshots: mergedSnapshots,
      tags: this.mergeStringArrays(base.tags, incoming.tags) || [],
      connections: this.mergeByKey(
        base.connections,
        incoming.connections,
        (c) => `${c.scenarioName}-${c.relationshipType}-${c.description ?? ""}`
      ),
    };

    return merged;
  }

  private mergeSnapshot(
    a: ParsedScenarioData["snapshot"],
    b: ParsedScenarioData["snapshot"]
  ): ParsedScenarioSnapshot {
    if (!a && !b) {
      throw new Error("Cannot merge: both snapshots are undefined");
    }
    if (!a) return b!;
    if (!b) return a;

    return {
      name: a.name || b.name,
      location: a.location || b.location,
      description: this.pickLonger(a.description, b.description) || "",
      timeRestriction: a.timeRestriction || b.timeRestriction,
      characters: this.mergeByKey(
        a.characters,
        b.characters,
        (c) => c.name
      ),
      clues: this.mergeByKey(a.clues, b.clues, (c) => c.clueText),
      conditions: this.mergeByKey(
        a.conditions,
        b.conditions,
        (c) => `${c.type}-${c.description}`
      ),
      events: this.mergeStringArrays(a.events, b.events) || [],
      exits: this.mergeByKey(
        a.exits,
        b.exits,
        (e) => `${e.direction}-${e.destination}`
      ),
      keeperNotes: this.pickLonger(a.keeperNotes, b.keeperNotes),
      permanentChanges: this.mergeStringArrays(a.permanentChanges, b.permanentChanges),
    };
  }

  private pickLonger(a?: string, b?: string): string | undefined {
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
