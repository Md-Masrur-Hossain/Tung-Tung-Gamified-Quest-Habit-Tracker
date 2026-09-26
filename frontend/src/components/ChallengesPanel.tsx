import React, { useState } from 'react';
import api from '../lib/api';
import type { Challenge, FriendEntry } from '../hooks/useSocial';
interface Props { challenges: Challenge[]; friends: FriendEntry[]; onChanged: () => void; }
const panel = 'bg-slate-900/60 border border-slate-800 rounded-xl mb-3 overflow-hidden';
export const ChallengesPanel: React.FC<Props> = ({ challenges, friends, onChanged }) => {
  const [open, setOpen] = useState(true);
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('3');
  const [goal, setGoal] = useState('QUEST_COUNT');
  const [opp, setOpp] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const act = async (fn: () => Promise<any>, ok: string) => {
    try { await fn(); setMsg(ok); onChanged(); }
    catch (e: any) { setMsg(e.response?.data?.message || 'Action failed'); }
  };
  const incoming = challenges.filter((c) => c.status === 'PENDING');
  const active = challenges.filter((c) => c.status === 'ACCEPTED');
  const done = challenges.filter((c) => c.status === 'COMPLETED' || c.status === 'DECLINED');
  return (
    <div className={panel}>
      <button onClick={() => setOpen(!open)} className="w-full flex justify-between items-center px-4 py-3 text-left">
        <span className="font-bold text-white">Challenges ({challenges.length})</span>
        <span className="text-slate-400 text-sm">{open ? 'v' : '>'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 mb-3">
            <p className="text-xs font-bold text-slate-300 mb-2">CHALLENGE A FRIEND</p>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Challenge title..." className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white mb-2" />
            <div className="flex flex-col sm:flex-row gap-2 mb-2">
              <select value={opp} onChange={(e) => setOpp(e.target.value)} className="w-full sm:flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white">
                <option value="">Select friend...</option>
                {friends.map((f) => (<option key={f.friend._id} value={f.friend._id}>{f.friend.username}</option>))}
              </select>
              <div className="flex gap-2">
                <select value={goal} onChange={(e) => setGoal(e.target.value)} className="flex-1 sm:flex-none bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white">
                  <option value="QUEST_COUNT">QUEST_COUNT</option>
                  <option value="XP_EARNED">XP_EARNED</option>
                  <option value="STREAK">STREAK</option>
                </select>
                <input value={target} onChange={(e) => setTarget(e.target.value)} className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white" />
              </div>
            </div>
            <button onClick={() => act(() => api.post('/api/social/challenges', { challengedId: opp, title, goalType: goal, target: Number(target) }), 'Challenge sent!')} className="w-full bg-amber-600 text-white text-xs font-bold py-1.5 rounded-lg">Send Challenge</button>
          </div>
          <p className="text-xs font-bold text-amber-300 mb-1.5">INCOMING / OUTGOING ({incoming.length})</p>
          {incoming.map((c) => (
            <div key={c._id} className="text-xs bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 mb-1.5">
              <div className="text-white font-bold">{c.title} <span className="text-slate-500 font-normal">{c.goalType} x{c.target}</span></div>
              <div className="flex gap-1.5 mt-1.5">
                <button onClick={() => act(() => api.post(`/api/social/challenges/${c._id}/accept`), 'Accepted!')} className="bg-emerald-600 text-white px-2 py-0.5 rounded-md font-bold">Accept</button>
                <button onClick={() => act(() => api.post(`/api/social/challenges/${c._id}/decline`), 'Declined.')} className="bg-slate-700 text-slate-200 px-2 py-0.5 rounded-md">Decline</button>
              </div>
            </div>
          ))}
          <p className="text-xs font-bold text-emerald-300 mb-1.5 mt-2">ACTIVE ({active.length})</p>
          {active.map((c) => (
            <div key={c._id} className="text-xs bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 mb-1.5">
              <div className="text-white font-bold">{c.title} <span className="text-slate-500 font-normal">{c.challengerProgress}/{c.target} vs {c.challengedProgress}/{c.target}</span></div>
              <button onClick={() => act(() => api.post(`/api/social/challenges/${c._id}/progress`, {}), 'Progress synced from gameplay!')} className="mt-1.5 bg-indigo-600 text-white px-2 py-0.5 rounded-md font-bold">Sync Progress</button>
            </div>
          ))}
          <p className="text-xs font-bold text-slate-400 mb-1.5 mt-2">RESULTS ({done.length})</p>
          {done.map((c) => (
            <div key={c._id} className="text-xs text-slate-300 bg-slate-950/40 border border-slate-800 rounded-lg px-3 py-1.5 mb-1">{c.title} - {c.status}{c.winner ? ` - winner: ${typeof c.winner === 'string' ? c.winner : (c.winner as any).username}` : ''}</div>
          ))}
          {msg && <p className="text-xs text-indigo-300 mt-2">{msg}</p>}
        </div>
      )}
    </div>
  );
};
