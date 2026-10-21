import { it, expect } from 'vitest';
import { Game } from '../../src/sim/game';
import { playOne } from '../../src/sim/bot/index';
import { openerBot } from '../../src/sim/bot/openerBot';
import { pictureStages } from '../../src/sim/fumen';
import { botAttack } from '../../src/sim/attack';
import { OPENERS, OPENER_BUILD_BONUS_PCT } from '../../src/data/openers';

// Every step of the OPENER chain pays: with the first n builds researched,
// the bot plays them (first that fits) and earns, with the chain's bonus,
// at least what the DPC loop alone earned the step before.
const SEEDS = [11, 12, 13];
const PIECES = 600;

function earn(builds: number): number {
  const bot = openerBot(OPENERS.slice(0, builds).map((o) => pictureStages(o.stages)));
  let paid = 0;
  for (const seed of SEEDS) {
    const g = new Game(seed);
    for (let i = 0; i < PIECES; i++) {
      const m = playOne(g, bot);
      expect(m).not.toBeNull();
      expect(m!.result.topped).toBe(false);
      paid += botAttack(m!.result, 'opener');
    }
  }
  return paid / (SEEDS.length * PIECES);
}

it('OPENER builds: each research step is a gain', () => {
  const bonus = (n: number): number => 1 + (OPENER_BUILD_BONUS_PCT * n) / 100;
  let before = earn(0);
  for (let n = 1; n <= OPENERS.length; n++) {
    const now = earn(n);
    expect(now * bonus(n), OPENERS[n - 1]!.id).toBeGreaterThan(before * bonus(n - 1));
    before = now;
  }
}, 7_200_000);
