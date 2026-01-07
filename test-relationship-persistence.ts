/**
 * Test relationship persistence to database
 * Verifies that NPC relationship changes are saved to database
 */

import { CoCDatabase } from "./src/coc_multiagents_system/agents/memory/database/index.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testRelationshipPersistence() {
  console.log("\n🧪 测试关系持久化功能\n");
  
  // Create test database in memory
  const testDbPath = path.join(__dirname, "data", "test_relationship.db");
  
  // Delete test database if exists
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
    console.log("✓ 清理旧测试数据库");
  }
  
  const db = new CoCDatabase(testDbPath);
  console.log("✓ 创建测试数据库");
  
  // Test data
  const sourceNpcId = "npc-test-001";
  const targetId = "player-001";
  const targetName = "测试玩家";
  
  // Test 1: Insert new relationship
  console.log("\n📝 测试 1: 插入新关系");
  db.upsertNPCRelationship(
    sourceNpcId,
    targetId,
    targetName,
    "neutral",
    0,
    "初次见面"
  );
  console.log("✓ 关系已插入");
  
  // Verify insert
  const database = db.getDatabase();
  let row = database.prepare(`
    SELECT * FROM npc_relationships 
    WHERE source_id = ? AND target_id = ?
  `).get(sourceNpcId, targetId) as any;
  
  console.log("查询结果:", row);
  if (row && row.attitude === 0 && row.relationship_type === "neutral") {
    console.log("✅ 验证通过: 关系已正确插入");
  } else {
    console.error("❌ 验证失败: 关系插入不正确");
    process.exit(1);
  }
  
  // Test 2: Update existing relationship
  console.log("\n📝 测试 2: 更新已有关系");
  db.upsertNPCRelationship(
    sourceNpcId,
    targetId,
    targetName,
    "friend",
    25,
    "帮助过我"
  );
  console.log("✓ 关系已更新");
  
  // Verify update
  row = database.prepare(`
    SELECT * FROM npc_relationships 
    WHERE source_id = ? AND target_id = ?
  `).get(sourceNpcId, targetId) as any;
  
  console.log("查询结果:", row);
  if (row && row.attitude === 25 && row.relationship_type === "friend" && row.description === "帮助过我") {
    console.log("✅ 验证通过: 关系已正确更新");
  } else {
    console.error("❌ 验证失败: 关系更新不正确");
    process.exit(1);
  }
  
  // Test 3: Batch insert/update
  console.log("\n📝 测试 3: 批量插入/更新关系");
  db.batchUpsertNPCRelationships([
    {
      sourceNpcId: "npc-test-002",
      targetId: targetId,
      targetName: targetName,
      relationshipType: "enemy",
      attitude: -50,
      description: "被我打败"
    },
    {
      sourceNpcId: "npc-test-003",
      targetId: targetId,
      targetName: targetName,
      relationshipType: "ally",
      attitude: 80,
      description: "可靠的伙伴"
    },
    {
      sourceNpcId: sourceNpcId, // Update existing
      targetId: targetId,
      targetName: targetName,
      relationshipType: "friend",
      attitude: 35, // Increased
      description: "再次帮助了我"
    }
  ]);
  console.log("✓ 批量操作完成");
  
  // Verify batch
  const allRows = database.prepare(`
    SELECT * FROM npc_relationships 
    WHERE target_id = ?
    ORDER BY source_id
  `).all(targetId) as any[];
  
  console.log(`查询到 ${allRows.length} 条关系记录:`);
  allRows.forEach((r: any) => {
    console.log(`  - ${r.source_id}: ${r.relationship_type}, attitude=${r.attitude}, desc="${r.description}"`);
  });
  
  if (allRows.length === 3 &&
      allRows.find((r: any) => r.source_id === "npc-test-002" && r.attitude === -50) &&
      allRows.find((r: any) => r.source_id === "npc-test-003" && r.attitude === 80) &&
      allRows.find((r: any) => r.source_id === sourceNpcId && r.attitude === 35)) {
    console.log("✅ 验证通过: 批量操作正确");
  } else {
    console.error("❌ 验证失败: 批量操作不正确");
    process.exit(1);
  }
  
  // Cleanup
  db.close();
  console.log("\n✓ 数据库已关闭");
  console.log("\n✅ 所有测试通过!\n");
}

testRelationshipPersistence().catch(err => {
  console.error("\n❌ 测试失败:", err);
  process.exit(1);
});
