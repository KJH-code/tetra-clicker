import { Economy } from './economy';
import type { Effect } from './effects';
import { tag } from './tags';
import type { LadderEntry } from '../data/ladder';

// Economy simulator: how fast a player climbs the building ladder under a
// given set of numbers. Bots are not run; each board earns at the same rate
// the hidden-tab formula assumes (PPS × lines per piece × multiplier), and
// pricing and bonuses go through the same Economy/effects code as the game so
// the two cannot drift apart.

export type BuildingParams = LadderEntry;

export interface PlayerParams {
  pps: number;
  linesPerPiece: number;
  // The player plays flat out for this long, then only `dailyMinutes` a day.
  focusMinutes: number;
  dailyMinutes: number;
}

export interface TargetParams {
  firstSeconds: number;
  ratio: number;
}

export interface SimParams {
  buildings: BuildingParams[];
  player: PlayerParams;
  horizonSeconds: number;
  target: TargetParams;
}

export interface Purchase {
  t: number;
  id: string;
  n: number; // copies owned after the purchase
  price: number;
  incomeAfter: number; // Lines per second, bots only
}

export interface Sample {
  t: number;
  balance: number;
  income: number; // bots + manual, Lines per second
}

export interface SimResult {
  purchases: Purchase[];
  firstUnlock: Record<string, number>;
  target: Record<string, number>;
  series: Sample[];
  finalBalance: number;
  finalIncome: number;
}

export const DEFAULT_PLAYER: PlayerParams = { pps: 0.5, linesPerPiece: 0.45, focusMinutes: 15, dailyMinutes: 60 };
export const DEFAULT_TARGET: TargetParams = { firstSeconds: 60, ratio: 2.5 };
export const DEFAULT_HORIZON_SECONDS = 7 * 86_400;

// The effects a ladder entry would carry as a game building: the same
// "+x% per copy after the first" shape buildings.ts uses.
export function effectsFor(b: BuildingParams): Effect[] {
  return [{
    target: 'income', filter: [tag.building(b.id)], op: 'add_pct', value: b.bonusPct,
    stack: { type: 'owned', id: b.id, offset: -1 },
  }];
}

// Economy keyed on the simulator's own ladder rather than the game's data file.
class LadderEconomy extends Economy {
  constructor(private readonly ladder: BuildingParams[]) {
    super(ladder.flatMap(effectsFor));
  }
  override price(id: string): number {
    const def = this.ladder.find((b) => b.id === id);
    if (!def) return Infinity;
    return def.basePrice * Math.pow(def.growth, this.owned(id));
  }
}

function manualRate(p: PlayerParams, t: number): number {
  const share = t < p.focusMinutes * 60 ? 1 : p.dailyMinutes / 1440;
  return p.pps * p.linesPerPiece * share;
}

export function simulate(params: SimParams): SimResult {
  const { buildings, player, horizonSeconds, target } = params;
  const eco = new LadderEconomy(buildings);
  const botTags = (id: string) => [tag.board('auto'), tag.building(id), tag.clear(1)];
  const botIncome = (): number =>
    buildings.reduce((sum, b) => sum + (eco.owned(b.id) > 0 ? b.pps * b.linesPerPiece * eco.incomeMultiplier(botTags(b.id)) : 0), 0);
  const unlocked = (b: BuildingParams): boolean => !b.requires || eco.owned(b.requires) > 0;
  // Income a purchase adds: the first copy brings its board, later copies the bonus.
  const gain = (b: BuildingParams): number =>
    eco.owned(b.id) === 0 ? b.pps * b.linesPerPiece : b.pps * b.linesPerPiece * (b.bonusPct / 100);

  const purchases: Purchase[] = [];
  const firstUnlock: Record<string, number> = {};
  const series: Sample[] = [];
  let t = 0;
  let balance = 0;
  const focusEnd = player.focusMinutes * 60;
  // Log-spaced sample points so a days-long horizon stays a few hundred rows.
  let nextSample = 1;
  const sampleStep = 1.08;

  const record = (): void => {
    series.push({ t, balance, income: botIncome() + manualRate(player, t) });
  };
  record();

  let guard = 0;
  while (t < horizonSeconds && guard++ < 200_000) {
    const rate = botIncome() + manualRate(player, t);
    // Pick the purchase that pays for itself soonest.
    let best: BuildingParams | null = null;
    let bestPayback = Infinity;
    for (const b of buildings) {
      if (!unlocked(b)) continue;
      const g = gain(b);
      if (g <= 0) continue;
      const payback = eco.price(b.id) / g;
      if (payback < bestPayback) { bestPayback = payback; best = b; }
    }
    if (!best || rate <= 0) break;
    const price = eco.price(best.id);
    const wait = Math.max(0, (price - balance) / rate);
    // Events that change the rate (focus ending) or that we want sampled come first.
    let next = t + wait;
    if (t < focusEnd && focusEnd < next) next = focusEnd;
    while (nextSample < next && nextSample < horizonSeconds) {
      balance += rate * (nextSample - t);
      t = nextSample;
      record();
      nextSample *= sampleStep;
    }
    if (next > horizonSeconds) {
      balance += rate * (horizonSeconds - t);
      t = horizonSeconds;
      break;
    }
    balance += rate * (next - t);
    t = next;
    // Stopping at the end of the focus window only changes the rate; the
    // next pass recomputes the wait with the lower one.
    if (balance + 1e-9 >= price) {
      balance -= price;
      eco.setOwned(best.id, eco.owned(best.id) + 1);
      const n = eco.owned(best.id);
      if (n === 1) firstUnlock[best.id] = t;
      purchases.push({ t, id: best.id, n, price, incomeAfter: botIncome() });
      record();
    }
  }
  record();

  const targetTimes: Record<string, number> = {};
  buildings.forEach((b, i) => { targetTimes[b.id] = target.firstSeconds * Math.pow(target.ratio, i); });

  return {
    purchases,
    firstUnlock,
    target: targetTimes,
    series,
    finalBalance: balance,
    finalIncome: botIncome() + manualRate(player, t),
  };
}
