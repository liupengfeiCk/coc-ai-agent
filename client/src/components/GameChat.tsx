/**
 * GameChat Component - Main game interaction interface
 * 
 * Handles sending messages to the game and displaying conversation history.
 */

import { useState, useEffect, useRef } from 'react';
import { useTurnPolling } from '../hooks/useTurnPolling';
// DiceRollDisplay和parseDiceRolls已移到GameSidebar中使用

interface Message {
  role: 'character' | 'keeper';
  content: string;
  timestamp: string;
  turnNumber: number;
  // diceRolls字段已删除 - 骰子数据通过onDiceRollsUpdate传递给侧边栏
}

interface GameChatProps {
  sessionId: string;
  apiBaseUrl?: string;
  characterName?: string;
  moduleIntroduction?: { introduction: string; moduleNotes: string } | null;
  initialMessages?: Message[];
  onNarrativeComplete?: () => void;
  onDiceRollsUpdate?: (diceRolls: string[]) => void; // Callback to update dice rolls
}

export function GameChat({ sessionId, apiBaseUrl = 'http://localhost:3000/api', characterName = 'Investigator', moduleIntroduction, initialMessages, onNarrativeComplete, onDiceRollsUpdate }: GameChatProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages || []);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const processedTurnIdsRef = useRef<Set<string>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const { turn, isPolling, error, startPolling } = useTurnPolling(apiBaseUrl);

  // WebSocket connection for progression checking
  useEffect(() => {
    if (!sessionId) return;

    // Get WebSocket URL from apiBaseUrl
    const wsUrl = apiBaseUrl.replace('/api', '').replace('http://', 'ws://').replace('https://', 'wss://');
    const wsPath = `${wsUrl}/ws?sessionId=${sessionId}`;

    console.log(`[WebSocket] Connecting to ${wsPath}`);

    const connectWebSocket = () => {
      try {
        const ws = new WebSocket(wsPath);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('[WebSocket] Connected');
          // Clear any reconnect timeout
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            console.log('[WebSocket] Received message:', message);

            if (message.type === 'connected') {
              console.log(`[WebSocket] Connection confirmed for session ${message.sessionId}`);
            } else if (message.type === 'simulate_triggered') {
              console.log('[WebSocket] Simulate triggered:', message);
              // Handle simulated narrative
              if (message.keeperNarrative) {
                // Find the latest turn number and add 1 for the simulated turn
                const latestTurnNumber = messages.length > 0 
                  ? Math.max(...messages.map(m => m.turnNumber))
                  : 0;
                
                setMessages(prev => {
                  // Check if this turn already exists
                  const existingTurn = prev.find(m => m.turnNumber === latestTurnNumber + 1);
                  if (existingTurn) return prev;

                  return [
                    ...prev,
                    {
                      role: 'keeper',
                      content: message.keeperNarrative,
                      timestamp: message.timestamp || new Date().toISOString(),
                      turnNumber: latestTurnNumber + 1,
                    }
                  ];
                });

                // Trigger sidebar refresh
                if (onNarrativeComplete) {
                  onNarrativeComplete();
                }
              }
            } else if (message.type === 'pong') {
              // Heartbeat response
              console.log('[WebSocket] Heartbeat received');
            } else if (message.type === 'progression_check_result') {
              console.log('[WebSocket] Progression check result:', message.triggered);
            } else if (message.type === 'error') {
              console.error('[WebSocket] Error:', message.message || message.error);
            }
          } catch (error) {
            console.error('[WebSocket] Error parsing message:', error);
          }
        };

        ws.onerror = (error) => {
          console.error('[WebSocket] Error:', error);
        };

        ws.onclose = () => {
          console.log('[WebSocket] Connection closed, attempting to reconnect in 5 seconds...');
          wsRef.current = null;
          
          // Reconnect after 5 seconds
          reconnectTimeoutRef.current = window.setTimeout(() => {
            connectWebSocket();
          }, 5000);
        };
      } catch (error) {
        console.error('[WebSocket] Failed to connect:', error);
        // Retry connection after 5 seconds
        reconnectTimeoutRef.current = window.setTimeout(() => {
          connectWebSocket();
        }, 5000);
      }
    };

    connectWebSocket();

    // Cleanup on unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current !== null) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [sessionId, apiBaseUrl, messages, onNarrativeComplete]);

  // Send heartbeat ping every 60 seconds
  useEffect(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const heartbeatInterval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
        console.log('[WebSocket] Sent heartbeat ping');
      }
    }, 60000); // Send ping every 60 seconds

    return () => clearInterval(heartbeatInterval);
  }, [sessionId]);

  // Load conversation history on mount or when sessionId changes
  useEffect(() => {
    // If initialMessages are provided, use them; otherwise load from API
    if (initialMessages && initialMessages.length > 0) {
      setMessages(initialMessages);
      // Mark all existing turnNumbers as processed
      const existingTurnNumbers = new Set(initialMessages.map(msg => msg.turnNumber));
      processedTurnIdsRef.current = new Set(Array.from(existingTurnNumbers).map(n => `turn-${n}`));
    } else if (sessionId) {
      loadConversationHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Update messages when initialMessages prop changes (e.g., when loading checkpoint)
  useEffect(() => {
    if (initialMessages && initialMessages.length > 0) {
      setMessages(initialMessages);
      // Mark all existing turnNumbers as processed
      const existingTurnNumbers = new Set(initialMessages.map(msg => msg.turnNumber));
      processedTurnIdsRef.current = new Set(Array.from(existingTurnNumbers).map(n => `turn-${n}`));
    } else if (!initialMessages && sessionId) {
      // If initialMessages is cleared, reload from API
      loadConversationHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessages]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Update messages when turn completes
  useEffect(() => {
    if (turn && turn.status === 'completed') {
      const turnKey = turn.turnId || `turn-${turn.turnNumber}`;
      
      // Check if we've already processed this turn
      if (processedTurnIdsRef.current.has(turnKey)) {
        console.log(`[GameChat] Turn ${turnKey} already processed, skipping...`);
        return;
      }
      
      // Mark as processed immediately to prevent race conditions
      processedTurnIdsRef.current.add(turnKey);
      
      // Extract dice rolls (only once per turn)
      if (turn.actionResults && Array.isArray(turn.actionResults)) {
        const diceRolls: string[] = [];
        turn.actionResults.forEach((result: any) => {
          if (result.diceRolls && Array.isArray(result.diceRolls)) {
            diceRolls.push(...result.diceRolls);
          }
        });

        if (diceRolls.length > 0 && onDiceRollsUpdate) {
          onDiceRollsUpdate(diceRolls);
        }
      }

      // Log turn details for debugging
      console.log(`[GameChat] Processing completed turn:`, {
        turnId: turn.turnId,
        turnNumber: turn.turnNumber,
        hasKeeperNarrative: !!turn.keeperNarrative,
        keeperNarrativeLength: turn.keeperNarrative?.length || 0,
        characterInput: turn.characterInput?.substring(0, 50) + '...',
      });

      // Add both character input and keeper response
      setMessages(prev => {
        // Double-check to avoid duplicates in case of race conditions
        const existingTurnNumbers = new Set(prev.map(msg => msg.turnNumber));
        if (existingTurnNumbers.has(turn.turnNumber)) {
          console.log(`[GameChat] Turn ${turn.turnNumber} already exists in messages, skipping...`);
          return prev;
        }

        const newMessages: Message[] = [];
        
        // Skip character input for simulated queries (only show user input)
        if (turn.characterInput && !turn.isSimulated) {
          newMessages.push({
            role: 'character',
            content: turn.characterInput,
            timestamp: turn.startedAt,
            turnNumber: turn.turnNumber,
          });
        }

        // Only add keeper message if narrative exists (show for both real and simulated turns)
        if (turn.keeperNarrative) {

          // 消息中不再保存diceRolls,只在侧边栏显示
          newMessages.push({
            role: 'keeper',
            content: turn.keeperNarrative,
            timestamp: turn.completedAt || turn.startedAt,
            turnNumber: turn.turnNumber,
            // diceRolls字段已移除,改为通过onDiceRollsUpdate传递给侧边栏
          });
        } else {
          console.warn(`[GameChat] Turn ${turn.turnNumber} completed but keeperNarrative is empty`);
        }

        return [...prev, ...newMessages];
      });
      setIsSending(false);

      // Trigger sidebar refresh when narrative is complete
      if (onNarrativeComplete) {
        onNarrativeComplete();
      }
    } else if (turn && turn.status === 'error') {
      // Handle error case
      console.error(`[GameChat] Turn ${turn.turnId || turn.turnNumber} failed:`, turn.errorMessage);
      setIsSending(false);
    }
  }, [turn, onNarrativeComplete, onDiceRollsUpdate]);

  const loadConversationHistory = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/sessions/${sessionId}/conversation`);
      const data = await response.json();

      if (data.success && data.conversation) {
        setMessages(data.conversation);
        // Mark all existing turnNumbers as processed
        const existingTurnNumbers = new Set(data.conversation.map((msg: Message) => msg.turnNumber));
        processedTurnIdsRef.current = new Set(Array.from(existingTurnNumbers).map(n => `turn-${n}`));
      } else {
        setMessages([]);
        processedTurnIdsRef.current.clear();
      }
    } catch (err) {
      console.error('Failed to load conversation history:', err);
      setMessages([]);
      processedTurnIdsRef.current.clear();
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isSending) return;

    const messageText = inputValue.trim();
    setInputValue('');
    setIsSending(true);

    try {
      // Send message and create turn
      const response = await fetch(`${apiBaseUrl}/turns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: messageText,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to send message');
      }

      // Start polling for turn completion
      startPolling(data.turnId);

    } catch (err) {
      console.error('Failed to send message:', err);
      setIsSending(false);
      alert('Failed to send message: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSaveCheckpoint = async () => {
    if (isSaving) return;

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch(`${apiBaseUrl}/checkpoints/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to save checkpoint');
      }

      setSaveMessage(`✓ ${data.message}: ${data.checkpointName}`);
      
      // Clear message after 3 seconds
      setTimeout(() => {
        setSaveMessage(null);
      }, 3000);
    } catch (err) {
      console.error('Failed to save checkpoint:', err);
      setSaveMessage('Failed to save: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  // 测试骰子显示的函数
  const handleTestDiceDisplay = () => {
    // 使用完整格式,区分执行者和目标
    const testDiceRolls = [
      '调查员 侦查检定: 1d100=1 (目标70) → 大成功',
      '调查员 对 藤蔓怪物 进行 攻击: 1d100=35 (斗殴 71) → 成功',
      '藤蔓怪物 对 调查员 进行 攻击: 1d100=45 (藤蔓缠绕 60) → 成功',
      '调查员 闪避检定: 1d100=88 (目标50) → 失败',
      '调查员 对 藤蔓怪物 造成伤害: 1d6+2=4+2=6',
      '藤蔓怪物 对 调查员 造成伤害: 1d6+0=3+0=3',
      '调查员 运气检定: 1d100=100 (目标80) → 大失败',
    ];

    const testMessage: Message = {
      role: 'keeper',
      content: '🧪 骰子显示测试 - 展示战斗中的各种检定\n\n包含调查员和怪物的攻击、闪避、伤害等,骰子详情已显示在右侧"骰子记录"标签页中。',
      timestamp: new Date().toISOString(),
      turnNumber: 999,
    };

    setMessages(prev => [...prev, testMessage]);
    
    // Update sidebar with test dice rolls
    console.log('[GameChat] 🎲 测试骰子 - 发送骰子数据到侧边栏:', testDiceRolls);
    if (onDiceRollsUpdate) {
      onDiceRollsUpdate(testDiceRolls);
    } else {
      console.warn('[GameChat] ⚠️ onDiceRollsUpdate回调未定义!');
    }
    
    // 自动滚动到底部
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  return (
    <div className="game-chat-container">
      {/* Session Info Bar */}
      <div className="session-info-bar">
        <div className="session-metadata">
          <span className="session-label">会话ID:</span>
          <span className="session-value">{sessionId}</span>
        </div>
        <div className="character-info">
          <span className="character-label">当前角色:</span>
          <span className="character-value">{characterName}</span>
        </div>
        <div className="save-checkpoint-section">
          <button
            className="save-checkpoint-btn"
            onClick={handleSaveCheckpoint}
            disabled={isSaving}
            title="保存当前游戏进度"
          >
            {isSaving ? '💾 保存中...' : '💾 保存'}
          </button>
          <button
            className="test-dice-btn"
            onClick={handleTestDiceDisplay}
            title="测试骰子显示效果"
            style={{
              marginLeft: '10px',
              padding: '8px 16px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            🎲 测试骰子
          </button>
          {saveMessage && (
            <span className="save-message" style={{ 
              marginLeft: '10px', 
              fontSize: '0.85rem',
              color: saveMessage.startsWith('✓') ? '#155724' : '#721c24'
            }}>
              {saveMessage}
            </span>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="messages-scroll-area">
        {messages.length === 0 && (
          <div className="empty-chat-prompt">
            <p>🎲 欢迎来到克苏鲁的呼唤!</p>
            <p>描述你的调查员行动来开始冒险...</p>
          </div>
        )}

        {messages.map((msg, index) => (
          <div key={index} className={`chat-message ${msg.role}`}>
            <div className="message-meta">
              <span className="sender-name">
                {msg.role === 'character' ? `📝 ${characterName}` : '🎭 Keeper'}
              </span>
              <span className="message-timestamp">
                {new Date(msg.timestamp).toLocaleTimeString('zh-CN', { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </span>
            </div>
            <div className="message-text">{msg.content}</div>
          </div>
        ))}

        {(isSending || isPolling) && (
          <div className="chat-message keeper loading">
            <div className="message-meta">
              <span className="sender-name">🎭 守秘人</span>
            </div>
            <div className="message-text">
              <span className="typing-indicator">
                <span>•</span><span>•</span><span>•</span>
              </span>
              {isPolling ? ' 守秘人正在思考...' : ' 处理你的行动中...'}
            </div>
          </div>
        )}

        {error && (
          <div className="error-message">
            <strong>⚠️ 错误:</strong> {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="chat-input-area">
        <textarea
          className="action-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="我检查桌上的古老书卷..."
          disabled={isSending || isPolling}
          rows={3}
        />
        <button
          className="submit-action-btn"
          onClick={handleSendMessage}
          disabled={!inputValue.trim() || isSending || isPolling}
        >
          {isSending || isPolling ? '⏳ 处理中...' : '🎲 执行行动'}
        </button>
      </div>
    </div>
  );
}