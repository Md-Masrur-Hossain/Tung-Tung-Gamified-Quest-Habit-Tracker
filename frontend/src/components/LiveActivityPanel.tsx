// src/components/LiveActivityPanel.tsx
// Sprint 6C: minimal Live Activity — today's deterministic event,
// refreshed in realtime via `daily_event:updated` (see useLive).
import React from 'react';
import { useLive } from '../hooks/useLive';
import { LiveStatusDot } from './LiveStatusDot';

export const LiveActivityPanel: React.FC = () => {
  const { event, connected, loading, error } = useLive();

  const isDoubleXp = event?.type === 'DOUBLE_XP_WORLD';
  const accent = event
    ? isDoubleXp
      ? 'border-indigo-500/50 bg-indigo-500/10'
      : 'border-amber-500/50 bg-amber-500/10'
    : 'border-slate-800/80 bg-slate-900/60';

  return (
    <section
      className={`mb-6 flex items-center justify-between gap-4 rounded-xl border p-4 ${accent}`}
      aria-label="Daily live event"
    >
      <div className="flex items-center gap-3 text-left">
        {event && <span className="text-2xl">{isDoubleXp ? '✨' : '💰'}</span>}
        <div>
          <div className="flex items-center gap-2">
            <h2 className="m-0 text-xs font-black tracking-widest text-slate-400 uppercase">
              Today&apos;s Event
            </h2>
            <LiveStatusDot connected={connected} />
          </div>
          {loading ? (
            <p className="text-sm text-slate-400">Loading today&apos;s event...</p>
          ) : error && !event ? (
            <p className="text-sm text-rose-400">{error}</p>
          ) : event ? (
            <>
              <p className="text-base font-bold text-white">
                {event.title}{' '}
                <span className="text-xs font-semibold text-slate-400">({event.date})</span>
              </p>
              <p className="text-xs text-slate-300">{event.description}</p>
            </>
          ) : null}
        </div>
      </div>
      {event && (
        <div className="flex shrink-0 gap-2 text-right">
          {isDoubleXp ? (
            <span className="rounded-full bg-indigo-500 px-2.5 py-1 text-xs font-black text-white">
              x{event.xpMultiplier} XP
            </span>
          ) : (
            <span className="rounded-full bg-amber-500 px-2.5 py-1 text-xs font-black text-slate-950">
              +{event.bossCoinBonus} coins
            </span>
          )}
        </div>
      )}
    </section>
  );
};

export default LiveActivityPanel;
