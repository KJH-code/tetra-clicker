import { describe, it, expect } from 'vitest';
import { Game, DEFAULT_RULES } from '../src/sim/game';
import { World } from '../src/sim/world';
import { migrate, SAVE_VERSION } from '../src/save/schema';
import { attackFor } from '../src/sim/attack';
import type { Piece } from '../src/sim/pieces';

function gridFrom(rows: string[]): string {
  return rows.map((r) => r.split('').map((c) => (c === '.' ? '0' : '1')).join('')).join('/');
}
function gameWith(rows: string[], queue: Piece[]): Game {
  return new Game(0, { grid: gridFrom(rows), holds: [], holdUsed: false, queue, rng: 1, combo: -1, b2b: -1, active: null, graceUsed: 0, shieldSpent: false });
}
// Drop the active piece vertically into the right wall column.
function oLeft(g: Game) { while (g.moveLeft()) { /* wall */ } return g.hardDrop(); }

describe('combo grace', () => {
  it('grace keeps the combo through that many empty placements', () => {
    // Board with three separate one-row gaps stacked so each I clears one row:
    // impossible with vertical I, so use horizontal I on full-minus-four rows.
    const play = (grace: number) => {
      const g = gameWith(['XXXXXX....', 'XXXXXX....'], ['I', 'O', 'I', 'O', 'O', 'O', 'O']);
      g.rules = { ...DEFAULT_RULES, comboGrace: grace };
      const first = (() => { while (g.moveRight()) { /* */ } return g.hardDrop(); })(); // clears bottom row
      const gap = oLeft(g); // no clear
      const second = (() => { while (g.moveRight()) { /* */ } return g.hardDrop(); })(); // clears next row
      return { first, gap, second };
    };
    const none = play(0);
    expect(none.first.comboIndex).toBe(0);
    expect(none.gap.lines).toBe(0);
    expect(none.second.comboIndex).toBe(0); // combo restarted
    const one = play(1);
    expect(one.second.comboIndex).toBe(1); // combo survived one empty piece
  });
});

describe('B2B shield', () => {
  // Set the active I straight into a slot and lock it there (the way the bots
  // place pieces), so the test does not depend on a reachable path.
  const place = (g: Game, x: number, y: number) => {
    expect(g.setActive({ piece: g.active!.piece, rot: 1, x, y })).toBe(true);
    return g.hardDrop();
  };
  // Bottom four rows: a tetris in column 9. Then one row ready for a single
  // in column 9 under three rows open in columns 8 and 9. Then, once those
  // three have column 9 filled, a tetris in column 8.
  const rows = [
    'XXXXXXXX.X',
    'XXXXXXXX..', 'XXXXXXXX..', 'XXXXXXXX..',
    'XXXXXXXXX.',
    'XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.',
  ];
  const play = (shield: boolean) => {
    const g = gameWith(rows, ['I', 'I', 'I', 'I', 'I', 'I', 'I']);
    g.rules = { ...DEFAULT_RULES, b2bShield: shield };
    const t1 = place(g, 7, 36); // column 9, rows 36-39
    const s = place(g, 7, 36); // column 9 again: only the bottom row is full
    const t2 = place(g, 6, 36); // column 8, rows 36-39
    return { t1, s, t2 };
  };

  it('without the shield a single breaks back-to-back', () => {
    const r = play(false);
    expect([r.t1.lines, r.s.lines, r.t2.lines]).toEqual([4, 1, 4]);
    expect(r.t2.b2bExtended).toBe(false);
  });

  it('with the shield the chain survives one single', () => {
    const r = play(true);
    expect([r.t1.lines, r.s.lines, r.t2.lines]).toEqual([4, 1, 4]);
    expect(r.t2.b2bExtended).toBe(true);
  });
});

