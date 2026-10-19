import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { num } from '../src/sim/num';
import { CHALLENGE_RULES, challengePoints } from '../src/data/challenges';

// On the prestige shop with crowns, challenges opened (or not).
function shop(open = true): World {
  const w = new World(1);
  w.awardAchievements = false;
  w.economy.stats.riskLines = 1e9;
  w.ascend();
  if (open) w.economy.meta.achievements.add('hc_level20');
  return w;
}

function run(pick: Record<string, number>): World {
  const w = shop();
  expect(w.setNextChallenge(pick)).toBe(true);
  expect(w.newRun()).toBe(true);
  return w;
}

describe('challenge runs', () => {
  it('eight rules; points add up by step', () => {
    expect(CHALLENGE_RULES).toHaveLength(8);
    expect(challengePoints({ no_hold: 1, gravity: 3 })).toBe(5);
    expect(challengePoints({ next: 1, garbage: 2, kinds: 2, price: 1 })).toBe(6);
  });

  it('locked until HARDCORE 20; under 3 points will not start', () => {
    expect(shop(false).setNextChallenge({ no_hold: 1 })).toBe(false);
    const w = shop();
    w.setNextChallenge({ price: 1, no_synergies: 1 });
    expect(w.newRun()).toBe(false);
    w.setNextChallenge({ price: 1, no_synergies: 1, next: 1 });
    expect(w.newRun()).toBe(true);
    expect(w.economy.meta.hardcore).toBe(true);
  });

  it('rule rules: no hold, fewer next, garbage, gravity', () => {
    const w = run({ no_hold: 1, next: 2, garbage: 2, gravity: 3 });
    expect(w.manual.rules.holdSlots).toBe(0);
    expect(w.manual.swapHold()).toBe(false);
    // Hardcore's three next pieces, two fewer.
    expect(w.manual.rules.nextCount).toBe(1);
    expect((w as unknown as { fx(t: string, b: number): number }).fx('buy_garbage', 1)).toBeCloseTo(2 * 2, 9); // ×2 more between lives
    expect((w as unknown as { fx(t: string, b: number): number }).fx('gravity', 1)).toBe(Infinity);
  });

  it('economy rules: kinds, upgrades, synergies, prices', () => {
    const w = run({ kinds: 2, no_upgrades: 1, price: 1 });
    w.economy.balance = num(1e12);
    expect(w.buy('single')).toBe(true);
    expect(w.buy('double')).toBe(false); // one kind only
    expect(w.buy('single')).toBe(true);
    expect(w.upgradeAllowed('manual_200')).toBe(false);
    w.economy.stats.manualLines = 1e9;
    expect(w.buyUpgrade('manual_200')).toBe(false);
    // Between lives: list price, ×1.25 over the base.
    expect(Number(w.economy.price('single'))).toBe(Math.ceil(110 * 1.15 ** 2 * 2 * 1.25 - 1e-9));
    const s = run({ no_synergies: 1, price: 1, next: 1 });
    expect(s.upgradeAllowed('syn_single_double')).toBe(false);
    expect(s.upgradeAllowed('manual_200')).toBe(true);
  });

  it('cleared by ascending alive: best points kept, +2% income per point, achievements', () => {
    const w = run({ no_hold: 1, gravity: 2, price: 1 });
    w.economy.stats.riskLines = 8e9;
    w.startRound();
    expect(w.ascend()).toBeGreaterThan(0);
    expect(w.economy.meta.challengeBest).toBe(5);
    expect(w.economy.meta.challenge).toEqual({});
    const before = w.economy.incomeMultiplier(['board:auto']);
    w.economy.meta.challengeBest = 6;
    expect(w.economy.incomeMultiplier(['board:auto']) / before).toBeCloseTo(1.12 / 1.10, 9);
    w.economy.meta.challengeBest = 5;
    w.awardAchievements = true;
    w.checkAchievements();
    expect(w.economy.meta.achievements.has('challenge_3')).toBe(true);
    expect(w.economy.meta.achievements.has('challenge_6')).toBe(false);
  });

  it('a top-out fails it: nothing kept', () => {
    const w = run({ no_hold: 1, gravity: 2, price: 1 });
    w.startRound();
    // Bury the board until the life ends.
    for (let i = 0; i < 40 && w.round.active; i++) w.manual.addGarbage(0) ? w.manualHardDrop() : w.manualHardDrop();
    expect(w.ascending).toBe(true);
    expect(w.economy.meta.challengeBest).toBe(0);
  });
});
