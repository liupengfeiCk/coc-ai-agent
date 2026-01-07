# CoC-AI-Agent 功能需求开发计划

> **文档创建时间**: 2026-01-07  
> **项目仓库**: https://github.com/liupengfeiCk/coc-ai-agent.git  
> **规划版本**: v2.0 Feature Enhancement

---

## 📋 需求概览

本文档规划了7个核心功能需求的实施方案,按照**实现难易程度**从低到高排序,帮助团队合理安排开发资源和时间。

### 需求列表
1. ✅ 前端显示骰子点数细节和技能成功/失败状态
2. ✅ 存档删除功能
3. ✅ 地图读取与可视化展示
4. ✅ 线索证物图片展示
5. ✅ 当前场景NPC显示及信息查看
6. ✅ 多人模式支持(多用户并发游戏)
7. ✅ Keeper智能选项推荐(保留自定义输入)

---

## 🟢 难度等级1 - 简单 (1-2天)

### 需求2: 存档删除功能

**实现难度**: ⭐️  
**预计工时**: 0.5天  
**优先级**: 🔥 高

#### 当前状态
- ✅ 后端已有 `deleteCheckpoint(checkpointId)` 方法 (`schema.ts` L797)
- ✅ 数据库表 `game_checkpoints` 已支持删除操作
- ❌ 前端缺少删除按钮和交互逻辑

#### 技术方案
```typescript
// 后端新增API路由
DELETE /api/checkpoints/:checkpointId

// 前端修改
client/src/components/GameSidebar.tsx
  - 在存档列表每项添加删除按钮
  - 添加确认提示(防止误删)
  - 调用删除API后刷新列表
```

#### 实现步骤
1. 后端添加 `DELETE /api/checkpoints/:checkpointId` 路由
2. 前端 `GameSidebar.tsx` 添加删除按钮组件
3. 添加确认对话框(使用 `window.confirm` 或自定义Modal)
4. 删除成功后刷新存档列表

#### 注意事项
- 删除当前正在使用的存档需要特殊处理
- 建议保留最近1个自动存档(防止误删所有存档)

---

### 需求1: 骰子点数细节展示

**实现难度**: ⭐️⭐️  
**预计工时**: 1天  
**优先级**: 🔥 高

#### 当前状态
- ✅ 后端 `ActionResult` 已记录 `diceRolls: string[]`
- ✅ 骰子格式标准化:
  ```
  "1d100: 52 (Fighting (Brawl) 71% = success)"
  "1d6: 2 + 0 (DB) = 2 (damage to 藤蔓)"
  ```
- ❌ 前端仅显示文本,未解析和美化展示

#### 技术方案
```typescript
// 前端解析骰子记录
interface DiceRoll {
  diceType: string;      // "1d100", "1d6"
  result: number;        // 52, 2
  modifier?: number;     // 0 (DB)
  total?: number;        // 2
  skill?: {
    name: string;        // "Fighting (Brawl)"
    value: number;       // 71
    success: boolean;    // true
  };
  purpose?: string;      // "damage to 藤蔓"
}

// 展示组件
<DiceRollDisplay rolls={parsedDiceRolls} />
```

#### UI设计建议
```
🎲 骰子检定结果:
┌─────────────────────────────────┐
│ 1d100: 52 点                     │
│ ✓ 格斗(近战) 71% - 成功          │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│ 1d6: 2 点 + 0 (伤害加值)         │
│ = 2 点伤害 (目标: 藤蔓)          │
└─────────────────────────────────┘
```

#### 实现步骤
1. 创建 `client/src/utils/diceParser.ts` 解析工具
2. 修改 `GameChat.tsx` 组件,解析 `diceRolls` 字段
3. 添加 `DiceRollDisplay` 子组件(美化展示)
4. 更新 `style.css` 添加骰子样式(成功=绿色,失败=红色)

#### 扩展功能
- 骰子动画效果(CSS transition)
- 大成功/大失败特殊标记(1或100点)
- 骰子历史记录折叠/展开

