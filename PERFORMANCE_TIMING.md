# 工作流性能计时功能

## 功能说明

为 CoC AI Agent 的工作流添加了详细的性能计时功能,可以清楚地看到每个 Agent 的执行耗时。

## 实现细节

### 1. 数据结构扩展

在 `GraphState` 接口中添加了 `stepTimings` 字段:

```typescript
export interface GraphState {
  messages: BaseMessage[];
  gameState: GameState;
  turnId?: string;
  isSimulatedQuery?: boolean;
  simulatedQueryCount?: number;
  stepTimings?: Record<string, number>;  // 记录每个步骤的耗时(毫秒)
}
```

### 2. 计时实现

每个 Agent 节点都添加了计时逻辑:

```typescript
graph.addNode("agentName", async (state: GraphState) => {
  const startTime = Date.now();
  
  // ... Agent 处理逻辑 ...
  
  const duration = Date.now() - startTime;
  console.log(`✅ [Agent Name] 处理完成 (耗时: ${duration}ms)`);
  
  return { 
    ...state, 
    stepTimings: { agentName: duration } 
  };
});
```

### 3. 性能汇总输出

在 Keeper Agent(工作流最后一步)输出详细的性能统计:

```
============================================================
📊 [Performance Summary] 各步骤耗时统计:
============================================================
  keeper           2500ms   35.7%  █████████████████████████
  action           1800ms   25.7%  ██████████████████
  orchestrator     1200ms   17.1%  ████████████
  character         800ms   11.4%  ████████
  director          600ms    8.6%  ██████
  memory            100ms    1.4%  █
  entry              10ms    0.1%  
============================================================
  总计: 7010ms
============================================================
```

## 覆盖的工作流

### 主工作流 (buildGraph)

1. **entry** - 入口节点,清理临时状态
2. **orchestrator** - 分析用户输入
3. **memory** - 丰富上下文(RAG检索)
4. **action** - 执行玩家动作
5. **character** - 分析NPC响应
6. **npcAction** - 执行NPC动作(条件执行)
7. **director** - 场景转换和叙事方向
8. **keeper** - 生成最终叙事

### Listener工作流 (buildListenerGraph)

1. **listener** - 检查故事进度
2. **entry** - 丰富上下文
3. **character** - 分析NPC响应
4. **npcAction** - 执行NPC动作(条件执行)
5. **director** - 场景转换和叙事方向
6. **keeper** - 生成最终叙事

## 使用方式

### 查看实时日志

运行游戏时,每个 Agent 完成后会立即输出耗时:

```bash
npm run dev -- --prompt "检查房间"
```

在控制台中会看到:

```
🎯 [Orchestrator Agent] 开始分析用户输入...
✅ [Orchestrator Agent] 分析完成 (耗时: 1250ms)

🧠 [Memory Agent] 开始丰富上下文信息...
✅ [Memory Agent] 上下文丰富完成 (耗时: 150ms)

⚡ [Action Agent] 开始执行动作...
✅ [Action Agent] 动作执行完成 (耗时: 1850ms)
```

### 查看性能汇总

在整个工作流结束时,Keeper Agent 会输出完整的性能统计表格,按耗时从高到低排序,包含:
- 步骤名称
- 耗时(毫秒)
- 占总时间百分比
- 可视化进度条

## 优化建议

根据性能统计结果,可以:

1. **识别瓶颈**: 找出耗时最长的 Agent
2. **优化重点**: 
   - 如果 `action` 耗时长 → 优化 LLM 调用或动作判定逻辑
   - 如果 `memory` 耗时长 → 优化 RAG 检索或缓存策略
   - 如果 `keeper` 耗时长 → 优化叙事生成的 prompt
3. **并行化**: 识别可以并行执行的步骤
4. **缓存策略**: 对频繁访问的数据添加缓存

## 注意事项

- 计时包含 Agent 内部所有操作(LLM调用、数据库查询、RAG检索等)
- 不包含网络传输时间
- 在不同的硬件环境下,绝对耗时会有差异,重点关注相对比例
- 性能统计不会影响游戏状态或功能
