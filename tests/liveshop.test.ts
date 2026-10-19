import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { num } from '../src/sim/num';
import { PIECES } from '../src/sim/pieces';
import type { LockResult } from '../src/sim/game';

const STEP = 1000 / 60;
const lock = (over: Partial<LockResult>): LockResult => ({ piece: 'I', lines: 0, spin: 'none', perfectClear: false, comboIndex: -1, b2bExtended: false, topped: false, clearedRows: [], ...over });
const setRate = (w: World, r: number) => { (w as unknown as { manualRate: number }).manualRate = r; };

describe('buying during a life', () => {
  it('a running life buys 20% under the list price; between lives and paused, the list price', () => {
    const w = new World(1);
    w.awardAchievements = false;
    w.economy.balance = num(1e9);
    w.economy.stats.manualLines = 1e6;
    const prices = () => ({ b: Number(w.economy.price('single')), u: Number(w.economy.upgradePrice('manual_200')) });
    w.advance(0);
    w.buy('single'); // a reading of the idle price after a purchase
    const idle = prices();
    w.startRound();
    w.step(STEP);
    // Live is the base price; the list price is that ×1.25, rounded up.
    expect(Math.ceil(prices().b * 1.25 - 1e-9)).toBe(idle.b);
    expect(Math.ceil(prices().u * 1.25 - 1e-9)).toBe(idle.u);
    w.pauseRound();
    expect(prices()).toEqual(idle);
    const before = Number(w.economy.balance);
    w.resumeRound();
    expect(w.buyUpgrade('manual_200')).toBe(true);
    expect(Math.ceil((before - Number(w.economy.balance)) * 1.25 - 1e-9)).toBe(idle.u);
  });

  it('between lives a purchase sends twice the rows, up to eight; in a life up to four', () => {
    const w = new World(1);
    w.advance(0);
    setRate(w, 10);
    expect(w.garbageFor(1_200)).toBe(4); // 2 rows ×2
    expect(w.garbageFor(100_000)).toBe(8);
    w.startRound();
    setRate(w, 10);
    expect(w.garbageFor(1_200)).toBe(2);
    expect(w.garbageFor(100_000)).toBe(4);
  });
});

describe('a fresh bag every life', () => {
  it('after a top-out the next life opens on a full 7-bag with hold empty', () => {
    const w = new World(3);
    w.awardAchievements = false;
    w.advance(0);
    w.startRound();
    w.manual.swapHold();
    w.manualLock(lock({ topped: true }));
    expect(w.round.active).toBe(false);
    expect(w.manual.holds).toEqual([]);
    const first = [w.manual.active!.piece, ...w.manual.next(6)];
    expect(new Set(first).size).toBe(PIECES.length);
  });
});

describe('the invader', () => {
  it('sends a cheese row every three seconds, whatever the level', () => {
    for (const level of [5, 15]) {
      const w = new World(1);
      w.advance(0);
      w.startRound();
      w.round.startLevel = level;
      w.beginEvent('invader');
      w.drainEvents();
      let rows = 0;
      for (let t = 1; t <= 31_000; t += STEP) { // ten gaps and a little
        w.advance(t);
        if (w.manual.active) w.manual.active = { ...w.manual.active, y: 20 };
        for (const e of w.drainEvents()) if (e.type === 'garbage') rows += e.rows;
      }
      expect(rows).toBe(10);
    }
  });
});
