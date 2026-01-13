/**
 * GameSidebar Component - Character status and clues panel
 *
 * Displays character information and collected clues in separate tabs.
 */

import { useState, useEffect, useRef } from 'react';
import { getSkillNameCn } from '../utils/skillTranslation';
import { DiceRollDisplay } from './DiceRollDisplay';
import { parseDiceRolls } from '../utils/diceParser';

interface GameSidebarProps {
  sessionId: string;
  apiBaseUrl?: string;
  refreshTrigger?: number; // When this changes, refresh game state
  latestDiceRolls?: string[]; // Latest dice rolls from turns
}

type TabType = 'status' | 'clues' | 'dice';

interface CharacterStatus {
  hp: number;
  maxHp: number;
  sanity: number;
  maxSanity: number;
  luck: number;
  mp?: number;
  conditions: string[];
}

interface CharacterProfile {
  id: string;
  name: string;
  status: CharacterStatus;
  skills: Record<string, number>;
  occupation?: string;
}

interface DiscoveredClue {
  text: string;
  type: "scenario" | "npc" | "secret";
  sourceName: string;
  discoveredBy: string;
  discoveredAt: string;
  category?: "physical" | "witness" | "document" | "environment" | "knowledge" | "observation";
  difficulty?: "automatic" | "regular" | "hard" | "extreme";
  method?: string;
}

interface CurrentScenario {
  name: string;
  location: string;
}

interface GameState {
  playerCharacter: CharacterProfile;
  discoveredClues: DiscoveredClue[];
  currentScenario: CurrentScenario | null;
  gameDay: number;
  timeOfDay: string;
}