---

## 🟡 难度等级2 - 中等 (2-4天)

### 需求5: 显示当前场景NPC及其信息

**实现难度**: ⭐️⭐️⭐️  
**预计工时**: 2天  
**优先级**: 🔥 高

#### 当前状态
- ✅ `gameState.currentScenario.characters` 包含场景NPC列表
- ✅ `gameState.npcCharacters` 有完整NPC属性
- ❌ 前端侧边栏未显示场景NPC信息

#### 技术方案
```typescript
// 后端API新增
GET /api/sessions/:sessionId/scene-npcs
Response: {
  npcs: [
    {
      id: string;
      name: string;
      occupation: string;
      appearance: string;
      status: { hp, sanity, conditions };
      currentLocation: string;
      attitude?: number; // 对玩家态度
    }
  ]
}

// 前端组件结构
<GameSidebar>
  <NPCPanel>
    <NPCCard npc={npc} onClick={showDetails} />
    <NPCDetailModal npc={selectedNPC} />
  </NPCPanel>
</GameSidebar>
```

#### UI设计建议
```
┌─ 场景人物 ────────────────┐
│ 👤 西蒙·拉普拉斯           │
│    占卜师 | HP: 12/12      │
│    [查看详情]              │
├───────────────────────────┤
│ 👤 布鲁诺                  │
│    出租车司机 | HP: 10/10  │
│    [查看详情]              │
└───────────────────────────┘

// 点击后弹窗
┌─ 西蒙·拉普拉斯 详细信息 ──┐
│ 职业: 占卜师               │
│ 年龄: 45岁                 │
│ 外貌: 消瘦的中年男子...    │
│ 性格: 神秘、谨慎           │
│ 当前状态: 正常             │
│ 对我态度: 中立(0)          │
└───────────────────────────┘
```

#### 实现步骤
1. 后端添加 `/api/sessions/:sessionId/scene-npcs` 接口
2. 前端创建 `NPCPanel.tsx` 组件
3. 创建 `NPCCard.tsx` 和 `NPCDetailModal.tsx` 子组件
4. 集成到 `GameSidebar.tsx` 中
5. 添加NPC头像系统(可用emoji或默认头像)

#### 扩展功能
- NPC态度值可视化(好感度条)
- NPC位置实时更新(当NPC移动时)
- NPC对话历史记录

---

### 需求7: Keeper提供预设选项 + 保留自定义输入

**实现难度**: ⭐️⭐️⭐️  
**预计工时**: 2-3天  
**优先级**: 🔥 高

#### 当前状态
- ✅ Keeper能生成叙述文本
- ❌ 未提供玩家行动建议
- ❌ 新手玩家不知道该做什么

#### 技术方案
```typescript
// 后端 keeperAgent.ts 返回结构扩展
interface KeeperResponse {
  narrative: string;
  clueRevelations: any;
  suggestedOptions: string[]; // 新增:3个推荐行动
}

// Keeper模板提示词增强
You must provide exactly 3 suggested actions for the player based on:
- Current scene exits and objects
- Discovered clues that need investigation
- NPCs present in the scene
- Player's current situation

Format: Short, actionable phrases (5-10 words)
Examples:
- "检查桌上的古老书卷"
- "询问守卫关于失踪案件"
- "前往教堂地下室"
```

#### UI设计建议
```
┌─ 守秘人建议 ──────────────┐
│ [🔍 检查门锁]              │
│ [💬 询问守卫失踪案件]      │
│ [📖 阅读桌上的日记]        │
└───────────────────────────┘

你想做什么?
┌───────────────────────────┐
│ 我仔细观察房间的布局...    │
│                            │
└───────────────────────────┘
         [🎲 执行行动]
```

#### 实现步骤
1. 修改 `keeperTemplate.ts` 增加选项生成提示
2. 修改 `keeperAgent.ts` 解析并返回 `suggestedOptions`
3. 前端 `GameChat.tsx` 显示选项按钮
4. 点击按钮自动填充到输入框(而非直接提交)
5. 保留手动输入和修改功能

