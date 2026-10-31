import { simulate, type SimParams, type SimResult } from './simulate';
import { crownGain } from './prestige';
import { PRESTIGE_UPGRADES, prestigeRequires } from '../data/prestige';
import { LADDER, PRESTIGE_LADDER } from '../data/ladder';

// Runs after runs: each ends on the last building it can buy (RIVAL, then
// MASTER and GRANDMASTER once the BOTS chain opens them) or at its time
// limit, and ascends. Its crowns come from the game's own curve, on risk
// built as the game builds it: Lines earned by hand, times the life's level,
// times the share banked before a top-out, times risk weight. The crowns
// buy the cheapest prestige step open, whatever its chain, until none is
// affordable; every crown ever earned adds 1% income as in the game.

// Share of hand-earned Lines banked at a checkpoint rather than lost to a
// top-out; the crown curve's constant was set on the same 70% (prestige.ts).
const BANKED_SHARE = 0.7;
// Tech score for a model player's run: three of the ten checks (0.15 each),
// a guess.
export const DEFAULT_TECH_SCORE = 0.45;

export interface RunsOptions {
  runs: number;
  maxRunSeconds: number;
  techScore?: number;
}

export interface RunReport {
  run: number;
  seconds: number;
  crownsGained: number;
  crownsEarned: number;
  bought: string[]; // prestige steps bought on ascending
  firstUnlock: Record<string, number>;
  result: SimResult;
}

export function ladderFor(prestige: ReadonlySet<string>) {
  return [...LADDER, ...PRESTIGE_LADDER.filter((b) => (b.id === 'master' ? prestige.has('bots_2') : b.id === 'grandmaster' ? prestige.has('bots_4') : true))];
}

export function simulateRuns(base: Omit<SimParams, 'buildings' | 'horizonSeconds' | 'prestige' | 'crownsEarned' | 'stopAfter'>, opts: RunsOptions): RunReport[] {
  const prestige = new Set<string>();
  let crownsEarned = 0;
  let crowns = 0;
  let riskBanked = 0;
  const reports: RunReport[] = [];
  for (let run = 1; run <= opts.runs; run++) {
    const buildings = ladderFor(prestige);
    const result = simulate({
      ...base, buildings, horizonSeconds: opts.maxRunSeconds,
      prestige: [...prestige], crownsEarned, stopAfter: buildings.at(-1)!.id,
    });
    const level = (base.player.avgLevel ?? 1) + (base.hardcore ? 3 : 0);
    const risk = result.manualLines * level * BANKED_SHARE * result.riskWeight;
    const gained = crownGain(riskBanked, risk, opts.techScore ?? DEFAULT_TECH_SCORE);
    riskBanked += risk;
    crownsEarned += gained;
    crowns += gained;
    const bought: string[] = [];
    for (;;) {
      const open = PRESTIGE_UPGRADES
        .filter((u) => !prestige.has(u.id) && u.price <= crowns && (prestigeRequires(u.id) === null || prestige.has(prestigeRequires(u.id)!)))
        .sort((a, b) => a.price - b.price);
      const next = open[0];
      if (!next) break;
      prestige.add(next.id);
      crowns -= next.price;
      bought.push(next.id);
    }
    reports.push({ run, seconds: result.seconds, crownsGained: gained, crownsEarned, bought, firstUnlock: result.firstUnlock, result });
  }
  return reports;
}
