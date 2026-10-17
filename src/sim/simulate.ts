import { Economy } from './economy';
import { evaluate, type Effect } from './effects';
import { tag } from './tags';
import { ATTACK } from '../data/attackTable';
import type { LadderEntry } from '../data/ladder';
import { milestonesFor, MANUAL_UPGRADES, MANUAL_SHARE_UPGRADES, type UpgradeDef } from '../data/upgrades';
import { upgradeEffects } from '../data/index';
import { UPGRADES } from '../data/upgrades';
import { SYNERGIES } from '../data/synergies';
import { HARDCORE_EFFECTS } from '../data/hardcore';
import { WRATH } from '../data/golden';
import { averageVault, goldenMeanSeconds, goldenValue, wrathValue } from './luck';

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
  // Average level the player's lives run at; manual income is multiplied by
  // the level. Missing means 1.
  avgLevel?: number;
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
  // Model the milestone and manual ×2 upgrades. Technique multipliers and
  // rule buffs are left out: a 0.5 PPS singles-and-doubles player barely
  // triggers them.
  upgrades?: boolean;
  // Synergies researched and bought like any upgrade. Link synergies pay
  // nothing here: the model player clears singles, never a tetris or PC.
  synergies?: boolean;
  // A hardcore run: its manual ×2 and risk ×3, and lives three levels higher.
  hardcore?: boolean;
  // Golden pieces, a WRATH stage 0..III of them coming as wrath pieces
  // (research assumed). Left out, luck is not modelled at all.
  wrath?: number;
}

export interface Purchase {
  t: number;
  id: string; // building or upgrade id
  kind?: 'building' | 'upgrade';
  n: number; // copies owned after the purchase
  price: number;
  incomeAfter: number; // Lines per second, bots only
}

export interface Sample {
  t: number;
  balance: number;
  income: number; // bots + manual, Lines per second
  bots: number;
  // Manual Lines per second while the player is at the board (the focus
  // pace), whatever the share of the day they play.
  manualActive: number;
  luck: number; // golden and wrath pieces, at the player's share of the day
}

export interface SimResult {
  purchases: Purchase[];
  firstUnlock: Record<string, number>;
  target: Record<string, number>;
  series: Sample[];
  finalBalance: number;
  finalIncome: number;
  // Lines earned by hand over the run, what risk weight is built from.
  manualLines: number;
  // Risk weight multiplier the run's effects give (×3 hardcore).
  riskWeight: number;
}

// The ladder prices were fitted to this player, at an average life level of 4.
export const DEFAULT_PLAYER: PlayerParams = { pps: 0.5, linesPerPiece: 0.9, focusMinutes: 15, dailyMinutes: 60, avgLevel: 4 };
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
export function ladderUpgrades(ladder: BuildingParams[]): UpgradeDef[] {
  return [...ladder.flatMap(milestonesFor), ...MANUAL_UPGRADES, ...MANUAL_SHARE_UPGRADES];
}

class LadderEconomy extends Economy {
  constructor(private readonly ladder: BuildingParams[], upgrades: UpgradeDef[], extra: Effect[] = []) {
    super([...ladder.flatMap(effectsFor), ...upgradeEffects(upgrades), ...extra], upgrades);
  }
  override price(id: string): number {
    const def = this.ladder.find((b) => b.id === id);
    if (!def) return Infinity;
    return Math.ceil(def.basePrice * Math.pow(def.growth, this.owned(id)) - 1e-9);
  }
}

// Share of the time the player is at the board.
function playShare(p: PlayerParams, t: number): number {
  return t < p.focusMinutes * 60 ? 1 : p.dailyMinutes / 1440;
}

function manualRate(p: PlayerParams, t: number, levelBonus = 0): number {
  return p.pps * p.linesPerPiece * playShare(p, t) * ((p.avgLevel ?? 1) + levelBonus);
}

const multiplierOf = (eco: Economy, target: string): number => evaluate(eco.effects, target, [], eco, 1);

export let lastIterations = 0;

