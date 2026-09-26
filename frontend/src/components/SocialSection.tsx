import React from 'react';
import { useSocial } from '../hooks/useSocial';
import { FriendsPanel } from './FriendsPanel';
import { PartyPanel } from './PartyPanel';
import { ChallengesPanel } from './ChallengesPanel';

export const SocialSection: React.FC = () => {
  const { friends, incoming, outgoing, parties, coopQuests, setCoopQuests, challenges, loading, error, refresh } = useSocial();
  return (
    <section className="mb-8">
      <h2 className="text-2xl font-bold mb-4">Alliance Hall</h2>
      {loading && <p className="text-slate-400 text-sm mb-2">Loading alliance data...</p>}
      {error && <p className="text-rose-400 text-sm mb-2">{error}</p>}
      <FriendsPanel friends={friends} incoming={incoming} outgoing={outgoing} onChanged={refresh} />
      <PartyPanel parties={parties} friends={friends} coopQuests={coopQuests} onChanged={refresh} onCoopChanged={setCoopQuests} />
      <ChallengesPanel challenges={challenges} friends={friends} onChanged={refresh} />
    </section>
  );
};
