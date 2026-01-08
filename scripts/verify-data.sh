#!/bin/bash

# 验证从模板导入到游戏实例创建的完整流程

DB_PATH="data/coc_game.db"
MODULE_NAME="Cassandra's Black Carnival"
TEST_THREAD_ID="test-thread-001"

echo "======================================"
echo "  CoC 数据库完整验证"
echo "======================================"
echo ""

# 1. 检查模板表数据
echo "📦 Step 1: 检查模板表数据"
echo "--------------------------------------"
echo -n "场景模板数量: "
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM module_scenarios WHERE module_name = \"$MODULE_NAME\";"
echo -n "NPC模板数量: "
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM module_npcs WHERE module_name = \"$MODULE_NAME\";"
echo ""

# 2. 检查实例表数据
echo "🎮 Step 2: 检查实例表数据 (thread_id=$TEST_THREAD_ID)"
echo "--------------------------------------"
echo -n "Sessions: "
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM sessions WHERE session_id = '$TEST_THREAD_ID';"
echo -n "Scenarios: "
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM scenarios WHERE thread_id = '$TEST_THREAD_ID';"
echo -n "Snapshots: "
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM scenario_snapshots WHERE thread_id = '$TEST_THREAD_ID';"
echo -n "NPCs (characters): "
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM characters WHERE thread_id = '$TEST_THREAD_ID' AND is_npc = 1;"
echo -n "Clues: "
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM scenario_clues WHERE thread_id = '$TEST_THREAD_ID';"
echo -n "Relationships: "
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM npc_relationships WHERE thread_id = '$TEST_THREAD_ID';"
echo ""

# 3. 数据完整性检查
echo "🔍 Step 3: 数据完整性检查"
echo "--------------------------------------"

# 检查场景字段完整性
echo -n "不完整的场景数据: "
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM scenarios WHERE thread_id = '$TEST_THREAD_ID' AND (name IS NULL OR name = '' OR description IS NULL OR description = '');"

# 检查NPC字段完整性(只检查必填字段name和occupation)
echo -n "不完整的NPC数据: "
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM characters WHERE thread_id = '$TEST_THREAD_ID' AND is_npc = 1 AND (name IS NULL OR name = '' OR occupation IS NULL OR occupation = '');"

# 检查孤立线索
echo -n "孤立的线索(无快照): "
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM scenario_clues c LEFT JOIN scenario_snapshots s ON c.snapshot_id = s.snapshot_id AND c.thread_id = s.thread_id WHERE c.thread_id = '$TEST_THREAD_ID' AND s.snapshot_id IS NULL;"

# 检查孤立关系
echo -n "孤立的关系(NPC不存在): "
sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM npc_relationships r LEFT JOIN characters n1 ON r.source_id = n1.character_id AND r.thread_id = n1.thread_id LEFT JOIN characters n2 ON r.target_id = n2.character_id AND r.thread_id = n2.thread_id WHERE r.thread_id = '$TEST_THREAD_ID' AND (n1.character_id IS NULL OR n2.character_id IS NULL);"
echo ""

# 4. 随机抽样检查
echo "🎲 Step 4: 随机抽样检查"
echo "--------------------------------------"
echo "随机场景样本:"
sqlite3 "$DB_PATH" "SELECT '  ID: ' || scenario_id || char(10) || '  名称: ' || name || char(10) || '  描述: ' || substr(description, 1, 50) || '...' FROM scenarios WHERE thread_id = '$TEST_THREAD_ID' ORDER BY RANDOM() LIMIT 1;"
echo ""
echo "随机NPC样本:"
sqlite3 "$DB_PATH" "SELECT '  ID: ' || character_id || char(10) || '  姓名: ' || name || char(10) || '  职业: ' || occupation || char(10) || '  年龄: ' || age || char(10) || '  性别: ' || gender FROM characters WHERE thread_id = '$TEST_THREAD_ID' AND is_npc = 1 ORDER BY RANDOM() LIMIT 1;"
echo ""

# 5. 数量对比
echo "📊 Step 5: 模板 vs 实例数量对比"
echo "--------------------------------------"
TEMPLATE_SCENARIOS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM module_scenarios WHERE module_name = \"$MODULE_NAME\";")
INSTANCE_SCENARIOS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM scenarios WHERE thread_id = '$TEST_THREAD_ID';")
TEMPLATE_NPCS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM module_npcs WHERE module_name = \"$MODULE_NAME\";")
INSTANCE_NPCS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM characters WHERE thread_id = '$TEST_THREAD_ID' AND is_npc = 1;")

echo "场景: $TEMPLATE_SCENARIOS -> $INSTANCE_SCENARIOS"
if [ "$TEMPLATE_SCENARIOS" -eq "$INSTANCE_SCENARIOS" ]; then
  echo "  ✅ 场景数量匹配"
else
  echo "  ❌ 场景数量不匹配"
fi

echo "NPC: $TEMPLATE_NPCS -> $INSTANCE_NPCS"
if [ "$TEMPLATE_NPCS" -eq "$INSTANCE_NPCS" ]; then
  echo "  ✅ NPC数量匹配"
else
  echo "  ❌ NPC数量不匹配"
fi
echo ""

# 6. 总结
echo "======================================"
echo "  验证总结"
echo "======================================"

INCOMPLETE_SCENARIOS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM scenarios WHERE thread_id = '$TEST_THREAD_ID' AND (name IS NULL OR name = '' OR description IS NULL OR description = '');")
INCOMPLETE_NPCS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM characters WHERE thread_id = '$TEST_THREAD_ID' AND is_npc = 1 AND (name IS NULL OR name = '' OR occupation IS NULL OR occupation = '');")
ORPHANED_CLUES=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM scenario_clues c LEFT JOIN scenario_snapshots s ON c.snapshot_id = s.snapshot_id AND c.thread_id = s.thread_id WHERE c.thread_id = '$TEST_THREAD_ID' AND s.snapshot_id IS NULL;")
ORPHANED_RELS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM npc_relationships r LEFT JOIN characters n1 ON r.source_id = n1.character_id AND r.thread_id = n1.thread_id LEFT JOIN characters n2 ON r.target_id = n2.character_id AND r.thread_id = n2.thread_id WHERE r.thread_id = '$TEST_THREAD_ID' AND (n1.character_id IS NULL OR n2.character_id IS NULL);")

PASSED=0
TOTAL=6

# 检查点
[ "$TEMPLATE_SCENARIOS" -gt 0 ] && PASSED=$((PASSED + 1))
[ "$INSTANCE_SCENARIOS" -eq "$TEMPLATE_SCENARIOS" ] && PASSED=$((PASSED + 1))
[ "$INSTANCE_NPCS" -eq "$TEMPLATE_NPCS" ] && PASSED=$((PASSED + 1))
[ "$INCOMPLETE_SCENARIOS" -eq 0 ] && PASSED=$((PASSED + 1))
[ "$INCOMPLETE_NPCS" -eq 0 ] && PASSED=$((PASSED + 1))
[ "$ORPHANED_CLUES" -eq 0 ] && [ "$ORPHANED_RELS" -eq 0 ] && PASSED=$((PASSED + 1))

if [ $PASSED -eq $TOTAL ]; then
  echo "✅ 所有检查通过 ($PASSED/$TOTAL)"
  echo ""
  echo "🎉 数据库架构和流程验证成功！"
else
  echo "⚠️  部分检查失败 ($PASSED/$TOTAL)"
  echo ""
  echo "❌ 发现错误，请检查上方详情"
fi
echo "======================================"
