// src/components/QuestCreator.tsx
// Sprint 8 fix: exposes the EXISTING quest-creation endpoints
// (POST /api/quests, POST /api/quick-quests) to new players. It is a small
// inline form (no new page/modal architecture) that the Dashboard mounts in the
// empty quest state and in the Quick Quests section, so a fresh account can
// always add its first quest with a single visible button.
import React, { useState } from 'react';
import { useQuestCreator } from '../hooks/useQuestCreator';

type Mode = 'quest' | 'quick';

export const QuestCreator: React.FC<{ onCreated?: () => void | Promise<void> }> = ({ onCreated }) => {
  const { creating, error, createQuest, createQuickQuest, categories, difficulties } = useQuestCreator(onCreated);
  const [open, setOpen] = useState<Mode | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(categories[0]);
  const [difficulty, setDifficulty] = useState(difficulties[0]);

  const reset = () => {
    setTitle('');
    setDescription('');
    setOpen(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || creating) return;
    const draft = { title: title.trim(), description: description.trim() || undefined, category, difficulty };
    const created = open === 'quick' ? await createQuickQuest(draft) : await createQuest(draft);
    if (created) reset();
  };

  if (!open) {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setOpen('quest')}
          className="px-4 py-2 rounded-lg bg-tealAccent hover:bg-teal-600 text-white font-bold transition"
        >
          New Quest
        </button>
        <button
          onClick={() => setOpen('quick')}
          className="px-4 py-2 rounded-lg bg-purpleAccent hover:opacity-90 text-white font-bold transition"
        >
          Quick Quest
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 rounded-xl border border-slate-700 bg-slate-900/80 p-4 text-left" aria-label="Quest creator">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-black tracking-widest text-slate-300 uppercase">
          {open === 'quick' ? 'New Quick Quest' : 'New Quest'}
        </h3>
        <button type="button" onClick={reset} className="text-xs text-slate-400 hover:text-white font-bold">
          Cancel
        </button>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Quest title"
        aria-label="Quest title"
        className="w-full mb-2 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white"
        required
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        aria-label="Quest description"
        rows={2}
        className="w-full mb-2 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white resize-none"
      />

      <div className="flex flex-wrap gap-2 mb-3">
        <label className="flex flex-1 min-w-[130px] flex-col text-xs text-slate-400">
          World
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Quest world"
            className="mt-1 rounded-lg bg-slate-900 border border-slate-700 px-2 py-2 text-sm text-white"
          >
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 min-w-[130px] flex-col text-xs text-slate-400">
          Difficulty
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            aria-label="Quest difficulty"
            className="mt-1 rounded-lg bg-slate-900 border border-slate-700 px-2 py-2 text-sm text-white"
          >
            {difficulties.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="text-xs text-rose-400 mb-2" role="alert">{error}</p>}

      <button
        type="submit"
        disabled={creating || !title.trim()}
        className={`w-full rounded-lg px-4 py-2 font-bold transition ${
          creating || !title.trim() ? 'bg-slate-700 text-slate-400' : 'bg-tealAccent hover:bg-teal-600 text-white'
        }`}
      >
        {creating ? 'Saving...' : open === 'quick' ? 'Start Quick Quest' : 'Save Quest'}
      </button>
    </form>
  );
};

export default QuestCreator;