// src/components/StreakBadge.tsx
import React from 'react';
import { useAuth } from '../hooks/useAuth';

interface StreakBadgeProps {
  pulse?: boolean;
}

export const StreakBadge: React.FC<StreakBadgeProps> = ({ pulse = false }) => {
  const { user } = useAuth();
  if (!user) return null;

  const badgeClass = `flex items-center bg-purpleAccent text-white px-3 py-1 rounded-full shadow-glow ${pulse ? 'animate-pulse-slow' : ''}`;

  return (
    <div className={badgeClass} title="Current streak">
      🔥 Streak: {user.currentStreak}
    </div>
  );
};

// Ensure Tailwind config includes 'pulse-slow' animation (already present).
