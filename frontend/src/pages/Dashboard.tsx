// src/pages/Dashboard.tsx
import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useProgress } from '../hooks/useProgress';
import api from '../lib/api';
import { ProgressBar } from '../components/ProgressBar';
import { StreakBadge } from '../components/StreakBadge';
import { LevelUpOverlay } from '../components/LevelUpOverlay';
import { QuestCard } from '../components/QuestCard';
import { QuestCreator } from '../components/QuestCreator';
import { useBosses } from '../hooks/useBosses';
import { BossCard } from '../components/BossCard';
import { useQuickQuests } from '../hooks/useQuickQuests';
import { LifeWorlds } from '../components/LifeWorlds';
import { useRewards } from '../hooks/useRewards';
import { PlayerRewardProfile } from '../components/PlayerRewardProfile';
import { ShopSection } from '../components/ShopSection';
import { AchievementsSection } from '../components/AchievementsSection';
import { SocialSection } from '../components/SocialSection';
import { LiveActivityPanel } from '../components/LiveActivityPanel';
import { RealtimePanel } from '../components/RealtimePanel';
import { AnalyticsSection } from '../components/AnalyticsSection';
import { NextActionCard } from '../components/NextActionCard';
import { useNextAction } from '../hooks/useNextAction';
import { SmartTipsPanel } from '../components/SmartTipsPanel';
import { useSuggestions } from '../hooks/useSuggestions';
import { RestModePanel } from '../components/RestModePanel';
import { useRestMode } from '../hooks/useRestMode';

interface Quest {
  _id: string;
  title: string;
  description?: string;
  type: string;
  category: string;
  difficulty: string;
  xpReward: number;
  status: 'pending' | 'completed';
  deadline?: string;
}

