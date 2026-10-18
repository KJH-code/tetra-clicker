import { it, expect } from 'vitest';
import { checkTechBot, share } from './techRun';

// The three that reach into the manual board run bots measured elsewhere;
// held to their own data here all the same.
it('HELPER: the combo bot', () => {
  checkTechBot('helper', (rs) => {
    expect(Math.max(...rs.map((r) => r.comboIndex))).toBeGreaterThanOrEqual(8);
  });
}, 3_600_000);

it('INVADER: the downstack bot on its own garbage', () => {
  checkTechBot('invader', (rs) => {
    expect(share(rs, (r) => !!r.garbageCleared)).toBeGreaterThan(0.15);
  });
}, 3_600_000);

it('RIVAL: stock Cold Clear, paid for back-to-back', () => {
  checkTechBot('rival', (rs) => {
    expect(share(rs, (r) => r.b2bExtended)).toBeGreaterThan(0.08);
  });
}, 3_600_000);
