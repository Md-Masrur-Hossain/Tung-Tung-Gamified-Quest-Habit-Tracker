import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000',
  withCredentials: true,
});

export default api;

// Request interceptor to add JWT token if present
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor to handle 401 globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Remove token and redirect to login page maybe
      localStorage.removeItem('token');
    }
    return Promise.reject(error);
  }
);

// Live API (Sprint 6A/6B): leaderboard snapshots and persisted notifications.
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  level: number;
  totalXP: number;
  longestStreak: number;
}

export interface LeaderboardSnapshot {
  scope: 'global' | 'friends';
  generatedAt: string;
  entries: LeaderboardEntry[];
}

export interface LiveNotification {
  _id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

export const getLeaderboard = (scope: 'global' | 'friends' = 'global', limit?: number) =>
  api.get('/api/live/leaderboard', { params: { scope, ...(limit ? { limit } : {}) } });

export const getNotifications = () => api.get('/api/live/notifications');

export const markNotificationRead = (id: string) => api.post(`/api/live/notifications/${id}/read`);

// Boss API
export const createBoss = (data: any) => api.post('/api/bosses', data);
export const getBosses = (params?: any) => api.get('/api/bosses', { params });
export const getBoss = (id: string) => api.get(`/api/bosses/${id}`);
export const completeBossAction = (bossId: string, actionId: string) =>
  api.post(`/api/bosses/${bossId}/actions/${actionId}/complete`);

// Quick Quest API
export const createQuickQuest = (data: any) => api.post('/api/quick-quests', data);
export const getQuickQuests = (params?: any) => api.get('/api/quick-quests', { params });
export const completeQuickQuest = (id: string) => api.post(`/api/quick-quests/${id}/complete`);

// Rewards & Shop API
export const getShopItems = () => api.get('/api/rewards/shop');
export const purchaseShopItem = (itemId: string) => api.post('/api/rewards/shop/purchase', { itemId });
export const getUserInventory = () => api.get('/api/rewards/inventory');
export const equipCosmeticItem = (itemId: string) => api.post('/api/rewards/cosmetics/equip', { itemId });
export const equipPlayerTitle = (title: string) => api.post('/api/rewards/titles/equip', { title });
export const getUserAchievements = () => api.get('/api/rewards/achievements');
export const getPlayerRewardProfile = () => api.get('/api/rewards/profile');

// Social / Friends API
export const searchUsers = (query: string) => api.get('/api/social/friends/search', { params: { q: query } });
export const sendFriendRequest = (recipientId: string) => api.post('/api/social/friends/requests', { recipientId });
export const acceptFriendRequest = (requestId: string) => api.post(`/api/social/friends/requests/${requestId}/accept`);
export const rejectFriendRequest = (requestId: string) => api.post(`/api/social/friends/requests/${requestId}/reject`);
export const getFriends = () => api.get('/api/social/friends');
export const getIncomingFriendRequests = () => api.get('/api/social/friends/requests/incoming');
export const getOutgoingFriendRequests = () => api.get('/api/social/friends/requests/outgoing');
export const removeFriend = (friendId: string) => api.delete(`/api/social/friends/${friendId}`);

// Party API
export const createParty = (name: string) => api.post('/api/social/parties', { name });
export const getParty = (partyId: string) => api.get(`/api/social/parties/${partyId}`);
export const getUserParties = () => api.get('/api/social/parties');
export const inviteToParty = (partyId: string, friendId: string) => api.post(`/api/social/parties/${partyId}/invite`, { friendId });
export const removePartyMember = (partyId: string, memberId: string) => api.delete(`/api/social/parties/${partyId}/members/${memberId}`);
export const leaveParty = (partyId: string) => api.post(`/api/social/parties/${partyId}/leave`);

// Co‑op Quest API
export const createCoopQuest = (data: any) => api.post('/api/social/coop-quests', data);
export const getPartyCoopQuests = (partyId: string) => api.get(`/api/social/parties/${partyId}/coop-quests`);
export const contributeToCoopQuest = (questId: string) => api.post(`/api/social/coop-quests/${questId}/contribute`);

// Challenge API (Sprint 5: progress is server-derived; client only requests a sync)
export const createChallenge = (data: any) => api.post('/api/social/challenges', data);
export const acceptChallenge = (challengeId: string) => api.post(`/api/social/challenges/${challengeId}/accept`);
export const declineChallenge = (challengeId: string) => api.post(`/api/social/challenges/${challengeId}/decline`);
export const getUserChallenges = () => api.get('/api/social/challenges');
export const recordChallengeProgress = (challengeId: string) => api.post(`/api/social/challenges/${challengeId}/progress`, {});
