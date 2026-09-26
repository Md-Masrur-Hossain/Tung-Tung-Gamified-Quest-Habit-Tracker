// src/components/RealtimePanel.tsx
// Sprint 8 UI polish: exposes the already-shipped leaderboard (Sprint 6A) and
// persisted notifications (Sprint 6B) through their existing REST contracts.
// Read-only apart from the documented "mark read" action; no new backend data.
import React, { useCallback, useEffect, useState } from 'react';
import {
  getLeaderboard,
  getNotifications,
  markNotificationRead,
  type LeaderboardSnapshot,
  type LiveNotification,
} from '../lib/api';

type Scope = 'global' | 'friends';

const emptyEntries: LeaderboardSnapshot['entries'] = [];

export const RealtimePanel: React.FC = () => {
  const [scope, setScope] = useState<Scope>('global');
  const [board, setBoard] = useState<LeaderboardSnapshot | null>(null);
  const [boardLoading, setBoardLoading] = useState(true);
  const [boardError, setBoardError] = useState<string | null>(null);

  const [notifications, setNotifications] = useState<LiveNotification[]>([]);
  const [notifLoading, setNotifLoading] = useState(true);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const loadBoard = useCallback(async (nextScope: Scope) => {
    setBoardLoading(true);
    try {
      const resp = await getLeaderboard(nextScope, 10);
      setBoard(resp.data as LeaderboardSnapshot);
      setBoardError(null);
    } catch (e: any) {
      setBoardError(e?.response?.data?.message || 'Could not load the leaderboard.');
    } finally {
      setBoardLoading(false);
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    setNotifLoading(true);
    try {
      const resp = await getNotifications();
      const data = resp.data;
      const list: LiveNotification[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.notifications)
          ? data.notifications
          : [];
      setNotifications(list);
      setNotifError(null);
    } catch (e: any) {
      setNotifError(e?.response?.data?.message || 'Could not load notifications.');
    } finally {
      setNotifLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBoard(scope);
  }, [scope, loadBoard]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const handleMarkRead = async (id: string) => {
    setMarkingId(id);
    try {
      const resp = await markNotificationRead(id);
      const updated = resp.data?.notification ?? resp.data;
      setNotifications((prev) =>
        prev.map((n) =>
          n._id === id
            ? { ...n, ...(updated && typeof updated === 'object' ? updated : { read: true }) }
            : n,
        ),
      );
    } catch (e: any) {
      setNotifError(e?.response?.data?.message || 'Could not mark that notification as read.');
    } finally {
      setMarkingId(null);
    }
  };

  const entries = board?.entries?.length ? board.entries : emptyEntries;
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <section className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-4" aria-label="Realtime activity">
      {/* Leaderboard */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-black tracking-widest text-slate-400 uppercase">Leaderboard</h2>
          <div className="flex gap-1 rounded-lg bg-slate-800/80 p-1" role="group" aria-label="Leaderboard scope">
            {(['global', 'friends'] as Scope[]).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                aria-pressed={scope === s}
                className={`px-2.5 py-1 text-xs font-bold rounded transition ${
                  scope === s ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {s === 'global' ? 'Global' : 'Friends'}
              </button>
            ))}
          </div>
        </div>
        {boardLoading && !board ? (
          <p className="text-sm text-slate-400">Loading rankings...</p>
        ) : boardError ? (
          <div className="text-sm">
            <p className="text-rose-300">{boardError}</p>
            <button
              onClick={() => void loadBoard(scope)}
              className="mt-2 px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs font-bold transition"
            >
              Retry
            </button>
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-slate-400">
            {scope === 'friends' ? 'No friends to rank yet — add a friend first.' : 'No ranked players yet.'}
          </p>
        ) : (
          <ol className="flex flex-col gap-1.5" aria-live="polite">
            {entries.map((entry) => (
              <li
                key={entry.userId}
                className="flex items-center justify-between gap-2 rounded-lg bg-slate-800/50 px-2.5 py-1.5 text-sm"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-5 shrink-0 text-center font-black text-slate-500">#{entry.rank}</span>
                  <span className="truncate font-semibold text-white">{entry.username}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-400">
                  Lv {entry.level} · {entry.totalXP} XP
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
      {/* Notifications */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-black tracking-widest text-slate-400 uppercase">
            Notifications
            {unread > 0 && (
              <span className="ml-2 rounded-full bg-indigo-500 px-1.5 py-0.5 text-[10px] font-black text-white">
                {unread} new
              </span>
            )}
          </h2>
          <button
            onClick={() => void loadNotifications()}
            className="px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs font-bold transition"
          >
            Refresh
          </button>
        </div>

        {notifLoading && notifications.length === 0 ? (
          <p className="text-sm text-slate-400">Loading notifications...</p>
        ) : notifError && notifications.length === 0 ? (
          <div className="text-sm">
            <p className="text-rose-300">{notifError}</p>
            <button
              onClick={() => void loadNotifications()}
              className="mt-2 px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs font-bold transition"
            >
              Retry
            </button>
          </div>
        ) : notifications.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing new. Complete a quest to earn your first notice.</p>
        ) : (
          <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1" aria-live="polite">
            {notifications.slice(0, 10).map((n) => (
              <li
                key={n._id}
                className={`rounded-lg border px-2.5 py-2 text-sm ${
                  n.read ? 'border-slate-800 bg-slate-800/30' : 'border-indigo-500/40 bg-indigo-500/10'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-white">{n.title}</p>
                    {n.message && <p className="mt-0.5 text-xs text-slate-300">{n.message}</p>}
                  </div>
                  {!n.read && (
                    <button
                      onClick={() => void handleMarkRead(n._id)}
                      disabled={markingId === n._id}
                      className="shrink-0 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 px-2 py-1 text-[10px] font-black uppercase tracking-wide transition"
                    >
                      {markingId === n._id ? 'Saving' : 'Mark read'}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

export default RealtimePanel;