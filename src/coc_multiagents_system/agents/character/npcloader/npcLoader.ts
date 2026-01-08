/**
 * NPC Loader
 * Loads NPC data from documents and stores them in the database
 */

import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import type { CoCDatabase } from "../../memory/database/schema.js";
import type {
  CharacterAttributes,
  CharacterStatus,
  InventoryItem,
  NPCClue,
  NPCProfile,
  NPCRelationship,
  ParsedNPCData,
} from "../../models/gameTypes.js";
import { InventoryUtils } from "../../models/gameTypes.js";
import {
  createChatModel,
  ModelClass,
  ModelProviderName,
} from "../../../../models/index.js";
import { NPCDocumentParser } from "./npcDocumentParser.js";

/**
 * Default attributes for NPCs when not specified
 */
const DEFAULT_ATTRIBUTES: CharacterAttributes = {
  STR: 50,
  CON: 50,
  DEX: 50,
  APP: 50,
  POW: 50,
  SIZ: 50,
  INT: 50,
  EDU: 50,
};

/**
 * Calculate default status from attributes
 */
function calculateDefaultStatus(
  attributes: CharacterAttributes
): CharacterStatus {
  const hp = Math.floor((attributes.CON + attributes.SIZ) / 10);
  const maxSanity = attributes.POW * 5;
  const mp = Math.floor(attributes.POW / 5);
  const { damageBonus, build } = calculateDamageBonusAndBuild(
    attributes.STR,
    attributes.SIZ
  );
  const mov = calculateMovement(attributes);

  return {
    hp,
    maxHp: hp,
    sanity: maxSanity,
    maxSanity,
    luck: 50,
    mp,
    damageBonus,
    build,
    mov,
    conditions: [],
  };
}

/**
 * Compute damage bonus and build from STR+SIZ (CoC 7e)
 */
function calculateDamageBonusAndBuild(
  str: number,
  siz: number
): { damageBonus: string; build: number } {
  const total = str + siz;
  if (total <= 64) return { damageBonus: "-1d4", build: -2 };
  if (total <= 84) return { damageBonus: "0", build: -1 };
  if (total <= 124) return { damageBonus: "+1d4", build: 0 };
  if (total <= 164) return { damageBonus: "+1d6", build: 1 };
  if (total <= 204) return { damageBonus: "+2d6", build: 2 };
  return { damageBonus: "+3d6", build: 3 };
}

/**
 * Compute movement (MOV) based on STR/DEX vs SIZ (simplified CoC 7e rules)
 */
function calculateMovement(attributes: CharacterAttributes): number {
  const { STR, DEX, SIZ } = attributes;
  if (STR > SIZ && DEX > SIZ) return 9;
  if (STR < SIZ && DEX < SIZ) return 7;
  return 8;
}

/**
 * NPC Loader class
 */
export class NPCLoader {
  private db: CoCDatabase;
  private parser: NPCDocumentParser;
  private mergeModel: ChatOpenAI | ChatGoogleGenerativeAI;

  constructor(
    db: CoCDatabase,
    parser?: NPCDocumentParser,
    mergeModel?: ChatOpenAI | ChatGoogleGenerativeAI
  ) {
    this.db = db;
    this.parser = parser || new NPCDocumentParser();
    this.mergeModel = mergeModel || this.createMergeModel();
  }

  /**
   * Merge already-stored NPCs in the DB (by similar names) and rewrite them.
   */
  async mergeExistingNPCs(): Promise<NPCProfile[]> {
    const existing = this.getAllNPCs();
    if (existing.length === 0) {
      console.log("No existing NPCs found to merge.");
      return [];
    }

    console.log(`Merging ${existing.length} existing NPC(s) by similar names...`);
    const parsed = existing.map((npc) => this.profileToParsed(npc));
    const mergedParsed = await this.mergeSimilarNPCs(parsed);

    // Wipe and reinsert
    const database = this.db.getDatabase();
    this.db.transaction(() => {
      database.prepare("DELETE FROM npc_clues").run();
      database.prepare("DELETE FROM npc_relationships").run();
      database.prepare("DELETE FROM characters WHERE is_npc = 1").run();
    });
    console.log("Cleared existing NPC data from DB.");

    const profiles: NPCProfile[] = [];
    for (const parsedData of mergedParsed) {
      const profile = this.convertToNPCProfile(parsedData);
      this.saveNPCToDatabase(profile);
      profiles.push(profile);
    }

    console.log(`Saved ${profiles.length} merged NPC(s) to DB.`);
    return profiles;
  }

