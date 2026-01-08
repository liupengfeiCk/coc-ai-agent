import React, { useState } from "react";

interface HomeProps {
  onCreate: () => void;
  onStartGame: () => void;
  onContinueGame: () => void;
  onImportModule: () => void;
}

const Homes: React.FC<HomeProps> = ({ onCreate, onStartGame, onContinueGame, onImportModule }) => {
  const handleStartGame = () => {
    // Just trigger the character selector
    onStartGame();
  };

  return (
    <div className="home">
      <div className="hero">
        <div>
          <p className="eyebrow">克苏鲁的呼唤 · 多智能体系统</p>
          <h1>CoC AI 守秘人</h1>
          <p className="lede">
            管理调查员,让编排者、记忆、行动和守秘人智能体运行你的冒险模组。
          </p>
        </div>

        <div className="home-actions">
          <button className="primary" onClick={handleStartGame}>
            🎮 新游戏
          </button>
          <button className="secondary" onClick={onContinueGame}>
            📂 继续游戏
          </button>
          <button onClick={onCreate}>
            创建角色
          </button>
          <button onClick={onImportModule}>
            📦 导入模组
          </button>
        </div>
      </div>
    </div>
  );
};

export default Homes;
