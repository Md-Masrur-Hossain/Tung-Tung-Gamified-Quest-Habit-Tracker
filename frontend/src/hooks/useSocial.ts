import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';

export interface SocialUser {
  _id: string;
  username: string;
  level?: number;
}
export interface FriendEntry {
  friendshipId: string;
  friend: SocialUser;
}
export interface FriendRequest {
  _id: string;
  requester?: SocialUser;
  recipient?: SocialUser;
}
export interface Party {
  _id: string;
  name: string;
  leader: SocialUser | string;
  members: SocialUser[];
  status: string;
}
export interface CoopQuest {
  _id: string;
  title: string;
  category: string;
  targetCount: number;
  status: string;
  contributions?: { userId: any }[];
}
export interface Challenge {
  _id: string;
  title: string;
  goalType: string;
  target: number;
  status: string;
  challenger: SocialUser;
  challenged: SocialUser;
  challengerProgress: number;
  challengedProgress: number;
  winner?: SocialUser | string | null;
}

export const useSocial = () => {
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [coopQuests, setCoopQuests] = useState<CoopQuest[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fr, inc, out, pa, ch] = await Promise.all([
        api.get('/api/social/friends'),
        api.get('/api/social/friends/requests/incoming'),
        api.get('/api/social/friends/requests/outgoing'),
        api.get('/api/social/parties'),
        api.get('/api/social/challenges'),
      ]);
      setFriends(fr.data || []);
      setIncoming(inc.data || []);
      setOutgoing(out.data || []);
      setParties(pa.data || []);
      setChallenges(ch.data || []);
      const firstParty = (pa.data || [])[0];
      if (firstParty?._id) {
        try {
          const cq = await api.get(`/api/social/parties/${firstParty._id}/coop-quests`);
          setCoopQuests(cq.data || []);
        } catch {
          setCoopQuests([]);
        }
      } else {
        setCoopQuests([]);
      }
    } catch (e: any) {
      setError(e.response?.data?.message || e.message || 'Failed to load social data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { friends, incoming, outgoing, parties, coopQuests, setCoopQuests, challenges, loading, error, refresh };
};
