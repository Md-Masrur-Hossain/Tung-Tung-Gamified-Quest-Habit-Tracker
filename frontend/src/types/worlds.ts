export const allWorlds = ['Health', 'Work', 'Study', 'Home', 'Hobby', 'Personal', 'Fitness', 'Other'] as const;

export type World = typeof allWorlds[number];
