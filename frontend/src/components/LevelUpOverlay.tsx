// src/components/LevelUpOverlay.tsx
import React from 'react';

interface LevelUpOverlayProps {
  newLevel: number;
  onClose: () => void;
}

export const LevelUpOverlay: React.FC<LevelUpOverlayProps> = ({ newLevel, onClose }) => {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm z-50">
      <div className="bg-purpleAccent text-white p-6 rounded-lg shadow-glow animate-level-up" onAnimationEnd={onClose}>
        <h2 className="text-3xl font-bold mb-2">LEVEL UP!</h2>
        <p className="text-xl">Level {newLevel}</p>
        <p className="mt-2">Your character is getting stronger.</p>
      </div>
    </div>
  );
};

// Ensure Tailwind config includes 'level-up' animation (already present).
