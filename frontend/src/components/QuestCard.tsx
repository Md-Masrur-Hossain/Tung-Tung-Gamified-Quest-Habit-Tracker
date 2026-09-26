// src/components/QuestCard.tsx
import React, { useState } from 'react';
import api from '../lib/api';

import { useAuth } from '../hooks/useAuth';
import { Toast } from './Toast';

interface Quest {
  _id: string;
  title: string;
  description?: string;
  type: string;
  category: string;
  difficulty: string;
  xpReward: number;
  status: 'pending' | 'completed';
  deadline?: string;
}

export const QuestCard: React.FC<{ quest: Quest; onComplete?: () => void }> = ({ quest, onComplete }) => {
  const { user, refreshUser } = useAuth();

  const [isCompleting, setIsCompleting] = useState(false);
  const [completed, setCompleted] = useState(quest.status === 'completed');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [xpAnim, setXpAnim] = useState<number | null>(null);
  const [rewardFeedback, setRewardFeedback] = useState<{ xp: number; coins: number; streak: number } | null>(null);

  const handleComplete = async () => {
    if (!user || isCompleting) return;
    setIsCompleting(true);
    setRewardFeedback(null);
    const xpBefore = user.totalXP || 0;
    try {
      const resp = await api.post(`/api/quests/${quest._id}/complete`);
      const { reaction, quest: updatedQuest, progression } = resp.data;
      const updatedUser = await refreshUser();
      setCompleted(true);
      const actualXp = Math.max((progression?.totalXP || 0) - xpBefore, updatedQuest.xpReward || 0);
      const coinsAfter = Number((updatedUser as any)?.coins ?? 0) || 0;
      const coinsBefore = Number((user as any)?.coins ?? 0) || 0;
      setXpAnim(actualXp);
      setRewardFeedback({
        xp: actualXp,
        coins: Math.max(coinsAfter - coinsBefore, 0),
        streak: Number(updatedUser?.currentStreak ?? 0) || 0,
      });
      if (reaction) setToastMessage(reaction);
      if (onComplete) onComplete();
    } catch (err: any) {
      setToastMessage(err.response?.data?.message || err.message || 'Error completing quest');
    } finally {
      setIsCompleting(false);
    }
  };

  return (
    <div className="bg-gray-800 p-4 rounded-lg shadow-glow mb-4 relative">
      <h3 className="text-xl font-semibold text-tealAccent">{quest.title}</h3>
      {quest.description && <p className="text-gray-300 mt-1">{quest.description}</p>}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm text-purpleAccent">XP: {quest.xpReward}</span>
        {completed ? (
          <span className="text-green-400 font-bold">Completed</span>
        ) : (
          <button
            onClick={handleComplete}
            disabled={isCompleting}
            className={`px-3 py-1 rounded ${isCompleting ? 'bg-gray-600' : 'bg-tealAccent hover:bg-teal-600'} transition`}
          >
            {isCompleting ? 'Completing...' : 'Complete'}
          </button>
        )}
      </div>
      {/* XP floating animation */}
      {xpAnim !== null && (
        <div className="absolute right-4 top-2 text-green-400 animate-float-up">+{xpAnim} XP</div>
      )}
      {rewardFeedback && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold" aria-live="polite">
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-emerald-300">+{rewardFeedback.xp} XP</span>
          <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-amber-300">+{rewardFeedback.coins} coins</span>
          <span className="rounded-full bg-orange-500/15 px-2.5 py-1 text-orange-300">{rewardFeedback.streak} day streak</span>
        </div>
      )}
      {/* Toast for reaction */}
      {toastMessage && (
        <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
      )}
    </div>
  );
};

// Ensure Tailwind config includes 'float-up' animation (already present).
