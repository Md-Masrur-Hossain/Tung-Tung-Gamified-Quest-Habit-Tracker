import React, { useState } from 'react';
import api from '../lib/api';
import type { CoopQuest, FriendEntry, Party } from '../hooks/useSocial';
interface Props { parties: Party[]; friends: FriendEntry[]; coopQuests: CoopQuest[]; onChanged: () => void; onCoopChanged: (q: CoopQuest[]) => void; }
const panel = 'bg-slate-900/60 border border-slate-800 rounded-xl mb-3 overflow-hidden';
const idOf = (u: any): string => (typeof u === 'string' ? u : u?._id || '');
export const PartyPanel: React.FC<Props> = ({ parties, friends, coopQuests, onChanged, onCoopChanged }) => {
  const [open, setOpen] = useState(true);
  const [name, setName] = useState('');
  const [coopTitle, setCoopTitle] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const act = async (fn: () => Promise<any>, ok: string) => {
    try { const r = await fn(); setMsg(ok); await onChanged(); return r; }
    catch (e: any) { setMsg(e.response?.data?.message || 'Action failed'); return null; }
  };
  const loadCoop = async (partyId: string) => {
    try { const r = await api.get(`/api/social/parties/${partyId}/coop-quests`); onCoopChanged(r.data || []); }
    catch { onCoopChanged([]); }
  };
  return (
    <div className={panel}>
      <button onClick={() => setOpen(!open)} className="w-full flex justify-between items-center px-4 py-3 text-left">
        <span className="font-bold text-white">Party / Co-op ({parties.length})</span>
        <span className="text-slate-400 text-sm">{open ? 'v' : '>'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          <div className="flex gap-2 mb-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New party name..." className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white" />
            <button onClick={() => act(() => api.post('/api/social/parties', { name }), 'Party forged!')} aria-label="Create party" className="bg-indigo-600 text-white text-sm font-bold px-3 py-1.5 rounded-lg">Create</button>
          </div>
          {parties.map((p) => (
            <PartyCard key={p._id} p={p} friends={friends} coopQuests={coopQuests} coopTitle={coopTitle} setCoopTitle={setCoopTitle} act={act} loadCoop={loadCoop} />
          ))}
          {!parties.length && <p className="text-xs text-slate-500 italic">No party yet. Forge one above (max 4).</p>}
          {msg && <p className="text-xs text-indigo-300 mt-2">{msg}</p>}
        </div>
      )}
    </div>
  );
};
const PartyCard: React.FC<any> = ({ p, friends, coopQuests, coopTitle, setCoopTitle, act, loadCoop }) => {
  const leaderId = idOf(p.leader as any);
  return (
    <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 mb-2.5">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-white font-bold text-sm">{p.name} <span className="text-slate-500 font-normal">({p.members.length}/4)</span></span>
        <button onClick={() => act(() => api.post(`/api/social/parties/${p._id}/leave`), 'You left.')} className="text-xs text-slate-300 border border-slate-700 px-2 py-0.5 rounded-md">Leave</button>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {p.members.map((m: any) => (
          <span key={idOf(m)} className="text-[11px] bg-slate-800 border border-slate-700 text-slate-200 px-2 py-0.5 rounded-full">
            {m.username || 'Hero'}{idOf(m) === leaderId ? ' (leader)' : ''}
            {idOf(m) !== leaderId && (<button onClick={() => act(() => api.delete(`/api/social/parties/${p._id}/members/${idOf(m)}`), 'Removed.')} className="ml-1.5 text-rose-300">x</button>)}
          </span>
        ))}
      </div>
      <div className="flex gap-1.5 flex-wrap mb-2">
        {friends.filter((f: any) => !p.members.some((m: any) => idOf(m) === f.friend._id)).slice(0, 4).map((f: any) => (
          <button key={f.friend._id} onClick={() => act(() => api.post(`/api/social/parties/${p._id}/invite`, { friendId: f.friend._id }), 'Invited!')} className="text-[11px] bg-emerald-700 text-white px-2 py-0.5 rounded-md">+ {f.friend.username}</button>
        ))}
      </div>
      <div className="flex gap-2 mt-2">
        <input value={coopTitle} onChange={(e) => setCoopTitle(e.target.value)} placeholder="New co-op quest..." className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white" />
        <button onClick={async () => { const r = await act(() => api.post('/api/social/coop-quests', { partyId: p._id, title: coopTitle, category: 'Work', targetCount: p.members.length }), 'Created!'); if (r) { setCoopTitle(''); loadCoop(p._id); } }} className="text-xs bg-amber-600 text-white px-2.5 py-1 rounded-md font-bold">Create Quest</button>
        <button onClick={() => loadCoop(p._id)} className="text-xs bg-slate-800 text-slate-200 px-2.5 py-1 rounded-md border border-slate-700">Refresh</button>
      </div>
      {coopQuests.map((q: any) => (
        <div key={q._id} className="flex justify-between items-center text-xs bg-slate-900 border border-slate-800 rounded-md px-2.5 py-1.5 mb-1 mt-1">
          <span className="text-white font-semibold">{q.title} <span className="text-slate-500">({(q.contributions || []).length}/{q.targetCount}) {q.status}</span></span>
          <button onClick={() => act(() => api.post(`/api/social/coop-quests/${q._id}/contribute`), 'Recorded!').then(() => loadCoop(p._id))} className="bg-indigo-600 text-white px-2 py-0.5 rounded-md font-bold">Contribute</button>
        </div>
      ))}
    </div>
  );
};
