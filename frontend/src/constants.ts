export const QUEST_TYPES = ['daily', 'weekly', 'epic', 'boss', 'quick'] as const;
export const DIFFICULTIES = ['easy', 'medium', 'hard', 'epic'] as const;
export const CATEGORIES = ['Health', 'Work', 'Study', 'Fitness', 'Home', 'Hobby', 'Personal', 'Other'] as const;

// XP mapping used on client for preview (must match backend logic)
export const XP_MAP: Record<string, Record<string, number>> = {
  easy: { daily: 50, weekly: 75, quick: 40, epic: 100, boss: 125 },
  medium: { daily: 100, weekly: 150, quick: 80, epic: 200, boss: 250 },
  hard: { daily: 150, weekly: 225, quick: 120, epic: 300, boss: 375 },
  epic: { daily: 300, weekly: 450, quick: 240, epic: 600, boss: 750 },
};