#### 智能生成规则
- 基于场景 `exits` 生成移动选项
- 基于未发现的 `clues` 生成调查选项
- 基于场景 `characters` 生成社交选项
- 基于玩家技能生成适合的行动

#### 注意事项
- 选项不应剧透(不直接告诉玩家答案)
- 选项应多样化(探索/社交/调查)
- 选项难度要合理(考虑玩家技能值)

---

### 需求3: 地图读取与展示

**实现难度**: ⭐️⭐️⭐️⭐️  
**预计工时**: 3天  
**优先级**: 🟡 中

#### 当前状态
- ✅ 地图数据存在: `data/Mods/.../map.json`
- ❌ 无地图解析器
- ❌ 无前端地图可视化组件

#### 地图数据格式
```json
{
  "mapName": "卡桑德拉镇",
  "locations": [
    {
      "id": "church",
      "name": "教堂",
      "x": 200,
      "y": 150,
      "type": "building",
      "connects": ["cemetery", "main_street"]
    }
  ],
  "connections": [
    {
      "from": "church",
      "to": "cemetery",
      "type": "path",
      "condition": "always"
    }
  ]
}
```

#### 技术方案
```typescript
// 后端新增地图加载器
src/coc_multiagents_system/agents/memory/maploader/
  - mapDocumentParser.ts   // 解析map.json
  - mapLoader.ts            // 加载和缓存地图
  - types.ts                // 地图数据结构

// 前端地图组件
client/src/components/GameMap.tsx
  - SVG渲染地图
  - 高亮当前位置
  - 点击位置触发移动

// API接口
GET /api/maps/:modName
Response: {
  mapName: string;
  locations: Location[];
  connections: Connection[];
  playerLocation: string;
}
```

#### UI设计建议
```
┌─ 卡桑德拉镇地图 ──────────┐
│                            │
│     🏰教堂 ← 你在这里      │
│       ↓                    │
│     ⚰️墓地                 │
│       ↓                    │
│     🏛️市政厅               │
│                            │
│ 点击地点可快速移动          │
└───────────────────────────┘
```

#### 实现步骤
1. 创建 `mapDocumentParser.ts` 解析器
2. 创建 `mapLoader.ts` 加载器(类似 `scenarioLoader`)
3. 创建前端 `GameMap.tsx` 组件(使用SVG)
4. 实现地图渲染逻辑(节点+连线)
5. 添加交互功能(点击移动)
6. 集成到 `GameSidebar.tsx`

#### 可视化方案
- **方案1**: SVG静态地图(简单,推荐)
- **方案2**: Canvas动态绘制(灵活,复杂)
- **方案3**: 使用现成图片 + 热区(最简单)

#### 扩展功能
- 地图缩放和拖拽
- 未探索区域迷雾效果
- 标记重要线索位置
- 显示NPC当前位置

---

## 🔴 难度等级3 - 困难 (4-7天)

### 需求4: 证物图片展示

**实现难度**: ⭐️⭐️⭐️⭐️  
**预计工时**: 3-4天  
**优先级**: 🟡 中

#### 当前状态
- ✅ 线索系统已实现(scenario_clues表)
- ❌ 线索仅有文本描述,无图片
- ❌ 缺少图片存储和展示方案

#### 数据结构改造
```sql
-- scenario_clues表增加字段
ALTER TABLE scenario_clues 
ADD COLUMN image_url TEXT;
ADD COLUMN image_base64 TEXT;
ADD COLUMN image_type TEXT; -- 'url' | 'base64' | 'file'

-- 线索JSON格式扩展
{
  "clueId": "diary-001",
  "clueText": "一本泛黄的日记",
  "imageUrl": "/images/clues/diary-001.jpg",
  "imageType": "file"
}
```

