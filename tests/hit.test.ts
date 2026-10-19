import { describe, expect, it } from 'vitest';
import { hitStrength, hitStopMs } from '../src/render/hit';
import type { LockResult } from '../src/sim/game';

const lock = (over: Partial<LockResult>): LockResult => ({ piece: 'I', lines: 0, spin: 'none', perfectClear: false, comboIndex: -1, b2bExtended: false, topped: false, clearedRows: [], ...over });

describe('hit strength', () => {
  it('grows with the technique', () => {
    const s = [lock({ lines: 1 }), lock({ lines: 2 }), lock({ lines: 4 }), lock({ piece: 'T', spin: 'full', lines: 2 }), lock({ lines: 4, b2bExtended: true }), lock({ lines: 2, perfectClear: true })].map(hitStrength);
    expect(s).toEqual([0, 1, 4, 3, 5, 8]);
    expect(hitStrength(lock({ lines: 0 }))).toBe(0);
    expect(hitStrength(lock({ lines: 1, comboIndex: 4 }))).toBe(1);
  });

  it('hit-stop only from a triple up, capped', () => {
    expect(hitStopMs(1)).toBe(0);
    expect(hitStopMs(4)).toBe(68);
    expect(hitStopMs(8)).toBe(110);
  });
});
