# 骰子显示功能测试指南

## 为什么当前界面看不到骰子?

**当前状态**: 游戏刚开始,只有守秘人的开场叙述,还没有任何骰子投掷记录。

## 触发骰子显示的方法

### 方法1: 执行需要检定的行动 ⭐推荐

在输入框中输入以下任一行动:

```
我仔细侦查房间
```

```
我尝试聆听门外的声音
```

```
我攻击眼前的敌人
```

```
我尝试使用图书馆学搜索资料
```

这些行动会触发:
1. ActionAgent执行技能检定
2. 投掷1d100骰子
3. 骰子结果存储在actionResults中
4. 前端GameChat组件渲染DiceRollDisplay

### 方法2: 检查历史turn记录

如果之前有执行过检定,可以检查历史turn是否包含diceRolls:

```bash
sqlite3 data/coc_game.db "
SELECT 
  turn_number,
  character_input,
  action_results
FROM game_turns 
WHERE session_id = 'session-ip-72ce48afa013f185'
  AND action_results IS NOT NULL
LIMIT 3;
"
```

## 骰子显示位置

骰子会显示在**守秘人回复的下方**,格式如下:

```
┌────────────────────────────────┐
│ 🎭 Keeper          21:00       │
├────────────────────────────────┤
│ 你仔细观察房间,发现了一些线索...│
│                                │
│ 🎲 骰子检定结果 (1)            │
│ ┌──────────────────────┐      │
│ │ 1d100  52 点          │      │
│ │ ✓ 侦查 71% 成功       │      │
│ └──────────────────────┘      │
└────────────────────────────────┘
```

## 预期效果

- ✅ 成功检定: **绿色背景**
- ❌ 失败检定: **红色背景**  
- ⭐ 大成功(1-5): **金色发光 + 脉冲动画**
- 💀 大失败(96-100): **深红发光 + 脉冲动画**

## 快速测试步骤

1. **在游戏输入框输入**: `我仔细侦查房间`
2. **点击"执行行动"按钮** (或按回车)
3. **等待守秘人回复** (约3-10秒)
4. **查看守秘人回复下方** - 应该能看到骰子卡片

## 排查问题

如果仍然看不到骰子,请检查:

### 1. 浏览器控制台是否有错误
打开开发者工具 (F12) → Console,查看是否有错误信息

### 2. 检查网络请求
开发者工具 → Network → 查看turn API响应是否包含actionResults

### 3. 验证CSS加载
检查 `client/src/styles/DiceRollDisplay.css` 是否正确加载

### 4. 临时调试代码
在 `GameChat.tsx` 的第435行添加调试日志:
```typescript
console.log('[DiceRoll Debug]', msg.diceRolls);
```

## 示例数据结构

正常情况下,turn API应该返回:

```json
{
  "success": true,
  "turn": {
    "turnId": "...",
    "keeperNarrative": "你仔细观察...",
    "actionResults": [
      {
        "action": "侦查",
        "diceRolls": [
          "侦查检定: 1d100=52 (目标71) → 成功"
        ],
        "success": true
      }
    ]
  }
}
```
