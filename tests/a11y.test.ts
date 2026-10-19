import { afterEach, describe, expect, test } from 'vitest';
import { PALETTES, PIECE_COLORS, setPalette } from '../src/render/theme';
import { World } from '../src/sim/world';
import { SAVE_VERSION, migrate } from '../src/save/schema';
import { PIECES } from '../src/sim/pieces';

describe('palettes', () => {
  afterEach(() => setPalette('standard'));

  test('a switch rewrites the one colour table every board reads', () => {
    const before = PIECE_COLORS;
    setPalette('cvd');
    expect(PIECE_COLORS).toBe(before);
    expect(PIECE_COLORS).toEqual(PALETTES.cvd);
    setPalette('standard');
    expect(PIECE_COLORS).toEqual(PALETTES.standard);
  });

  test('every piece has its own colour in both palettes', () => {
    for (const p of Object.values(PALETTES)) {
      expect(Object.keys(p).sort()).toEqual([...PIECES].sort());
      expect(new Set(Object.values(p)).size).toBe(PIECES.length);
    }
  });
});

describe('save v10', () => {
  test('a v9 save gains the rival streak at zero', () => {
    const w = new World(1);
    const v9 = JSON.parse(JSON.stringify({ version: 9, savedAt: 0, world: w.snapshot() }));
    delete v9.world.meta.rivalStreak;
    delete v9.world.meta.rivalBest;
    const data = migrate(v9)!;
    expect(data.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(10);
    const meta = data.world.meta as unknown as Record<string, number>;
    expect(meta['rivalStreak']).toBe(0);
    expect(meta['rivalBest']).toBe(0);
  });
});
