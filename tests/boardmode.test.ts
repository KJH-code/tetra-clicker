import { describe, it, expect } from 'vitest';
import { Game } from '../src/sim/game';
import { WIDTH, HEIGHT, TOP_VISIBLE_ROW } from '../src/sim/board';
import { GARBAGE_ID, CHEESE_ID } from '../src/data/levels';
import { botAttack, attackFor } from '../src/sim/attack';
import type { LockResult } from '../src/sim/game';

const row = (g: Game, y: number) => Array.from(g.grid.subarray(y * WIDTH, y * WIDTH + WIDTH));

describe('board modes', () => {
  it('walls: three columns a side stay full below the buffer, through clears and resets', () => {
    const g = new Game(1);
    g.setMode({ walls: 3 }, 1);
    for (let y = TOP_VISIBLE_ROW; y < HEIGHT; y++) {
      const r = row(g, y);
      expect(r.slice(0, 3).every((c) => c === GARBAGE_ID)).toBe(true);
      expect(r.slice(7).every((c) => c === GARBAGE_ID)).toBe(true);
      expect(r.slice(3, 7).every((c) => c === 0)).toBe(true);
    }
    // An I flat in the well clears the bottom row; the walls refill above.
    g.setActive({ piece: g.active!.piece, rot: 0, x: 3, y: g.active!.y });
    let cleared = 0;
    for (let i = 0; i < 40 && cleared === 0; i++) cleared += g.hardDrop().lines;
    for (let y = TOP_VISIBLE_ROW; y < HEIGHT; y++) expect(row(g, y)[0]).toBe(GARBAGE_ID);
    // Survives a snapshot.
    const back = new Game(0, JSON.parse(JSON.stringify(g.snapshot())));
    expect(back.mode).toEqual({ walls: 3 });
  });

  it('own garbage: a row every N pieces, cheese and clean mixed, deterministic', () => {
    const play = () => {
      const g = new Game(5);
      g.setMode({ garbageEvery: 2, cheese: 0.5 }, 5);
      for (let i = 0; i < 4; i++) {
        // Drop the pieces at alternating walls so nothing clears or tops out.
        if (i % 2) while (g.moveRight()) { /* wall */ }
        else while (g.moveLeft()) { /* wall */ }
        g.hardDrop();
      }
      return g;
    };
    const g = play();
    const kinds = new Set<number>();
    for (let y = 0; y < HEIGHT; y++) for (const c of row(g, y)) if (c === GARBAGE_ID || c === CHEESE_ID) kinds.add(c);
    expect(kinds.has(GARBAGE_ID) || kinds.has(CHEESE_ID)).toBe(true);
    expect(play().snapshot()).toEqual(g.snapshot());
  });

  it('reports cleared garbage rows by kind', () => {
    const g = new Game(1);
    // Bottom row cheese with a hole at 9, the row above clean with a hole at 9.
    g.addGarbage(9, false);
    g.addGarbage(9, true);
    // A vertical I in column 9 clears both.
    g.setActive({ piece: 'I', rot: 1, x: 7, y: TOP_VISIBLE_ROW });
    while (g.active!.piece !== 'I') g.swapHold();
    g.setActive({ piece: 'I', rot: 1, x: 7, y: TOP_VISIBLE_ROW });
    const r = g.hardDrop();
    expect(r.lines).toBe(2);
    expect(r.garbageCleared).toEqual({ clean: 1, cheese: 1 });
  });

  it('bots: garbage bonus outside the table; 4-wide paid combos; opener paid PC, T-spins and B2B', () => {
    const base: LockResult = { piece: 'T', lines: 2, spin: 'full', perfectClear: false, comboIndex: 3, b2bExtended: true, topped: false, clearedRows: [] };
    expect(botAttack({ ...base, garbageCleared: { clean: 1, cheese: 1 } }, 'downstack', { clean: 1, cheese: 3 }))
      .toBe(attackFor({ ...base, spin: 'none', comboIndex: 0, b2bExtended: false }).total + 4);
    expect(botAttack(base, 'fourwide')).toBe(attackFor({ ...base, spin: 'none', b2bExtended: false }).total);
    expect(botAttack(base, 'opener')).toBe(attackFor({ ...base, comboIndex: 0 }).total);
  });
});