export function simulate(params: SimParams): SimResult {
  const { buildings, player, horizonSeconds, target } = params;
  const synergies = params.synergies ? UPGRADES.filter((u) => u.group === 'synergy' && u.unlock.every((c) => c.type !== 'owned' || buildings.some((b) => b.id === c.id))) : [];
  const upgrades = [...(params.upgrades === false ? [] : ladderUpgrades(buildings)), ...synergies];
  const eco = new LadderEconomy(buildings, upgrades, params.hardcore ? HARDCORE_EFFECTS : []);
  for (const s of SYNERGIES) eco.meta.prestige.add(s.research);
  eco.meta.hardcore = !!params.hardcore;
  // Hardcore lives start three levels up; the model's average moves with them.
  const levelBonus = params.hardcore ? 3 : 0;
  const botTags = (id: string) => [tag.board('auto'), tag.building(id), tag.clear(1)];
  const manualTags = [tag.board('manual')];
  const botIncome = (): number =>
    buildings.reduce((sum, b) => sum + (eco.owned(b.id) > 0 ? b.pps * b.linesPerPiece * eco.incomeMultiplier(botTags(b.id)) : 0), 0);
  // The model player clears singles, worth two Lines a row; each row also
  // pays the share of bot income, and the level multiplies both.
  const manualIncome = (at: number): number => {
    const rate = manualRate(player, at, levelBonus);
    return rate * eco.incomeMultiplier(manualTags) + (rate / ATTACK.normal[1]) * eco.manualShare() * botIncome();
  };
  // Golden and wrath pieces appear only while a life runs, so at the
  // player's share of the day; each is worth its expected value.
  const rowsPerSecond = (player.pps * player.linesPerPiece) / ATTACK.normal[1];
  const wrathChance = params.wrath === undefined ? 0 : WRATH.chance[Math.min(WRATH.chance.length - 1, params.wrath)] ?? 0;
  const luckIncome = (at: number): number => {
    if (params.wrath === undefined) return 0;
    const manual = manualIncome(0);
    const state = { bots: botIncome(), manual, vault: averageVault(manual, rowsPerSecond) };
    const ev = (1 - wrathChance) * goldenValue(state) + wrathChance * wrathValue(state);
    return (playShare(player, at) * ev) / goldenMeanSeconds;
  };
  const income = (at: number): number => botIncome() + manualIncome(at) + luckIncome(at);
  const unlocked = (b: BuildingParams): boolean => !b.requires || eco.owned(b.requires) > 0;

  // Income a purchase would add at time `at`, measured by applying it and
  // backing it out, so buildings and upgrades are compared on one scale.
  type Option = { kind: 'building' | 'upgrade'; id: string; price: number };
  const gainOf = (o: Option, at: number): number => {
    const before = income(at);
    if (o.kind === 'building') {
      eco.setOwned(o.id, eco.owned(o.id) + 1);
      const after = income(at);
      eco.setOwned(o.id, eco.owned(o.id) - 1);
      return after - before;
    }
    eco.upgrades.add(o.id);
    const after = income(at);
    eco.upgrades.delete(o.id);
    return after - before;
  };
  const options = (): Option[] => [
    ...buildings.filter(unlocked).map((b) => ({ kind: 'building' as const, id: b.id, price: eco.price(b.id) as number })),
    ...upgrades.filter((u) => eco.isUpgradeUnlocked(u.id)).map((u) => ({ kind: 'upgrade' as const, id: u.id, price: u.price })),
  ];

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
    series.push({ t, balance, income: income(t), bots: botIncome(), manualActive: manualIncome(0), luck: luckIncome(t) });
  };
  // Advance the clock at a constant rate, keeping the manual-Lines stat that
  // unlocks the manual upgrades.
  const advanceTo = (to: number): void => {
    const dt = to - t;
    balance += income(t) * dt;
    eco.stats.manualLines += manualIncome(t) * dt;
    t = to;
  };
  record();

  let guard = 0;
  while (t < horizonSeconds && guard++ < 200_000) {
    const rate = income(t);
    // Pick the purchase that pays for itself soonest.
    let best: Option | null = null;
    let bestPayback = Infinity;
    for (const o of options()) {
      const g = gainOf(o, t);
      if (g <= 0) continue;
      const payback = o.price / g;
      if (payback < bestPayback) { bestPayback = payback; best = o; }
    }
    if (!best || rate <= 0) break;
    const price = best.price;
    let next = t + Math.max(0, (price - balance) / rate);
    // Events that change the rate or the options come first: the end of the
    // focus window, and the next manual-Lines unlock.
    if (t < focusEnd && focusEnd < next) next = focusEnd;
    // Snap the stat exactly onto the threshold when stopping for an unlock,
    // or rounding leaves it a hair short and the loop crawls toward it.
    let snapStat: number | null = null;
    const manualNow = manualIncome(t);
    if (manualNow > 0) {
      for (const u of upgrades) {
        if (eco.hasUpgrade(u.id)) continue;
        const need = u.unlock.find((c) => c.type === 'stat');
        if (!need || need.type !== 'stat' || !('gte' in need) || eco.stats.manualLines >= need.gte) continue;
        const at = t + (need.gte - eco.stats.manualLines) / manualNow;
        if (at < next) { next = at; snapStat = need.gte; }
      }
    }
    while (nextSample < next && nextSample < horizonSeconds) {
      advanceTo(nextSample);
      record();
      nextSample *= sampleStep;
    }
    if (next > horizonSeconds) {
      advanceTo(horizonSeconds);
      break;
    }
    advanceTo(next);
    if (snapStat !== null) eco.stats.manualLines = Math.max(eco.stats.manualLines, snapStat);
    // Relative tolerance: at large balances the remaining wait can be too
    // small to move t at all, and an absolute one never closes the gap.
    if (balance >= price * (1 - 1e-9)) {
      balance = Math.max(0, balance - price);
      if (best.kind === 'building') {
        eco.setOwned(best.id, eco.owned(best.id) + 1);
        const n = eco.owned(best.id);
        if (n === 1) firstUnlock[best.id] = t;
        purchases.push({ t, id: best.id, kind: 'building', n, price, incomeAfter: botIncome() });
      } else {
        eco.upgrades.add(best.id);
        purchases.push({ t, id: best.id, kind: 'upgrade', n: 1, price, incomeAfter: botIncome() });
      }
      record();
    }
  }
  record();
  lastIterations = guard;

  const targetTimes: Record<string, number> = {};
  buildings.forEach((b, i) => { targetTimes[b.id] = target.firstSeconds * Math.pow(target.ratio, i); });

  return {
    purchases,
    firstUnlock,
    target: targetTimes,
    series,
    finalBalance: balance,
    finalIncome: income(t),
    manualLines: eco.stats.manualLines,
    riskWeight: multiplierOf(eco, 'risk_weight'),
  };
}
