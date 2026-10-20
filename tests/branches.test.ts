import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { num } from '../src/sim/num';
import { evaluate } from '../src/sim/effects';
import { missionById } from '../src/data/missions';
import type { LockResult } from '../src/sim/game';

const lock = (over: Partial<LockResult>): LockResult => ({ piece: 'I', lines: 0, spin: 'none', perfectClear: false, comboIndex: -1, b2bExtended: false, topped: false, clearedRows: [], ...over });

function life(prestige: string[], seed = 1): World {
  const w = new World(seed);
  w.awardAchievements = false;
  for (const id of prestige) w.economy.meta.prestige.add(id);
  w.economy.balance = num(1e6);
  w.buy('single');
  w.advance(0);
  w.startRound();
  return w;
}

const fx = (w: World, target: string, base: number) => evaluate(w.economy.effects, target, [], w.economy, base);

describe('MISSION branch', () => {
  it('four missions a life, and hard ones only once bought', () => {
    expect(life([]).missions).toHaveLength(3);
    expect(life(['mission_1', 'mission_2']).missions).toHaveLength(4);
    const hardSeen = (p: string[]) => Array.from({ length: 40 }, (_, i) => life(p, i + 1).missions).flat().some((m) => missionById(m.id)?.hard);
    expect(hardSeen(['mission_1', 'mission_2'])).toBe(false);
    expect(hardSeen(['mission_1', 'mission_2', 'mission_3'])).toBe(true);
  });

  it('pay ×1.5 then ×3; each mission done lifts income 10% until the life ends', () => {
    const w = life(['mission_1', 'mission_2', 'mission_3', 'mission_4', 'mission_5']);
    expect(fx(w, 'mission_pay', 1)).toBeCloseTo(3, 9);
    const before = w.economy.incomeMultiplier(['board:auto']);
    w.missions = [{ id: 'tetris3', base: w.economy.stats.tetrises, done: false }];
    for (let i = 0; i < 3; i++) w.manualLock(lock({ lines: 4 }));
    expect(w.economy.lifeMissions).toBe(1);
    expect(w.economy.incomeMultiplier(['board:auto']) / before).toBeCloseTo(1.1, 9);
    (w as unknown as { endRound(): void }).endRound();
    expect(w.economy.lifeMissions).toBe(0);
  });
});

describe('EVENT branch and the tops of the old ones', () => {
  it('rate ×1.5 in all, good events ×2, rewards ×3, boss HP ×0.75', () => {
    const w = life(['event_1', 'event_2', 'event_3', 'event_4', 'event_5']);
    expect(fx(w, 'event_rate', 1)).toBeCloseTo(1.5, 9);
    expect(fx(w, 'good_event_weight', 1)).toBe(2);
    expect(fx(w, 'event_reward', 1)).toBeCloseTo(3, 9);
    w.round.startLevel = 4;
    w.beginEvent('boss');
    const ev = w.lifeEvent!;
    expect(ev.kind === 'boss' && ev.maxHp).toBe(30);
  });

  it('ALL INCOME ×3, KEEP 75%, RISK WEIGHT ×3, NO RUIN', () => {
    const all = (b: string) => [1, 2, 3, 4, 5].map((i) => `${b}_${i}`);
    const w = life([...all('production'), ...all('survival'), ...all('proportion'), ...all('elder')]);
    expect(fx(w, 'retain', 0)).toBeCloseTo(0.75, 9);
    expect(fx(w, 'risk_weight', 1)).toBeCloseTo(9, 9);
    expect(evaluate(w.economy.effects, 'wrath_weight', ['wrath:ruin'], w.economy, 40)).toBe(0);
    const plain = life([...all('production').slice(0, 4)]);
    expect(w.economy.incomeMultiplier(['board:auto']) / plain.economy.incomeMultiplier(['board:auto'])).toBeCloseTo(3, 6);
  });
});
