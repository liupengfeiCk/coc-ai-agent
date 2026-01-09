import React, { useMemo, useState, useRef } from "react";
import Homes from "./views/Homes";
import { GameChat } from "./components/GameChat";
import { GameSidebar } from "./components/GameSidebar";
import { CharacterSelector } from "./components/CharacterSelector";
import { ModSelector } from "./components/ModSelector";

type SkillEntry = { name: string; nameCn: string; base: string; category: string };
type AppPage = "home" | "sheet" | "game" | "character-select" | "mod-select" | "module-intro" | "module-import";

const SKILLS: SkillEntry[] = [
  // Interpersonal & Social Skills
  { name: "Charm", nameCn: "魅惑", base: "15%", category: "Social" },
  { name: "Fast Talk", nameCn: "话术", base: "5%", category: "Social" },
  { name: "Intimidate", nameCn: "恐吓", base: "15%", category: "Social" },
  { name: "Persuade", nameCn: "说服", base: "10%", category: "Social" },
  { name: "Psychology", nameCn: "心理学", base: "10%", category: "Social" },

  // Knowledge & Academic Skills
  { name: "Accounting", nameCn: "会计学", base: "5%", category: "Knowledge" },
  { name: "Anthropology", nameCn: "人类学", base: "1%", category: "Knowledge" },
  { name: "Archaeology", nameCn: "考古学", base: "1%", category: "Knowledge" },
  { name: "Art and Craft", nameCn: "艺术与工艺", base: "5%", category: "Knowledge" },
  { name: "History", nameCn: "历史", base: "5%", category: "Knowledge" },
  { name: "Law", nameCn: "法律", base: "5%", category: "Knowledge" },
  { name: "Library Use", nameCn: "图书馆使用", base: "20%", category: "Knowledge" },
  { name: "Occult", nameCn: "神秘学", base: "5%", category: "Knowledge" },
  { name: "Science (Biology)", nameCn: "科学(生物学)", base: "1%", category: "Knowledge" },
  { name: "Science (Chemistry)", nameCn: "科学(化学)", base: "1%", category: "Knowledge" },
  { name: "Science (Physics)", nameCn: "科学(物理学)", base: "1%", category: "Knowledge" },

  // Perception & Investigation Skills
  { name: "Listen", nameCn: "聆听", base: "20%", category: "Investigation" },
  { name: "Spot Hidden", nameCn: "侦查", base: "25%", category: "Investigation" },
  { name: "Track", nameCn: "追踪", base: "10%", category: "Investigation" },

  // Physical & Movement Skills
  { name: "Climb", nameCn: "攀爬", base: "20%", category: "Physical" },
  { name: "Dodge", nameCn: "闪避", base: "0%", category: "Physical" },
  { name: "Jump", nameCn: "跳跃", base: "20%", category: "Physical" },
  { name: "Swim", nameCn: "游泳", base: "20%", category: "Physical" },
  { name: "Throw", nameCn: "投掷", base: "20%", category: "Physical" },

  // Stealth & Deception Skills
  { name: "Disguise", nameCn: "乔装", base: "5%", category: "Stealth" },
  { name: "Sleight of Hand", nameCn: "妙手", base: "10%", category: "Stealth" },
  { name: "Stealth", nameCn: "潜行", base: "20%", category: "Stealth" },

  // Mechanical & Technical Skills
  { name: "Electrical Repair", nameCn: "电气维修", base: "10%", category: "Technical" },
  { name: "Mechanical Repair", nameCn: "机械维修", base: "10%", category: "Technical" },
  { name: "Operate Heavy Machinery", nameCn: "操作重型机械", base: "1%", category: "Technical" },
  { name: "Pilot (Aircraft)", nameCn: "驾驶(飞机)", base: "1%", category: "Technical" },
  { name: "Pilot (Boat)", nameCn: "驾驶(船只)", base: "1%", category: "Technical" },
  { name: "Drive Auto", nameCn: "驾驶(汽车)", base: "20%", category: "Technical" },

  // Medical & Survival Skills
  { name: "First Aid", nameCn: "急救", base: "30%", category: "Medical" },
  { name: "Medicine", nameCn: "医学", base: "1%", category: "Medical" },
  { name: "Natural World", nameCn: "自然学", base: "10%", category: "Medical" },
  { name: "Survival (Arctic)", nameCn: "生存(极地)", base: "10%", category: "Medical" },
  { name: "Survival (Desert)", nameCn: "生存(沙漠)", base: "10%", category: "Medical" },
  { name: "Survival (Forest)", nameCn: "生存(森林)", base: "10%", category: "Medical" },

  // Combat Skills - Fighting
  { name: "Fighting (Brawl)", nameCn: "斗殴", base: "25%", category: "Combat" },
  { name: "Fighting (Sword)", nameCn: "格斗(剑)", base: "20%", category: "Combat" },
  { name: "Fighting (Axe)", nameCn: "格斗(斧)", base: "15%", category: "Combat" },
  { name: "Fighting (Whip)", nameCn: "格斗(鞭)", base: "5%", category: "Combat" },

  // Combat Skills - Firearms
  { name: "Firearms (Handgun)", nameCn: "射击(手枪)", base: "20%", category: "Combat" },
  { name: "Firearms (Rifle/Shotgun)", nameCn: "射击(步枪/霰弹枪)", base: "25%", category: "Combat" },
  { name: "Firearms (Submachine Gun)", nameCn: "射击(冲锋枪)", base: "15%", category: "Combat" },
  { name: "Firearms (Bow)", nameCn: "射击(弓)", base: "15%", category: "Combat" },

  // Criminal & Subterfuge Skills
  { name: "Locksmith", nameCn: "锁匠", base: "1%", category: "Criminal" },
  { name: "Criminology", nameCn: "犯罪学", base: "1%", category: "Criminal" },
  { name: "Forgery", nameCn: "伪造", base: "1%", category: "Criminal" },

  // Communication & Language Skills
  { name: "Language (Own)", nameCn: "母语", base: "0%", category: "Language" },
  { name: "Language (Other)", nameCn: "其他语言", base: "1%", category: "Language" },

  // Financial & Status Skill
  { name: "Credit Rating", nameCn: "信用评级", base: "0%", category: "Status" },

  // Cthulhu Mythos
  { name: "Cthulhu Mythos", nameCn: "克苏鲁神话", base: "0%", category: "Mythos" },

  // Additional Common Skills
  { name: "Appraise", nameCn: "估价", base: "5%", category: "Knowledge" },
  { name: "Navigate", nameCn: "领航", base: "10%", category: "Technical" },
  { name: "Psychoanalysis", nameCn: "精神分析", base: "1%", category: "Medical" },
  { name: "Ride", nameCn: "骑术", base: "5%", category: "Physical" },
];