#### 存储方案对比
| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| 本地文件 | 性能好,易管理 | 需要文件系统 | ⭐️⭐️⭐️⭐️⭐️ |
| Base64嵌入 | 无需额外请求 | JSON体积大 | ⭐️⭐️⭐️ |
| 外部CDN | 不占用服务器 | 依赖网络 | ⭐️⭐️ |

**推荐方案**: 本地文件存储
```
data/
  Mods/
    Cassandra's Black Carnival/
      images/
        clues/
          diary-001.jpg
          knife-002.png
```

#### 技术方案
```typescript
// 后端API新增
GET /api/images/clues/:modName/:imageId
Response: image file (Content-Type: image/jpeg)

// 前端组件
<ClueImageViewer 
  clueId="diary-001" 
  imageUrl="/api/images/clues/cassandra/diary-001.jpg"
  onClose={() => setShowImage(false)}
/>
```

#### UI设计建议
```
┌─ 已发现线索 ──────────────┐
│ 📄 泛黄的日记              │
│    [🖼️ 查看证物]           │
│                            │
│ 🔪 沾血的小刀              │
│    [🖼️ 查看证物]           │
└───────────────────────────┘

// 点击后弹出图片查看器
┌─ 证物: 泛黄的日记 ────────┐
│                            │
│      [图片预览]            │
│                            │
│ 一本封面破损的日记本...    │
│                            │
│        [关闭]              │
└───────────────────────────┘
```

#### 实现步骤
1. 数据库 schema 增加图片字段
2. 修改 `scenarioDocumentParser.ts` 解析图片路径
3. 后端添加图片静态文件服务
4. 前端创建 `ClueImageViewer.tsx` 组件
5. 集成到 `GameSidebar.tsx` 线索列表
6. 准备示例图片资源

#### 安全考虑
```typescript
// 图片验证规则
const IMAGE_RULES = {
  maxSize: 2 * 1024 * 1024,  // 2MB
  allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
  pathPattern: /^[a-zA-Z0-9_\-\/]+\.(jpg|jpeg|png|webp)$/
};

// 防止路径遍历攻击
function sanitizeImagePath(path: string): string {
  return path.replace(/\.\./g, '').replace(/[^a-zA-Z0-9_\-\/\.]/g, '');
}
```

#### 图片资源准备
- 建议使用AI生成工具(Midjourney/DALL-E)
- 分辨率: 800x600px (适中)
- 格式: WebP (压缩率高)
- 风格: 克苏鲁复古手绘风

---

## 🔴 难度等级4 - 最困难 (7-14天)

### 需求6: 多人模式(多用户并发游戏)

**实现难度**: ⭐️⭐️⭐️⭐️⭐️  
**预计工时**: 7-10天  
**优先级**: 🟢 低

#### 架构挑战
- ❌ **会话隔离不完整**: 当前 `sessionId` 存在但未完全隔离
- ❌ **并发写入风险**: SQLite单写入限制
- ❌ **全局状态污染**: `runtime.ts` 使用单例模式
- ❌ **缺少用户系统**: 无身份认证和授权

#### 技术方案

##### 1. 用户系统
```sql
-- 新增用户表
CREATE TABLE users (
  user_id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 修改sessions表
ALTER TABLE sessions 
ADD COLUMN user_id TEXT REFERENCES users(user_id);
```

##### 2. 会话管理
```typescript
// 会话管理器
class SessionManager {
  private activeSessions: Map<string, GameSession>;
  
  createSession(userId: string, modName: string): string;
  getSession(sessionId: string): GameSession | null;
  listUserSessions(userId: string): SessionInfo[];
  switchSession(userId: string, sessionId: string): void;
  deleteSession(sessionId: string): void;
}

// API路由
POST   /api/users/register          // 注册
POST   /api/users/login             // 登录
GET    /api/users/:userId/sessions  // 用户会话列表
POST   /api/sessions/create         // 创建新会话
DELETE /api/sessions/:sessionId     // 删除会话
```

