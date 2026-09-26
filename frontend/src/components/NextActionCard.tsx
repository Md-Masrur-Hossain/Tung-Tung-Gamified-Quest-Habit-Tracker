// src/components/NextActionCard.tsx
// Sprint 7B UI: compact RPG guide card rendering the server-generated
// recommendation from GET /api/analytics/next-action. Presentation only —
// no local recommendation logic, no fake data, no polling, no realtime.
import React from 'react';
import type { NextActionResponse } from '../hooks/useNextAction';

// Player-friendly labels for the server's priority values (internal rule
// names stay internal; these read like guide hints).
const PRIORITY_LABELS: Record<string, string> = {
  OVERDUE: '⏳ Overdue',
  STREAK: '🔥 Keep the streak',
  FRESH_WORLD: '🌍 Try a new world',
  NEXT_QUEST: '➡️ Ready to go',
  MOMENTUM: '⚡ Build momentum',
  GET_STARTED: '🌱 First steps',
  QUICK_START: '✨ Stay on track',
};

interface Props {
  data: NextActionResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export const scrollToFirst = (ids: string[]) => {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
  }
};

export const NextActionCard: React.FC<Props> = ({ data, loading, error, onRetry }) => {
  if (!data) {
    if (loading) {
      return (
        <div
          className="h-24 bg-slate-800/60 rounded-2xl animate-pulse mb-8"
          aria-busy="true"
          aria-label="Loading recommendation"
        />
      );
    }
    if (error) {
      return (
        <div className="mb-8 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>🎯</span> What Should I Do Now?
              </h2>
              <p className="text-xs text-rose-400 mt-1">{error}</p>
            </div>
            <button
              type="button"
              onClick={onRetry}
              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return null; // unauthenticated or empty response — never show fake guidance
  }

  const rec = data.recommendation;
  if (!rec || !rec.actionType) return null; // defensive: nothing valid to render

  const priorityLabel = PRIORITY_LABELS[rec.priority] || '💡 Tip';
  const isComplete = rec.actionType === 'COMPLETE_QUEST';

  return (
    <section
      className="mb-8 bg-indigo-950/30 border border-indigo-500/40 rounded-2xl p-5 shadow-xl backdrop-blur"
      aria-label="Recommended next action"
    >
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <span>🎯</span> What Should I Do Now?
        </h2>
        <span className="text-[10px] font-black tracking-wide bg-indigo-900/70 border border-indigo-500/60 text-indigo-200 px-2.5 py-1 rounded-full">
          {priorityLabel}
        </span>
      </div>

      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-full bg-indigo-900/70 border border-indigo-400/60 flex items-center justify-center text-xl flex-shrink-0"
          aria-hidden="true"
        >
          🧭
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-white truncate">{rec.title}</h3>
            {rec.world && (
              <span className="text-[10px] font-bold text-amber-300 bg-amber-950/50 border border-amber-800/70 px-2 py-0.5 rounded-full flex-shrink-0">
                🌍 {rec.world}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-300 mt-1">{rec.reason}</p>
          <p className="text-[10px] text-slate-500 mt-1">
            {data.context.pendingQuests} quest
            {data.context.pendingQuests === 1 ? '' : 's'} in your log
            {rec.metadata.currentStreak > 0 && ` · 🔥 ${rec.metadata.currentStreak}-day streak`}
          </p>

          <div className="mt-3">
            {isComplete ? (
              rec.questId ? (
                <button
                  type="button"
                  onClick={() =>
                    scrollToFirst([
                      `quest-${rec.questId}`,
                      `qquest-${rec.questId}`,
                      'todays-adventure',
                    ])
                  }
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition"
                >
                  Open quest ↓
                </button>
              ) : null
            ) : (
              <button
                type="button"
                onClick={() => scrollToFirst(['quick-quests'])}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition"
              >
                View quick quests ↓
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default NextActionCard;