  /**
   * Ask LLM to suggest potential duplicate names, merge those groups, and rewrite DB.
   * Useful for catching cross-language/variant names missed by heuristic clustering.
   */
  async mergeWithLLMSuggestedGroups(): Promise<NPCProfile[]> {
    const existing = this.getAllNPCs();
    if (existing.length === 0) {
      console.log("No existing NPCs found to merge.");
      return [];
    }

    const suggestedGroups = await this.suggestDuplicateGroups(existing);
    if (suggestedGroups.length === 0) {
      console.log("No duplicate suggestions from LLM. Keeping existing NPCs.");
      return existing;
    }

    // Build lookup by normalized name
    const normalize = (n: string) => n.toLowerCase().trim();
    const nameMap = new Map<string, NPCProfile>();
    for (const npc of existing) {
      if (!nameMap.has(normalize(npc.name))) {
        nameMap.set(normalize(npc.name), npc);
      }
    }

    // Track which names are consumed by suggested groups
    const consumed = new Set<string>();
    const mergedParsed: ParsedNPCData[] = [];

    for (const group of suggestedGroups) {
      const groupNPCs: NPCProfile[] = [];
      for (const rawName of group) {
        const key = normalize(rawName);
        const found = nameMap.get(key);
        if (!found) {
          console.warn(`LLM suggested name not found in DB: "${rawName}"`);
          continue;
        }
        groupNPCs.push(found);
        consumed.add(found.name);
      }

      if (groupNPCs.length < 2) {
        // Not enough to merge, keep originals
        mergedParsed.push(...groupNPCs.map((npc) => this.profileToParsed(npc)));
        continue;
      }

      try {
        const merged = await this.mergeClusterWithLLM(
          groupNPCs.map((npc) => this.profileToParsed(npc))
        );
        mergedParsed.push(...merged);
        console.log(
          `LLM-suggested merge: ${groupNPCs.length} -> ${merged.length} for [${groupNPCs
            .map((n) => n.name)
            .join(", ")}]`
        );
      } catch (error) {
        console.warn(
          `Failed to merge LLM-suggested group [${groupNPCs
            .map((n) => n.name)
            .join(", ")}], keeping originals. Error: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        mergedParsed.push(...groupNPCs.map((npc) => this.profileToParsed(npc)));
      }
    }

    // Add untouched NPCs
    for (const npc of existing) {
      if (!consumed.has(npc.name)) {
        mergedParsed.push(this.profileToParsed(npc));
      }
    }

    // Rewrite DB
    const database = this.db.getDatabase();
    this.db.transaction(() => {
      database.prepare("DELETE FROM npc_clues").run();
      database.prepare("DELETE FROM npc_relationships").run();
      database.prepare("DELETE FROM characters WHERE is_npc = 1").run();
    });
    console.log("Rewrote DB with LLM-suggested merges.");

    const profiles: NPCProfile[] = [];
    for (const parsed of mergedParsed) {
      const profile = this.convertToNPCProfile(parsed);
      this.saveNPCToDatabase(profile);
      profiles.push(profile);
    }

    console.log(`Saved ${profiles.length} NPC(s) after LLM suggestion merge.`);
    return profiles;
  }

  /**
   * Check if any files in directory have changed since last load
   */
  private checkForChanges(dirPath: string): { hasChanges: boolean; currentFiles: Map<string, number> } {
    if (!fs.existsSync(dirPath)) {
      return { hasChanges: false, currentFiles: new Map() };
    }

    const currentFiles = new Map<string, number>();
    const files = fs.readdirSync(dirPath).filter(file => 
      file.endsWith('.docx') || file.endsWith('.pdf')
    );

    // Get modification times for all relevant files
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      currentFiles.set(file, stats.mtime.getTime());
    }

    // Check if we have cached file info
    const existingNPCs = this.getAllNPCs();
    
    // If no NPCs exist, we need to load
    if (existingNPCs.length === 0) {
      return { hasChanges: true, currentFiles };
    }

    // For now, we'll use a simple approach - check if any file timestamps changed
    // In a production system, you might want to store this in the database
    const lastLoadFile = path.join(dirPath, '.last_load_timestamp');
    let lastLoadTime = 0;
    
    if (fs.existsSync(lastLoadFile)) {
      try {
        lastLoadTime = parseInt(fs.readFileSync(lastLoadFile, 'utf8'));
      } catch {
        // If we can't read the timestamp, assume changes
        return { hasChanges: true, currentFiles };
      }
    }

    // Check if any file is newer than last load
    const hasChanges = Array.from(currentFiles.values()).some(mtime => mtime > lastLoadTime);
    
    return { hasChanges, currentFiles };
  }

  /**
   * Update the last load timestamp
   */
  private updateLastLoadTimestamp(dirPath: string): void {
    const lastLoadFile = path.join(dirPath, '.last_load_timestamp');
    const currentTime = Date.now().toString();
    fs.writeFileSync(lastLoadFile, currentTime, 'utf8');
  }

  /**
   * Load NPCs from JSON files in a directory (skip document parsing)
   */
  async loadNPCsFromJSONDirectory(dirPath: string, forceReload = false): Promise<NPCProfile[]> {
    console.log(`\n=== Loading NPCs from JSON directory: ${dirPath} ===`);

    if (!fs.existsSync(dirPath)) {
      console.log(`Directory does not exist: ${dirPath}`);
      return [];
    }

    // Check for file changes unless forced reload
    if (!forceReload) {
      const { hasChanges } = this.checkForJSONChanges(dirPath);
      if (!hasChanges) {
        const existingNPCs = this.getAllNPCs();
        console.log(`No changes detected. Using ${existingNPCs.length} existing NPCs from database.`);
        return existingNPCs;
      }
    }

    console.log(`Loading NPCs from JSON files in directory: ${dirPath}`);

    const files = fs.readdirSync(dirPath);
    const jsonFiles = files.filter((f) => f.toLowerCase().endsWith(".json"));

    if (jsonFiles.length === 0) {
      console.log("No JSON files found in directory.");
      this.updateLastLoadTimestamp(dirPath);
      return [];
    }

    const allParsedNPCs: ParsedNPCData[] = [];

    console.log(`📦 找到 ${jsonFiles.length} 个NPC JSON文件，开始加载...`);
    for (let i = 0; i < jsonFiles.length; i++) {
      const file = jsonFiles[i];
      try {
        console.log(`  [${i + 1}/${jsonFiles.length}] 正在加载: ${file}`);
        const filePath = path.join(dirPath, file);
        const fileContent = fs.readFileSync(filePath, "utf-8");
        const jsonData = JSON.parse(fileContent);

        // Handle both array of NPCs and single NPC object
        const npcs: ParsedNPCData[] = Array.isArray(jsonData) ? jsonData : [jsonData];

        for (const npcData of npcs) {
          allParsedNPCs.push(npcData);
        }
        console.log(`  ✓ 已加载 ${npcs.length} 个NPC从文件: ${file}`);
      } catch (error) {
        console.error(`  ✗ 加载文件失败 ${file}:`, error);
      }
    }

    if (allParsedNPCs.length === 0) {
      console.log("No NPC data found in JSON files.");
      this.updateLastLoadTimestamp(dirPath);
      return [];
    }

    // Direct import from JSON - no merging needed
    console.log(`💾 开始保存 ${allParsedNPCs.length} 个NPC到数据库（直接导入，跳过合并）...`);
    const npcProfiles: NPCProfile[] = [];
    for (let i = 0; i < allParsedNPCs.length; i++) {
      const parsedData = allParsedNPCs[i];
      try {
        const npcProfile = this.convertToNPCProfile(parsedData);
        this.saveNPCToDatabase(npcProfile);
        npcProfiles.push(npcProfile);
        console.log(`  [${i + 1}/${allParsedNPCs.length}] ✓ 已保存NPC: ${npcProfile.name}`);
      } catch (error) {
        console.error(`  [${i + 1}/${allParsedNPCs.length}] ✗ 保存NPC失败 ${parsedData.name}:`, error);
      }
    }

    // Update timestamp after successful load
    this.updateLastLoadTimestamp(dirPath);

    console.log(`\n=== Successfully loaded ${npcProfiles.length} NPCs from JSON files ===\n`);
    return npcProfiles;
  }

  /**
   * Check if any JSON files in directory have changed since last load
   */
  private checkForJSONChanges(dirPath: string): { hasChanges: boolean; currentFiles: Map<string, number> } {
    if (!fs.existsSync(dirPath)) {
      return { hasChanges: false, currentFiles: new Map() };
    }

    const currentFiles = new Map<string, number>();
    const files = fs.readdirSync(dirPath).filter(file => file.toLowerCase().endsWith(".json"));

    // Get modification times for all JSON files
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      currentFiles.set(file, stats.mtime.getTime());
    }

    // Check if we have existing NPCs
    const existingNPCs = this.getAllNPCs();
    
    // If no NPCs exist, we need to load
    if (existingNPCs.length === 0) {
      return { hasChanges: true, currentFiles };
    }

    // Check timestamp file
    const lastLoadFile = path.join(dirPath, '.last_load_timestamp');
    let lastLoadTime = 0;
    
    if (fs.existsSync(lastLoadFile)) {
      try {
        lastLoadTime = parseInt(fs.readFileSync(lastLoadFile, 'utf8'));
      } catch {
        return { hasChanges: true, currentFiles };
      }
    }

    // Check if any file is newer than last load
    const hasChanges = Array.from(currentFiles.values()).some(mtime => mtime > lastLoadTime);
    
    return { hasChanges, currentFiles };
  }

  /**
   * Load NPCs from a directory (only if files have changed)
   */
  async loadNPCsFromDirectory(dirPath: string, forceReload = false): Promise<NPCProfile[]> {
    console.log(`\n=== Checking NPCs in directory: ${dirPath} ===`);

    if (!fs.existsSync(dirPath)) {
      console.log(`Directory does not exist, creating: ${dirPath}`);
      fs.mkdirSync(dirPath, { recursive: true });
      return [];
    }

    // Check for file changes unless forced reload
    if (!forceReload) {
      const { hasChanges } = this.checkForChanges(dirPath);
      if (!hasChanges) {
        const existingNPCs = this.getAllNPCs();
        console.log(`No changes detected. Using ${existingNPCs.length} existing NPCs from database.`);
        return existingNPCs;
      }
    }

    console.log(`Loading NPCs from directory: ${dirPath}`);

    // Parse all documents in the directory
    const parsedNPCs = await this.parser.parseDirectory(dirPath);
    console.log(`🔄 开始合并相似NPC，共 ${parsedNPCs.length} 个...`);
    const dedupedNPCs = await this.mergeSimilarNPCs(parsedNPCs);
    console.log(`✓ 合并完成，剩余 ${dedupedNPCs.length} 个唯一NPC`);

    if (dedupedNPCs.length === 0) {
      console.log("⚠️  目录中未找到NPC文档。");
      this.updateLastLoadTimestamp(dirPath);
      return [];
    }

    // Convert and store each NPC
    console.log(`💾 开始保存 ${dedupedNPCs.length} 个NPC到数据库...`);
    const npcProfiles: NPCProfile[] = [];
    for (let i = 0; i < dedupedNPCs.length; i++) {
      const parsedData = dedupedNPCs[i];
      try {
        const npcProfile = this.convertToNPCProfile(parsedData);
        this.saveNPCToDatabase(npcProfile);
        npcProfiles.push(npcProfile);
        console.log(`  [${i + 1}/${dedupedNPCs.length}] ✓ 已保存NPC: ${npcProfile.name}`);
      } catch (error) {
        console.error(`  [${i + 1}/${dedupedNPCs.length}] ✗ 保存NPC失败 ${parsedData.name}:`, error);
      }
    }

    // Update timestamp after successful load
    this.updateLastLoadTimestamp(dirPath);
    
    console.log(`\n=== Successfully loaded ${npcProfiles.length} NPCs ===\n`);
    return npcProfiles;
  }

  /**
   * Convert ParsedNPCData to NPCProfile
   */
  private convertToNPCProfile(parsedData: ParsedNPCData): NPCProfile {
    const npcId = this.generateNPCId(parsedData.name);

    // Merge attributes with defaults
    const attributes: CharacterAttributes = this.normalizeAttributes(
      parsedData.attributes
    );

    // Calculate or use provided status
    const defaultStatus = calculateDefaultStatus(attributes);
    const status: CharacterStatus = {
      ...defaultStatus,
      ...parsedData.status,
    };

    // Convert clues
    const clues: NPCClue[] = (parsedData.clues || []).map((clue, index) => ({
      id: `${npcId}-clue-${index}`,
      clueText: clue.clueText,
      category: clue.category,
      difficulty: clue.difficulty,
      revealed: false,
      relatedTo: clue.relatedTo,
    }));

    // Convert relationships
    const relationships: NPCRelationship[] = (
      parsedData.relationships || []
    ).map((rel, index) => ({
      targetId: `${rel.targetName.toLowerCase().replace(/\s+/g, "-")}`,
      targetName: rel.targetName,
      relationshipType: rel.relationshipType,
      attitude: rel.attitude,
      description: rel.description,
      history: rel.history,
    }));

    const npcProfile: NPCProfile = {
      id: npcId,
      name: parsedData.name,
      attributes,
      status,
      inventory: InventoryUtils.normalizeInventory(parsedData.inventory),
      skills: parsedData.skills || {},
      notes: parsedData.notes,
      occupation: parsedData.occupation,
      age: parsedData.age,
      gender: parsedData.gender,
      appearance: parsedData.appearance,
      personality: parsedData.personality,
      background: parsedData.background,
      goals: parsedData.goals || [],
      secrets: parsedData.secrets || [],
      currentLocation: parsedData.currentLocation,
      clues,
      relationships,
      isNPC: true,
    };

    return npcProfile;
  }

  /**
   * Normalize partial attributes into full CharacterAttributes with defaults
   */
  private normalizeAttributes(
    attrs?: Partial<CharacterAttributes>
  ): CharacterAttributes {
    const result: CharacterAttributes = { ...DEFAULT_ATTRIBUTES };

    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (typeof value === "number") {
          // Keep only numeric entries
          result[key] = value;
        }
      }
    }

    return result;
  }

  /**
   * Convert an existing NPC profile (from DB) back to ParsedNPCData for merging
   */
  private profileToParsed(npc: NPCProfile): ParsedNPCData {
    return {
      name: npc.name,
      occupation: npc.occupation,
      age: npc.age,
      appearance: npc.appearance,
      personality: npc.personality,
      background: npc.background,
      goals: npc.goals,
      secrets: npc.secrets,
      currentLocation: npc.currentLocation,
      attributes: npc.attributes,
      status: npc.status,
      skills: npc.skills,
      inventory: npc.inventory,
      clues: npc.clues?.map((c) => ({
        clueText: c.clueText,
        category: c.category,
        difficulty: c.difficulty,
        relatedTo: c.relatedTo,
      })),
      relationships: npc.relationships?.map((r) => ({
        targetName: r.targetName,
        relationshipType: r.relationshipType,
        attitude: r.attitude,
        description: r.description,
        history: r.history,
      })),
      notes: npc.notes,
    };
  }

  /**
   * Merge similar NPC entries (e.g., "Ben" vs "Ben Cleo") using LLM guidance.
   */
  private async mergeSimilarNPCs(parsedNPCs: ParsedNPCData[]): Promise<ParsedNPCData[]> {
    if (parsedNPCs.length === 0) return [];

    const clusters = this.clusterSimilar(parsedNPCs);
    if (clusters.every((c) => c.length === 1)) {
      return parsedNPCs;
    }

    const mergedResults: ParsedNPCData[] = [];

    for (const cluster of clusters) {
      if (cluster.length === 1) {
        mergedResults.push(cluster[0]);
        continue;
      }

      try {
        const merged = await this.mergeClusterWithLLM(cluster);
        mergedResults.push(...merged);
        console.log(
          `Merged cluster (${cluster.length} entries) into ${merged.length} NPC(s): ${cluster
            .map((c) => c.name)
            .join(", ")}`
        );
      } catch (error) {
        console.warn(
          `Failed to LLM-merge cluster ${cluster.map((c) => c.name).join(", ")}. Using originals. Error: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        mergedResults.push(...cluster);
      }
    }

    return mergedResults;
  }

  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ")
      .trim();
  }

