import { describe, expect, it } from 'vitest';
import { World, type WorldEvent } from '../src/sim/world';
import { num } from '../src/sim/num';
import type { LockResult } from '../src/sim/game';
import { BOT_LINKS, botLevelFor, linkBuffId, linkedBuildings, stackBonusPct } from '../src/data/botlinks';

const lock = (over: Partial<LockResult>): LockResult => ({ piece: 'I', lines: 0, spin: 'none', perfectClear: false, comboIndex: -1, b2bExtended: false, topped: false, clearedRows: [], ...over });

type Inner = { botAbilities(board: unknown, i: number, r: LockResult): void; autoBoards: { buildingId: string }[]; countBoardGarbage(): void };
const inner = (w: World) => w as unknown as Inner;

function life(owned: string[]): World {
  const w = new World(1);
  w.awardAchievements = false;
  for (const id of owned) w.economy.setOwned(id, 1);
  (w as unknown as { syncBoards?: () => void }).syncBoards?.();
  w.economy.balance = num(1e12);
  w.buy('single');
  w.advance(0);
  w.startRound();
  return w;
}
const fire = (w: World, building: string, r: Partial<LockResult>) => {
  const board = inner(w).autoBoards.find((b) => b.buildingId === building) ?? { buildingId: building };
  inner(w).botAbilities(board, 0, lock(r));
};

describe('a technique by hand lends its bot a hand', () => {
  it('which bots each clear lends to', () => {
    expect(linkedBuildings(lock({ lines: 4, b2bExtended: true }))).toEqual(['tetris', 'b2b']);
    expect(linkedBuildings(lock({ piece: 'T', spin: 'full', lines: 2, comboIndex: 3 }))).toEqual(['tspin', 'combo']);
    expect(linkedBuildings(lock({ piece: 'S', spin: 'full', lines: 1 }))).toEqual(['allspin']);
    expect(linkedBuildings(lock({ lines: 2, perfectClear: true }))).toEqual(['double', 'pc']);
    expect(linkedBuildings(lock({ lines: 0 }))).toEqual([]);
  });

  it('30 s of ×2 to an owned bot, 30 s more each time, 90 s at most', () => {
    const w = life(['tetris']);
    w.manualLock(lock({ lines: 4 }));
    const link = () => w.links.active.find((b) => b.id === linkBuffId('tetris'))?.msLeft;
    expect(link()).toBe(30_000);
    expect(w.links.multiplier(['board:auto', 'building:tetris'], w.economy)).toBe(2);
    for (let i = 0; i < 5; i++) w.manualLock(lock({ lines: 4 }));
    expect(link()).toBe(BOT_LINKS.linkMaxMs);
    // Not owned: nothing lent.
    w.manualLock(lock({ piece: 'T', spin: 'full', lines: 2 }));
    expect(w.links.active.some((b) => b.id === linkBuffId('tspin'))).toBe(false);
  });
});

describe('a low stack speeds the bots', () => {
  it('20% at four rows or fewer, nothing from ten, only while a life runs', () => {
    expect([0, 4, 7, 10, 15].map(stackBonusPct)).toEqual([20, 20, 10, 0, 0]);
    const w = life([]);
    expect(w.economy.stackBonus).toBe(20);
    w.pauseRound();
    inner(w).countBoardGarbage();
    expect(w.economy.stackBonus).toBe(0);
  });
});

describe('bot levels', () => {
  it('level n at 50 × n(n+1)/2 of its technique, 5% a level, gone on ascending', () => {
    expect([0, 49, 50, 149, 150, 10_500, 99_999].map(botLevelFor)).toEqual([0, 0, 1, 1, 2, 20, 20]);
    const w = life([]);
    const before = w.economy.incomeMultiplier(['board:auto', 'building:single']);
    const events: WorldEvent[] = [];
    for (let i = 0; i < 150; i++) fire(w, 'single', { lines: 1 });
    events.push(...w.drainEvents());
    expect(w.botLevel('single')).toBe(2);
    expect(events.filter((e) => e.type === 'botLevel')).toHaveLength(2);
    expect(w.economy.incomeMultiplier(['board:auto', 'building:single']) / before).toBeCloseTo(1.1, 9);
    // A clear that is not its technique does not count.
    fire(w, 'single', { lines: 2 });
    expect(w.botXp['single']).toBe(150);
  });
});

describe('abilities', () => {
  it('TETRIS cancels a queued garbage row; PERFECT doubles every bot for 5 s', () => {
    const w = life(['tetris', 'pc']);
    w.garbageQueue = 3;
    fire(w, 'tetris', { lines: 4 });
    expect(w.garbageQueue).toBe(2);
    fire(w, 'pc', { lines: 2, perfectClear: true });
    expect(w.links.active.find((b) => b.id === 'pc_burst')?.msLeft).toBe(BOT_LINKS.pcBurstMs);
    expect(w.links.multiplier(['board:auto', 'building:single'], w.economy)).toBe(2);
  });

  it('DOWNSTACK lifts a garbage row off the manual board, then waits 20 s', () => {
    const w = life(['downstack']);
    for (let i = 0; i < 3; i++) w.manual.addGarbage(i);
    fire(w, 'downstack', { lines: 1, garbageCleared: { clean: 1, cheese: 0 } });
    expect(w.manual.garbageRows()).toBe(2);
    fire(w, 'downstack', { lines: 1, garbageCleared: { clean: 1, cheese: 0 } });
    expect(w.manual.garbageRows()).toBe(2);
  });

  it('OPENER doubles the first ten pieces of a life by hand', () => {
    const plain = life([]);
    const a = Number(plain.manualLock(lock({ lines: 1 })));
    const w = life(['opener']);
    const b = Number(w.manualLock(lock({ lines: 1 })));
    expect(b / a).toBeCloseTo(2, 1);
    for (let i = 0; i < 9; i++) w.manualLock(lock({ lines: 0 }));
    expect(Number(w.manualLock(lock({ lines: 1 }))) / a).toBeCloseTo(1, 1);
  });

  it('HINT: needs a bot and a live life; cooldown shortens with bots owned; ALL-SPIN cuts it', () => {
    const w = life(['allspin']);
    expect(w.requestHint()).toBe(true);
    expect(w.requestHint()).toBe(false);
    // Two buildings owned: 30 s ÷ (1 + 2/50).
    expect(w.hintMs).toBeCloseTo(30_000 / (1 + 2 / 50), 6);
    const left = w.hintMs;
    fire(w, 'allspin', { piece: 'S', spin: 'full', lines: 1 });
    expect(w.hintMs).toBeCloseTo(left - 2_000, 6);
  });
});
