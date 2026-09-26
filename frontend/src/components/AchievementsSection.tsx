import React from 'react';
import type { AchievementItem } from '../hooks/useRewards';

interface Props {
  achievements: AchievementItem[];
}

export const AchievementsSection: React.FC<Props> = ({ achievements }) => {
  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur mb-8">
      <div className="flex items-center justify-between pb-5 border-b border-slate-800 mb-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>🏆</span> Achievements & Trophies
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Real milestone accomplishments earned through your journey.
          </p>
        </div>
        <div className="text-xs font-semibold text-indigo-400 bg-indigo-950/60 border border-indigo-800 px-3 py-1.5 rounded-lg">
          {achievements.filter((a) => a.unlocked).length} / {achievements.length} Unlocked
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {achievements.map((ach) => (
          <div
            key={ach.key}
            className={`p-4 rounded-xl border transition-all flex items-start gap-4 ${
              ach.unlocked
                ? 'bg-slate-800/80 border-indigo-500/60 shadow-md'
                : 'bg-slate-900/50 border-slate-800 opacity-60'
            }`}
          >
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 ${
                ach.unlocked
                  ? 'bg-indigo-900/50 border border-indigo-400 shadow'
                  : 'bg-slate-800 border border-slate-700 grayscale'
              }`}
            >
              {ach.icon}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <h3 className={`text-sm font-bold truncate ${ach.unlocked ? 'text-white' : 'text-slate-400'}`}>
                  {ach.name}
                </h3>
                {ach.unlocked ? (
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-700/60 px-2 py-0.5 rounded-full flex-shrink-0">
                    ✓ Unlocked
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full flex-shrink-0">
                    🔒 Locked
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-400 mt-1">{ach.description}</p>

              <div className="flex flex-wrap gap-2 mt-3 text-[11px] font-medium">
                {ach.rewardCoins > 0 && (
                  <span className="text-amber-400 bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded-md">
                    +{ach.rewardCoins} Coins
                  </span>
                )}
                {ach.rewardTitle && (
                  <span className="text-indigo-300 bg-indigo-950/40 border border-indigo-800/40 px-2 py-0.5 rounded-md">
                    Title: {ach.rewardTitle}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
