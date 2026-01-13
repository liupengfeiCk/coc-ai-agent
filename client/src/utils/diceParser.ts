/**
 * 骰子投掷结果解析工具
 * 支持格式:
 * - 完整格式: "调查员 对 藤蔓怪物 进行 攻击: 1d100=35 (斗殴 71) → 成功"
 * - 技能检定: "调查员 侦查检定: 1d100=1 (目标70) → 大成功"
 * - 伤害骰: "调查员 对 藤蔓怪物 造成伤害: 1d6+2=4+2=6"
 * - 简化格式: "侦查检定: 1d100=1 (目标70) → 大成功"
 */

export interface DiceRoll {
  diceType: string;      // "1d100", "1d6", etc.
  result: number;        // 骰子点数
  modifier?: number;     // 修正值 (如DB)
  total?: number;        // 最终总值
  skill?: {
    name: string;        // 技能名称
    value: number;       // 技能值百分比
    success: boolean;    // 是否成功
  };
  purpose?: string;      // 用途描述
  actor?: string;        // 执行者名称 (例: "调查员", "藤蔓怪物")
  action?: string;       // 行为描述 (例: "攻击", "闪避", "侦查")
  target?: string;       // 目标 (例: "藤蔓怪物", "古老的书架")
  rawText: string;       // 原始文本
}

/**
 * 解析单个骰子投掷记录
 */
