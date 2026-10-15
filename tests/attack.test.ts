import { describe, it, expect } from 'vitest';
import { attackFor, tagsFor } from '../src/sim/attack';
import type { LockResult } from '../src/sim/game';

const base = (over: Partial<LockResult>): LockResult => ({
  piece: 'I', lines: 1, spin: 'none', perfectClear: false, comboIndex: 0, b2bExtended: false, topped: false, clearedRows: [], ...over,
});

describe('attack table', () => {
  it('plain clears: 1 / 2.5 / 4.5 / 7', () => {
    expect(attackFor(base({ lines: 1 })).total).toBe(1);
    expect(attackFor(base({ lines: 2 })).total).toBe(2.5);
    expect(attackFor(base({ lines: 3 })).total).toBe(4.5);
    expect(attackFor(base({ lines: 4 })).total).toBe(7);
  });
  it('T-spin single / double / triple: 2 / 4 / 6', () => {
    expect(attackFor(base({ piece: 'T', spin: 'full', lines: 1 })).total).toBe(2);
    expect(attackFor(base({ piece: 'T', spin: 'full', lines: 2 })).total).toBe(4);
    expect(attackFor(base({ piece: 'T', spin: 'full', lines: 3 })).total).toBe(6);
  });
  it('mini spins and non-T spins are worth a plain clear', () => {
    expect(attackFor(base({ piece: 'T', spin: 'mini', lines: 1 })).total).toBe(1);
    expect(attackFor(base({ piece: 'T', spin: 'mini', lines: 2 })).total).toBe(2.5);
    expect(attackFor(base({ piece: 'S', spin: 'full', lines: 2 })).total).toBe(2.5);
  });
  it('combo multiplies by 1 + 0.1 × table, capped at ×1.5', () => {
    const table = [0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5, 5, 5, 5];
    table.forEach((v, i) => {
      expect(attackFor(base({ lines: 1, comboIndex: i })).total).toBeCloseTo(1 + 0.1 * v, 10);
    });
    expect(attackFor(base({ lines: 1, comboIndex: 30 })).total).toBeCloseTo(1.5, 10);
    expect(attackFor(base({ lines: 1, comboIndex: -1 })).total).toBe(1);
  });
  it('back-to-back adds 20%', () => {
    expect(attackFor(base({ lines: 4, b2bExtended: true })).total).toBeCloseTo(8.4, 10);
    expect(attackFor(base({ piece: 'T', spin: 'full', lines: 2, b2bExtended: true })).total).toBeCloseTo(4.8, 10);
  });
  it('perfect clear replaces the base with 10, then combo and b2b apply', () => {
    expect(attackFor(base({ lines: 4, perfectClear: true })).total).toBe(10);
    expect(attackFor(base({ lines: 1, perfectClear: true })).total).toBe(10);
    expect(attackFor(base({ lines: 4, perfectClear: true, b2bExtended: true, comboIndex: 1 })).total).toBeCloseTo(10 * 1.1 * 1.2, 10);
  });
  it('no clear earns nothing', () => {
    expect(attackFor(base({ lines: 0, comboIndex: -1 })).total).toBe(0);
  });
  it('tags describe the clear', () => {
    const t = tagsFor(base({ piece: 'T', spin: 'full', lines: 2, comboIndex: 2, b2bExtended: true }), ['board:manual']);
    expect(t).toEqual(expect.arrayContaining(['board:manual', 'piece:T', 'clear:double', 'tech:spin', 'tech:combo', 'tech:b2b']));
    expect(tagsFor(base({ lines: 1, perfectClear: true }), ['board:auto', 'building:single'])).toContain('tech:pc');
  });
});
