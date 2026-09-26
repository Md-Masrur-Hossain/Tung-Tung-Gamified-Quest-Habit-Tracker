import React, { useState } from 'react';
import type { RewardProfile } from '../hooks/useRewards';

interface Props {
  profile: RewardProfile | null;
  onEquipTitle: (title: string) => Promise<{ success: boolean; error?: string }>;
  companionReaction?: string | null;
}

export const PlayerRewardProfile: React.FC<Props> = ({ profile, onEquipTitle, companionReaction }) => {
  const [isChangingTitle, setIsChangingTitle] = useState(false);

  if (!profile) return null;

  // Visual cues based on equipped cosmetics
  const getAvatarVisual = () => {
    switch (profile.equippedAvatar) {
      case 'avatar_warrior':
        return { icon: '🛡️', bg: 'bg-blue-900/60' };
      case 'avatar_mage':
        return { icon: '🔮', bg: 'bg-purple-900/60' };
      case 'avatar_cyber':
        return { icon: '⚡', bg: 'bg-cyan-900/60' };
      default:
        return { icon: '⚔️', bg: 'bg-slate-800' };
    }
  };

  const getFrameVisual = () => {
    switch (profile.equippedFrame) {
      case 'frame_bronze':
        return 'border-4 border-amber-700 shadow-amber-900/40 shadow-lg';
      case 'frame_gold':
        return 'border-4 border-yellow-400 shadow-yellow-500/50 shadow-xl';
      case 'frame_neon':
        return 'border-4 border-pink-500 shadow-pink-500/50 shadow-xl animate-pulse';
      default:
        return 'border-2 border-slate-700';
    }
  };

  const getAuraVisual = () => {
    switch (profile.equippedAura) {
      case 'aura_spark':
        return 'ring-4 ring-orange-500/50 animate-pulse';
      case 'aura_void':
        return 'ring-4 ring-purple-600/60 shadow-inner shadow-purple-500';
      default:
        return '';
    }
  };

  const getCompanionVisual = () => {
    switch (profile.equippedCompanion) {
      case 'companion_cat':
        return { icon: '🐱', name: 'Lucky Calico', sound: 'Purr! Keep it up!' };
      case 'companion_dog':
        return { icon: '🐶', name: 'Loyal Hound', sound: 'Woof! Great job!' };
      case 'companion_dragon':
        return { icon: '🐲', name: 'Pyre Wyvern', sound: 'Roar of victory!' };
      case 'companion_robot':
        return { icon: '🤖', name: 'Gizmo-01', sound: 'Bleep bloop! Optimal!' };
      default:
        return null;
    }
  };

  const avatar = getAvatarVisual();
  const companion = getCompanionVisual();

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl backdrop-blur mb-6">
      <div className="flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Left: Avatar + Title + Level */}
        <div className="flex items-center gap-5">
          <div className={`relative w-20 h-20 rounded-2xl flex items-center justify-center text-4xl ${avatar.bg} ${getFrameVisual()} ${getAuraVisual()} transition-all duration-300`}>
            <span>{avatar.icon}</span>
            <span className="absolute -bottom-2 -right-2 bg-indigo-600 text-white text-xs font-bold px-2 py-0.5 rounded-full border border-indigo-400 shadow">
              Lv.{profile.level}
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white tracking-wide">{profile.username}</h2>
              {/* Title Badge with dropdown switcher */}
              <button
                onClick={() => setIsChangingTitle(!isChangingTitle)}
                className="bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-300 text-xs px-2.5 py-1 rounded-full font-semibold transition"
                title="Click to change title"
              >
                ✦ {profile.equippedTitle} ▾
              </button>
            </div>

            {isChangingTitle && (
              <div className="mt-2 p-2 bg-slate-950 border border-indigo-800 rounded-lg shadow-xl flex flex-wrap gap-1.5 z-20 absolute">
                {profile.unlockedTitles.map((title) => (
                  <button
                    key={title}
                    onClick={async () => {
                      await onEquipTitle(title);
                      setIsChangingTitle(false);
                    }}
                    className={`text-xs px-2.5 py-1 rounded-md transition ${
                      profile.equippedTitle === title
                        ? 'bg-indigo-600 text-white font-bold'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    {title}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
              <span>{profile.totalXP} Total XP</span>
              <span>•</span>
              <span>🔥 {profile.currentStreak} Day Streak</span>
              <span>•</span>
              <span>🏆 {profile.achievementsCount.unlocked}/{profile.achievementsCount.total} Achievements</span>
            </div>
          </div>
        </div>

        {/* Center: Coin Balance */}
        <div className="flex items-center gap-3 bg-amber-950/40 border border-amber-600/40 px-5 py-3 rounded-xl shadow-inner">
          <span className="text-3xl animate-bounce">🪙</span>
          <div>
            <div className="text-xs uppercase font-bold tracking-wider text-amber-400">Coins Balance</div>
            <div className="text-2xl font-black text-amber-300">{profile.coins}</div>
          </div>
        </div>

        {/* Right: Equipped Companion */}
        {companion ? (
          <div className="flex items-center gap-3 bg-slate-800/60 border border-slate-700/60 px-4 py-2.5 rounded-xl">
            <span className="text-3xl">{companion.icon}</span>
            <div className="text-left">
              <div className="text-xs font-semibold text-slate-400">{companion.name}</div>
              <div className="text-xs text-emerald-400 font-medium max-w-[200px] truncate">
                "{companionReaction || companion.sound}"
              </div>
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-500 italic bg-slate-800/30 px-3 py-2 rounded-lg border border-slate-800">
            No companion equipped. Visit the Shop to adopt one!
          </div>
        )}
      </div>
    </div>
  );
};
