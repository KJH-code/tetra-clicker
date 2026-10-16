import { expect } from 'vitest';
import { Game, type LockResult } from '../../src/sim/game';
import { playOne, POLICIES } from '../../src/sim/bot/index';
import { botAttack } from '../../src/sim/attack';
import { BUILDINGS } from '../../src/data/buildings';

// Long runs of a technique bot: it never tops out, does its technique, and
// earns the measured Lines per piece the hidden-tab formula uses (the data
// file was measured on these seeds). One file per bot so they run side by side.
const SEEDS = [11, 12, 13];
const PIECES = 3000;

export function checkTechBot(id: string, technique: (rs: LockResult[]) => void): void {
  const def = BUILDINGS.find((b) => b.id === id)!;
  const results: LockResult[] = [];
  let paid = 0;
  for (const seed of SEEDS) {
    const g = new Game(seed);
    for (let i = 0; i < PIECES; i++) {
      const m = playOne(g, POLICIES[def.skill]!);
      expect(m).not.toBeNull();
      results.push(m!.result);
      paid += botAttack(m!.result, def.tech);
    }
  }
  expect(results.filter((r) => r.topped)).toHaveLength(0);
  technique(results);
  expect(Math.abs(paid / results.length - def.linesPerPiece) / def.linesPerPiece).toBeLessThan(0.01);
}

export const share = (rs: LockResult[], f: (r: LockResult) => boolean): number => rs.filter(f).length / rs.length;
