import { WORLDS, WORLD_TITLES, normalizeWorld } from '../constants/worlds';

describe('World Constants & Validation (Scenario 23 & Worlds)', () => {
  const EXPECTED_8_WORLDS = [
    'HEALTH',
    'WORK',
    'STUDY',
    'HOME',
    'HOBBY',
    'PERSONAL',
    'FITNESS',
    'OTHER',
  ];

  test('23. Shared world definition contains exactly the 8 specified worlds', () => {
    expect(WORLDS).toHaveLength(8);
    expect([...WORLDS].sort()).toEqual([...EXPECTED_8_WORLDS].sort());
  });

  test('All 8 valid worlds are mapped to standard capitalized titles', () => {
    EXPECTED_8_WORLDS.forEach((world) => {
      expect(WORLD_TITLES[world as keyof typeof WORLD_TITLES]).toBeDefined();
    });
  });

  test('normalizeWorld accepts all 8 valid worlds regardless of casing', () => {
    EXPECTED_8_WORLDS.forEach((world) => {
      const lower = world.toLowerCase();
      const upper = world.toUpperCase();
      const capitalized = world.charAt(0).toUpperCase() + world.slice(1).toLowerCase();

      expect(normalizeWorld(lower)).toBe(capitalized);
      expect(normalizeWorld(upper)).toBe(capitalized);
      expect(normalizeWorld(capitalized)).toBe(capitalized);
    });
  });

  test('normalizeWorld rejects invalid worlds with an error', () => {
    expect(() => normalizeWorld('INVALID_WORLD')).toThrow(/Invalid world/);
    expect(() => normalizeWorld('SPACE')).toThrow(/Invalid world/);
    expect(() => normalizeWorld('CRYPTO')).toThrow(/Invalid world/);
    expect(() => normalizeWorld('')).toThrow(/Invalid world/);
    expect(() => normalizeWorld(null as any)).toThrow(/Invalid world/);
    expect(() => normalizeWorld(undefined as any)).toThrow(/Invalid world/);
  });
});