export function parseDiceRoll(rollText: string): DiceRoll | null {
  if (!rollText || typeof rollText !== 'string') {
    return null;
  }

  const trimmed = rollText.trim();
  
  // ===== 完整格式解析 (带执行者、目标、行为) =====
  
  // 格式1: "调查员 对 藤蔓怪物 进行 攻击: 1d100=35 (斗殴 71) → 成功"
  const fullFormatMatch = trimmed.match(/^(.+?)\s+对\s+(.+?)\s+进行\s+(.+?):\s*(\d+d\d+)=(\d+)\s*\((.+?)\s+(\d+)\)\s*→\s*(.+)$/);
  if (fullFormatMatch) {
    const actor = fullFormatMatch[1].trim();
    const target = fullFormatMatch[2].trim();
    const action = fullFormatMatch[3].trim();
    const diceType = fullFormatMatch[4];
    const result = parseInt(fullFormatMatch[5], 10);
    const skillName = fullFormatMatch[6].trim();
    const skillValue = parseInt(fullFormatMatch[7], 10);
    const outcome = fullFormatMatch[8].trim();
    
    return {
      diceType,
      result,
      actor,
      action,
      target,
      skill: {
        name: skillName,
        value: skillValue,
        success: outcome.includes('成功'),
      },
      purpose: outcome,
      rawText: trimmed,
    };
  }
  
  // 格式2: "调查员 侦查检定: 1d100=1 (目标70) → 大成功"
  const actorSkillMatch = trimmed.match(/^(.+?)\s+(.+?):\s*(\d+d\d+)=(\d+)\s*\(目标(\d+)\)\s*→\s*(.+)$/);
  if (actorSkillMatch) {
    const actor = actorSkillMatch[1].trim();
    const skillName = actorSkillMatch[2].trim().replace('检定', '');
    const diceType = actorSkillMatch[3];
    const result = parseInt(actorSkillMatch[4], 10);
    const targetValue = parseInt(actorSkillMatch[5], 10);
    const outcome = actorSkillMatch[6].trim();
    
    return {
      diceType,
      result,
      actor,
      action: skillName + '检定',
      skill: {
        name: skillName,
        value: targetValue,
        success: outcome.includes('成功'),
      },
      purpose: outcome,
      rawText: trimmed,
    };
  }
  
  // 格式3: "调查员 对 藤蔓怪物 造成伤害: 1d6+2=4+2=6"
  const fullDamageMatch = trimmed.match(/^(.+?)\s+对\s+(.+?)\s+造成伤害:\s*(\d+d\d+)\+(\d+)=(\d+)\+(\d+)=(\d+)$/);
  if (fullDamageMatch) {
    const actor = fullDamageMatch[1].trim();
    const target = fullDamageMatch[2].trim();
    const diceType = fullDamageMatch[3];
    const result = parseInt(fullDamageMatch[5], 10);
    const modifier = parseInt(fullDamageMatch[6], 10);
    const total = parseInt(fullDamageMatch[7], 10);
    
    return {
      diceType,
      result,
      modifier,
      total,
      actor,
      action: '造成伤害',
      target,
      purpose: `对${target}造成${total}点伤害`,
      rawText: trimmed,
    };
  }
  
  // ===== 简化格式解析 (向后兼容) =====
  
  // 中文技能检定格式: "侦查检定: 1d100=1 (目标70) → 大成功"
  const cnSkillMatch = trimmed.match(/^(.+?):\s*(\d+d\d+)=(\d+)\s*\(目标(\d+)\)\s*→\s*(.+)$/);
  if (cnSkillMatch) {
    const skillName = cnSkillMatch[1].trim();
    const diceType = cnSkillMatch[2];
    const result = parseInt(cnSkillMatch[3], 10);
    const targetValue = parseInt(cnSkillMatch[4], 10);
    const outcome = cnSkillMatch[5].trim();
    
    const success = outcome.includes('成功');
    
    return {
      diceType,
      result,
      action: skillName,
      skill: {
        name: skillName.replace('检定', ''),
        value: targetValue,
        success,
      },
      purpose: outcome,
      rawText: trimmed,
    };
  }
  
  // 中文伤害格式: "近战伤害: 1d6+2=4+2=6 (武器伤害)"
  const cnDamageMatch = trimmed.match(/^(.+?):\s*(\d+d\d+)\+(\d+)=(\d+)\+(\d+)=(\d+)\s*\((.+)\)$/);
  if (cnDamageMatch) {
    const purpose = cnDamageMatch[1].trim();
    const diceType = cnDamageMatch[2];
    const result = parseInt(cnDamageMatch[4], 10);
    const modifier = parseInt(cnDamageMatch[5], 10);
    const total = parseInt(cnDamageMatch[6], 10);
    const description = cnDamageMatch[7].trim();
    
    return {
      diceType,
      result,
      modifier,
      total,
      purpose: `${purpose} - ${description}`,
      rawText: trimmed,
    };
  }
  
  // 中文简单格式: "随机事件: 1d20=15 (事件判定)"
  const cnSimpleMatch = trimmed.match(/^(.+?):\s*(\d+d\d+)=(\d+)\s*\((.+)\)$/);
  if (cnSimpleMatch) {
    const skillName = cnSimpleMatch[1].trim();
    const diceType = cnSimpleMatch[2];
    const result = parseInt(cnSimpleMatch[3], 10);
    const description = cnSimpleMatch[4].trim();
    
    return {
      diceType,
      result,
      purpose: `${skillName} - ${description}`,
      rawText: trimmed,
    };
  }
  
  // ===== 英文格式解析 (兼容旧格式) =====
  
  // 提取骰子类型和结果: "1d100: 52" 或 "1d6: 2"
  const diceMatch = trimmed.match(/^(\d+d\d+(?:_\w+)?)\s*:\s*(\d+)/);
  if (!diceMatch) {
    return null;
  }

  const diceType = diceMatch[1];
  const result = parseInt(diceMatch[2], 10);

  // 尝试解析技能检定: "(Fighting (Brawl) 71% = success)"
  const skillMatch = trimmed.match(/\(([^)]+?)\s+(\d+)%\s*=\s*(success|failure)\)/i);
  if (skillMatch) {
    return {
      diceType,
      result,
      skill: {
        name: skillMatch[1].trim(),
        value: parseInt(skillMatch[2], 10),
        success: skillMatch[3].toLowerCase() === 'success',
      },
      rawText: trimmed,
    };
  }

  // 尝试解析伤害投掷: "2 + 0 (DB) = 2 (damage to 藤蔓)"
  const damageMatch = trimmed.match(/(\d+)\s*\+\s*(-?\d+)\s*\(([^)]+)\)\s*=\s*(\d+)\s*\(([^)]+)\)/);
  if (damageMatch) {
    return {
      diceType,
      result: parseInt(damageMatch[1], 10),
      modifier: parseInt(damageMatch[2], 10),
      total: parseInt(damageMatch[4], 10),
      purpose: damageMatch[5].trim(),
      rawText: trimmed,
    };
  }

  // 尝试简化的伤害格式: "2 + 0 (DB) = 2"
  const simpleDamageMatch = trimmed.match(/(\d+)\s*\+\s*(-?\d+)\s*\(([^)]+)\)\s*=\s*(\d+)/);
  if (simpleDamageMatch) {
    return {
      diceType,
      result: parseInt(simpleDamageMatch[1], 10),
      modifier: parseInt(simpleDamageMatch[2], 10),
      total: parseInt(simpleDamageMatch[4], 10),
      purpose: simpleDamageMatch[3].trim(),
      rawText: trimmed,
    };
  }

  // 尝试解析简单用途: "2 (藤蔓攻击)"
  const purposeMatch = trimmed.match(/\d+\s*\(([^)]+)\)/);
  if (purposeMatch) {
    return {
      diceType,
      result,
      purpose: purposeMatch[1].trim(),
      rawText: trimmed,
    };
  }

  // 默认返回基础信息
  return {
    diceType,
    result,
    rawText: trimmed,
  };
}

/**
 * 批量解析骰子记录
 */
export function parseDiceRolls(rollTexts: string[]): DiceRoll[] {
  if (!Array.isArray(rollTexts)) {
    return [];
  }
  
  return rollTexts
    .map(parseDiceRoll)
    .filter((roll): roll is DiceRoll => roll !== null);
}

/**
 * 判断是否为大成功/大失败
 */
export function isCritical(roll: DiceRoll): 'critical_success' | 'critical_failure' | 'fumble' | null {
  if (roll.skill && roll.diceType.startsWith('1d100')) {
    if (roll.result === 1) {
      return 'critical_success'; // 大成功
    }
    if (roll.result === 100) {
      return 'fumble'; // 大失败
    }
    if (roll.result <= 5 && roll.skill.success) {
      return 'critical_success'; // 极难成功
    }
    if (roll.result >= 96 && !roll.skill.success) {
      return 'critical_failure'; // 失败
    }
  }
  return null;
}
