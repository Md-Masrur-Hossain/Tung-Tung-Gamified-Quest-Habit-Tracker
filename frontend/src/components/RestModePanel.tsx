// src/components/RestModePanel.tsx
// Sprint 7D UI: a compact RPG "mode switch" card rendering the server-owned
// Rest Mode state from GET /api/analytics/rest-mode and toggling it through
// POST /api/analytics/rest-mode. Presentation only — the UI never implements
// recommendation rules, never invents a quest or an action, and never
// completes quests. Quest actions reuse the existing 7B/7C scroll navigation.
import React from 'react';
import { scrollToFirst } from './NextActionCard';
import type { RestModeResponse } from '../hooks/useRestMode';

// Display-only icons for the server's suggestion types (not rules).
const SUGGESTION_ICONS: Record<string, string> = {
  QUICK_QUEST: '⚡',
  EASY_QUEST: '🌱',
  SMALL_QUEST: '🪶',
  QUIET_LOG: '💤',
  NORMAL_MODE: '☀️',
};

interface Props {
  data: RestModeResponse | null;
  loading: boolean;
  error: string | null;
  toggling: boolean;
  toggleError: string | null;
  questIds: string[]; // already-loaded quests, used only to locate nav targets
  onToggle: (enabled: boolean) => void;
  onRetry: () => void;
}

/** Honest scope note — Rest Mode is a guidance preference, not an exploit. */
const ScopeNote: React.FC = () => (
  <p className="text-[10px] text-slate-500 mt-3 leading-relaxed">
    Rest Mode only changes the guidance you see. It does not freeze streaks, multiply XP, change
    coins, alter quest rewards or modify existing quests.
  </p>
);

export const RestModePanel: React.FC<Props> = ({
  data,
  loading,
  error,
  toggling,
  toggleError,
  questIds,
  onToggle,
  onRetry,
}) => {
  const header = (badge: React.ReactNode) => (
    <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
      <h2 className="text-base font-bold text-white flex items-center gap-2">
        <span aria-hidden="true">🌙</span> Rest Mode
      </h2>
      {badge}
    </div>
  );

  if (!data) {
    if (loading) {
      return (
        <div
          className="h-16 bg-slate-800/60 rounded-2xl animate-pulse mb-8"
          aria-busy="true"
          aria-label="Loading Rest Mode"
        />
      );
    }
    if (error) {
      return (
        <div className="mb-8 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              {header(null)}
              <p className="text-xs text-rose-400 mt-1">{error}</p>
            </div>
            <button
              type="button"
              onClick={onRetry}
              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return null; // unauthenticated — never show a mode that was not loaded
  }

  const restOn = data.enabled === true;
  const suggestion = data.suggestion;
  const targetId = suggestion && typeof suggestion.questId === 'string' ? suggestion.questId : null;
  const targetLoaded = targetId !== null && questIds.includes(targetId);
  const streak = data.context?.currentStreak || 0;
  const pending = data.context?.pendingQuests || 0;
  const light = data.context?.lightweightQuests || 0;

  return (
    <section
      className={
        restOn
          ? 'mb-8 bg-violet-950/30 border border-violet-500/40 rounded-2xl p-5 shadow-xl backdrop-blur'
          : 'mb-8 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur'
      }
      aria-label="Rest Mode"
    >
      {header(
        restOn ? (
          <span className="text-[10px] font-black tracking-wide bg-violet-900/70 border border-violet-500/60 text-violet-200 px-2.5 py-1 rounded-full">
            💤 REST MODE ON
          </span>
        ) : (
          <span className="text-[10px] font-black tracking-wide bg-slate-800/80 border border-slate-700 text-slate-300 px-2.5 py-1 rounded-full">
            ☀️ OFF
          </span>
        ),
      )}
      <p className="text-[11px] text-slate-500 mb-3">
        Low-pressure adventure — you choose when the pace is gentler.
      </p>

      {!restOn ? (
        /* ---------- OFF state: explanation + clear control ---------- */
        <div>
          <p className="text-xs text-slate-300">
            Rest Mode gives you lighter guidance on low-energy days: smaller steps and softer
            nudges instead of your heaviest quest. Switch it on when you want a gentle session, and
            off again whenever you are ready to go full speed.
          </p>
          <ScopeNote />
          <button
            type="button"
            onClick={() => onToggle(true)}
            disabled={toggling}
            className="mt-3 px-4 py-2 text-xs font-bold rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {toggling ? 'Turning on…' : '🌙 Turn on Rest Mode'}
          </button>
        </div>
      ) : (
        /* ---------- ON state: server suggestion + clear way back out ---------- */
        <div>
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-full bg-violet-900/70 border border-violet-400/60 flex items-center justify-center text-xl flex-shrink-0"
              aria-hidden="true"
            >
              {SUGGESTION_ICONS[suggestion?.type || ''] || '🌙'}
            </div>
            <div className="min-w-0 flex-1">
              {suggestion?.title && (
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-white">{suggestion.title}</h3>
                  <span className="text-[9px] font-bold text-violet-200 bg-violet-950/60 border border-violet-700/70 px-1.5 py-0.5 rounded-full flex-shrink-0">
                    {suggestion.type}
                  </span>
                </div>
              )}
              <p className="text-xs text-slate-300 mt-1">
                {suggestion?.message || 'Rest Mode is on — take the gentlest option available.'}
              </p>

              {targetId && targetLoaded && (
                <button
                  type="button"
                  onClick={() =>
                    scrollToFirst([`quest-${targetId}`, `qquest-${targetId}`, 'todays-adventure'])
                  }
                  className="mt-2.5 px-4 py-2 text-xs font-bold rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition"
                >
                  Open quest ↓
                </button>
              )}

              {targetId && !targetLoaded && (
                <p className="mt-2 text-[11px] text-amber-300/90 border border-dashed border-slate-700 rounded-lg px-3 py-2">
                  💤 That quest is not in your loaded log right now — refresh to update it, or pick
                  any gentle quest below.
                </p>
              )}

              {!targetId && suggestion?.type === 'QUIET_LOG' && (
                <p className="mt-2 text-[11px] text-slate-400 border border-dashed border-slate-700 rounded-lg px-3 py-2">
                  Nothing light to open right now — resting is a perfectly good move.
                </p>
              )}
            </div>
          </div>

          <p className="text-[10px] text-slate-500 mt-3">
            {pending} quest{pending === 1 ? '' : 's'} in your log · {light} light
            {streak > 0 && ` · 🔥 ${streak}-day streak`}
            {data.context?.progressionUnchanged ? ' · XP, coins and streak rules unchanged' : ''}
          </p>

          <ScopeNote />

          <button
            type="button"
            onClick={() => onToggle(false)}
            disabled={toggling}
            className="mt-3 px-4 py-2 text-xs font-bold rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {toggling ? 'Turning off…' : 'Turn off Rest Mode'}
          </button>
        </div>
      )}

      {toggleError && <p className="text-[11px] text-rose-400 mt-2">{toggleError}</p>}

      {error && (
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <p className="text-[11px] text-amber-400">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="px-2.5 py-1 text-[10px] font-bold rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition"
          >
            Retry
          </button>
        </div>
      )}
    </section>
  );
};

export default RestModePanel;