const App: React.FC = () => {
  const [page, setPage] = useState<AppPage>("home");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [occupations, setOccupations] = useState<any[]>([]);
  const [selectedOccupation, setSelectedOccupation] = useState<any>(null);
  const [occupationalPoints, setOccupationalPoints] = useState<number>(0);
  const [interestPoints, setInterestPoints] = useState<number>(0);
  const [sessionId, setSessionId] = useState<string>("");
  const [showAttributeSelector, setShowAttributeSelector] = useState(false);
  const [attributeOptions, setAttributeOptions] = useState<any[]>([]);
  
  // 防止重复提交的锁
  const isSubmittingRef = useRef(false);
  const [characterName, setCharacterName] = useState<string>("Investigator");
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>("");
  const [selectedModName, setSelectedModName] = useState<string>("");
  const [showCheckpointSelector, setShowCheckpointSelector] = useState(false);
  const [checkpoints, setCheckpoints] = useState<any[]>([]);
  const [loadingCheckpoints, setLoadingCheckpoints] = useState(false);
  const [moduleIntroduction, setModuleIntroduction] = useState<{ introduction: string; moduleNotes: string } | null>(null);
  const [showModuleIntro, setShowModuleIntro] = useState(false);
  const [loadingModData, setLoadingModData] = useState(false);
  const [modLoadProgress, setModLoadProgress] = useState<{ stage: string; progress: number; message: string } | null>(null);
  const [conversationHistory, setConversationHistory] = useState<Array<{
    role: 'character' | 'keeper';
    content: string;
    timestamp: string;
    turnNumber: number;
  }> | null>(null);
  const [sidebarRefreshTrigger, setSidebarRefreshTrigger] = useState(0);
  const [isCreatingFromGameFlow, setIsCreatingFromGameFlow] = useState(false);
  const [importingModule, setImportingModule] = useState(false);
  const [importMessage, setImportMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [form, setForm] = React.useState<Record<string, string>>({});

  // Fetch occupations on component mount
  React.useEffect(() => {
    const fetchOccupations = async () => {
      try {
        const response = await fetch("http://localhost:3000/api/occupations");
        const data = await response.json();

        if (data.success && data.occupations) {
          // Flatten all occupations from all groups
          const allOccupations: any[] = [];
          data.occupations.groups.forEach((group: any) => {
            group.occupations.forEach((occ: any) => {
              allOccupations.push({
                ...occ,
                groupName: group.name_zh,
              });
            });
          });
          setOccupations(allOccupations);
        }
      } catch (error) {
        console.error("Error fetching occupations:", error);
      }
    };

    fetchOccupations();
  }, []);

  // Calculate occupational and interest skill points
  React.useEffect(() => {
    // Calculate interest points (INT × 2)
    const intValue = Number(form.INT) || 0;
    setInterestPoints(intValue * 2);

    // Calculate occupational points based on selected occupation
    if (selectedOccupation && selectedOccupation.suggested_occupational_points) {
      const expression = selectedOccupation.suggested_occupational_points.expression;

      try {
        // Parse and evaluate the expression
        // Replace attribute names with their values from form
        let evaluatedExpression = expression
          .replace(/STR/g, String(Number(form.STR) || 0))
          .replace(/CON/g, String(Number(form.CON) || 0))
          .replace(/DEX/g, String(Number(form.DEX) || 0))
          .replace(/APP/g, String(Number(form.APP) || 0))
          .replace(/POW/g, String(Number(form.POW) || 0))
          .replace(/SIZ/g, String(Number(form.SIZ) || 0))
          .replace(/INT/g, String(Number(form.INT) || 0))
          .replace(/EDU/g, String(Number(form.EDU) || 0));

        // Safely evaluate the expression
        // eslint-disable-next-line no-eval
        const result = eval(evaluatedExpression);
        setOccupationalPoints(Math.floor(result));
      } catch (error) {
        console.error("Error calculating occupational points:", error);
        setOccupationalPoints(0);
      }
    } else {
      setOccupationalPoints(0);
    }
  }, [form.STR, form.CON, form.DEX, form.APP, form.POW, form.SIZ, form.INT, form.EDU, selectedOccupation]);

  // Show mod selector first, then character selector
  const handleShowCharacterSelector = () => {
    setPage("mod-select");
  };

  // Handle mod selection - only record the module name and show introduction
  const handleSelectMod = async (modName: string) => {
    setSelectedModName(modName);
    setLoadingModData(true);
    setModLoadProgress({ stage: "加载", progress: 50, message: "正在获取模组介绍..." });
    
    try {
      // Only fetch module introduction (do NOT import template yet)
      const introResponse = await fetch(`http://localhost:3000/api/mod/introduction?modName=${encodeURIComponent(modName)}`);
      const introData = await introResponse.json();

      if (introResponse.ok && introData.success) {
        setModuleIntroduction(introData.moduleIntroduction);
        setModLoadProgress({ stage: "完成", progress: 100, message: "准备就绪" });
        setTimeout(() => {
          setLoadingModData(false);
          setModLoadProgress(null);
          setPage("module-intro");
        }, 500);
      } else {
        // If failed to get introduction, go directly to character select
        console.error("Failed to get module introduction:", introData.error);
        setLoadingModData(false);
        setModLoadProgress(null);
        setPage("character-select");
      }
    } catch (error) {
      console.error("Error loading mod info:", error);
      setLoadingModData(false);
      setModLoadProgress(null);
      alert("Failed to load module info: " + (error as Error).message);
      setPage("mod-select");
    }
  };

  // Handle character selection and start game
  // Import template (if needed) → Create instance from template → Start game
  const handleSelectCharacter = async (characterId: string, charName: string) => {
    console.log("Selected character:", characterId, charName);
    setSelectedCharacterId(characterId);
    setCharacterName(charName);
    
    try {
      // Step 1: Import module to template table (backend will check if already imported)
      console.log(`Importing module template: ${selectedModName}`);
      
      const importResponse = await fetch("http://localhost:3000/api/modules/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          moduleName: selectedModName, 
          forceReimport: false  // Don't re-import if already exists
        }),
      });

      const importData = await importResponse.json();

      if (!importResponse.ok) {
        throw new Error(importData.error || "Failed to import module template");
      }

      console.log(`✅ Module template ready: ${importData.scenarioCount} scenarios, ${importData.npcCount} NPCs`);

      // Step 2: Start game session (backend will create game instance using IP-based sessionId)
      const startResponse = await fetch("http://localhost:3000/api/game/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId, modName: selectedModName }),
      });

      const startData = await startResponse.json();

      if (startResponse.ok) {
        // Use the sessionId returned by backend (IP-based, not time-based)
        setSessionId(startData.sessionId);
        // Clear conversation history for new game (will be loaded from API)
        setConversationHistory(null);
        // Don't show module introduction again (already shown before character selection)
        setShowModuleIntro(false);
        setPage("game");
      } else {
        alert("Failed to start game: " + (startData.error || "Unknown error"));
        setPage("character-select");
      }
    } catch (error) {
      console.error("Error starting game:", error);
      alert("Failed to start game: " + (error as Error).message);
      setPage("character-select");
    }
  };

  const handleBackToHome = () => {
    setPage("home");
    setImportMessage(null);
  };

  // Handle continue game - show checkpoint selector
  const handleContinueGame = async () => {
    setShowCheckpointSelector(true);
    setLoadingCheckpoints(true);

    try {
      // Get all checkpoints (we'll filter by session later if needed)
      // For now, we'll get checkpoints from a default session or all sessions
      const response = await fetch(`http://localhost:3000/api/checkpoints/list?sessionId=all&limit=50`);
      const data = await response.json();

      if (data.success) {
        setCheckpoints(data.checkpoints || []);
      } else {
        alert("Failed to load checkpoint list: " + (data.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Error loading checkpoints:", error);
      alert("Network error, unable to load checkpoint list");
    } finally {
      setLoadingCheckpoints(false);
    }
  };

  // Handle import module - show module selector in import mode
  const handleImportModule = () => {
    setPage("module-import");
  };

  // Handle checkpoint selection and load
  const handleLoadCheckpoint = async (checkpointId: string) => {
    try {
      const response = await fetch("http://localhost:3000/api/checkpoints/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkpointId }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Restore game state
        setSessionId(data.sessionId);
        
        // Extract character name from game state if available
        if (data.gameState?.playerCharacter?.name) {
          setCharacterName(data.gameState.playerCharacter.name);
        }

        // Load conversation history if provided
        if (data.conversationHistory && Array.isArray(data.conversationHistory)) {
          setConversationHistory(data.conversationHistory);
          console.log(`Loaded ${data.conversationHistory.length} messages from checkpoint`);
        } else {
          setConversationHistory(null);
        }

        // Don't show module introduction when loading checkpoint (only for new games)
        setShowModuleIntro(false);
        setModuleIntroduction(null);

        // Close checkpoint selector and go to game
        setShowCheckpointSelector(false);
        setPage("game");
      } else {
        alert("Failed to load checkpoint: " + (data.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Error loading checkpoint:", error);
      alert("Network error, unable to load checkpoint");
    }
  };

  // Handle checkpoint deletion
  const handleDeleteCheckpoint = async (checkpointId: string, checkpointName: string) => {
    // Confirmation dialog
    const confirmed = window.confirm(
      `确定要删除存档 "${checkpointName}" 吗?\n\n此操作无法撤销!`
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:3000/api/checkpoints/${checkpointId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Remove checkpoint from local state
        setCheckpoints((prevCheckpoints) => 
          prevCheckpoints.filter((cp) => cp.checkpointId !== checkpointId)
        );
        console.log(`✓ Checkpoint deleted: ${checkpointId}`);
      } else {
        alert("删除存档失败: " + (data.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Error deleting checkpoint:", error);
      alert("网络错误，无法删除存档");
    }
  };

  const onChange = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // Handle random attribute generation - generate one set and show modal
  const handleRandomizeAttributes = async () => {
    try {
      const age = Number(form.age) || undefined;
      const response = await fetch("http://localhost:3000/api/characters/random-attributes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ age }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setAttributeOptions([{ id: 1, attributes: data.attributes }]);
        setShowAttributeSelector(true);
      } else {
        alert("生成属性失败: " + (data.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Error generating random attributes:", error);
      alert("网络错误，无法生成随机属性");
    }
  };

  // Generate another attribute set in the modal (max 5 sets)
  const handleGenerateAnotherSet = async () => {
    if (attributeOptions.length >= 5) {
      return;
    }

    try {
      const age = Number(form.age) || undefined;
      const response = await fetch("http://localhost:3000/api/characters/random-attributes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ age }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setAttributeOptions((prev) => [
          ...prev,
          { id: prev.length + 1, attributes: data.attributes }
        ]);
      } else {
        alert("生成属性失败: " + (data.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Error generating random attributes:", error);
      alert("网络错误，无法生成随机属性");
    }
  };

  // Handle attribute set selection
  const handleSelectAttributeSet = (attributes: any) => {
    setForm((prev) => ({
      ...prev,
      ...attributes,
    }));
    setShowAttributeSelector(false);
    setAttributeOptions([]);
  };

  const skillsState = useMemo(() => {
    return SKILLS.map((skill) => ({
      name: skill.name,
      nameCn: skill.nameCn,
      base: skill.base,
      category: skill.category,
      occupationalValue: form[`skill_occ_${skill.name}`] || "",
      interestValue: form[`skill_int_${skill.name}`] || "",
    }));
  }, [form]);

  // Calculate used skill points
  const skillPointsUsage = useMemo(() => {
    let occupationalUsed = 0;
    let interestUsed = 0;

    skillsState.forEach((skill) => {
      const occupationalValue = parseInt(skill.occupationalValue) || 0;
      const interestValue = parseInt(skill.interestValue) || 0;

      occupationalUsed += occupationalValue;
      interestUsed += interestValue;
    });

    return {
      occupationalUsed,
      interestUsed,
      occupationalRemaining: Math.max(0, occupationalPoints - occupationalUsed),
      interestRemaining: Math.max(0, interestPoints - interestUsed),
    };
  }, [skillsState, occupationalPoints, interestPoints]);

  const weapons = [0, 1, 2].map((i) => ({
    name: form[`weapon_${i}_name`] || "",
    skill: form[`weapon_${i}_skill`] || "",
    damage: form[`weapon_${i}_damage`] || "",
    range: form[`weapon_${i}_range`] || "",
    attacks: form[`weapon_${i}_attacks`] || "",
    ammo: form[`weapon_${i}_ammo`] || "",
  }));

  const characterData = useMemo(
    () => ({
      identity: {
        era: form.era,
        name: form.name,
        occupation: form.occupation,
        age: Number(form.age) || null,
        gender: form.gender,
        residence: form.residence,
        birthplace: form.birthplace,
      },
      attributes: ["STR", "CON", "DEX", "APP", "POW", "SIZ", "INT", "EDU", "LCK"].reduce(
        (acc, key) => ({ ...acc, [key]: Number(form[key]) || 0 }),
        {}
      ),
      derived: {
        HP: Number(form.HP) || 0,
        SAN: Number(form.SAN) || 0,
        MP: Number(form.MP) || 0,
        LUCK: Number(form.LUCK) || 0,
        MOV: Number(form.MOV) || 0,
        BUILD: form.BUILD,
        DB: form.DB,
        ARMOR: form.ARMOR,
      },
      skills: skillsState.reduce(
        (acc, s) => ({
          ...acc,
          [s.name]: {
            base: parseInt(s.base.replace("%", "")) || 0,
            occupationalPoints: Number(s.occupationalValue) || 0,
            interestPoints: Number(s.interestValue) || 0,
            total: (parseInt(s.base.replace("%", "")) || 0) + (Number(s.occupationalValue) || 0) + (Number(s.interestValue) || 0)
          }
        }),
        {}
      ),
      weapons: weapons.filter((w) => w.name || w.skill || w.damage),
      notes: {
        appearance: form.appearance,
        ideology: form.ideology,
        people: form.people,
        gear: form.gear,
        backstory: form.backstory,
      },
    }),
    [form, skillsState, weapons]
  );

  const handleCreateCharacter = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!characterData.identity.name) {
      setSaveMessage({ type: "error", text: "Please fill in character name!" });
      return;
    }

    // 防止重复提交
    if (isSubmittingRef.current) {
      console.log("角色创建已在进行中,忽略重复提交");
      return;
    }

    isSubmittingRef.current = true;
    setSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch("http://localhost:3000/api/characters/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(characterData),
      });

      const data = await response.json();

      if (response.ok) {
        setSaveMessage({ type: "success", text: data.message });

        // Wait a moment to show success message, then navigate
        setTimeout(() => {
          if (isCreatingFromGameFlow) {
            // If from game flow, return to character selection
            setPage("character-select");
          } else {
            // If from home, return to home page
            setPage("home");
          }
          // Clear form and reset state
          setForm({});
          setSaveMessage(null);
          setIsCreatingFromGameFlow(false);
        }, 1500);
      } else {
        setSaveMessage({ type: "error", text: data.error || "创建角色失败" });
      }
    } catch (error) {
      console.error("Error creating character:", error);
      setSaveMessage({ type: "error", text: "网络错误，无法连接到服务器" });
    } finally {
      setSaving(false);
      isSubmittingRef.current = false;  // 释放锁
    }
  };

  const sheet = (
    <div className="sheet">
      <h1>克苏鲁的呼唤 - 调查员卡</h1>
      <form onSubmit={handleCreateCharacter}>
        <div style={{ textAlign: "right", marginBottom: "6px" }}>
          <button
            type="button"
            className="pill-btn"
            onClick={() => {
              if (isCreatingFromGameFlow) {
                setPage("character-select");
              } else {
                setPage("home");
              }
              setIsCreatingFromGameFlow(false);
            }}
            style={{ background: "#eee" }}
          >
            {isCreatingFromGameFlow ? "← 返回角色选择" : "← 返回主页"}
          </button>
        </div>
        <div className="section-title">身份信息</div>
        <table>
          <tbody>
            <tr>
              <th>时代</th>
              <td>
                <input name="era" placeholder="1920年代调查员" value={form.era || ""} onChange={(e) => onChange("era", e.target.value)} />
              </td>
              <th>姓名</th>
              <td>
                <input name="name" placeholder="姓名" value={form.name || ""} onChange={(e) => onChange("name", e.target.value)} />
              </td>
              <th>职业</th>
              <td>
                <select
                  name="occupation"
                  value={form.occupation || ""}
                  onChange={(e) => {
                    const occupationName = e.target.value;
                    onChange("occupation", occupationName);

                    // Find and store the selected occupation details
                    const selected = occupations.find(occ => occ.name_zh === occupationName || occ.name_en === occupationName);
                    setSelectedOccupation(selected);
                  }}
                  style={{ width: "100%", padding: "4px" }}
                >
                  <option value="">选择职业...</option>
                  {occupations.map((occ) => (
                    <option key={occ.id} value={occ.name_zh}>
                      {occ.name_zh} ({occ.name_en})
                    </option>
                  ))}
                </select>
              </td>
            </tr>
            <tr>
              <th>年龄</th>
              <td>
                <input name="age" type="number" min="1" placeholder="32" value={form.age || ""} onChange={(e) => onChange("age", e.target.value)} />
              </td>
              <th>性别</th>
              <td>
                <input name="gender" placeholder="男 / 女" value={form.gender || ""} onChange={(e) => onChange("gender", e.target.value)} />
              </td>
              <th>居住地</th>
              <td>
                <input name="residence" placeholder="纽约" value={form.residence || ""} onChange={(e) => onChange("residence", e.target.value)} />
              </td>
            </tr>
            <tr>
              <th>出生地</th>
              <td colSpan={5}>
                <input name="birthplace" placeholder="波士顿" value={form.birthplace || ""} onChange={(e) => onChange("birthplace", e.target.value)} />
              </td>
            </tr>
          </tbody>
        </table>

        <div className="section-title">属性值</div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "8px" }}>
          <button
            type="button"
            className="pill-btn"
            onClick={handleRandomizeAttributes}
            style={{ background: "#8b7355", color: "#f5f1e8" }}
          >
            🎲 随机生成属性
          </button>
        </div>
        <table>
          <tbody>
            <tr>
              {[
                { key: "STR", label: "力量" },
                { key: "CON", label: "体质" },
                { key: "DEX", label: "敏捷" },
                { key: "APP", label: "外貌" },
                { key: "POW", label: "意志" },
                { key: "SIZ", label: "体型" },
                { key: "INT", label: "智力" },
                { key: "EDU", label: "教育" },
                { key: "LCK", label: "幸运" }
              ].map((attr) => (
                <th key={attr.key}>{attr.label}</th>
              ))}
            </tr>
            <tr>
              {[
                { key: "STR", label: "力量" },
                { key: "CON", label: "体质" },
                { key: "DEX", label: "敏捷" },
                { key: "APP", label: "外貌" },
                { key: "POW", label: "意志" },
                { key: "SIZ", label: "体型" },
                { key: "INT", label: "智力" },
                { key: "EDU", label: "教育" },
                { key: "LCK", label: "幸运" }
              ].map((attr) => (
                <td key={attr.key}>
                  <input
                    name={attr.key}
                    type="number"
                    min="1"
                    max="99"
                    placeholder="50"
                    value={form[attr.key] || ""}
                    onChange={(e) => onChange(attr.key, e.target.value)}
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>

        <table>
          <tbody>
            <tr>
              <th>生命值</th>
              <td>
                <input name="HP" type="number" min="1" placeholder="10" value={form.HP || ""} onChange={(e) => onChange("HP", e.target.value)} />
              </td>
              <th>理智值</th>
              <td>
                <input name="SAN" type="number" min="0" placeholder="60" value={form.SAN || ""} onChange={(e) => onChange("SAN", e.target.value)} />
              </td>
              <th>魔法值</th>
              <td>
                <input name="MP" type="number" min="0" placeholder="10" value={form.MP || ""} onChange={(e) => onChange("MP", e.target.value)} />
              </td>
              <th>幸运值</th>
              <td>
                <input name="LUCK" type="number" min="0" placeholder="50" value={form.LUCK || ""} onChange={(e) => onChange("LUCK", e.target.value)} />
              </td>
            </tr>
            <tr>
              <th>移动力</th>
              <td>
                <input name="MOV" type="number" min="1" placeholder="8" value={form.MOV || ""} onChange={(e) => onChange("MOV", e.target.value)} />
              </td>
              <th>体格</th>
              <td>
                <input name="BUILD" placeholder="0" value={form.BUILD || ""} onChange={(e) => onChange("BUILD", e.target.value)} />
              </td>
              <th>伤害加深</th>
              <td>
                <input name="DB" placeholder="+0" value={form.DB || ""} onChange={(e) => onChange("DB", e.target.value)} />
              </td>
              <th>护甲</th>
              <td colSpan={3}>
                <input name="ARMOR" placeholder="-" value={form.ARMOR || ""} onChange={(e) => onChange("ARMOR", e.target.value)} />
              </td>
            </tr>
          </tbody>
        </table>

        <div className="section-title">技能</div>

        {/* Skill Points Display */}
        <div style={{
          marginBottom: "16px",
          padding: "16px",
          background: "#fff9e6",
          border: "2px solid #8b7355",
          borderRadius: "4px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "16px"
        }}>
          <div>
            <strong style={{ color: "#8b7355", fontSize: "1rem" }}>职业技能点数:</strong>
            <div style={{
              fontSize: "1.5rem",
              fontWeight: "bold",
              color: skillPointsUsage.occupationalRemaining < 0 ? "#c41e3a" : "#3d2817",
              marginTop: "4px"
            }}>
              剩余: {skillPointsUsage.occupationalRemaining}
            </div>
            <div style={{ fontSize: "0.9rem", color: "#666", marginTop: "4px" }}>
              总共: {occupationalPoints} | 已用: {skillPointsUsage.occupationalUsed}
            </div>
            {selectedOccupation && selectedOccupation.suggested_occupational_points && (
              <div style={{ fontSize: "0.75rem", color: "#999", marginTop: "2px" }}>
                ({selectedOccupation.suggested_occupational_points.expression})
              </div>
            )}
            {skillPointsUsage.occupationalRemaining < 0 && (
              <div style={{ fontSize: "0.8rem", color: "#c41e3a", marginTop: "4px", fontWeight: "bold" }}>
                ⚠️ 超出可用点数！
              </div>
            )}
          </div>
          <div>
            <strong style={{ color: "#8b7355", fontSize: "1rem" }}>兴趣技能点数:</strong>
            <div style={{
              fontSize: "1.5rem",
              fontWeight: "bold",
              color: skillPointsUsage.interestRemaining < 0 ? "#c41e3a" : "#3d2817",
              marginTop: "4px"
            }}>
              剩余: {skillPointsUsage.interestRemaining}
            </div>
            <div style={{ fontSize: "0.9rem", color: "#666", marginTop: "4px" }}>
              总共: {interestPoints} | 已用: {skillPointsUsage.interestUsed}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#999", marginTop: "2px" }}>
              (INT × 2)
            </div>
            {skillPointsUsage.interestRemaining < 0 && (
              <div style={{ fontSize: "0.8rem", color: "#c41e3a", marginTop: "4px", fontWeight: "bold" }}>
                ⚠️ 超出可用点数！
              </div>
            )}
          </div>
        </div>

        <div style={{
          marginBottom: "12px",
          padding: "10px",
          background: "#e8f4f8",
          border: "1px solid #5ba3c0",
          borderRadius: "4px",
          fontSize: "0.85rem",
          color: "#2c5f75"
        }}>
          <strong>💡 提示:</strong> 每个技能可以分别使用<strong>职业加点</strong>和<strong>兴趣加点</strong>进行提升，最终技能值 = 基础值 + 职业加点 + 兴趣加点
        </div>

        {selectedOccupation && selectedOccupation.suggested_skills && selectedOccupation.suggested_skills.length > 0 && (
          <div style={{
            marginBottom: "16px",
            padding: "12px",
            background: "#f0f8ff",
            border: "1px solid #8b7355",
            borderRadius: "4px"
          }}>
            <strong style={{ color: "#8b7355" }}>
              {selectedOccupation.name_zh} ({selectedOccupation.name_en}) 推荐技能:
            </strong>
            <div style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {selectedOccupation.suggested_skills.map((skill: string, index: number) => (
                <span
                  key={index}
                  style={{
                    padding: "4px 8px",
                    background: "#fff",
                    border: "1px solid #ddd",
                    borderRadius: "3px",
                    fontSize: "0.85rem"
                  }}
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* Left Column */}
          <div>
            {[
              { key: "social-knowledge", label: "社交与知识技能", categories: ["Social", "Knowledge", "Language"] },
              { key: "investigation", label: "调查与犯罪技能", categories: ["Investigation", "Criminal"] },
              { key: "combat", label: "战斗技能", categories: ["Combat"] }
            ].map((group) => {
              const groupSkills = skillsState.filter((s) => group.categories.includes(s.category));
              if (groupSkills.length === 0) return null;

              return (
                <div key={group.key} className="skill-category" style={{ marginBottom: '20px' }}>
                  <h4 className="skill-category-title">{group.label}</h4>
                  <table className="skills-table">
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left' }}>技能名称</th>
                        <th style={{ width: '80px' }}>职业加点</th>
                        <th style={{ width: '80px' }}>兴趣加点</th>
                        <th style={{ width: '80px' }}>总计</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupSkills.map((skill) => {
                        const isOccupationalSkill = selectedOccupation?.suggested_skills?.includes(skill.name);
                        const baseValue = parseInt(skill.base.replace("%", "")) || 0;
                        const occValue = parseInt(skill.occupationalValue) || 0;
                        const intValue = parseInt(skill.interestValue) || 0;
                        const totalValue = baseValue + occValue + intValue;

                        return (
                          <tr
                            key={skill.name}
                            style={{
                              backgroundColor: isOccupationalSkill ? '#f5e6d3' : 'transparent'
                            }}
                          >
                            <td className="skill-name-cell">
                              <span>{skill.nameCn}</span>
                              <span className="skill-base" style={{ marginLeft: '8px', color: '#999' }}>({skill.base})</span>
                            </td>
                            <td className="skill-value-cell">
                              <input
                                type="number"
                                min="0"
                                max="99"
                                placeholder="0"
                                value={skill.occupationalValue}
                                onChange={(e) => onChange(`skill_occ_${skill.name}`, e.target.value)}
                                style={{ width: '100%' }}
                              />
                            </td>
                            <td className="skill-value-cell">
                              <input
                                type="number"
                                min="0"
                                max="99"
                                placeholder="0"
                                value={skill.interestValue}
                                onChange={(e) => onChange(`skill_int_${skill.name}`, e.target.value)}
                                style={{ width: '100%' }}
                              />
                            </td>
                            <td className="skill-value-cell" style={{ textAlign: 'center', fontWeight: 'bold', backgroundColor: '#f0f0f0' }}>
                              {totalValue}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>

          {/* Right Column */}
          <div>
            {[
              { key: "physical", label: "体能与潜行技能", categories: ["Physical", "Stealth"] },
              { key: "technical-medical", label: "技术与医疗技能", categories: ["Technical", "Medical"] },
              { key: "special", label: "特殊技能", categories: ["Status", "Mythos"] }
            ].map((group) => {
              const groupSkills = skillsState.filter((s) => group.categories.includes(s.category));
              if (groupSkills.length === 0) return null;

              return (
                <div key={group.key} className="skill-category" style={{ marginBottom: '20px' }}>
                  <h4 className="skill-category-title">{group.label}</h4>
                  <table className="skills-table">
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left' }}>技能名称</th>
                        <th style={{ width: '80px' }}>职业加点</th>
                        <th style={{ width: '80px' }}>兴趣加点</th>
                        <th style={{ width: '80px' }}>总计</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupSkills.map((skill) => {
                        const isOccupationalSkill = selectedOccupation?.suggested_skills?.includes(skill.name);
                        const baseValue = parseInt(skill.base.replace("%", "")) || 0;
                        const occValue = parseInt(skill.occupationalValue) || 0;
                        const intValue = parseInt(skill.interestValue) || 0;
                        const totalValue = baseValue + occValue + intValue;

                        return (
                          <tr
                            key={skill.name}
                            style={{
                              backgroundColor: isOccupationalSkill ? '#f5e6d3' : 'transparent'
                            }}
                          >
                            <td className="skill-name-cell">
                              <span>{skill.nameCn}</span>
                              <span className="skill-base" style={{ marginLeft: '8px', color: '#999' }}>({skill.base})</span>
                            </td>
                            <td className="skill-value-cell">
                              <input
                                type="number"
                                min="0"
                                max="99"
                                placeholder="0"
                                value={skill.occupationalValue}
                                onChange={(e) => onChange(`skill_occ_${skill.name}`, e.target.value)}
                                style={{ width: '100%' }}
                              />
                            </td>
                            <td className="skill-value-cell">
                              <input
                                type="number"
                                min="0"
                                max="99"
                                placeholder="0"
                                value={skill.interestValue}
                                onChange={(e) => onChange(`skill_int_${skill.name}`, e.target.value)}
                                style={{ width: '100%' }}
                              />
                            </td>
                            <td className="skill-value-cell" style={{ textAlign: 'center', fontWeight: 'bold', backgroundColor: '#f0f0f0' }}>
                              {totalValue}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </div>

        <div className="section-title">武器</div>
        <table>
          <tbody>
            <tr>
              <th>武器名称</th>
              <th>技能</th>
              <th>伤害</th>
              <th>射程</th>
              <th>攻击次数</th>
              <th>弹药</th>
            </tr>
            {weapons.map((w, i) => (
              <tr className="weapon-row" key={i}>
                <td>
                  <input
                    name={`weapon_${i}_name`}
                    placeholder={i === 0 ? ".38 Revolver" : "Weapon"}
                    value={w.name}
                    onChange={(e) => onChange(`weapon_${i}_name`, e.target.value)}
                  />
                </td>
                <td>
                  <input
                    name={`weapon_${i}_skill`}
                    placeholder={i === 0 ? "Handgun" : "Skill"}
                    value={w.skill}
                    onChange={(e) => onChange(`weapon_${i}_skill`, e.target.value)}
                  />
                </td>
                <td>
                  <input
                    name={`weapon_${i}_damage`}
                    placeholder={i === 0 ? "1d10" : "-"}
                    value={w.damage}
                    onChange={(e) => onChange(`weapon_${i}_damage`, e.target.value)}
                  />
                </td>
                <td>
                  <input
                    name={`weapon_${i}_range`}
                    placeholder={i === 0 ? "15" : "-"}
                    value={w.range}
                    onChange={(e) => onChange(`weapon_${i}_range`, e.target.value)}
                  />
                </td>
                <td>
                  <input
                    name={`weapon_${i}_attacks`}
                    placeholder={i === 0 ? "1" : "-"}
                    value={w.attacks}
                    onChange={(e) => onChange(`weapon_${i}_attacks`, e.target.value)}
                  />
                </td>
                <td>
                  <input
                    name={`weapon_${i}_ammo`}
                    placeholder={i === 0 ? "6" : "-"}
                    value={w.ammo}
                    onChange={(e) => onChange(`weapon_${i}_ammo`, e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="section-title">形象与笔记</div>
        <div className="notes-grid">
          <table>
            <tbody>
              <tr>
                <th>外貌描述</th>
              </tr>
              <tr>
                <td>
                  <textarea
                    name="appearance"
                    placeholder="描述外貌、着装、伤疤、举止..."
                    value={form.appearance || ""}
                    onChange={(e) => onChange("appearance", e.target.value)}
                  />
                </td>
              </tr>
            </tbody>
          </table>
          <table>
            <tbody>
              <tr>
                <th>特质/信念</th>
              </tr>
              <tr>
                <td>
                  <textarea
                    name="ideology"
                    placeholder="信仰、政治观点、宗教、性格特点..."
                    value={form.ideology || ""}
                    onChange={(e) => onChange("ideology", e.target.value)}
                  />
                </td>
              </tr>
            </tbody>
          </table>
          <table>
            <tbody>
              <tr>
                <th>重要之人</th>
              </tr>
              <tr>
                <td>
                  <textarea
                    name="people"
                    placeholder="重要人物、导师、家人、联系人..."
                    value={form.people || ""}
                    onChange={(e) => onChange("people", e.target.value)}
                  />
                </td>
              </tr>
            </tbody>
          </table>
          <table>
            <tbody>
              <tr>
                <th>装备与资产</th>
              </tr>
              <tr>
                <td>
                  <textarea
                    name="gear"
                    placeholder="装备、物品、资产、资金..."
                    value={form.gear || ""}
                    onChange={(e) => onChange("gear", e.target.value)}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="section-title">背景故事</div>
        <table>
          <tbody>
            <tr>
              <td>
                <textarea
                  name="backstory"
                  placeholder="背景故事、经历、动机、恐惧、秘密..."
                  value={form.backstory || ""}
                  onChange={(e) => onChange("backstory", e.target.value)}
                />
              </td>
            </tr>
          </tbody>
        </table>

        {saveMessage && (
          <div
            style={{
              marginTop: "12px",
              padding: "12px",
              borderRadius: "4px",
              backgroundColor: saveMessage.type === "success" ? "#d4edda" : "#f8d7da",
              color: saveMessage.type === "success" ? "#155724" : "#721c24",
              border: `1px solid ${saveMessage.type === "success" ? "#c3e6cb" : "#f5c6cb"}`,
            }}
          >
            {saveMessage.text}
          </div>
        )}
        <div style={{ marginTop: "20px", textAlign: "center", display: "flex", gap: "12px", justifyContent: "center" }}>
          {saveMessage && (
            <button
              className="pill-btn"
              type="button"
              onClick={() => setSaveMessage(null)}
              style={{ background: "#8b7355", borderColor: "#8b7355", color: "#f5f1e8" }}
            >
              清除消息
            </button>
          )}
          <button className="pill-btn" type="submit" disabled={saving}>
            {saving ? "创建中..." : "🎲 创建角色"}
          </button>
        </div>
      </form>

      {/* Attribute Selector Modal */}
      {showAttributeSelector && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          padding: '20px',
        }}>
          <div style={{
            backgroundColor: '#f5f1e8',
            padding: '30px',
            borderRadius: '8px',
            maxWidth: '1200px',
            width: '95%',
            maxHeight: '90vh',
            overflow: 'auto',
            border: '3px solid #8b7355',
            boxShadow: '0 8px 20px rgba(0, 0, 0, 0.4)',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <h2 style={{
                margin: 0,
                color: '#3d2817',
                fontSize: '1.6rem'
              }}>
                🎲 选择属性组合
              </h2>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '15px'
              }}>
                <span style={{
                  fontSize: '0.9rem',
                  color: '#666',
                  fontWeight: 'bold'
                }}>
                  已生成: {attributeOptions.length}/5
                </span>
                <button
                  onClick={handleGenerateAnotherSet}
                  disabled={attributeOptions.length >= 5}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: attributeOptions.length >= 5 ? '#ccc' : '#8b7355',
                    color: '#f5f1e8',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: attributeOptions.length >= 5 ? 'not-allowed' : 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: 'bold',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (attributeOptions.length < 5) {
                      e.currentTarget.style.backgroundColor = '#6b5a45';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (attributeOptions.length < 5) {
                      e.currentTarget.style.backgroundColor = '#8b7355';
                    }
                  }}
                >
                  {attributeOptions.length >= 5 ? '已达上限' : '🎲 再随机一组'}
                </button>
              </div>
            </div>

            <div style={{
              padding: '12px',
              background: '#e8f4f8',
              border: '1px solid #5ba3c0',
              borderRadius: '4px',
              marginBottom: '15px',
              fontSize: '0.9rem',
              color: '#2c5f75',
              textAlign: 'center'
            }}>
              💡 点击卡片选择该组属性，或点击右上角"再随机一组"继续生成（最多5组）
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '15px',
              marginBottom: '20px'
            }}>
              {attributeOptions.map((option) => {
                const attrs = option.attributes;
                const total = (attrs.STR || 0) + (attrs.CON || 0) + (attrs.DEX || 0) +
                             (attrs.APP || 0) + (attrs.POW || 0) + (attrs.SIZ || 0) +
                             (attrs.INT || 0) + (attrs.EDU || 0) + (attrs.LCK || 0);

                return (
                  <div
                    key={option.id}
                    onClick={() => handleSelectAttributeSet(attrs)}
                    style={{
                      padding: '15px',
                      border: '2px solid #8b7355',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      backgroundColor: '#fff',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f0ebe0';
                      e.currentTarget.style.transform = 'scale(1.02)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#fff';
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                  >
                    <div style={{
                      fontWeight: 'bold',
                      fontSize: '1.1rem',
                      marginBottom: '10px',
                      color: '#8b7355',
                      textAlign: 'center',
                      borderBottom: '1px solid #ddd',
                      paddingBottom: '8px'
                    }}>
                      方案 {option.id}
                    </div>

                    <table style={{ width: '100%', fontSize: '0.85rem' }}>
                      <tbody>
                        <tr>
                          <td style={{ padding: '2px 4px', fontWeight: '500' }}>STR:</td>
                          <td style={{ padding: '2px 4px', textAlign: 'right' }}>{attrs.STR}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: '2px 4px', fontWeight: '500' }}>CON:</td>
                          <td style={{ padding: '2px 4px', textAlign: 'right' }}>{attrs.CON}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: '2px 4px', fontWeight: '500' }}>DEX:</td>
                          <td style={{ padding: '2px 4px', textAlign: 'right' }}>{attrs.DEX}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: '2px 4px', fontWeight: '500' }}>APP:</td>
                          <td style={{ padding: '2px 4px', textAlign: 'right' }}>{attrs.APP}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: '2px 4px', fontWeight: '500' }}>POW:</td>
                          <td style={{ padding: '2px 4px', textAlign: 'right' }}>{attrs.POW}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: '2px 4px', fontWeight: '500' }}>SIZ:</td>
                          <td style={{ padding: '2px 4px', textAlign: 'right' }}>{attrs.SIZ}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: '2px 4px', fontWeight: '500' }}>INT:</td>
                          <td style={{ padding: '2px 4px', textAlign: 'right' }}>{attrs.INT}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: '2px 4px', fontWeight: '500' }}>EDU:</td>
                          <td style={{ padding: '2px 4px', textAlign: 'right' }}>{attrs.EDU}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: '2px 4px', fontWeight: '500' }}>LCK:</td>
                          <td style={{ padding: '2px 4px', textAlign: 'right' }}>{attrs.LCK}</td>
                        </tr>
                        <tr style={{ borderTop: '1px solid #ddd' }}>
                          <td style={{ padding: '4px 4px 2px', fontWeight: 'bold' }}>总计:</td>
                          <td style={{ padding: '4px 4px 2px', textAlign: 'right', fontWeight: 'bold' }}>{total}</td>
                        </tr>
                      </tbody>
                    </table>

                    <div style={{
                      marginTop: '10px',
                      padding: '8px',
                      background: '#f9f9f9',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      color: '#666'
                    }}>
                      <div><strong>HP:</strong> {attrs.HP}</div>
                      <div><strong>MP:</strong> {attrs.MP}</div>
                      <div><strong>SAN:</strong> {attrs.SAN}</div>
                      <div><strong>MOV:</strong> {attrs.MOV}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => {
                setShowAttributeSelector(false);
                setAttributeOptions([]);
              }}
              style={{
                width: '100%',
                padding: '12px 20px',
                backgroundColor: '#6b5a45',
                color: '#f5f1e8',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: 'bold',
              }}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );

  if (page === "home") {
    return (
      <>
        <Homes
          onCreate={() => {
            setIsCreatingFromGameFlow(false);
            setPage("sheet");
          }}
          onStartGame={handleShowCharacterSelector}
          onContinueGame={handleContinueGame}
          onImportModule={handleImportModule}
        />
        {showCheckpointSelector && (
          <div className="checkpoint-selector-overlay" style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}>
            <div className="checkpoint-selector" style={{
              backgroundColor: '#f5f1e8',
              padding: '30px',
              borderRadius: '8px',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto',
              border: '3px solid #8b7355',
              boxShadow: '0 8px 20px rgba(0, 0, 0, 0.3)',
            }}>
              <h2 style={{ marginTop: 0, marginBottom: '20px', color: '#3d2817' }}>📂 选择存档</h2>
              
              {loadingCheckpoints ? (
                <p>加载存档列表中...</p>
              ) : checkpoints.length === 0 ? (
                <p style={{ color: '#666' }}>暂无存档</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {checkpoints.map((checkpoint: any) => (
                    <div
                      key={checkpoint.checkpointId}
                      style={{
                        padding: '15px',
                        border: '2px solid #8b7355',
                        borderRadius: '4px',
                        backgroundColor: '#fff',
                      }}
                    >
                      <div style={{ fontWeight: 'bold', marginBottom: '5px', color: '#3d2817' }}>
                        {checkpoint.checkpointName || '未命名存档'}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#666' }}>
                        {checkpoint.currentSceneName && `场景: ${checkpoint.currentSceneName}`}
                        {checkpoint.currentLocation && ` | 位置: ${checkpoint.currentLocation}`}
                        {checkpoint.gameDay && ` | 第 ${checkpoint.gameDay} 天`}
                        {checkpoint.gameTime && ` | ${checkpoint.gameTime}`}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '5px', marginBottom: '10px' }}>
                        {checkpoint.createdAt && new Date(checkpoint.createdAt).toLocaleString('zh-CN')}
                      </div>
                      
                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => handleLoadCheckpoint(checkpoint.checkpointId)}
                          style={{
                            flex: 1,
                            padding: '8px 12px',
                            backgroundColor: '#8b7355',
                            color: '#f5f1e8',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            fontWeight: 'bold',
                            transition: 'background-color 0.2s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#6b5a45';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#8b7355';
                          }}
                        >
                          📂 加载存档
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation(); // Prevent triggering parent click
                            handleDeleteCheckpoint(checkpoint.checkpointId, checkpoint.checkpointName || '未命名存档');
                          }}
                          style={{
                            padding: '8px 12px',
                            backgroundColor: '#c41e3a',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            fontWeight: 'bold',
                            transition: 'background-color 0.2s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#a01828';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#c41e3a';
                          }}
                        >
                          🗑️ 删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              <button
                onClick={() => setShowCheckpointSelector(false)}
                style={{
                  marginTop: '20px',
                  padding: '10px 20px',
                  backgroundColor: '#8b7355',
                  color: '#f5f1e8',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '1rem',
                }}
              >
                取消
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  if (page === "mod-select") {
    return (
      <>
        <ModSelector
          onSelectMod={handleSelectMod}
          onCancel={handleBackToHome}
          onImportModule={async (modName) => {
            console.log(`✅ Module ${modName} imported to template table successfully`);
          }}
        />
        
        {/* Loading Progress Modal */}
        {loadingModData && (
          <div className="mod-loading-overlay" style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3000,
            padding: '20px',
          }}>
            <div className="mod-loading-modal" style={{
              backgroundColor: '#f5f1e8',
              padding: '40px',
              borderRadius: '8px',
              maxWidth: '500px',
              width: '90%',
              border: '3px solid #8b7355',
              boxShadow: '0 8px 20px rgba(0, 0, 0, 0.5)',
              fontFamily: 'serif',
            }}>
              <h2 style={{ 
                marginTop: 0, 
                marginBottom: '30px', 
                color: '#3d2817',
                fontSize: '1.8rem',
                textAlign: 'center',
              }}>
                📦 正在加载模组数据
              </h2>
              
              {modLoadProgress && (
                <>
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '10px',
                      fontSize: '0.9rem',
                      color: '#5a4a3a',
                    }}>
                      <span>{modLoadProgress.stage}</span>
                      <span>{modLoadProgress.progress}%</span>
                    </div>
                    <div style={{
                      width: '100%',
                      height: '24px',
                      backgroundColor: '#ddd',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      border: '2px solid #8b7355',
                    }}>
                      <div style={{
                        width: `${modLoadProgress.progress}%`,
                        height: '100%',
                        backgroundColor: '#8b7355',
                        transition: 'width 0.3s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#f5f1e8',
                        fontSize: '0.8rem',
                        fontWeight: 'bold',
                      }}>
                        {modLoadProgress.progress >= 10 && `${modLoadProgress.progress}%`}
                      </div>
                    </div>
                  </div>
                  
                  <div style={{
                    textAlign: 'center',
                    color: '#5a4a3a',
                    fontSize: '1rem',
                    minHeight: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {modLoadProgress.message}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </>
    );
  }

  if (page === "module-intro") {
    return (
      <>
        <div className="module-intro-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          padding: '20px',
        }}>
          <div className="module-intro-modal" style={{
            backgroundColor: '#f5f1e8',
            padding: '40px',
            borderRadius: '8px',
            maxWidth: '800px',
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto',
            border: '3px solid #8b7355',
            boxShadow: '0 8px 20px rgba(0, 0, 0, 0.5)',
            fontFamily: 'serif',
          }}>
            <h2 style={{ 
              marginTop: 0, 
              marginBottom: '20px', 
              color: '#3d2817',
              fontSize: '1.8rem',
              borderBottom: '2px solid #8b7355',
              paddingBottom: '10px'
            }}>
              📖 模块导入
            </h2>
            
            {moduleIntroduction && (
              <>
                <div style={{ marginBottom: '30px' }}>
                  <h3 style={{ color: '#5a4a3a', marginBottom: '10px', fontSize: '1.2rem' }}>
                    故事介绍
                  </h3>
                  <div style={{
                    backgroundColor: '#fff',
                    padding: '20px',
                    borderRadius: '4px',
                    border: '1px solid #ddd',
                    lineHeight: '1.8',
                    color: '#2c2c2c',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {moduleIntroduction.introduction}
                  </div>
                </div>

                <div style={{ marginBottom: '30px' }}>
                  <h3 style={{ color: '#5a4a3a', marginBottom: '10px', fontSize: '1.2rem' }}>
                    📝 角色创建指导
                  </h3>
                  <div style={{
                    backgroundColor: '#fff',
                    padding: '20px',
                    borderRadius: '4px',
                    border: '1px solid #ddd',
                    lineHeight: '1.8',
                    color: '#2c2c2c',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {moduleIntroduction.moduleNotes}
                  </div>
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setPage("mod-select")}
                style={{
                  flex: 1,
                  padding: '15px 20px',
                  backgroundColor: '#6b5a45',
                  color: '#f5f1e8',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#5a4a3a';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#6b5a45';
                }}
              >
                返回选择模组
              </button>
              <button
                onClick={() => setPage("character-select")}
                style={{
                  flex: 2,
                  padding: '15px 20px',
                  backgroundColor: '#8b7355',
                  color: '#f5f1e8',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#6b5a45';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#8b7355';
                }}
              >
                下一步：选择角色
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (page === "character-select") {
    return (
      <CharacterSelector
        onSelectCharacter={handleSelectCharacter}
        onCancel={() => setPage("module-intro")}
        onCreateNew={() => {
          setIsCreatingFromGameFlow(true);
          setPage("sheet");
        }}
      />
    );
  }

  // Module import page (dedicated import mode)
  if (page === "module-import") {
    const handleModuleImportSuccess = async (modName: string) => {
      setImportMessage({ 
        type: "success", 
        text: `✅ 模组 "${modName}" 已成功导入到模板表！` 
      });
      // Auto return to home after 2 seconds
      setTimeout(() => {
        setPage("home");
        setImportMessage(null);
      }, 2000);
    };

    const handleModuleImportError = (error: string) => {
      setImportMessage({ 
        type: "error", 
        text: `导入失败: ${error}` 
      });
    };

    return (
      <>
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'var(--paper, #f5f1e8)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}>
          <div style={{
            maxWidth: '800px',
            width: '100%',
            textAlign: 'center',
            marginBottom: '30px'
          }}>
            <h1 style={{ 
              fontSize: '2.5rem', 
              color: '#3d2817', 
              marginBottom: '10px',
              fontFamily: 'serif'
            }}>
              📦 导入模组到模板表
            </h1>
            <p style={{ 
              fontSize: '1.1rem', 
              color: '#5a4a3a',
              marginBottom: '20px'
            }}>
              选择一个模组将其场景和NPC数据导入到模板表中，供后续创建游戏实例使用
            </p>
            
            {importMessage && (
              <div style={{
                padding: '15px',
                borderRadius: '6px',
                marginBottom: '20px',
                backgroundColor: importMessage.type === "success" ? "#d4edda" : "#f8d7da",
                color: importMessage.type === "success" ? "#155724" : "#721c24",
                border: `2px solid ${importMessage.type === "success" ? "#c3e6cb" : "#f5c6cb"}`,
                fontSize: '1rem',
                fontWeight: 'bold',
              }}>
                {importMessage.text}
              </div>
            )}

            <button
              onClick={handleBackToHome}
              style={{
                padding: '10px 20px',
                backgroundColor: '#8b7355',
                color: '#f5f1e8',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: 'bold',
                marginBottom: '20px',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#6b5a45';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#8b7355';
              }}
            >
              ← 返回主页
            </button>
          </div>

          <ModSelector
            onSelectMod={async (modName) => {
              // In import mode, clicking "确认选择" should trigger import
              try {
                setImportingModule(true);
                setImportMessage({ type: "success", text: `正在导入模组 "${modName}"...` });

                const response = await fetch('http://localhost:3000/api/modules/import', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ moduleName: modName, forceReimport: true })
                });

                const data = await response.json();

                if (response.ok && data.success) {
                  setImportMessage({ 
                    type: "success", 
                    text: `✅ 模组 "${modName}" 已成功导入到模板表！导入了 ${data.scenarioCount} 个场景和 ${data.npcCount} 个NPC` 
                  });
                  
                  // Auto return to home after 2 seconds
                  setTimeout(() => {
                    setPage("home");
                    setImportMessage(null);
                    setImportingModule(false);
                  }, 2000);
                } else {
                  throw new Error(data.error || '导入失败');
                }
              } catch (error) {
                console.error('Error importing module:', error);
                setImportMessage({ 
                  type: "error", 
                  text: `导入失败: ${(error as Error).message}` 
                });
                setImportingModule(false);
              }
            }}
            onCancel={handleBackToHome}
          />
        </div>
      </>
    );
  }
  
  if (page === "game") {
    return (
      <div className="game-container">
        <div className="game-header">
          <h1>克苏鲁的呼唤 - 游戏会话</h1>
          <button className="back-button" onClick={handleBackToHome}>
            ← 返回首页
          </button>
        </div>
        <div className="game-main-layout">
          <GameChat
            sessionId={sessionId}
            apiBaseUrl="http://localhost:3000/api"
            characterName={characterName}
            moduleIntroduction={moduleIntroduction}
            initialMessages={conversationHistory || undefined}
            onNarrativeComplete={() => setSidebarRefreshTrigger(prev => prev + 1)}
          />
          <GameSidebar
            sessionId={sessionId}
            apiBaseUrl="http://localhost:3000/api"
            refreshTrigger={sidebarRefreshTrigger}
          />
        </div>
      </div>
    );
  }
  
  return sheet;
};

export default App;