  private levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () =>
      Array(n + 1).fill(0)
    );

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    return dp[m][n];
  }

  private similarName(a: string, b: string): boolean {
    const na = this.normalizeName(a);
    const nb = this.normalizeName(b);
    if (!na || !nb) return false;
    if (na === nb) return true;

    const tokensA = na.split(/\s+/);
    const tokensB = nb.split(/\s+/);
    if (tokensA[0] && tokensA[0] === tokensB[0]) return true;

    const dist = this.levenshtein(na, nb);
    const maxLen = Math.max(na.length, nb.length);
    const score = 1 - dist / maxLen;
    return score >= 0.6;
  }

  private clusterSimilar(parsedNPCs: ParsedNPCData[]): ParsedNPCData[][] {
    const visited = new Set<number>();
    const clusters: ParsedNPCData[][] = [];

    for (let i = 0; i < parsedNPCs.length; i++) {
      if (visited.has(i)) continue;
      const anchor = parsedNPCs[i];
      const group: ParsedNPCData[] = [anchor];
      visited.add(i);

      for (let j = i + 1; j < parsedNPCs.length; j++) {
        if (visited.has(j)) continue;
        const candidate = parsedNPCs[j];
        if (this.similarName(anchor.name, candidate.name)) {
          group.push(candidate);
          visited.add(j);
        }
      }

      clusters.push(group);
    }

    return clusters;
  }

  private async mergeClusterWithLLM(cluster: ParsedNPCData[]): Promise<ParsedNPCData[]> {
    const entries = cluster.map((npc, idx) => ({
      idx,
      name: npc.name,
      occupation: npc.occupation,
      age: npc.age ?? null,
      appearance: npc.appearance,
      personality: npc.personality,
      background: npc.background,
      goals: npc.goals || [],
      secrets: npc.secrets || [],
      attributes: npc.attributes || {},
      status: npc.status || {},
      skills: npc.skills || {},
      inventory: InventoryUtils.normalizeInventory(npc.inventory),
      clues: npc.clues || [],
      relationships: npc.relationships || [],
      notes: npc.notes,
    }));

    const prompt = `You are deduplicating NPC entries that likely refer to the same person. The inputs may be fragments from chunked documents.
- If entries are the same NPC, merge them into ONE object.
- If they are different people, return multiple objects (one per distinct NPC).
- Do NOT invent details. If a field is missing, leave it empty/omit it.
- For lists (goals, secrets, inventory, clues, relationships), take the union and deduplicate exact duplicates.
- Acceptable outputs: a single JSON object OR a JSON array of objects.
- Required field: "name" (use the best/most complete name; you may pick one of the provided names).
- Keep clue/relationship structures unchanged if present.
- The text may be partial; missing info is OK.
- If two entries are clearly different people (e.g., different surnames and roles), keep them separate.

Entries (JSON):
${JSON.stringify(entries, null, 2)}

Return ONLY JSON (object or array), no extra text.`;

    let lastError: unknown;
    
    const promptChars = prompt.length;
    console.log(`\n📝 [NPC Loader - Merge Duplicates] LLM请求统计:`);
    console.log(`   Cluster size: ${entries.length}`);
    console.log(`   Prompt字符数: ${promptChars} chars`);
    
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const llmStart = Date.now();
        const response = await this.mergeModel.invoke(prompt);
        const llmDuration = Date.now() - llmStart;
        const content = response.content as string;
        
        if (attempt === 1) {
          console.log(`   Response字符数: ${content.length} chars`);
          console.log(`   总字符数: ${promptChars + content.length} chars`);
          console.log(`   LLM耗时: ${llmDuration}ms\n`);
        }
        const jsonText =
          content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ||
          content.match(/\[[\s\S]*\]/)?.[0] ||
          content.match(/\{[\s\S]*\}/)?.[0];

        if (!jsonText) {
          throw new Error(`Failed to extract JSON from LLM response: ${content}`);
        }

        const parsed = JSON.parse(jsonText) as unknown;
        const objs = Array.isArray(parsed) ? parsed : [parsed];

        const cleaned: ParsedNPCData[] = objs.map((o, idx) => {
          const obj = o as any;
          const name = obj.name || obj.canonicalName || cluster[0].name;
          if (!name) {
            throw new Error(`Merged NPC missing name (index ${idx})`);
          }
          const normalized: ParsedNPCData = {
            name,
            occupation: obj.occupation ?? obj.occ ?? undefined,
            age: obj.age ?? undefined,
            appearance: obj.appearance,
            personality: obj.personality,
            background: obj.background,
            goals: obj.goals,
            secrets: obj.secrets,
            attributes: obj.attributes,
            status: obj.status,
            skills: obj.skills,
            inventory: obj.inventory,
            clues: obj.clues,
            relationships: obj.relationships,
            notes: obj.notes,
          };
          return normalized;
        });

        return cleaned;
      } catch (err) {
        lastError = err;
        const detail =
          err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
        console.warn(
          `Retry ${attempt}/3 for NPC merge cluster (${cluster
            .map((c) => c.name)
            .join(", ")}) due to error: ${detail}`
        );
        if (attempt === 3) {
          throw err;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  /**
   * Ask LLM to suggest potential duplicate name groups from existing NPC list.
   */
  private async suggestDuplicateGroups(
    npcs: NPCProfile[]
  ): Promise<string[][]> {
    const names = npcs.map((n) => n.name);
    const prompt = `You are reviewing a list of NPC names. Some may be duplicates referring to the same person (e.g., language variants, nicknames). It is also possible that none are duplicates.
- Task: propose groups of names that are likely the same person.
- Be conservative: if unsure, do NOT group.
- Return a JSON array of groups. Each group is an array of strings (the names). Return [] if no likely duplicates.
Example output:
[ ["Ben", "Ben Cleo"], ["Simon", "Simon Laplace"] ]
Names:
${names.map((n) => `- ${n}`).join("\n")}

Return ONLY JSON array, no extra text.`;

    let lastError: unknown;
    
    const promptChars = prompt.length;
    console.log(`\n📝 [NPC Loader - Cluster Names] LLM请求统计:`);
    console.log(`   Names to cluster: ${names.length}`);
    console.log(`   Prompt字符数: ${promptChars} chars`);
    
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const llmStart = Date.now();
        const response = await this.mergeModel.invoke(prompt);
        const llmDuration = Date.now() - llmStart;
        const content = response.content as string;
        
        if (attempt === 1) {
          console.log(`   Response字符数: ${content.length} chars`);
          console.log(`   总字符数: ${promptChars + content.length} chars`);
          console.log(`   LLM耗时: ${llmDuration}ms\n`);
        }
        const jsonText =
          content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ||
          content.match(/\[[\s\S]*\]/)?.[0];

        if (!jsonText) {
          throw new Error(`Failed to extract JSON from LLM response: ${content}`);
        }

        const parsed = JSON.parse(jsonText);
        if (!Array.isArray(parsed)) {
          throw new Error("LLM response is not an array");
        }
        const groups: string[][] = parsed
          .filter((g: any) => Array.isArray(g))
          .map((g: any[]) => g.map((s) => String(s)));
        return groups;
      } catch (err) {
        lastError = err;
        const detail =
          err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
        console.warn(
          `Retry ${attempt}/3 for duplicate suggestion due to error: ${detail}`
        );
        if (attempt === 3) {
          throw err;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  /**
   * Generate a unique ID for an NPC based on their name
   */
  private generateNPCId(name: string): string {
    return `npc-${name.toLowerCase().replace(/\s+/g, "-")}-${randomUUID().slice(0, 8)}`;
  }

  /**
   * Save NPC to database
   */
  private saveNPCToDatabase(npc: NPCProfile): void {
    const database = this.db.getDatabase();

    this.db.transaction(() => {
      // Insert or update character
      const stmt = database.prepare(`
                INSERT OR REPLACE INTO characters (
                    character_id, name, attributes, status, inventory, skills, notes,
                    is_npc, occupation, age, gender, appearance, personality, background, goals, secrets, current_location,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `);

      stmt.run(
        npc.id,
        npc.name,
        JSON.stringify(npc.attributes),
        JSON.stringify(npc.status),
        JSON.stringify(npc.inventory),
        JSON.stringify(npc.skills),
        npc.notes || null,
        1, // is_npc = true
        npc.occupation || null,
        npc.age || null,
        npc.gender || null,
        npc.appearance || null,
        npc.personality || null,
        npc.background || null,
        JSON.stringify(npc.goals),
        JSON.stringify(npc.secrets),
        npc.currentLocation || null
      );

      // Delete existing clues and relationships for this NPC
      database.prepare("DELETE FROM npc_clues WHERE npc_id = ?").run(npc.id);
      database
        .prepare("DELETE FROM npc_relationships WHERE source_id = ?")
        .run(npc.id);

      // Insert clues
      if (npc.clues.length > 0) {
        const clueStmt = database.prepare(`
                    INSERT INTO npc_clues (
                        id, npc_id, clue_text, category, difficulty, revealed, related_to
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                `);

        for (const clue of npc.clues) {
          clueStmt.run(
            clue.id,
            npc.id,
            clue.clueText,
            clue.category || null,
            clue.difficulty || null,
            clue.revealed ? 1 : 0,
            clue.relatedTo ? JSON.stringify(clue.relatedTo) : null
          );
        }
      }

      // Insert relationships
      if (npc.relationships.length > 0) {
        const relStmt = database.prepare(`
                    INSERT INTO npc_relationships (
                        id, source_id, target_id, target_name, relationship_type, attitude, description, history
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `);

        const seenTargets = new Set<string>();
        for (const rel of npc.relationships) {
          const targetId = rel.targetId || this.slugify(rel.targetName);
          if (seenTargets.has(targetId)) {
            continue;
          }
          seenTargets.add(targetId);

          const relId = `${npc.id}-rel-${targetId}`;
          relStmt.run(
            relId,
            npc.id,
            targetId,
            rel.targetName,
            rel.relationshipType,
            rel.attitude,
            rel.description || null,
            rel.history || null
          );
        }
      }
    });
  }

  /**
   * Normalize a name into a slug-like id fragment
   */
  private slugify(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/(^-+|-+$)/g, "");
  }

  /**
   * Get an NPC from the database by ID
   */
  getNPCById(npcId: string): NPCProfile | null {
    const database = this.db.getDatabase();

    // Get character data
    const character = database
      .prepare(`
            SELECT * FROM characters WHERE character_id = ? AND is_npc = 1
        `)
      .get(npcId) as any;

    if (!character) {
      return null;
    }

    // Get clues
    const clues = database
      .prepare(`
            SELECT * FROM npc_clues WHERE npc_id = ?
        `)
      .all(npcId) as any[];

    // Get relationships
    const relationships = database
      .prepare(`
            SELECT * FROM npc_relationships WHERE source_id = ?
        `)
      .all(npcId) as any[];

    // Build NPC profile
    const npcProfile: NPCProfile = {
      id: character.character_id,
      name: character.name,
      attributes: JSON.parse(character.attributes),
      status: JSON.parse(character.status),
      inventory: InventoryUtils.normalizeInventory(JSON.parse(character.inventory || "[]")),
      skills: JSON.parse(character.skills || "{}"),
      notes: character.notes,
      occupation: character.occupation,
      age: character.age,
      gender: character.gender,
      appearance: character.appearance,
      personality: character.personality,
      background: character.background,
      goals: JSON.parse(character.goals || "[]"),
      secrets: JSON.parse(character.secrets || "[]"),
      currentLocation: character.current_location || undefined,
      clues: clues.map((c) => ({
        id: c.id,
        clueText: c.clue_text,
        category: c.category,
        difficulty: c.difficulty,
        revealed: c.revealed === 1,
        relatedTo: c.related_to ? JSON.parse(c.related_to) : undefined,
      })),
      relationships: relationships.map((r) => ({
        targetId: r.target_id,
        targetName: r.target_name,
        relationshipType: r.relationship_type,
        attitude: r.attitude,
        description: r.description,
        history: r.history,
      })),
      isNPC: true,
    };

    return npcProfile;
  }

  /**
   * Get all NPCs from the database
   */
  getAllNPCs(): NPCProfile[] {
    const database = this.db.getDatabase();

    const characters = database
      .prepare(`
            SELECT character_id FROM characters WHERE is_npc = 1
        `)
      .all() as any[];

    return characters
      .map((c) => this.getNPCById(c.character_id))
      .filter((npc) => npc !== null) as NPCProfile[];
  }

  /**
   * Get all NPCs for a specific session
   */
  getAllNPCsBySession(sessionId: string): NPCProfile[] {
    const database = this.db.getDatabase();

    const characters = database
      .prepare(`
            SELECT character_id FROM characters WHERE is_npc = 1 AND session_id = ?
        `)
      .all(sessionId) as any[];

    return characters
      .map((c) => this.getNPCById(c.character_id))
      .filter((npc) => npc !== null) as NPCProfile[];
  }

  /**
   * Check if NPC already exists in database
   */
  npcExists(npcId: string): boolean {
    const database = this.db.getDatabase();
    const result = database
      .prepare(`
            SELECT COUNT(*) as count FROM characters WHERE character_id = ? AND is_npc = 1
        `)
      .get(npcId) as any;
    return result.count > 0;
  }

  /**
   * Model used for NPC merging
   */
  private createMergeModel(): ChatOpenAI | ChatGoogleGenerativeAI {
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
