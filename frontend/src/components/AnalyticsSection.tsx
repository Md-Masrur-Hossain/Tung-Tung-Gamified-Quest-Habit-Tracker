// src/components/AnalyticsSection.tsx
// Sprint 7A: RPG-style player stats screen fed by GET /api/analytics/summary.
// Server-derived only — no local calculations beyond display formatting,
// no charting library (plain CSS bars), no recommendations/suggestions.
import React from 'react';
import { useAnalytics } from '../hooks/useAnalytics';
import type { AnalyticsSummary } from '../hooks/useAnalytics';

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const dayLetter = (date: string): string => {
  const d = new Date(`${date}T00:00:00.000Z`);
  return DAY_LETTERS[d.getUTCDay()] || '?';
};

interface StatTileProps {
  icon: string;
  label: string;
  value: string;
  sub?: string;
}

const StatTile: React.FC<StatTileProps> = ({ icon, label, value, sub }) => (
  <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center min-w-0">
    <div className="text-base mb-0.5" aria-hidden="true">
      {icon}
    </div>
    <div className="text-white font-black text-lg leading-tight truncate" title={value}>
      {value}
    </div>
    <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{label}</div>
    {sub ? <div className="text-[10px] text-slate-500 mt-0.5 truncate">{sub}</div> : null}
  </div>
);

/** Loading skeleton — deliberately shows NO numbers so zeros are never misleading. */
const LoadingSkeleton: React.FC = () => (
  <div aria-busy="true" aria-label="Loading player stats">
    <p className="text-xs text-slate-400 mb-4">Loading your stats...</p>
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-20 bg-slate-800/60 rounded-xl animate-pulse" />
      ))}
    </div>
    <div className="h-36 bg-slate-800/60 rounded-xl animate-pulse mb-4" />
    <div className="h-28 bg-slate-800/60 rounded-xl animate-pulse" />
  </div>
);

