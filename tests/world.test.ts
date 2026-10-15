import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { BUILDINGS } from '../src/data/buildings';
import { LADDER } from '../src/data/ladder';
import { MemoryStore } from '../src/save/memoryStore';
import { SAVE_VERSION, type SaveData } from '../src/save/schema';
import { DEFAULT_HANDLING } from '../src/data/handling';

describe('building ladder in the shop', () => {
  it('matches the simulator ladder for every shop building', () => {
    for (const b of BUILDINGS) {
      const l = LADDER.find((x) => x.id === b.id)!;
      expect(l, b.id).toBeDefined();
      expect(b.basePrice).toBe(l.basePrice);
      expect(b.priceGrowth).toBe(l.growth);
      expect(b.pps).toBe(l.pps);
      expect(b.effects[0]?.value).toBe(l.bonusPct);
      expect(b.linesPerPiece).toBe(l.linesPerPiece);
    }
    expect(BUILDINGS.map((b) => b.id)).toEqual(LADDER.slice(0, BUILDINGS.length).map((b) => b.id));
  });

  it('each tier unlocks only after the previous one is owned', () => {
    const w = new World(1);
    w.economy.balance = 1e9;
    expect(w.isUnlocked('single')).toBe(true);
    expect(w.isUnlocked('double')).toBe(false);
    expect(w.buy('double')).toBe(false);
    expect(w.buy('single')).toBe(true);
    expect(w.isUnlocked('double')).toBe(true);
    expect(w.isUnlocked('triple')).toBe(false);
    expect(w.buy('double')).toBe(true);
    expect(w.buy('tetris')).toBe(false);
    expect(w.buy('triple')).toBe(true);
    expect(w.buy('tetris')).toBe(true);
    expect(w.autoBoards.map((b) => b.buildingId)).toEqual(['single', 'double', 'triple', 'tetris']);
    expect(w.incomePerSecond()).toBeCloseTo(BUILDINGS.reduce((sum, b) => sum + b.linesPerPiece, 0), 10);
  });

  it('four boards survive a save round trip and keep stepping identically', () => {
    const w = new World(7);
    w.economy.balance = 1e9;
    for (const id of ['single', 'double', 'triple', 'tetris']) w.buy(id);
    w.advance(0);
    for (let t = 16; t <= 20_000; t += 16) w.advance(t);
    const store = new MemoryStore();
    const data: SaveData = { version: SAVE_VERSION, savedAt: 1, world: w.snapshot(), settings: DEFAULT_HANDLING };
    store.save(data);
    const w2 = new World(7, store.load()!.world);
    expect(w2.snapshot()).toEqual(w.snapshot());
    // The loaded world's first tick only sets its clock: give it the original's last tick.
    w2.advance(20_000);
    for (let t = 20_016; t <= 30_000; t += 16) { w.advance(t); w2.advance(t); }
    expect(w2.snapshot()).toEqual(w.snapshot());
  });
});

describe('catch-up formula per building', () => {
  for (const id of ['double', 'triple', 'tetris']) {
    it(`${id}: 10,000 bot pieces earn within 1% of the formula`, () => {
      const w = new World(11);
      w.economy.balance = 1e9;
      for (const b of BUILDINGS) { w.buy(b.id); if (b.id === id) break; }
      // Only the building under test keeps its board: the others are dropped so
      // their income does not blur the comparison.
      w.autoBoards = w.autoBoards.filter((b) => b.buildingId === id);
      w.economy.balance = 0;
      w.advance(0);
      const pieces = 10_000;
      for (let i = 1; i <= pieces; i++) w.advance(i * 1000);
      const expected = pieces * w.incomePerSecond();
      const events = w.drainEvents().filter((e) => e.type === 'botMove');
      const def = BUILDINGS.find((b) => b.id === id)!;
      for (const e of events) {
        if (e.type !== 'botMove') continue;
        expect(e.move.result.lines).toBeLessThanOrEqual(def.clearSize);
        expect(e.move.result.topped).toBe(false);
      }
      // The data file's measured constant must match the bot it describes.
      expect(Math.abs(Number(w.economy.balance) - expected) / expected).toBeLessThan(0.01);
    }, 300_000);
  }
});
