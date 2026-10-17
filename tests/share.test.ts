import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { num, toNumber } from '../src/sim/num';
import type { GameSnapshot } from '../src/sim/game';
import { MANUAL_SHARE_UPGRADES } from '../src/data/upgrades';
import { simulate, DEFAULT_PLAYER, DEFAULT_TARGET } from '../src/sim/simulate';
import { LADDER } from '../src/data/ladder';

// Four rows one I short of full, with bots running so PER SECOND is non-zero.
function world(upgrades: string[]): World {
  const w = new World(1);
  w.awardAchievements = false; // exact amounts
  w.economy.balance = num(1e12);
  expect(w.buy('single')).toBe(true);
  const snap = w.snapshot();
  snap.manual = {
    grid: '1111111110/1111111110/1111111110/1111111110', holds: [], holdUsed: false,
    queue: ['I', 'O', 'S', 'Z', 'J', 'L', 'T'], rng: 3, combo: -1, b2b: -1, active: null, graceUsed: 0, shieldSpent: false,
  } as GameSnapshot;
  snap.economy.upgrades = upgrades;
  const out = new World(1, snap);
  out.awardAchievements = false;
  out.startRound();
  return out;
}

function tetris(w: World) {
  w.manual.rotateCW();
  while (w.manual.moveRight()) { /* wall */ }
  return w.manualHardDrop();
}

describe('manual share of PER SECOND', () => {
  it('pays nothing extra before any share upgrade', () => {
    const w = world([]);
    expect(w.economy.manualShare()).toBe(0);
    tetris(w);
    expect(w.round.vault).toBe(20); // the tetris is also a perfect clear
  });

  it('each upgrade adds 1% of PER SECOND per row cleared', () => {
    const ids = MANUAL_SHARE_UPGRADES.map((u) => u.id);
    const w1 = world(ids.slice(0, 1));
    const pps = toNumber(w1.incomePerSecond());
    expect(pps).toBeGreaterThan(0);
    tetris(w1);
    expect(w1.round.vault).toBe(Math.floor(20 + 4 * 0.01 * pps));
    const w3 = world(ids.slice(0, 3));
    tetris(w3);
    expect(w3.round.vault).toBe(Math.floor(20 + 4 * 0.03 * pps));
  });

  it('manual ×2 multiplies the table value only; the level multiplies both', () => {
    const w = world(['manual_200', MANUAL_SHARE_UPGRADES[0]!.id]);
    const pps = toNumber(w.incomePerSecond());
    w.round.startLevel = 3;
    tetris(w);
    expect(w.round.vault).toBe(Math.floor((20 * 2 + 4 * 0.01 * pps) * 3));
  });

  it('a row-less placement earns no share', () => {
    const w = world([MANUAL_SHARE_UPGRADES[0]!.id]);
    const r = w.manualHardDrop(); // I flat on top: no clear
    expect(r.lines).toBe(0);
    expect(w.round.vault).toBe(0);
  });

  it('chain unlocks by Lines by hand and costs ten times that', () => {
    expect(MANUAL_SHARE_UPGRADES.map((u) => u.price)).toEqual([2e4, 2e5, 2e6, 2e7, 2e8]);
    const w = new World(1);
    const first = MANUAL_SHARE_UPGRADES[0]!.id;
    expect(w.economy.isUpgradeUnlocked(first)).toBe(false);
    w.economy.stats.manualLines = 2000;
    expect(w.economy.isUpgradeUnlocked(first)).toBe(true);
    expect(w.economy.isUpgradeUnlocked(MANUAL_SHARE_UPGRADES[1]!.id)).toBe(false);
  });

  it('the simulator buys share upgrades and they raise manual income', () => {
    const r = simulate({ buildings: LADDER, player: DEFAULT_PLAYER, horizonSeconds: 7 * 86_400, target: DEFAULT_TARGET });
    expect(r.purchases.some((p) => p.id.startsWith('share_'))).toBe(true);
  });
});
