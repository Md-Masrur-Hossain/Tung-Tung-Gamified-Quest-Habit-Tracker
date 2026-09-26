// src/components/ProgressBar.tsx
import React from 'react';

interface ProgressBarProps {
  totalXP: number;
  level: number;
  xpForNext: number;
  progressPercent: number;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ totalXP, level, xpForNext, progressPercent }) => {
  return (
    <div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden">
      <div
        className="bg-tealAccent h-4 transition-all duration-700"
        style={{ width: `${progressPercent}%` }}
      />
      <span className="hidden">{totalXP}-{level}-{xpForNext}</span>
    </div>
  );
};

// Tailwind: ensure transition-width is enabled via plugin (already default).
