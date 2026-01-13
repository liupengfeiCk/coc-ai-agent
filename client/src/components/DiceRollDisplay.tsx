import React from 'react';
import { DiceRoll, isCritical } from '../utils/diceParser';
import '../styles/DiceRollDisplay.css';

interface DiceRollDisplayProps {
  rolls: DiceRoll[];
}

export function DiceRollDisplay({ rolls }: DiceRollDisplayProps) {
  if (!rolls || rolls.length === 0) {
    return null;
  }

  return (
    <div className="dice-rolls-container">
      <div className="dice-rolls-header">
        🎲 骰子检定结果 ({rolls.length})
      </div>
      
      {rolls.map((roll, index) => {
        const critical = isCritical(roll);
        
        return (
          <div 
            key={index} 
            className={`dice-roll-card ${roll.skill ? (roll.skill.success ? 'success' : 'failure') : ''} ${critical || ''}`}
          >
            {/* 行为描述头部 */}
            {(roll.actor || roll.action || roll.target) && (
              <div className="dice-action-header" style={{
                padding: '8px 12px',
                backgroundColor: '#f8f9fa',
                borderBottom: '2px solid #dee2e6',
                marginBottom: '8px',
                fontSize: '0.95rem',
                fontWeight: 'bold',
                color: '#495057',
              }}>
                {roll.actor && <span style={{ color: '#007bff' }}>{roll.actor}</span>}
                {roll.action && <span style={{ margin: '0 4px' }}>{roll.action}</span>}
                {roll.target && (
                  <>
                    <span style={{ margin: '0 4px', color: '#6c757d' }}>→</span>
                    <span style={{ color: '#dc3545' }}>{roll.target}</span>
                  </>
                )}
              </div>
            )}

            {/* 骰子类型和点数 */}
            <div className="dice-roll-header">
              <span className="dice-type">{roll.diceType}</span>
              <span className="dice-result">{roll.result} 点</span>
            </div>

            {/* 技能检定详情 */}
            {roll.skill && (
              <div className="dice-skill-check">
                <span className={`skill-icon ${roll.skill.success ? 'success-icon' : 'failure-icon'}`}>
                  {roll.skill.success ? '✓' : '✗'}
                </span>
                <span className="skill-name">{roll.skill.name}</span>
                <span className="skill-value">目标: {roll.skill.value}</span>
                <span className={`skill-result ${roll.skill.success ? 'success-text' : 'failure-text'}`}>
                  {roll.purpose || (roll.skill.success ? '成功' : '失败')}
                </span>
                
                {/* 大成功/大失败标记 */}
                {critical === 'critical_success' && (
                  <span className="critical-badge critical-success">大成功!</span>
                )}
                {critical === 'fumble' && (
                  <span className="critical-badge fumble">大失败!</span>
                )}
              </div>
            )}

            {/* 伤害计算详情 */}
            {roll.modifier !== undefined && roll.total !== undefined && (
              <div className="dice-damage-calc">
                <span className="damage-formula">
                  {roll.result} {roll.modifier >= 0 ? '+' : ''} {roll.modifier} = <strong>{roll.total}</strong>
                </span>
                {roll.purpose && (
                  <span className="damage-purpose">({roll.purpose})</span>
                )}
              </div>
            )}

            {/* 简单用途 (没有技能检定和伤害计算时) */}
            {roll.purpose && roll.modifier === undefined && !roll.skill && (
              <div className="dice-purpose">
                {roll.purpose}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