export const AnalyticsSection: React.FC = () => {
  const { summary, loading, error, refresh } = useAnalytics();

  const renderHeader = (right?: React.ReactNode) => (
    <div className="flex items-center justify-between gap-3 pb-5 border-b border-slate-800 mb-6">
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <span>📜</span> Player Stats
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Your recent adventure performance — recorded by your quests, yours alone.
        </p>
      </div>
      {right}
    </div>
  );

  if (loading && !summary) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur mb-8">
        {renderHeader()}
        <LoadingSkeleton />
      </div>
    );
  }

  if (!summary) {
    if (error) {
      return (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur mb-8">
          {renderHeader()}
          <div className="border border-rose-800/60 bg-rose-950/30 rounded-xl p-5 text-center">
            <p className="text-sm text-rose-300 font-semibold">{error}</p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="mt-3 px-4 py-2 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return null; // no token yet — Dashboard is auth-gated, nothing to show
  }

  const s: AnalyticsSummary = summary;
  const o = s.overview;
  const last = s.recent.last7Days;
  const prev = s.recent.previous7Days;
  const delta = last.questsCompleted - prev.questsCompleted;
  const maxDay = Math.max(1, ...s.recent.byDay.map((d) => d.questsCompleted));
  const todayIdx = s.recent.byDay.length - 1;
  const maxWorld = Math.max(1, ...s.worlds.activity.map((w) => w.completedQuests));
  const rateLabel = o.completionRate === null ? '—' : `${Math.round(o.completionRate * 100)}%`;
  const isEmptyAdventurer = o.totalQuests === 0;
  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur mb-8">
      {renderHeader(
        <div className="text-xs font-semibold text-indigo-400 bg-indigo-950/60 border border-indigo-800 px-3 py-1.5 rounded-lg flex-shrink-0">
          Level {o.level}
        </div>,
      )}

      {/* ---- Overview: player stat tiles ---- */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <StatTile
          icon="⭐"
          label="Level"
          value={String(o.level)}
          sub={`${o.totalXP.toLocaleString()} XP total`}
        />
        <StatTile
          icon="✨"
          label="Total XP"
          value={o.totalXP.toLocaleString()}
          sub={`Best streak ${o.longestStreak}d`}
        />
        <StatTile icon="🔥" label="Streak" value={`${o.currentStreak}d`} sub="current streak" />
        <StatTile
          icon="🗡️"
          label="Quests Cleared"
          value={String(o.totalQuestsCompleted)}
          sub={`${o.totalQuests} total`}
        />
        <StatTile
          icon="🎯"
          label="Completion"
          value={rateLabel}
          sub={
            o.totalQuests > 0
              ? `${o.totalQuestsCompleted}/${o.totalQuests} quests`
              : 'no quests yet'
          }
        />
      </div>

      {isEmptyAdventurer ? (
        /* ---- Empty / new player ---- */
        <div className="border border-dashed border-slate-700 rounded-xl p-6 text-center">
          <div className="text-2xl mb-1" aria-hidden="true">
            🗺️
          </div>
          <p className="text-sm text-slate-300 font-semibold">Your adventure log is empty.</p>
          <p className="text-xs text-slate-500 mt-1">
            Clear your first quest and your week, worlds, and trends will appear here.
          </p>
        </div>
      ) : (
        <>
          {/* ---- Your Week: 7-day quest + XP activity ---- */}
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-400 mb-1">
            Your Week
          </h3>
          <p className="text-xs text-slate-500 mb-1">
            Last 7 days:{' '}
            <span className="text-white font-bold">{last.questsCompleted}</span> quests ·{' '}
            <span className="text-indigo-300 font-bold">{last.xpEarned.toLocaleString()}</span> XP ·{' '}
            <span className="text-emerald-300 font-bold">{last.activeDays}/7</span> active days
            <span
              className={`ml-1.5 font-bold ${
                delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-rose-400' : 'text-slate-500'
              }`}
            >
              ({delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '◆ '}
              {delta} vs prev. 7d)
            </span>
          </p>
          <p className="text-[11px] text-slate-500 mb-3">
            Today so far:{' '}
            <span className="text-slate-300 font-semibold">
              {s.recent.today.questsCompleted} quest
              {s.recent.today.questsCompleted === 1 ? '' : 's'} ·{' '}
              {s.recent.today.xpEarned.toLocaleString()} XP
            </span>{' '}
            · Previous 7 days: {prev.questsCompleted} quests ·{' '}
            {prev.xpEarned.toLocaleString()} XP
          </p>

          <div className="flex items-end gap-1.5 sm:gap-2 mb-6">
            {s.recent.byDay.map((d, i) => {
              const pct =
                d.questsCompleted === 0
                  ? 0
                  : Math.max(12, Math.round((d.questsCompleted / maxDay) * 100));
              const isToday = i === todayIdx;
              return (
                <div
                  key={d.date}
                  className="flex-1 min-w-0 flex flex-col items-center gap-1"
                  title={`${d.date} — ${d.questsCompleted} quest(s), ${d.xpEarned} XP`}
                >
                  <span
                    className={`text-[10px] font-bold ${
                      d.questsCompleted > 0 ? 'text-indigo-300' : 'text-slate-600'
                    }`}
                  >
                    {d.questsCompleted}
                  </span>
                  <div
                    className={`w-full h-16 rounded-md bg-slate-800/80 flex items-end overflow-hidden border ${
                      isToday ? 'border-indigo-500/70' : 'border-slate-700/50'
                    }`}
                  >
                    <div
                      className={`w-full rounded-t-sm ${
                        d.questsCompleted > 0 ? (isToday ? 'bg-indigo-400' : 'bg-indigo-600') : ''
                      }`}
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  <span
                    className={`text-[10px] font-bold ${isToday ? 'text-white' : 'text-slate-500'}`}
                  >
                    {dayLetter(d.date)}
                  </span>
                  <span className="text-[9px] text-slate-600">{d.date.slice(8, 10)}</span>
                </div>
              );
            })}
          </div>

          {/* ---- World Activity: all 8 worlds distribution ---- */}
          <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-400">
              World Activity
            </h3>
            {s.worlds.mostActiveWorld && (
              <span className="text-[10px] font-bold text-amber-300 bg-amber-950/50 border border-amber-800/70 px-2 py-0.5 rounded-full">
                ⚒ Most active: {s.worlds.mostActiveWorld}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Completed quests across your 8 worlds (all time).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {s.worlds.activity.map((w) => {
              const active = w.completedQuests > 0;
              const pct = active
                ? Math.max(6, Math.round((w.completedQuests / maxWorld) * 100))
                : 0;
              return (
                <div
                  key={w.world}
                  className="flex items-center gap-2 bg-slate-900/50 border border-slate-800 rounded-lg px-3 py-2 min-w-0"
                >
                  <span
                    className={`text-xs font-semibold w-16 sm:w-20 truncate ${
                      active ? 'text-white' : 'text-slate-500'
                    }`}
                  >
                    {w.world}
                  </span>
                  <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden min-w-0">
                    <div
                      className={`h-2 rounded-full ${active ? 'bg-emerald-500' : ''}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span
                    className={`text-xs font-bold w-6 text-right ${
                      active ? 'text-emerald-400' : 'text-slate-600'
                    }`}
                  >
                    {w.completedQuests}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};