describe('hold queue and next count', () => {
  it('one slot behaves like the guideline hold', () => {
    const g = gameWith([], ['T', 'I', 'O', 'S', 'Z', 'J', 'L']);
    g.swapHold();
    expect(g.holds).toEqual(['T']);
    expect(g.active?.piece).toBe('I');
    g.hardDrop();
    g.swapHold();
    expect(g.holds).toEqual(['O']);
    expect(g.active?.piece).toBe('T');
  });

  it('two slots fill from the queue, then return the oldest', () => {
    const g = gameWith([], ['T', 'I', 'O', 'S', 'Z', 'J', 'L']);
    g.rules = { ...DEFAULT_RULES, holdSlots: 2 };
    g.swapHold(); // hold T, play I
    expect(g.holds).toEqual(['T']);
    expect(g.active?.piece).toBe('I');
    expect(g.swapHold()).toBe(false); // once per piece
    g.hardDrop(); // active O
    g.swapHold(); // hold O, play S
    expect(g.holds).toEqual(['T', 'O']);
    expect(g.active?.piece).toBe('S');
    g.hardDrop(); // active Z
    g.swapHold(); // hold Z, T comes out
    expect(g.holds).toEqual(['O', 'Z']);
    expect(g.active?.piece).toBe('T');
  });

  it('next count follows the rule', () => {
    const g = new Game(3);
    expect(g.next()).toHaveLength(5);
    g.rules = { ...DEFAULT_RULES, nextCount: 6 };
    expect(g.next()).toHaveLength(6);
  });
});

describe('upgrades reach the manual game', () => {
  it('buying rule upgrades changes the manual rules', () => {
    const w = new World(1);
    w.economy.balance = 1e9;
    w.economy.stats.manualPieces = 5000;
    w.economy.stats.combo5 = 100;
    w.economy.stats.b2bs = 100;
    expect(w.manual.rules).toEqual(DEFAULT_RULES);
    expect(w.buyUpgrade('hold2')).toBe(true);
    expect(w.buyUpgrade('next_plus')).toBe(true);
    expect(w.buyUpgrade('grace_1')).toBe(true);
    expect(w.buyUpgrade('grace_2')).toBe(true);
    expect(w.buyUpgrade('b2b_shield')).toBe(true);
    expect(w.manual.rules).toEqual({ comboGrace: 2, b2bShield: true, nextCount: 6, holdSlots: 2 });
    // and survive a reload
    const w2 = new World(1, JSON.parse(JSON.stringify(w.snapshot())));
    expect(w2.manual.rules).toEqual(w.manual.rules);
    expect(w2.economy.hasUpgrade('hold2')).toBe(true);
  });

  it('combo upgrades raise the combo step', () => {
    const w = new World(1);
    expect(w.comboStep()).toBeCloseTo(0.1, 10);
    w.economy.upgrades.add('combo_1');
    w.economy.upgrades.add('combo_2');
    expect(w.comboStep()).toBeCloseTo(0.2, 10);
    const r = { piece: 'I' as const, lines: 1, spin: 'none' as const, perfectClear: false, comboIndex: 3, b2bExtended: false, topped: false, clearedRows: [] };
    expect(attackFor(r, w.comboStep()).total).toBeCloseTo(2 * (1 + 0.2 * 2), 10);
  });

  it('manual clears are counted in the stats', () => {
    const w = new World(5);
    w.advance(0);
    for (let i = 0; i < 20; i++) w.manualHardDrop();
    expect(w.economy.stats.manualPieces).toBe(20);
  });
});

describe('save migration', () => {
  it('a version 1 save loads as version 2', () => {
    const v1 = {
      version: 1, savedAt: 1, settings: {},
      world: {
        seed: 9, accumulatorMs: 0,
        manual: { grid: '', hold: 'T', holdUsed: false, queue: ['I', 'O', 'S', 'Z', 'J', 'L', 'T'], rng: 5, combo: -1, b2b: -1, active: null },
        economy: { balance: '42', owned: { single: 2 } },
        autoBoards: [{ buildingId: 'single', timerMs: 500, game: { grid: '', hold: null, holdUsed: false, queue: ['I', 'O', 'S', 'Z', 'J', 'L', 'T'], rng: 7, combo: -1, b2b: -1, active: null } }],
      },
    };
    const data = migrate(JSON.parse(JSON.stringify(v1)));
    expect(data?.version).toBe(SAVE_VERSION);
    const w = new World(9, data!.world);
    expect(w.manual.holds).toEqual(['T']);
    expect(Number(w.economy.balance)).toBe(84); // old Lines, doubled into the whole-number unit
    expect(w.economy.owned('single')).toBe(2);
    expect(w.economy.stats.manualLines).toBe(0);
    expect(w.autoBoards[0]!.game.holds).toEqual([]);
  });
});