##### 3. 并发控制
```typescript
// 使用事务锁保护会话状态
class GameSession {
  private lock = new AsyncLock();
  
  async processPlayerInput(input: string) {
    await this.lock.acquire('gameState', async () => {
      // 读取 -> 处理 -> 写入 (原子操作)
      const state = this.loadState();
      const newState = await this.engine.process(input, state);
      this.saveState(newState);
    });
  }
}
```

##### 4. WebSocket改造
```typescript
// 当前: 全局广播
wss.clients.forEach(client => {
  client.send(JSON.stringify(message));
});

// 改造: 按会话广播
const sessionClients = new Map<string, Set<WebSocket>>();

function broadcastToSession(sessionId: string, message: any) {
  const clients = sessionClients.get(sessionId);
  clients?.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}
```

##### 5. 状态管理改造
```typescript
// 当前: 单例全局状态 (错误!)
let globalGameState: GameState;

// 改造: 多会话状态管理
class StateStore {
  private states = new Map<string, GameState>();
  
  getState(sessionId: string): GameState {
    return this.states.get(sessionId) || this.loadFromDB(sessionId);
  }
  
  setState(sessionId: string, state: GameState): void {
    this.states.set(sessionId, state);
    this.saveToCache(sessionId, state);
  }
}
```

#### 实现步骤

**阶段1: 用户系统 (2天)**
1. 创建 `users` 表和认证API
2. 实现 JWT token 认证
3. 前端添加登录/注册页面
4. 添加认证中间件

**阶段2: 会话隔离 (3天)**
1. 改造 `runtime.ts` 移除全局单例
2. 创建 `SessionManager` 类
3. 所有API增加 `sessionId` 参数验证
4. 前端添加会话切换UI

**阶段3: 并发优化 (2天)**
1. 引入 `async-lock` 库
2. 关键操作加锁(状态读写/数据库更新)
3. 数据库连接池优化
4. 考虑迁移到 PostgreSQL (可选)

**阶段4: WebSocket改造 (2天)**
1. WebSocket连接绑定 `sessionId`
2. 消息路由改为会话级别
3. 连接管理和清理优化

**阶段5: 测试和优化 (1天)**
1. 多用户并发测试
2. 压力测试(10个并发会话)
3. 性能监控和优化

#### 风险评估

| 风险点 | 严重度 | 缓解方案 |
|--------|--------|----------|
| SQLite并发限制 | 🔴 高 | 迁移到PostgreSQL |
| 状态不一致 | 🔴 高 | 事务锁 + 乐观锁 |
| 内存占用过高 | 🟡 中 | 会话超时清理 + LRU缓存 |
| WebSocket连接泄漏 | 🟡 中 | 心跳检测 + 自动清理 |
| LangGraph线程安全 | 🟠 中高 | 每会话独立实例 |

#### 数据库迁移建议
```typescript
// SQLite → PostgreSQL 迁移
// 原因:
// 1. SQLite并发写入限制(单线程)
// 2. PostgreSQL支持真正的并发事务
// 3. 更好的性能和扩展性

// 迁移步骤:
// 1. 安装 pg 和 pg-promise
// 2. 导出SQLite数据
// 3. 创建PostgreSQL schema
// 4. 导入数据
// 5. 修改database连接配置
```

#### 前端UI改造
```tsx
// 会话选择页面
<SessionSelector>
  <SessionList sessions={userSessions}>
    <SessionCard>
      会话1: 卡桑德拉黑色嘉年华
      Day 2, 下午 | HP: 12/15
      [继续游戏] [删除]
    </SessionCard>
  </SessionList>
  <CreateSessionButton>
    + 创建新游戏
  </CreateSessionButton>
</SessionSelector>
```

---

## 🎯 推荐实施路线图

### 第1周: 快速见效的基础功能
```
周一-周二: 需求2 (存档删除) ✅
周三-周五: 需求1 (骰子细节) ✅
```
**里程碑**: 用户体验提升20%,操作直观性增强

