import { describe, expect, it } from 'vitest';
import { ladderFor, simulateRuns } from '../src/sim/runs';
import { simulate, DEFAULT_PLAYER, DEFAULT_TARGET } from '../src/sim/simulate';
import { LADDER } from '../src/data/ladder';

describe('ascension runs in the simulator', () => {
  it('MASTER and GRANDMASTER join the ladder with their BOTS steps', () => {
    expect(ladderFor(new Set()).at(-1)!.id).toBe('rival');
    expect(ladderFor(new Set(['bots_2'])).at(-1)!.id).toBe('master');
    expect(ladderFor(new Set(['bots_2', 'bots_4'])).at(-1)!.id).toBe('grandmaster');
  });

  it('a run earns crowns, spends them on prestige, and the next run goes faster', () => {
    const base = { player: DEFAULT_PLAYER, target: DEFAULT_TARGET };
    const [first, second] = simulateRuns(base, { runs: 2, maxRunSeconds: 20 * 86_400 });
    expect(first!.crownsGained).toBeGreaterThan(0);
    expect(first!.bought.length).toBeGreaterThan(0);
    expect(second!.crownsEarned).toBeGreaterThanOrEqual(first!.crownsGained);
    // Crowns (+1% each) and production steps: the second run's first buildings come sooner.
    expect(second!.firstUnlock['tetris']!).toBeLessThan(first!.firstUnlock['tetris']!);
  }, 60_000);

  it('a run stops on the building it ascends after', () => {
    const r = simulate({ buildings: LADDER.slice(0, 4), player: DEFAULT_PLAYER, target: DEFAULT_TARGET, horizonSeconds: 30 * 86_400, stopAfter: 'tetris' });
    expect(r.seconds).toBe(r.firstUnlock['tetris']);
  });

  it('links speed the SINGLE bot while the player plays', () => {
    const p = { buildings: LADDER.slice(0, 3), player: DEFAULT_PLAYER, target: DEFAULT_TARGET, horizonSeconds: 3_600 };
    const plain = simulate(p);
    const linked = simulate({ ...p, links: true });
    // Not TRIPLE's unlock time: linked SINGLE bots pay back sooner, so the buyer
    // rightly stacks them first and TRIPLE comes later while the economy runs ahead.
    expect(linked.finalIncome).toBeGreaterThan(plain.finalIncome);
    const at = (r: typeof plain, id: string) => r.purchases.find((x) => x.id === id)!.t;
    expect(at(linked, 'ms_single_5')).toBeLessThan(at(plain, 'ms_single_5'));
  });
});
