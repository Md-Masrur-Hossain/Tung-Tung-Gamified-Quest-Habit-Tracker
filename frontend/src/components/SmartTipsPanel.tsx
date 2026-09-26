// src/components/SmartTipsPanel.tsx
// Sprint 7C UI: compact RPG mentor/tips panel rendering the server-generated
// suggestions from GET /api/analytics/suggestions. Presentation only — the
// UI never implements suggestion rules, never fabricates tips, and never
// completes quests. Navigation reuses Sprint 7B's scroll approach.
import React from 'react';
import { scrollToFirst } from './NextActionCard';
import type { SmartSuggestion, SuggestionsResponse } from '../hooks/useSuggestions';

// Display-only icons for server suggestion types (not rules).
const ICONS: Record<string, string> = {
  STREAK: '🔥',
  WORLD_BALANCE: '🌍',
  MOMENTUM: '⚡',
  QUEST_BACKLOG: '📋',
  RECENT_SUCCESS: '🎉',
  INACTIVE_PLAYER: '🌱',
};

interface QuestRef {
  _id: string;
  category: string;
  status: string;
}

interface Props {
  data: SuggestionsResponse | null;
  loading: boolean;
  error: string | null;
  quests: QuestRef[]; // already-loaded quests, used only to locate navigation targets
  onRetry: () => void;
}

// Maps server metadata to a navigation action (same scroll approach as 7B).
// Returns null for informational-only suggestions — no invented flows.
const actionFor = (
  s: SmartSuggestion,
  quests: QuestRef[],
): { label: string; targetIds: string[] } | null => {
  if (s.type === 'MOMENTUM') {
    const id =
      typeof s.metadata.suggestedQuestId === 'string' ? s.metadata.suggestedQuestId : null;
    if (id) {
      return {
        label: 'Open quest ↓',
        targetIds: [`quest-${id}`, `qquest-${id}`, 'todays-adventure'],
      };
    }
    return null;
  }
  if (s.type === 'WORLD_BALANCE') {
    const world =
      typeof s.metadata.suggestedWorld === 'string' ? s.metadata.suggestedWorld : null;
    if (!world) return null;
    const target = quests.find((q) => q.status === 'pending' && q.category === world);
    if (target) {
      return {
        label: `Open ${world} quest ↓`,
        targetIds: [`quest-${target._id}`, `qquest-${target._id}`, 'todays-adventure'],
      };
    }
    return null; // no existing quest in that world -> informational only
  }
  return null;
};

export const SmartTipsPanel: React.FC<Props> = ({ data, loading, error, quests, onRetry }) => {
  if (!data) {
    if (loading) {
      return (
        <div
          className="h-16 bg-slate-800/60 rounded-2xl animate-pulse mb-8"
          aria-busy="true"
          aria-label="Loading tips"
        />
      );
    }
    if (error) {
      return (
        <div className="mb-8 bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>💡</span> Smart Tips
              </h2>
              <p className="text-xs text-rose-400 mt-1">{error}</p>
            </div>
            <button
              type="button"
              onClick={onRetry}
              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return null; // unauthenticated — never show fake tips
  }

  const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];

  return (
    <section
      className="mb-8 bg-slate-900/80 border border-emerald-500/30 rounded-2xl p-5 shadow-xl backdrop-blur"
      aria-label="Smart tips"
    >
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <span>💡</span> Smart Tips
        </h2>
        {suggestions.length > 0 && (
          <span className="text-[10px] font-bold text-emerald-300 bg-emerald-950/50 border border-emerald-700/60 px-2 py-0.5 rounded-full">
            {suggestions.length} tip{suggestions.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <p className="text-[11px] text-slate-500 mb-3">
        Little nudges from your own adventure log.
      </p>

      {suggestions.length === 0 ? (
        <p className="text-xs text-slate-400 italic border border-dashed border-slate-700 rounded-lg px-3 py-3 text-center">
          No tips right now — your adventure log is all caught up. ✨
        </p>
      ) : (
        <ul className="space-y-2">
          {suggestions.map((s, i) => {
            const action = actionFor(s, quests);
            return (
              <li
                key={`${s.type}-${i}`}
                className="flex items-start gap-2.5 bg-slate-900/50 border border-slate-800 rounded-xl px-3 py-2.5"
              >
                <span className="text-base flex-shrink-0" aria-hidden="true">
                  {ICONS[s.type] || '💡'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-white">{s.title}</span>
                    {s.world && (
                      <span className="text-[9px] font-bold text-amber-300 bg-amber-950/50 border border-amber-800/70 px-1.5 py-0.5 rounded-full flex-shrink-0">
                        🌍 {s.world}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-300 mt-0.5">{s.message}</p>
                  {action && (
                    <button
                      type="button"
                      onClick={() => scrollToFirst(action.targetIds)}
                      className="mt-1.5 px-3 py-1 text-[11px] font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition"
                    >
                      {action.label}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

