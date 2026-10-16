import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { num, toNumber } from '../src/sim/num';
import { BUFFS } from '../src/data/golden';
import type { GameSnapshot } from '../src/sim/game';

const STEP = 1000 / 60;

function botWorld(): World {
  const w = new World(1);
  w.economy.balance = num(1e6);
  w.buy('single');
  w.economy.balance = num(0);
  w.advance(0);
  return w;
}

function readyManual(w: World): World {
  const snap = w.snapshot();
  snap.manual = {
    grid: '1111111110/1111111110/1111111110/1111111110', holds: [], holdUsed: false,
    queue: ['I', 'O', 'S', 'Z', 'J', 'L', 'T'], rng: 3, combo: -1, b2b: -1, active: null, graceUsed: 0, shieldSpent: false,
  } as GameSnapshot;
  const out = new World(1, snap);
  out.advance(0);
  out.startRound();
  return out;
}

function tetris(w: World) {
  w.manual.rotateCW();
  while (w.manual.moveRight()) { /* wall */ }
  return w.manualHardDrop();
}

function run(w: World, ms: number, from = 0): number {
  let t = from;
  for (; t <= from + ms; t += STEP) w.advance(t);
  return t;
}

describe('buffs', () => {
  it('frenzy multiplies bot income by 7 while it lasts', () => {
    const plain = botWorld();
    const buffed = botWorld();
    buffed.grantBuff('frenzy');
    run(plain, 60_000);
    run(buffed, 60_000);
    expect(Number(plain.economy.balance)).toBeGreaterThan(0);
    expect(Number(buffed.economy.balance)).toBeCloseTo(Number(plain.economy.balance) * 7, 6);
  });

  it('PER SECOND shows the buff, the formula value does not', () => {
    const w = botWorld();
    const base = toNumber(w.incomePerSecond());
    w.grantBuff('frenzy');
    expect(toNumber(w.incomePerSecond(true))).toBeCloseTo(base * 7, 10);
    expect(toNumber(w.incomePerSecond())).toBe(base);
  });

  it('ends after 77 s of game time and outlives the round', () => {
    const w = readyManual(botWorld());
    w.grantBuff('frenzy');
    w.round.end();
    run(w, 76_000, 1);
    expect(w.buffs.active.map((b) => b.id)).toEqual(['frenzy']);
    run(w, 2_000, 76_100);
    expect(w.buffs.active).toEqual([]);
  });

  it('the same buff again restarts the timer instead of adding to it', () => {
    const w = botWorld();
    w.grantBuff('frenzy');
    run(w, 30_000, 1);
    w.grantBuff('frenzy');
    expect(w.buffs.active[0]!.msLeft).toBe(BUFFS.frenzy!.durationMs);
  });

  it('clear frenzy multiplies manual only; with frenzy they multiply', () => {
    const a = readyManual(botWorld());
    a.grantBuff('clear_frenzy');
    tetris(a);
    expect(a.round.vault).toBeCloseTo(10 * 777, 6);
    const b = readyManual(botWorld());
    b.grantBuff('clear_frenzy');
    b.grantBuff('frenzy');
    tetris(b);
    expect(b.round.vault).toBeCloseTo(10 * 777 * 7, 6);
    const plain = botWorld();
    const cf = botWorld();
    cf.grantBuff('clear_frenzy');
    run(plain, 10_000);
    run(cf, 10_000);
    expect(Number(cf.economy.balance)).toBeCloseTo(Number(plain.economy.balance), 6);
  });

  it('a hidden-tab gap uses up buff time without paying the multiplier', () => {
    const w = botWorld();
    w.grantBuff('frenzy');
    const pps = toNumber(w.incomePerSecond());
    w.advance(30_000); // formula gap
    expect(Number(w.economy.balance)).toBeCloseTo(pps * 30, 6);
    expect(w.buffs.active[0]!.msLeft).toBeCloseTo(BUFFS.frenzy!.durationMs - 30_000, 6);
  });

  it('survives a save', () => {
    const w = botWorld();
    w.grantBuff('frenzy');
    run(w, 10_000, 1);
    const back = new World(1, JSON.parse(JSON.stringify(w.snapshot())));
    expect(back.buffs.active).toEqual(w.buffs.active);
  });
});