export function GameSidebar({ sessionId, apiBaseUrl = 'http://localhost:3000/api', refreshTrigger, latestDiceRolls }: GameSidebarProps) {
  const [activeTab, setActiveTab] = useState<TabType>('status');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [occupationalSkills, setOccupationalSkills] = useState<string[]>([]);
  const isInitialLoadRef = useRef(true);
  const [hasUnreadDice, setHasUnreadDice] = useState(false); // 未读骰子提示
  const previousDiceCountRef = useRef(0); // 记录之前的骰子数量
  const [hasUnreadClues, setHasUnreadClues] = useState(false); // 未读线索提示
  const previousCluesCountRef = useRef(0); // 记录之前的线索数量

  // Fetch game state from backend
  useEffect(() => {
    const fetchGameState = async () => {
      try {
        // Only show loading on initial load
        if (isInitialLoadRef.current) {
          setLoading(true);
        }

        const response = await fetch(`${apiBaseUrl}/gamestate`);

        if (!response.ok) {
          throw new Error('Failed to fetch game state');
        }

        const data = await response.json();

        if (data.success && data.gameState) {
          setGameState(data.gameState);
          setError(null);
        } else {
          throw new Error('Invalid game state response');
        }
      } catch (err) {
        console.error('Error fetching game state:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        // Clear loading state and mark as no longer initial load
        if (isInitialLoadRef.current) {
          setLoading(false);
          isInitialLoadRef.current = false;
        }
      }
    };

    fetchGameState();
  }, [apiBaseUrl, sessionId, refreshTrigger]); // Refetch when refreshTrigger changes

  // Fetch occupational skills when game state changes
  useEffect(() => {
    const fetchOccupationalSkills = async () => {
      if (!gameState?.playerCharacter?.occupation) {
        setOccupationalSkills([]);
        return;
      }

      try {
        const response = await fetch(`${apiBaseUrl}/occupations`);
        const data = await response.json();

        if (data.success && data.occupations) {
          // Find the matching occupation
          for (const group of data.occupations.groups || []) {
            for (const occ of group.occupations || []) {
              if (occ.name_en === gameState.playerCharacter.occupation ||
                  occ.name_zh === gameState.playerCharacter.occupation) {
                setOccupationalSkills(occ.suggested_skills || []);
                return;
              }
            }
          }
        }
        setOccupationalSkills([]);
      } catch (err) {
        console.error('Error fetching occupations:', err);
        setOccupationalSkills([]);
      }
    };

    fetchOccupationalSkills();
  }, [gameState?.playerCharacter?.occupation, apiBaseUrl]);

  // Monitor dice rolls for unread notification
  useEffect(() => {
    const currentDiceCount = latestDiceRolls?.length || 0;
    
    // If there are new dice rolls and user is NOT on dice tab, show red dot
    if (currentDiceCount > previousDiceCountRef.current && activeTab !== 'dice') {
      console.log('[GameSidebar] 检测到新骰子事件,显示红点提示');
      setHasUnreadDice(true);
    }
    
    // Update previous count
    previousDiceCountRef.current = currentDiceCount;
  }, [latestDiceRolls, activeTab]);

  // Monitor clues for unread notification
  useEffect(() => {
    const currentCluesCount = gameState?.discoveredClues?.length || 0;
    
    // If there are new clues and user is NOT on clues tab, show red dot
    if (currentCluesCount > previousCluesCountRef.current && activeTab !== 'clues') {
      console.log('[GameSidebar] 检测到新线索,显示红点提示');
      setHasUnreadClues(true);
    }
    
    // Update previous count
    previousCluesCountRef.current = currentCluesCount;
  }, [gameState?.discoveredClues, activeTab]);

  // Clear unread notification when user switches to dice tab
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    if (tab === 'dice') {
      console.log('[GameSidebar] 用户切换到骰子标签页,清除红点提示');
      setHasUnreadDice(false);
    }
    if (tab === 'clues') {
      console.log('[GameSidebar] 用户切换到线索标签页,清除红点提示');
      setHasUnreadClues(false);
    }
  };

  return (
    <div className="game-sidebar">
      {/* Tab Headers */}
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${activeTab === 'status' ? 'active' : ''}`}
          onClick={() => handleTabChange('status')}
        >
          角色状态
        </button>
        <button
          className={`sidebar-tab ${activeTab === 'clues' ? 'active' : ''}`}
          onClick={() => handleTabChange('clues')}
          style={{ position: 'relative' }}
        >
          发现的线索
          {hasUnreadClues && (
            <span
              className="notification-dot"
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                width: '8px',
                height: '8px',
                backgroundColor: '#ff4444',
                borderRadius: '50%',
                border: '2px solid #f5f1e8',
                boxShadow: '0 0 6px rgba(255, 68, 68, 0.9)',
              }}
              title="有新的线索发现"
            />
          )}
        </button>
        <button
          className={`sidebar-tab ${activeTab === 'dice' ? 'active' : ''}`}
          onClick={() => handleTabChange('dice')}
          style={{ position: 'relative' }}
        >
          骰子记录
          {hasUnreadDice && (
            <span
              className="notification-dot"
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                width: '8px',
                height: '8px',
                backgroundColor: '#ff4444',
                borderRadius: '50%',
                border: '2px solid #f5f1e8',
                boxShadow: '0 0 6px rgba(255, 68, 68, 0.9)',
              }}
              title="有新的骰子记录"
            />
          )}
        </button>
      </div>

      {/* Tab Content */}
      <div className="sidebar-content">
        {activeTab === 'status' && (
          <div className="tab-panel status-panel">
            {loading ? (
              <p className="empty-state">加载中...</p>
            ) : error ? (
              <p className="empty-state" style={{ color: '#c41e3a' }}>加载失败: {error}</p>
            ) : gameState ? (
              <>
                <div className="status-section">
                  <h3>基础属性</h3>
                  <div className="status-grid">
                    <div className="status-item">
                      <span className="status-label">生命:</span>
                      <span className="status-value">
                        {gameState.playerCharacter.status.hp}/{gameState.playerCharacter.status.maxHp}
                      </span>
                    </div>
                    <div className="status-item">
                      <span className="status-label">魔法:</span>
                      <span className="status-value">
                        {gameState.playerCharacter.status.mp || 0}/{gameState.playerCharacter.status.mp || 0}
                      </span>
                    </div>
                    <div className="status-item">
                      <span className="status-label">理智:</span>
                      <span className="status-value">
                        {gameState.playerCharacter.status.sanity}/{gameState.playerCharacter.status.maxSanity}
                      </span>
                    </div>
                    <div className="status-item">
                      <span className="status-label">幸运:</span>
                      <span className="status-value">{gameState.playerCharacter.status.luck}</span>
                    </div>
                  </div>
                </div>

                <div className="status-section">
                  <h3>当前状态</h3>
                  <div className="status-list">
                    <div className="status-item-full">
                      <span className="status-label">位置:</span>
                      <span className="status-value">
                        {gameState.currentScenario?.location || '未知'}
                      </span>
                    </div>
                    <div className="status-item-full">
                      <span className="status-label">时间:</span>
                      <span className="status-value">{gameState.timeOfDay || '--'}</span>
                    </div>
                    <div className="status-item-full">
                      <span className="status-label">天数:</span>
                      <span className="status-value">第 {gameState.gameDay} 天</span>
                    </div>
                  </div>
                </div>

                <div className="status-section">
                  <h3>状态效果</h3>
                  <div className="status-effects">
                    {gameState.playerCharacter.status.conditions.length > 0 ? (
                      <ul style={{ margin: 0, paddingLeft: '20px' }}>
                        {gameState.playerCharacter.status.conditions.map((condition, idx) => (
                          <li key={idx}>{condition}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="empty-state">无状态效果</p>
                    )}
                  </div>
                </div>

                <div className="status-section">
                  <h3>技能</h3>
                  <div className="skills-grid">
                    {gameState.playerCharacter.skills && Object.keys(gameState.playerCharacter.skills).length > 0 ? (
                      Object.entries(gameState.playerCharacter.skills)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([skillName, skillValue]) => {
                          const isOccupationalSkill = occupationalSkills.includes(skillName);
                          return (
                            <div
                              key={skillName}
                              className={`skill-item ${isOccupationalSkill ? 'occupational' : ''}`}
                            >
                              <span className="skill-name">{getSkillNameCn(skillName)}</span>
                              <span className="skill-value">{skillValue}</span>
                            </div>
                          );
                        })
                    ) : (
                      <p className="empty-state">无技能数据</p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <p className="empty-state">无数据</p>
            )}
          </div>
        )}

        {activeTab === 'clues' && (
          <div className="tab-panel clues-panel">
            {loading ? (
              <p className="empty-state">加载中...</p>
            ) : error ? (
              <p className="empty-state" style={{ color: '#c41e3a' }}>加载失败: {error}</p>
            ) : gameState ? (
              <div className="clues-section">
                <h3>重要线索</h3>
                <div className="clues-list">
                  {gameState.discoveredClues.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {gameState.discoveredClues.map((clue, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: '10px',
                            backgroundColor: '#fff',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                          }}
                        >
                          <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                            {clue.sourceName}
                            <span
                              style={{
                                marginLeft: '8px',
                                fontSize: '0.8rem',
                                color: '#666',
                                fontWeight: 'normal',
                              }}
                            >
                              ({clue.type === 'scenario' ? '场景线索' : clue.type === 'npc' ? 'NPC线索' : '秘密'})
                            </span>
                          </div>
                          <div style={{ fontSize: '0.9rem', color: '#333', marginBottom: '5px' }}>
                            {clue.text}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#999' }}>
                            发现者: {clue.discoveredBy}
                            {clue.method && ` | 方式: ${clue.method}`}
                            {clue.difficulty && ` | 难度: ${clue.difficulty}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-state">暂无线索</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="empty-state">无数据</p>
            )}
          </div>
        )}

        {activeTab === 'dice' && (
          <div className="tab-panel dice-panel">
            <div className="dice-section">
              <h3>最近骰子记录</h3>
              {(() => {
                console.log('[GameSidebar] 骰子面板渲染 - latestDiceRolls:', latestDiceRolls);
                if (latestDiceRolls && latestDiceRolls.length > 0) {
                  const parsedRolls = parseDiceRolls(latestDiceRolls);
                  console.log('[GameSidebar] 解析后的骰子数据:', parsedRolls);
                  return (
                    <div style={{ marginTop: '10px' }}>
                      <DiceRollDisplay rolls={parsedRolls} />
                    </div>
                  );
                } else {
                  console.log('[GameSidebar] 无骰子数据显示空状态');
                  return <p className="empty-state">暂无骰子记录</p>;
                }
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
