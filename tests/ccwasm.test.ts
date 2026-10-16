import { describe, it, expect } from 'vitest';
import { Game } from '../src/sim/game';
import { playOne } from '../src/sim/bot/index';
import { ccWasmBot, engineSuggest, CC_DEFAULT } from '../src/sim/bot/ccWasm';

describe('Cold Clear engine', () => {
  it('gives the same move for the same position', () => {
    const a = engineSuggest(new Game(5), { weights: CC_DEFAULT }, 800);
    const b = engineSuggest(new Game(5), { weights: CC_DEFAULT }, 800);
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
    expect(a!.nodes).toBeGreaterThan(0);
  });

  it('does not depend on what it searched before', () => {
    const first = engineSuggest(new Game(21), { weights: CC_DEFAULT }, 2000);
    for (let s = 0; s < 5; s++) engineSuggest(new Game(100 + s), { weights: CC_DEFAULT, allSpins: true }, 2000);
    expect(engineSuggest(new Game(21), { weights: CC_DEFAULT }, 2000)).toEqual(first);
  });

  it('plays a game the same way twice, every move reachable by our rules', () => {
    const run = () => {
      const g = new Game(9);
      const bot = ccWasmBot({ weights: CC_DEFAULT, nodes: 300 });
      const log: string[] = [];
      for (let i = 0; i < 150; i++) {
        const m = playOne(g, bot);
        expect(m).not.toBeNull();
        expect(m!.result.topped).toBe(false);
        log.push(`${m!.to.piece}${m!.to.rot}${m!.to.x},${m!.to.y}`);
      }
      return log;
    };
    expect(run()).toEqual(run());
  });

  it('never makes a forbidden clear when another move exists', () => {
    const g = new Game(3);
    const bot = ccWasmBot({ weights: CC_DEFAULT, nodes: 300, forbid: ['clear1', 'clear2', 'clear3'] });
    let small = 0;
    for (let i = 0; i < 120; i++) {
      const r = playOne(g, bot)!.result;
      if (r.lines > 0 && r.lines < 4 && r.spin === 'none') small++;
    }
    expect(small).toBe(0);
  });
});
