import React, { useState } from 'react';
import api from '../lib/api';
import type { FriendEntry, FriendRequest } from '../hooks/useSocial';

interface Props {
  friends: FriendEntry[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  onChanged: () => void;
}
const panel = 'bg-slate-900/60 border border-slate-800 rounded-xl mb-3 overflow-hidden';

export const FriendsPanel: React.FC<Props> = ({ friends, incoming, outgoing, onChanged }) => {
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const search = async () => {
    setMsg(null);
    try {
      const r = await api.get('/api/social/friends/search', { params: { q: query } });
      setResults(r.data || []);
      if (!(r.data || []).length) setMsg('No heroes found.');
    } catch (e: any) {
      setMsg(e.response?.data?.message || 'Search failed');
    }
  };
  const act = async (fn: () => Promise<any>, ok: string) => {
    try {
      await fn();
      setMsg(ok);
      onChanged();
    } catch (e: any) {
      setMsg(e.response?.data?.message || 'Action failed');
    }
  };

  return (
    <div className={panel}>
      <button onClick={() => setOpen(!open)} className="w-full flex justify-between items-center px-4 py-3 text-left">
        <span className="font-bold text-white">🧝 Friends ({friends.length})</span>
        <span className="text-slate-400 text-sm">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          <div className="flex gap-2 mb-3">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search heroes by name..." className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white" />
            <button onClick={search} className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold px-3 py-1.5 rounded-lg">Search</button>
          </div>
          {results.map((u: any) => (
            <div key={u._id} className="flex justify-between items-center bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-1.5 mb-1.5 text-sm">
              <span className="text-white font-semibold">{u.username} <span className="text-slate-500">Lv.{u.level ?? 1}</span></span>
              <button onClick={() => act(() => api.post('/api/social/friends/requests', { recipientId: u._id }), 'Request sent!')} className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 rounded-md font-bold">Add</button>
            </div>
          ))}
          {incoming.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-bold text-amber-300 mb-1.5">INCOMING ({incoming.length})</p>
              {incoming.map((r) => (
                <div key={r._id} className="flex justify-between items-center text-sm mb-1.5 bg-amber-950/30 border border-amber-800/40 rounded-lg px-3 py-1.5">
                  <span className="text-white">{r.requester?.username}</span>
                  <span className="flex gap-1.5">
                    <button onClick={() => act(() => api.post(`/api/social/friends/requests/${r._id}/accept`), 'Friend added!')} className="text-xs bg-emerald-600 text-white px-2 py-1 rounded-md font-bold">Accept</button>
                    <button onClick={() => act(() => api.post(`/api/social/friends/requests/${r._id}/reject`), 'Request declined.')} className="text-xs bg-slate-700 text-slate-200 px-2 py-1 rounded-md">Reject</button>
                  </span>
                </div>
              ))}
            </div>
          )}
          {outgoing.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-bold text-slate-400 mb-1.5">OUTGOING ({outgoing.length})</p>
              {outgoing.map((r) => (
                <div key={r._id} className="text-xs text-slate-400 px-1 py-0.5">⏳ to {(r.recipient as any)?.username}</div>
              ))}
            </div>
          )}
          <div className="mt-3">
            {friends.map((f) => (
              <div key={String(f.friendshipId)} className="flex justify-between items-center text-sm mb-1.5 bg-slate-800/50 border border-slate-700/60 rounded-lg px-3 py-1.5">
                <span className="text-white">⚔️ {f.friend.username} <span className="text-slate-500">Lv.{f.friend.level ?? 1}</span></span>
                <button onClick={() => act(() => api.delete(`/api/social/friends/${f.friend._id}`), 'Friend removed.')} className="text-xs text-rose-300 hover:text-rose-200 border border-rose-800/60 px-2 py-0.5 rounded-md">Remove</button>
              </div>
            ))}
            {!friends.length && <p className="text-xs text-slate-500 italic">No friends yet. Search heroes above to recruit allies!</p>}
          </div>
          {msg && <p className="text-xs text-indigo-300 mt-2">{msg}</p>}
        </div>
      )}
    </div>
  );
};
