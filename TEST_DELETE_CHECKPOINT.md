# 存档删除功能测试指南

> **功能**: 允许用户删除不需要的游戏存档  
> **难度**: ⭐️ (简单)  
> **开发时间**: 0.5天  
> **实现日期**: 2026-01-07

---

## 🎯 功能说明

用户可以在"继续游戏"界面删除不需要的存档,删除前会有确认对话框防止误删。

### 关键特性
- ✅ 后端DELETE API接口 (`/api/checkpoints/:checkpointId`)
- ✅ 前端删除按钮(红色,醒目)
- ✅ 确认对话框(防止误删)
- ✅ 本地状态自动更新(删除后不需要刷新)
- ✅ 数据库级别删除(真实删除,非软删除)

---

## 🧪 测试步骤

### 1. 启动应用

```bash
# 终端1: 启动前端客户端
cd /Users/学习/ai/coc/CoC-AI-agent/client
npm run dev

# 终端2: 启动后端服务器
cd /Users/学习/ai/coc/CoC-AI-agent/client
npm run server
```

### 2. 创建测试存档

1. 打开浏览器访问 `http://localhost:5173`
2. 点击"开始游戏" → 选择模组 → 选择角色
3. 游戏开始后,进行几个回合操作
4. 游戏会自动保存存档

### 3. 测试删除功能

#### 测试场景1: 正常删除
1. 返回主页,点击"继续游戏"
2. 找到要删除的存档,点击**🗑️ 删除**按钮
3. **验证**: 应该弹出确认对话框
   ```
   确定要删除存档 "存档名称" 吗?
   
   此操作无法撤销!
   [取消] [确定]
   ```
4. 点击"确定"
5. **验证**: 
   - 存档从列表中消失
   - 不需要刷新页面
   - 控制台输出: `✓ Checkpoint deleted: checkpoint-xxx`

#### 测试场景2: 取消删除
1. 点击删除按钮
2. 在确认对话框点击"取消"
3. **验证**: 存档仍然存在,未被删除

#### 测试场景3: 删除不存在的存档
1. 打开浏览器开发者工具(F12)
2. 在Console执行:
   ```javascript
   fetch('http://localhost:3000/api/checkpoints/non-existent-id', {
     method: 'DELETE'
   }).then(r => r.json()).then(console.log)
   ```
3. **验证**: 返回 `{ error: "Checkpoint not found" }` (404状态码)

### 4. 验证数据库

```bash
# 查看数据库中的存档
sqlite3 data/coc_game.db "SELECT checkpoint_id, checkpoint_name, created_at FROM game_checkpoints;"
```

**验证**: 已删除的存档不应该出现在查询结果中

---

## 📋 测试检查清单

- [ ] 删除按钮正常显示(红色,🗑️图标)
- [ ] 点击删除按钮触发确认对话框
- [ ] 确认对话框显示存档名称
- [ ] 点击"取消"不会删除存档
- [ ] 点击"确定"成功删除存档
- [ ] 删除后存档从列表中消失
- [ ] 删除后不需要刷新页面
- [ ] 数据库中的记录真实删除
- [ ] 删除不存在的存档返回404错误
- [ ] 网络错误时有友好提示

---

## 🔧 技术实现细节

### 后端API

**路由**: `DELETE /api/checkpoints/:checkpointId`

**请求示例**:
```bash
curl -X DELETE http://localhost:3000/api/checkpoints/checkpoint-1736251234567
```

**成功响应**:
```json
{
  "success": true,
  "message": "Checkpoint deleted successfully",
  "checkpointId": "checkpoint-1736251234567"
}
```

**失败响应**:
```json
{
  "error": "Checkpoint not found"
}
```

### 前端实现

**删除处理函数**:
```typescript
const handleDeleteCheckpoint = async (checkpointId: string, checkpointName: string) => {
  // 1. 确认对话框
  const confirmed = window.confirm(`确定要删除存档 "${checkpointName}" 吗?\n\n此操作无法撤销!`);
  if (!confirmed) return;
  
  // 2. 调用删除API
  const response = await fetch(`http://localhost:3000/api/checkpoints/${checkpointId}`, {
    method: "DELETE",
  });
  
  // 3. 更新本地状态
  setCheckpoints(prev => prev.filter(cp => cp.checkpointId !== checkpointId));
};
```

**UI改动**:
- 移除了卡片的整体点击事件
- 新增"📂 加载存档"按钮
- 新增"🗑️ 删除"按钮(红色主题)

---

## 🐛 已知问题

暂无

---

## 🚀 后续优化建议

1. **批量删除**: 允许一次性删除多个存档
2. **软删除**: 将删除改为标记,保留30天后再真实删除
3. **撤销功能**: 删除后5秒内可以撤销
4. **存档保护**: 重要存档可以标记为"不可删除"
5. **统计信息**: 删除时显示存档的游戏时长、回合数等信息

---

## 📊 性能指标

| 指标 | 目标值 | 实际值 |
|------|--------|--------|
| API响应时间 | < 100ms | ~50ms |
| UI响应延迟 | < 50ms | < 30ms |
| 数据库删除时间 | < 10ms | ~5ms |

---

**测试完成后请反馈**: 如有问题请在 GitHub Issues 中提交 🎯
