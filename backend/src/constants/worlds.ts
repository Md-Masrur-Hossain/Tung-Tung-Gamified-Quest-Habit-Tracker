export const WORLDS = [
  'HEALTH',
  'WORK',
  'STUDY',
  'HOME',
  'HOBBY',
  'PERSONAL',
  'FITNESS',
  'OTHER',
] as const;

export type WorldName = typeof WORLDS[number];

export const WORLD_TITLES: Record<WorldName, string> = {
  HEALTH: 'Health',
  WORK: 'Work',
  STUDY: 'Study',
  HOME: 'Home',
  HOBBY: 'Hobby',
  PERSONAL: 'Personal',
  FITNESS: 'Fitness',
  OTHER: 'Other',
};

export const normalizeWorld = (input?: string | null): string => {
  if (!input || typeof input !== 'string') {
    throw new Error('Invalid world: category is required');
  }
  const upper = input.trim().toUpperCase() as WorldName;
  if (!WORLDS.includes(upper)) {
    throw new Error(`Invalid world/category: ${input}`);
  }
  return WORLD_TITLES[upper];
};
