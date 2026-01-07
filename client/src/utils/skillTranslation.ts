/**
 * Skill Translation Utility
 * Maps English skill names to Chinese names
 */

export const SKILL_NAME_MAP: Record<string, string> = {
  // Social Skills
  "Charm": "魅惑",
  "Fast Talk": "话术",
  "Intimidate": "恐吓",
  "Persuade": "说服",
  "Psychology": "心理学",

  // Knowledge Skills
  "Accounting": "会计学",
  "Anthropology": "人类学",
  "Archaeology": "考古学",
  "Art and Craft": "艺术与工艺",
  "History": "历史",
  "Law": "法律",
  "Library Use": "图书馆使用",
  "Occult": "神秘学",
  "Science (Biology)": "科学(生物学)",
  "Science (Chemistry)": "科学(化学)",
  "Science (Physics)": "科学(物理学)",
  "Appraise": "估价",

  // Investigation Skills
  "Listen": "聆听",
  "Spot Hidden": "侦查",
  "Track": "追踪",

  // Physical Skills
  "Climb": "攀爬",
  "Dodge": "闪避",
  "Jump": "跳跃",
  "Swim": "游泳",
  "Throw": "投掷",
  "Ride": "骑术",

  // Stealth Skills
  "Disguise": "乔装",
  "Sleight of Hand": "妙手",
  "Stealth": "潜行",

  // Technical Skills
  "Electrical Repair": "电气维修",
  "Mechanical Repair": "机械维修",
  "Operate Heavy Machinery": "操作重型机械",
  "Pilot (Aircraft)": "驾驶(飞机)",
  "Pilot (Boat)": "驾驶(船只)",
  "Drive Auto": "驾驶(汽车)",
  "Navigate": "领航",

  // Medical Skills
  "First Aid": "急救",
  "Medicine": "医学",
  "Natural World": "自然学",
  "Survival (Arctic)": "生存(极地)",
  "Survival (Desert)": "生存(沙漠)",
  "Survival (Forest)": "生存(森林)",
  "Psychoanalysis": "精神分析",

  // Combat Skills - Fighting
  "Fighting (Brawl)": "斗殴",
  "Fighting (Sword)": "格斗(剑)",
  "Fighting (Axe)": "格斗(斧)",
  "Fighting (Whip)": "格斗(鞭)",

  // Combat Skills - Firearms
  "Firearms (Handgun)": "射击(手枪)",
  "Firearms (Rifle/Shotgun)": "射击(步枪/霰弹枪)",
  "Firearms (Submachine Gun)": "射击(冲锋枪)",
  "Firearms (Bow)": "射击(弓)",

  // Criminal Skills
  "Locksmith": "锁匠",
  "Criminology": "犯罪学",
  "Forgery": "伪造",

  // Language Skills
  "Language (Own)": "母语",
  "Language (Other)": "其他语言",

  // Status Skills
  "Credit Rating": "信用评级",

  // Mythos Skills
  "Cthulhu Mythos": "克苏鲁神话",
};

/**
 * Get Chinese name for a skill, fallback to English if not found
 */
export function getSkillNameCn(skillNameEn: string): string {
  return SKILL_NAME_MAP[skillNameEn] || skillNameEn;
}