### 第2周: 核心游戏体验
```
周一-周三: 需求5 (场景NPC显示) ✅
周四-周五: 需求7 (预设选项) 开始
```
**里程碑**: 新手友好度大幅提升,沉浸感增强

### 第3周: 可视化增强
```
周一-周三: 需求7 (预设选项) 完成 ✅
周四-周五: 需求3 (地图展示) 开始
```
**里程碑**: 探索体验优化,空间感建立

### 第4周: 内容丰富性
```
周一-周三: 需求3 (地图展示) 完成 ✅
周四-周五: 需求4 (证物图片) 开始
```
**里程碑**: 视觉呈现完善,代入感提升

### 第5-6周: 架构升级(可选)
```
第5周: 需求4 (证物图片) 完成 ✅
第6周: 需求6 (多人模式) - 根据需求决定
```
**里程碑**: 完整的多人游戏平台

---

## 📊 优先级矩阵

```
高价值高优先级 (先做)    | 高价值低优先级 (后做)
---------------------------|---------------------------
需求1: 骰子细节 ⭐️⭐️      | 需求3: 地图展示 ⭐️⭐️⭐️⭐️
需求2: 删除存档 ⭐️        | 需求4: 证物图片 ⭐️⭐️⭐️⭐️
需求5: 场景NPC ⭐️⭐️⭐️     |
需求7: 预设选项 ⭐️⭐️⭐️    |
---------------------------|---------------------------
低价值高优先级 (谨慎)     | 低价值低优先级 (暂缓)
---------------------------|---------------------------
(空)                       | 需求6: 多人模式 ⭐️⭐️⭐️⭐️⭐️
                           | (架构风险高,收益需验证)
```

---

## 🔍 技术债务评估

### 需要重构的模块
1. **runtime.ts** - 全局状态管理需改为会话隔离
2. **WebSocket** - 需要会话级别消息路由
3. **数据库** - 考虑迁移到PostgreSQL支持并发

### 性能优化点
1. 图片懒加载(需求4)
2. 地图SVG缓存(需求3)
3. NPC信息分页加载(需求5)

### 测试覆盖
- [ ] 单元测试: 骰子解析器
- [ ] 集成测试: 多用户并发
- [ ] E2E测试: 完整游戏流程

---

## 📈 成功指标

### 用户体验指标
- 新手完成首次行动时间: < 2分钟
- 骰子检定理解率: > 95%
- NPC交互频率: +50%

### 技术指标
- API响应时间: < 500ms (P95)
- 并发用户支持: 10+ (需求6)
- 存档加载时间: < 1s

### 业务指标
- 用户留存率: +20%
- 平均游戏时长: +30%
- 功能使用率: 骰子详情 > 80%, 地图 > 60%

---

## 🛠️ 技术栈更新

### 新增依赖
```json
{
  "dependencies": {
    "async-lock": "^1.4.0",      // 并发控制
    "jsonwebtoken": "^9.0.0",    // JWT认证
    "bcrypt": "^5.1.0",          // 密码加密
    "pg": "^8.11.0",             // PostgreSQL (可选)
    "sharp": "^0.32.0"           // 图片处理 (可选)
  }
}
```

### 前端库
```json
{
  "dependencies": {
    "react-image-lightbox": "^5.1.4",  // 图片查看器
    "d3": "^7.8.0"                      // 地图可视化 (可选)
  }
}
```

---

## 📝 文档更新计划

1. **API文档**: 新增接口需要更新Swagger文档
2. **用户手册**: 新功能使用说明
3. **开发者指南**: 架构变更和多人模式开发规范
4. **部署文档**: PostgreSQL配置和迁移指南

---

## 🚀 开始实施

**当前建议**: 从第1周计划开始,优先完成以下任务:
1. ✅ 实现存档删除功能 (0.5天)
2. ✅ 实现骰子细节展示 (1天)

完成后评估效果,决定后续优先级调整。

---

**最后更新**: 2026-01-07  
**负责人**: 开发团队  
**状态**: ⏳ 待开始实施
