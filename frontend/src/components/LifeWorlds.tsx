// src/components/LifeWorlds.tsx
import React from 'react';
import { allWorlds } from '../types/worlds';

export const LifeWorlds: React.FC = () => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {allWorlds.map((world) => (
        <div
          key={world}
          className="p-4 bg-gray-800 rounded-lg shadow-lg hover:shadow-xl transition-shadow duration-300 text-center"
        >
          <h3 className="text-lg font-bold text-white">{world}</h3>
          {/* Placeholder for world-specific stats */}
          <p className="text-sm text-gray-400 mt-2">No quests yet</p>
        </div>
      ))}
    </div>
  );
};
