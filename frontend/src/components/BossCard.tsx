import React, { useState } from 'react';
import { completeBossAction } from '../lib/api';
import { Toast } from './Toast';
// import { ProgressBar } from './ProgressBar';

interface ActionProps {
  action: {
    _id: string;
    title: string;
    damage: number;
    xpReward?: number;
    completed: boolean;
  };
  bossId: string;
  onCompleted: () => void;
}

const ActionButton: React.FC<ActionProps> = ({ action, bossId, onCompleted }) => {
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastError, setToastError] = useState<string | null>(null);
  const handleClose = () => setToastMessage(null);
  const handleErrorClose = () => setToastError(null);
  const handleClick = async () => {
    if (action.completed) return;
    setLoading(true);
    try {
      await completeBossAction(bossId, action._id);
      setToastMessage(`-${action.damage} HP`);
      onCompleted();
    } catch (err: any) {
      setToastError(err.message || 'Failed');
    } finally {
      setLoading(false);
    }
  };
  // replace original handleClick
  return (
    <>
      <button
        className="boss-action-btn"
        disabled={action.completed || loading}
        onClick={handleClick}
      >
        {action.completed ? 'Done' : action.title}
      </button>
      {toastMessage && <Toast message={toastMessage} onClose={handleClose} />}
      {toastError && <Toast message={toastError} onClose={handleErrorClose} />}
    </>
  );
};

interface BossCardProps {
  boss: {
    _id: string;
    title: string;
    description?: string;
    category: string;
    maxHp: number;
    currentHp: number;
    status: 'ACTIVE' | 'DEFEATED';
    actions: any[];
  };
  refresh: () => void;
}

export const BossCard: React.FC<BossCardProps> = ({ boss, refresh }) => {
  const hpPercent = (boss.currentHp / boss.maxHp) * 100;
  const handleActionComplete = () => {
    refresh();
  };

  return (
    <div className={`boss-card ${boss.status === 'DEFEATED' ? 'defeated' : ''}`}>
      <h3>{boss.title}</h3>
      {boss.description && <p>{boss.description}</p>}
      <div className="hp-bar">
        <div
          className="bg-tealAccent h-4 transition-all duration-700"
          style={{ width: `${hpPercent}%` }}
        />
        <span>{boss.currentHp} / {boss.maxHp} HP</span>
      </div>

      {boss.status === 'DEFEATED' && (
        <div className="defeat-overlay">BOSS DEFEATED! ⚔️🔥</div>
      )}
      <div className="actions">
        {boss.actions.map((a) => (
          <ActionButton key={a._id} action={a} bossId={boss._id} onCompleted={handleActionComplete} />
        ))}
      </div>
    </div>
  );
};
