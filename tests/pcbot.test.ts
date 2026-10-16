import { describe, it, expect } from 'vitest';
import { Game } from '../src/sim/game';
import { playOne } from '../src/sim/bot/index';
import { pcBot } from '../src/sim/bot/pcBot';
import { solvePc, moveFor } from '../src/sim/bot/cc/pcf';
import { replay } from '../src/sim/bot/cc/movegen';
import { createBag } from '../src/sim/bag';
import { createRng } from '../src/sim/rng';

describe('perfect clear finder', () => {
  it('plans a four-line PC from an empty board, and the plan plays out', () => {
    for (const seed of [1, 4, 9]) {
      const g = new Game(seed);
      const seq = [g.active!.piece, ...g.preview(10)];
      const plan = solvePc(g.grid, seq)!;
      expect(plan).not.toBeNull();
      expect(plan).toHaveLength(10);
      let pc = false;
      for (const step of plan) {
        if (g.active!.piece !== step.piece) g.swapHold();
        const m = moveFor(g.grid, g.active!.piece, step)!;
        expect(m).not.toBeNull();
        replay(g, m.inputs);
        pc = g.hardDrop().perfectClear || pc;
      }
      expect(pc).toBe(true);
      expect(g.grid.every((c) => c === 0)).toBe(true);
    }
  }, 60_000);

  it('looking ahead deals the same pieces', () => {
    const a = createBag(createRng(5), 6);
    const b = createBag(createRng(5), 6);
    a.ensure(30);
    const fromA = a.peek(30);
    const fromB: string[] = [];
    for (let i = 0; i < 30; i++) fromB.push(b.take());
    expect(fromA).toEqual(fromB);
  });
});

describe('PC loop bot', () => {
  it('perfect clears every ten pieces and never tops out', () => {
    const g = new Game(2);
    const bot = pcBot();
    let pcs = 0;
    for (let i = 0; i < 60; i++) {
      const m = playOne(g, bot)!;
      expect(m).not.toBeNull();
      expect(m.result.topped).toBe(false);
      if (m.result.perfectClear) pcs++;
    }
    expect(pcs).toBeGreaterThanOrEqual(5);
  }, 60_000);
});
