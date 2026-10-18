import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { num, toNumber } from '../src/sim/num';
import { Game, type LockResult } from '../src/sim/game';
import { playOne } from '../src/sim/bot/index';
import { tspinTstBot, b2bComboBot } from '../src/sim/bot/techBots';
import { SYNERGIES } from '../src/data/synergies';
import { BUILDINGS } from '../src/data/buildings';
import { PRESTIGE_UPGRADES, prestigeRequires } from '../src/data/prestige';
import { upgradeById } from '../src/data/upgrades';
import { tag } from '../src/sim/tags';
import { multiplier } from '../src/sim/effects';

const lock = (over: Partial<LockResult>): LockResult => ({
  piece: 'I', lines: 0, spin: 'none', perfectClear: false, comboIndex: -1, b2bExtended: false, topped: false, clearedRows: [], golden: false, ...over,
});

// A world that has researched every synergy and owns every building once.
function researched(): World {
  const w = new World(1);
  w.advance(0);
  w.economy.balance = num(1e12);
  for (const s of SYNERGIES) w.economy.meta.prestige.add(s.research);
  for (const b of BUILDINGS) w.economy.setOwned(b.id, 1);
  return w;
}

const botTags = (id: string) => [tag.board('auto'), tag.building(id), tag.clear(4)];

