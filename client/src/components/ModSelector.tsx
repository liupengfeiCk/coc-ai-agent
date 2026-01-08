import React, { useEffect, useState } from 'react';

export interface Mod {
  name: string;
  path: string;
}

export interface ModSelectorProps {
  apiBaseUrl?: string;
  onSelectMod: (modName: string) => void;
  onCancel: () => void;
  onImportModule?: (modName: string) => Promise<void>;
}

export function ModSelector({ 
  apiBaseUrl = 'http://localhost:3000/api',
  onSelectMod,
  onCancel,
  onImportModule
}: ModSelectorProps) {
  const [mods, setMods] = useState<Mod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMod, setSelectedMod] = useState<string>('');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ stage: string; message: string } | null>(null);

  useEffect(() => {
    fetchMods();
  }, []);

  const fetchMods = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${apiBaseUrl}/mods`);
      const data = await response.json();

      if (response.ok && data.success) {
        setMods(data.mods || []);
        if (data.mods && data.mods.length > 0) {
          setSelectedMod(data.mods[0].name);
        }
      } else {
        setError(data.error || 'Failed to load mods');
      }
    } catch (err) {
      console.error('Error fetching mods:', err);
      setError('Network error, unable to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = () => {
    if (selectedMod) {
      onSelectMod(selectedMod);
    }
  };

  const handleImport = async () => {
    if (!selectedMod) return;
    
    try {
      setImporting(true);
      setImportProgress({ stage: 'Importing', message: `正在导入模组 ${selectedMod} 到模板表...` });

      const response = await fetch(`${apiBaseUrl}/modules/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleName: selectedMod, forceReimport: true })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setImportProgress({ 
          stage: 'Complete', 
          message: `✅ 成功导入 ${data.scenarioCount} 个场景和 ${data.npcCount} 个NPC` 
        });
        
        // Call callback if provided
        if (onImportModule) {
          await onImportModule(selectedMod);
        }

        setTimeout(() => {
          setImporting(false);
          setImportProgress(null);
        }, 2000);
      } else {
        throw new Error(data.error || '导入失败');
      }
    } catch (err) {
      console.error('Error importing module:', err);
      setError(`导入模组失败: ${(err as Error).message}`);
      setImporting(false);
      setImportProgress(null);
    }
  };

  if (loading) {
    return (
      <>
        <div className="mod-selector-overlay">
          <div className="mod-selector-modal">
            <div className="modal-header">
              <h2>选择模组</h2>
            </div>
            <div className="modal-content">
              <div className="loading-state">
                <p>加载模组列表中...</p>
              </div>
            </div>
          </div>
        </div>
        <style>{`
          .mod-selector-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: 20px;
          }
          .mod-selector-modal {
            background: var(--paper, #f5f1e8);
            border: 3px solid var(--border, #3d2f1f);
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
            max-width: 600px;
            width: 100%;
            border-radius: 4px;
          }
          .loading-state {
            text-align: center;
            padding: 40px 20px;
          }
        `}</style>
      </>
    );
  }

  if (error) {
    return (
      <>
        <div className="mod-selector-overlay">
          <div className="mod-selector-modal">
            <div className="modal-header">
              <h2>选择模组</h2>
              <button onClick={onCancel} className="close-button">×</button>
            </div>
            <div className="modal-content">
              <div className="error-state">
                <div style={{ color: '#721c24', padding: '12px', backgroundColor: '#f8d7da', borderRadius: '4px', marginBottom: '16px' }}>
                  {error}
                </div>
                <div className="modal-actions">
                  <button onClick={onCancel} className="secondary">取消</button>
                  <button onClick={fetchMods} className="primary">重试</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <style>{`
          .mod-selector-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: 20px;
          }
          .mod-selector-modal {
            background: var(--paper, #f5f1e8);
            border: 3px solid var(--border, #3d2f1f);
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
            max-width: 600px;
            width: 100%;
            border-radius: 4px;
          }
          .error-state {
            text-align: center;
            padding: 20px;
          }
        `}</style>
      </>
    );
  }

  if (mods.length === 0) {
    return (
      <>
        <div className="mod-selector-overlay">
          <div className="mod-selector-modal">
            <div className="modal-header">
              <h2>选择模组</h2>
              <button onClick={onCancel} className="close-button">×</button>
            </div>
            <div className="modal-content">
              <div className="empty-state">
                <p>未找到可用的模组。请确保 <code>data/Mods/</code> 目录下有模组文件夹。</p>
                <button onClick={onCancel} className="secondary" style={{ marginTop: '16px' }}>返回</button>
              </div>
            </div>
          </div>
        </div>
        <style>{`
          .mod-selector-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: 20px;
          }
          .mod-selector-modal {
            background: var(--paper, #f5f1e8);
            border: 3px solid var(--border, #3d2f1f);
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
            max-width: 600px;
            width: 100%;
            border-radius: 4px;
          }
          .empty-state {
            text-align: center;
            padding: 40px 20px;
          }
        `}</style>
      </>
    );
  }

  return (
    <>
      <div className="mod-selector-overlay">
        <div className="mod-selector-modal">
          <div className="modal-header">
            <h2>选择模组</h2>
            <button onClick={onCancel} className="close-button">×</button>
          </div>
          <div className="modal-content">
            <p style={{ marginBottom: '20px', color: 'var(--ink)' }}>请选择要加载的模组</p>
            <div className="mod-list">
              {mods.map((mod) => (
                <div
                  key={mod.name}
                  className={`mod-item ${selectedMod === mod.name ? 'selected' : ''}`}
                  onClick={() => setSelectedMod(mod.name)}
                >
                  <input
                    type="radio"
                    name="mod"
                    value={mod.name}
                    checked={selectedMod === mod.name}
                    onChange={(e) => setSelectedMod(e.target.value)}
                    style={{ marginRight: '12px' }}
                  />
                  <span className="mod-name">{mod.name}</span>
                  {selectedMod === mod.name && (
                    <div className="selected-indicator">✓</div>
                  )}
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button onClick={onCancel} className="secondary">取消</button>
              <button 
                onClick={handleSelect} 
                className="primary"
                disabled={!selectedMod}
              >
                确认选择
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Import Progress Modal */}
      {importing && importProgress && (
        <div style={{
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
        }}>
          <div style={{
            backgroundColor: '#f5f1e8',
            padding: '40px',
            borderRadius: '8px',
            maxWidth: '400px',
            width: '90%',
            border: '3px solid #8b7355',
            textAlign: 'center',
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px', color: '#3d2817' }}>
              {importProgress.stage}
            </h3>
            <p style={{ color: '#5a4a3a', fontSize: '1rem' }}>
              {importProgress.message}
            </p>
            {importProgress.stage === 'Importing' && (
              <div style={{ marginTop: '20px' }}>
                <div className="spinner"></div>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        .mod-selector-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }

        .mod-selector-modal {
          background: var(--paper, #f5f1e8);
          border: 3px solid var(--border, #3d2f1f);
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
          max-width: 600px;
          width: 100%;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          border-radius: 4px;
        }

        .mod-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 24px;
        }

        .mod-item {
          display: flex;
          align-items: center;
          padding: 16px;
          border: 2px solid var(--border, #3d2f1f);
          background: var(--paper, #f5f1e8);
          cursor: pointer;
          transition: all 0.2s;
          border-radius: 4px;
          position: relative;
        }

        .mod-item:hover {
          background: var(--header-bg, #d4c4b0);
          border-color: var(--accent, #8b7355);
        }

        .mod-item.selected {
          background: var(--header-bg, #d4c4b0);
          border-color: var(--accent, #8b7355);
          box-shadow: 0 0 0 2px var(--accent, #8b7355);
        }

        .mod-name {
          flex: 1;
          font-size: 1.1rem;
          color: var(--title, #3d2f1f);
          font-weight: 500;
        }

        .selected-indicator {
          color: var(--accent, #8b7355);
          font-size: 1.5rem;
          font-weight: bold;
        }

        .import-button {
          padding: 12px 24px;
          font-size: 1rem;
          font-weight: 600;
          border: 2px solid;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
          color: white;
        }

        .import-button:hover:not(:disabled) {
          opacity: 0.9;
          transform: translateY(-1px);
        }

        .import-button:disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }

        .spinner {
          border: 4px solid #f3f3f3;
          border-top: 4px solid #8b7355;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          animation: spin 1s linear infinite;
          margin: 0 auto;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
