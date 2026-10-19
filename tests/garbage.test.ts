import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { num, toNumber } from '../src/sim/num';
import type { LockResult } from '../src/sim/game';
import { attackRows } from '../src/sim/events';
import { tagsFor } from '../src/sim/attack';
import { migrate } from '../src/save/schema';
import { upgradeById, UPGRADES } from '../src/data/upgrades';

const lock = (over: Partial<LockResult>): LockResult => ({ piece: 'I', lines: 0, spin: 'none', perfectClear: false, comboIndex: -1, b2bExtended: false, topped: false, clearedRows: [], ...over });

type Inner = { manualRate: number; countBoardGarbage(): void; endRound(): void };
const inner = (w: World) => w as unknown as Inner;

// A world in a life whose purchases weigh against `perSecond` Lines a
// second from the hand alone (no bots), so row counts are easy to read.
function life(perSecond = 10): World {
  const w = new World(1);
  w.awardAchievements = false;
  w.advance(0);
  w.startRound();
  inner(w).manualRate = perSecond;
  return w;
}

describe('purchase garbage', () => {
  it('rows: price over a minute of income, rounded down, four at most', () => {
    const w = life(10);
    expect([500, 600, 1_199, 1_200, 2_400, 10_000].map((p) => w.garbageFor(p))).toEqual([0, 1, 1, 2, 4, 4]);
    // With nothing earned yet there is nothing to weigh against.
    expect(life(0).garbageFor(1e9)).toBe(0);
  });

  it('a building or an upgrade bought queues its rows', () => {
    const w = life(1);
    w.economy.balance = num(1e6);
    expect(w.buy('single')).toBe(true); // 110 Lines over 60 s of 1/s: one row
    expect(w.garbageQueue).toBe(1);
    w.economy.stats.manualLines = 1e6;
    inner(w).manualRate = 1e6; // the bot now earns a little; the hand dwarfs it
    const before = w.garbageQueue;
    expect(w.buyUpgrade('manual_200')).toBe(true);
    expect(w.garbageQueue).toBe(before); // cheap next to that rate
    inner(w).manualRate = 0.1;
    expect(w.buyUpgrade('manual_2000')).toBe(true);
    expect(w.garbageQueue).toBe(before + 4);
  });

  it('a clear cancels queued rows by its attack; a piece that clears nothing lets up to four rise', () => {
    const w = life();
    w.garbageQueue = 9;
    const tetris = lock({ lines: 4, clearedRows: [] });
    w.drainEvents();
    w.manualLock(tetris);
    const cancelled = attackRows(tetris, 0).rows;
    expect(cancelled).toBeGreaterThan(0);
    expect(w.garbageQueue).toBe(9 - cancelled);
    expect(w.drainEvents().find((e) => e.type === 'garbageCancel')).toEqual({ type: 'garbageCancel', rows: cancelled });
    const q = w.garbageQueue;
    w.manualLock(lock({ lines: 0 }));
    expect(w.garbageQueue).toBe(q - Math.min(4, q));
    expect(w.manual.garbageRows()).toBe(Math.min(4, q));
  });

  it('bought between lives, the rows wait for the next life', () => {
    const w = new World(1);
    w.awardAchievements = false;
    inner(w).manualRate = 1;
    w.economy.balance = num(1e6);
    w.buy('single'); // 138 (list price) over a minute of 1/s, twice over between lives: 4 rows
    expect(w.garbageQueue).toBe(4);
    expect(w.manual.garbageRows()).toBe(0);
    w.advance(0);
    w.startRound();
    w.manualLock(lock({ lines: 0 }));
    expect(w.manual.garbageRows()).toBe(4);
  });

  it('a top-out sends the board\'s garbage back to the queue', () => {
    const w = life();
    for (let i = 0; i < 3; i++) w.manual.addGarbage(i);
    inner(w).endRound();
    expect(w.manual.garbageRows()).toBe(0);
    expect(w.garbageQueue).toBe(3);
  });

  it('garbage on the board slows the bots 5% a row, half at most; the hand is untouched', () => {
    const w = life();
    const bots = () => w.economy.incomeMultiplier(['board:auto']);
    const hand = () => w.economy.incomeMultiplier(['board:manual']);
    const clean = { bots: bots(), hand: hand() };
    for (let i = 0; i < 3; i++) w.manual.addGarbage(i);
    inner(w).countBoardGarbage();
    expect(bots() / clean.bots).toBeCloseTo(0.85, 9);
    expect(hand()).toBe(clean.hand);
    for (let i = 0; i < 9; i++) w.manual.addGarbage(i % 10);
    inner(w).countBoardGarbage();
    expect(bots() / clean.bots).toBeCloseTo(0.5, 9);
  });

  it('garbage rows cleared by a technique pay ten seconds of PER SECOND each', () => {
    const w = life();
    w.economy.balance = num(1e6);
    w.buy('single');
    const perSecond = toNumber(w.incomePerSecond());
    expect(perSecond).toBeGreaterThan(0);
    w.drainEvents();
    w.manualLock(lock({ lines: 4, garbageCleared: { clean: 2, cheese: 0 } }));
    const bonus = w.drainEvents().find((e) => e.type === 'garbageBonus');
    expect(bonus && bonus.type === 'garbageBonus' ? Math.abs(Number(bonus.amount) - perSecond * 20) : Infinity).toBeLessThan(1);
    expect(w.economy.stats.garbageBonusRows).toBe(2);
    // A plain double through garbage pays no bonus.
    w.manualLock(lock({ lines: 2, garbageCleared: { clean: 2, cheese: 0 } }));
    expect(w.drainEvents().some((e) => e.type === 'garbageBonus')).toBe(false);
  });
});

describe('hardcore pays techniques', () => {
  it('a plain clear pays half by hand; a technique pays in full', () => {
    const w = new World(1);
    w.economy.meta.hardcore = true;
    const m = (r: LockResult) => w.economy.incomeMultiplier(tagsFor(r, ['board:manual']));
    const plain = m(lock({ lines: 2 }));
    expect(plain / m(lock({ lines: 4 }))).toBeCloseTo(0.5, 9);
    expect(m(lock({ piece: 'T', spin: 'full', lines: 2 }))).toBeCloseTo(m(lock({ lines: 4 })), 9);
    expect(m(lock({ lines: 1, comboIndex: 4 }))).toBeCloseTo(m(lock({ lines: 4 })), 9);
    expect(m(lock({ lines: 1, comboIndex: 3 }))).toBeCloseTo(plain, 9);
    w.economy.meta.hardcore = false;
    expect(m(lock({ lines: 2 }))).toBeCloseTo(m(lock({ lines: 4 })), 9);
  });
});

describe('HOLD ×2 is gone', () => {
  it('no longer sold; a save that bought it gets its price back and one hold slot', () => {
    expect(upgradeById('hold2')).toBeUndefined();
    expect(UPGRADES.some((u) => u.effects.some((e) => e.target === 'rule:hold2'))).toBe(false);
    const w = new World(1);
    const v10 = JSON.parse(JSON.stringify({ version: 10, savedAt: 0, world: w.snapshot() }));
    v10.world.economy.upgrades.push('hold2');
    v10.world.economy.balance = '500';
    v10.world.manual.holds = ['T', 'I'];
    const data = migrate(v10)!;
    expect(data.world.economy.upgrades).not.toContain('hold2');
    expect(Number(data.world.economy.balance)).toBe(20_500);
    expect(data.world.manual.holds).toEqual(['T']);
    expect(new World(1, data.world).manual.rules.holdSlots).toBe(1);
  });
});