describe('synergy data', () => {
  it('pairs each building with the next, priced at ten times the dearer one', () => {
    expect(SYNERGIES).toHaveLength(BUILDINGS.length - 1);
    SYNERGIES.forEach((s, i) => {
      expect(s.pair).toEqual([BUILDINGS[i]!.id, BUILDINGS[i + 1]!.id]);
      expect(s.price).toBe(Math.max(BUILDINGS[i]!.basePrice, BUILDINGS[i + 1]!.basePrice) * 10);
      expect(upgradeById(s.id)?.group).toBe('synergy');
    });
    expect(new Set(SYNERGIES.map((s) => s.kind))).toEqual(new Set(['cross', 'reward', 'play', 'link']));
  });

  it('research is a prestige chain up the ladder, a crown dearer each step', () => {
    const chain = PRESTIGE_UPGRADES.filter((u) => u.branch === 'synergy');
    expect(chain.map((u) => u.price)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(chain.map((u) => u.id)).toEqual(SYNERGIES.map((s) => s.research));
    expect(prestigeRequires('synergy_1')).toBeNull();
    expect(prestigeRequires('synergy_5')).toBe('synergy_4');
  });
});

describe('synergy upgrades in a run', () => {
  it('show up only once researched and both buildings are owned', () => {
    const w = new World(1);
    w.economy.setOwned('tetris', 1);
    w.economy.setOwned('tspin', 1);
    expect(w.economy.isUpgradeUnlocked('syn_tetris_tspin')).toBe(false);
    w.economy.meta.prestige.add('synergy_4');
    expect(w.economy.isUpgradeUnlocked('syn_tetris_tspin')).toBe(true);
    w.economy.setOwned('tspin', 0);
    expect(w.economy.isUpgradeUnlocked('syn_tetris_tspin')).toBe(false);
  });

  it('cross: each building earns +1% per copy of the other', () => {
    const w = researched();
    w.economy.setOwned('double', 5);
    const before = w.economy.incomeMultiplier(botTags('single'));
    expect(w.buyUpgrade('syn_single_double')).toBe(true);
    // One copy of SINGLE carries no per-copy bonus yet, so the five DOUBLEs are all of it.
    expect(w.economy.incomeMultiplier(botTags('single')) / before).toBeCloseTo(1.05, 10);
    // And summed with that per-copy bonus, not multiplied by it.
    w.economy.setOwned('single', 3);
    expect(multiplier(w.economy.effects, 'income', botTags('single'), w.economy)).toBeCloseTo(1 + 0.2 + 0.05, 10);
  });

  it('reward and play synergies are a fixed ×1.25 on that bot, in play and in the formula alike', () => {
    const w = researched();
    w.buy('tspin');
    const tags = botTags('tspin');
    const before = w.economy.incomeMultiplier(tags);
    const formulaBefore = toNumber(w.incomePerSecond());
    w.buyUpgrade('syn_tetris_tspin');
    expect(w.economy.incomeMultiplier(tags) / before).toBeCloseTo(1.25, 10);
    const tspin = BUILDINGS.find((b) => b.id === 'tspin')!;
    const gained = toNumber(w.incomePerSecond()) - formulaBefore;
    expect(gained).toBeCloseTo(tspin.pps * tspin.linesPerPiece * before * 0.25, 6);
  });

  it('play synergies switch the bot to its variant', () => {
    const w = researched();
    w.buy('tspin');
    const board = w.autoBoards.find((b) => b.buildingId === 'tspin')!;
    expect(w.skillFor(board)).toBe('tspin');
    w.buyUpgrade('syn_tspin_allspin');
    expect(w.skillFor(board)).toBe('tspin_tst');
  });

  it('link: a tetris by hand doubles the TETRIS bot for 30 s, refilled by the next', () => {
    const w = researched();
    w.manualLock(lock({ lines: 4 }));
    expect(w.buffs.active).toHaveLength(0);
    w.buyUpgrade('syn_triple_tetris');
    w.manualLock(lock({ lines: 4 }));
    expect(w.buffs.active.map((b) => [b.id, b.msLeft])).toEqual([['syn_tetris', 30_000]]);
    expect(w.buffs.multiplier(botTags('tetris'), w.economy)).toBe(2);
    expect(w.buffs.multiplier(botTags('triple'), w.economy)).toBe(1);
    w.buffs.tick(20_000);
    w.manualLock(lock({ lines: 4 }));
    expect(w.buffs.active[0]!.msLeft).toBe(30_000);
    w.manualLock(lock({ lines: 3 }));
    expect(w.buffs.active[0]!.msLeft).toBe(30_000);
  });

  it('link: a perfect clear by hand doubles every bot, not the manual board', () => {
    const w = researched();
    w.buyUpgrade('syn_b2b_pc');
    w.manualLock(lock({ lines: 2, perfectClear: true }));
    expect(w.buffs.multiplier(botTags('single'), w.economy)).toBe(2);
    expect(w.buffs.multiplier(botTags('pc'), w.economy)).toBe(2);
    expect(w.buffs.multiplier([tag.board('manual')], w.economy)).toBe(1);
  });

  it('prestige keeps research and drops the purchase', () => {
    const w = researched();
    w.buyUpgrade('syn_single_double');
    w.economy.meta.crowns = 0;
    w.economy.stats.riskLines = 1e12;
    w.ascend();
    w.newRun();
    expect(w.economy.hasUpgrade('syn_single_double')).toBe(false);
    expect(w.economy.hasPrestige('synergy_1')).toBe(true);
  });
});

describe('variant bots (short runs; long ones live in tests/slow)', () => {
  const run = (make: () => ReturnType<typeof tspinTstBot>, n: number, seed: number) => {
    const g = new Game(seed);
    const bot = make();
    return Array.from({ length: n }, () => playOne(g, bot)!.result);
  };

  it('T-SPIN with singles and triples open never tops out and plays the same twice', () => {
    const a = run(tspinTstBot, 120, 4);
    expect(a.filter((r) => r.topped)).toHaveLength(0);
    expect(a.filter((r) => r.piece === 'T' && r.spin === 'full' && r.lines > 0).length).toBeGreaterThan(5);
    expect(run(tspinTstBot, 40, 4).map((r) => r.lines)).toEqual(a.slice(0, 40).map((r) => r.lines));
  }, 120_000);

  it('B2B with combos never tops out', () => {
    const rs = run(b2bComboBot, 150, 4);
    expect(rs.filter((r) => r.topped)).toHaveLength(0);
  }, 120_000);
});