export const Dashboard: React.FC = () => {
  const { user, refreshUser, logout } = useAuth();
  const { progression, refresh, previousLevel, previousStreak } = useProgress();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [questsError, setQuestsError] = useState<string | null>(null);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [activeTab, setActiveTab] = useState<'ADVENTURE' | 'SHOP' | 'ACHIEVEMENTS'>('ADVENTURE');
  const [companionMessage, setCompanionMessage] = useState<string | null>(null);

  // Bosses and quick quests hooks
  const { bosses, loading: bossesLoading, error: bossesError, refresh: refreshBosses } = useBosses();
  const { quests: quickQuests, loading: quickLoading, error: quickError, refresh: refreshQuick } = useQuickQuests();

  // Rewards, Shop, and Profile hook
  const {
    shopItems,
    inventory,
    profile,
    achievements,
    refresh: refreshRewards,
    buyItem,
    equipCosmetic,
    equipTitle,
  } = useRewards();

  // Sprint 7B UI: server-generated next-action guide (read-only fetch)
  const {
    data: nextAction,
    loading: nextActionLoading,
    error: nextActionError,
    refresh: refreshNextAction,
  } = useNextAction();

  // Sprint 7C UI: server-generated smart suggestions (read-only fetch)
  const {
    data: suggestions,
    loading: suggestionsLoading,
    error: suggestionsError,
    refresh: refreshSuggestions,
  } = useSuggestions();

  // Sprint 7D UI: player-owned Rest Mode preference (server-owned state + rules)
  const {
    data: restMode,
    loading: restModeLoading,
    error: restModeError,
    toggling: restModeToggling,
    toggleError: restModeToggleError,
    refresh: refreshRestMode,
    setEnabled: setRestModeEnabled,
  } = useRestMode();

  const fetchQuests = async () => {
    if (!user) return;
    try {
      const resp = await api.get('/api/quests');
      setQuests(resp.data.quests as Quest[]);
      setQuestsError(null);
    } catch (e: any) {
      // Surface a retryable state instead of rendering a silently empty quest log.
      setQuestsError(e?.response?.data?.message || e?.message || 'Could not load your quests.');
    } finally {
      setLoading(false);
    }
  };

  const refreshAll = async () => {
    await refreshUser();
    await refresh();
    await fetchQuests();
    await refreshBosses();
    await refreshQuick();
    await refreshRewards();
    await refreshNextAction(); // re-ask the guide after the player acts
    await refreshSuggestions(); // refresh tips after the player acts
    await refreshRestMode(); // re-ask for the lighter-session guide after the player acts
  };

  const handleQuestCompleted = async () => {
    await refreshAll();
    // Companion reaction
    const dialogs: Record<string, string> = {
      companion_cat: 'Purr! Excellent execution, hooman! +Coins earned!',
      companion_dog: 'Woof! Another quest down! Good job! +Coins!',
      companion_dragon: 'Roar! Your momentum burns like dragonfire!',
      companion_robot: 'Bleep bloop! Quest verified: 100% optimal.',
    };
    const equipped = profile?.equippedCompanion;
    if (equipped && dialogs[equipped]) {
      setCompanionMessage(dialogs[equipped]);
      setTimeout(() => setCompanionMessage(null), 4000);
    }
  };

  useEffect(() => {
    fetchQuests();
  }, [user]);

  // Level up detection & companion celebration
  useEffect(() => {
    if (previousLevel !== null && progression && progression.level > previousLevel) {
      setShowLevelUp(true);
      const equipped = profile?.equippedCompanion;
      if (equipped) {
        setCompanionMessage('🎉 LEVEL UP! Outstanding growth, champion!');
        setTimeout(() => setCompanionMessage(null), 5000);
      }
    }
  }, [progression, previousLevel]);

  const handleLevelUpClose = () => setShowLevelUp(false);

  // Today's adventure calculations
  const pendingQuests = quests.filter((q) => q.status === 'pending');
  const completedQuests = quests.filter((q) => q.status === 'completed');
  const totalAvailableXP = pendingQuests.reduce((sum, q) => sum + q.xpReward, 0);
  const totalQuests = quests.length;
  const completedCount = completedQuests.length;
  const progressPercent = totalQuests ? (completedCount / totalQuests) * 100 : 0;

  return (
    <div className="w-full max-w-full sm:max-w-7xl mx-auto p-4 sm:p-6 min-h-screen bg-darkBg text-white box-border overflow-x-clip">
      {/* Level Up Overlay */}
      {showLevelUp && progression && (
        <LevelUpOverlay newLevel={progression.level} onClose={handleLevelUpClose} />
      )}

      {/* Top Header */}
      <header className="flex flex-wrap justify-between items-center gap-4 mb-6 w-full">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white">Tung-Tung</h1>
          <p className="text-xs text-slate-400">Real life, but it's an RPG adventure.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <StreakBadge
            pulse={!!(previousStreak !== null && progression && progression.currentStreak > previousStreak)}
          />
          {user && (
            <span className="text-sm text-slate-300 font-semibold">{user.username}</span>
          )}
          <button
            onClick={logout}
            className="px-3 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-700 transition rounded text-white"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Sprint 6C: Live Activity — today's deterministic event, realtime */}
      <LiveActivityPanel />

      {/* Sprint 8 UI: leaderboard + notifications over the existing live APIs */}
      <RealtimePanel />

      {/* Sprint 4: RPG Reward Profile Header */}
      <PlayerRewardProfile
        profile={profile}
        onEquipTitle={equipTitle}
        companionReaction={companionMessage}
      />

      {/* Navigation Tabs — sticky so the primary sections stay reachable from anywhere
          on this long single-scroll dashboard (previously buried thousands of px down). */}
      <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-2 pb-1 bg-darkBg/95 backdrop-blur-sm border-b border-slate-800 shadow-lg">
        <div className="flex border-b border-slate-800/0 mb-4 gap-2 overflow-x-auto max-w-full pb-1">
        <button
          onClick={() => setActiveTab('ADVENTURE')}
          className={`px-4 py-2.5 font-bold text-sm rounded-t-xl transition whitespace-nowrap flex-shrink-0 ${
            activeTab === 'ADVENTURE'
              ? 'bg-slate-800 text-white border-t-2 border-indigo-500'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          ⚔️ Adventure & Bosses
        </button>
        <button
          onClick={() => setActiveTab('SHOP')}
          className={`px-4 py-2.5 font-bold text-sm rounded-t-xl transition whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 ${
            activeTab === 'SHOP'
              ? 'bg-slate-800 text-white border-t-2 border-amber-500'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <span>🛒</span> Reward Shop
          {profile && profile.coins > 0 && (
            <span className="text-[10px] bg-amber-500 text-slate-950 font-black px-1.5 py-0.2 rounded-full">
              {profile.coins}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('ACHIEVEMENTS')}
          className={`px-4 py-2.5 font-bold text-sm rounded-t-xl transition whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 ${
            activeTab === 'ACHIEVEMENTS'
              ? 'bg-slate-800 text-white border-t-2 border-purple-500'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <span>🏆</span> Achievements
        </button>
        </div>
      </div>

      {activeTab === 'SHOP' && (
        <ShopSection
          items={shopItems}
          inventory={inventory}
          profile={profile}
          onBuy={buyItem}
          onEquip={equipCosmetic}
        />
      )}

      {activeTab === 'ACHIEVEMENTS' && (
        <AchievementsSection achievements={achievements} />
      )}

      {activeTab === 'ADVENTURE' && (
        <>
          {/* Sprint 7B UI: "What Should I Do Now?" guide (server-generated) */}
          <NextActionCard
            data={nextAction}
            loading={nextActionLoading}
            error={nextActionError}
            onRetry={() => void refreshNextAction()}
          />

          {/* Sprint 7C UI: "💡 Smart Tips" panel (server-generated) */}
          <SmartTipsPanel
            data={suggestions}
            loading={suggestionsLoading}
            error={suggestionsError}
            quests={quests}
            onRetry={() => void refreshSuggestions()}
          />

          {/* Sprint 7D UI: 🌙 Rest Mode switch (server-owned preference) */}
          <RestModePanel
            data={restMode}
            loading={restModeLoading}
            error={restModeError}
            toggling={restModeToggling}
            toggleError={restModeToggleError}
            questIds={[...quests.map((q) => q._id), ...quickQuests.map((q) => q._id)]}
            onToggle={(enabled) => void setRestModeEnabled(enabled)}
            onRetry={() => void refreshRestMode()}
          />

          {/* Progress Section */}
          {progression && (
            <section className="mb-8 bg-slate-900/60 p-5 rounded-xl border border-slate-800/80">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-xl font-bold">Level {progression.level} Progression</h2>
                <span className="text-xs text-indigo-400 font-semibold">{progression.totalXP} / {progression.xpForNext} XP</span>
              </div>
              <ProgressBar
                totalXP={progression.totalXP}
                level={progression.level}
                xpForNext={progression.xpForNext}
                progressPercent={progression.progressPercent}
              />
            </section>
          )}

          {/* Today's Adventure */}
          <section id="todays-adventure" className="mb-8">
            <h2 className="text-2xl font-bold mb-4">Today's Adventure</h2>
            {loading ? (
              <p className="text-slate-400 text-sm">Loading quests...</p>
            ) : questsError ? (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm">
                <p className="text-rose-200 font-semibold">{questsError}</p>
                <button
                  onClick={() => {
                    setLoading(true);
                    void fetchQuests();
                  }}
                  className="mt-3 px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-bold transition"
                >
                  Retry loading quests
                </button>
              </div>
            ) : quests.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/50 p-6 text-center">
                <p className="text-lg font-bold text-white">Your quest log is empty</p>
                <p className="mt-1 text-sm text-slate-400">
                  Add your first quest, or start a quick one, to begin earning XP and coins.
                </p>
                <div className="mt-4 flex justify-center">
                  <QuestCreator onCreated={refreshAll} />
                </div>
              </div>
            ) : (
              <div>
                <p className="mb-2 text-sm text-slate-300">
                  Quests: <span className="text-amber-400 font-bold">{pendingQuests.length} pending</span> |{' '}
                  <span className="text-emerald-400 font-bold">{completedCount} completed</span>
                </p>
                <p className="mb-4 text-xs text-slate-400">Available XP: {totalAvailableXP}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {quests.map((quest) => (
                    <div key={quest._id} id={`quest-${quest._id}`}>
                      <QuestCard quest={quest} onComplete={handleQuestCompleted} />
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-purpleAccent h-3 transition-all duration-700"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Overall progress: {completedCount}/{totalQuests} quests</p>
                </div>
              </div>
            )}
          </section>

          {/* Active Boss */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">⚔️ ACTIVE BOSS</h2>
            {bossesLoading ? (
              <p className="text-slate-400 text-sm">Loading boss...</p>
            ) : bossesError ? (
              <p className="text-rose-400 text-sm">{bossesError}</p>
            ) : (
              <div className="grid gap-4">
                {bosses.map((boss) => (
                  <BossCard key={boss._id} boss={boss} refresh={refreshAll} />
                ))}
              </div>
            )}
          </section>

          {/* Quick Quests */}
          <section id="quick-quests" className="mb-8">
            <h2 className="text-2xl font-bold mb-4">⚡ QUICK QUESTS</h2>
            {quickLoading ? (
              <p className="text-slate-400 text-sm">Loading quick quests...</p>
            ) : quickError ? (
              <p className="text-rose-400 text-sm">{quickError}</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {quickQuests.map((q) => (
                  <div key={q._id} id={`qquest-${q._id}`}>
                    <QuestCard quest={q as any} onComplete={handleQuestCompleted} />
                  </div>
                ))}
              </div>
            )}

            {/* Sprint 8: a real, always-available action inside the Quick Quests
                section (the heading itself is not interactive). */}
            <div className="mt-4">
              <QuestCreator onCreated={refreshAll} />
            </div>
          </section>

          {/* Life Worlds */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">🌍 YOUR LIFE WORLDS</h2>
            <LifeWorlds />
          </section>

          {/* Sprint 7A: Player Stats (server-derived analytics, read-only) */}
          <AnalyticsSection />

          {/* Sprint 5: Social Alliance Hall (Dashboard-embedded, dark RPG) */}
          <SocialSection />
        </>
      )}
    </div>
  );
};

export default Dashboard;
