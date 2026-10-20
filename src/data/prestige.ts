import type { Condition, Effect } from '../sim/effects';
import { SYNERGIES } from './synergies';
import { buildingById } from './buildings';
import { OPENERS } from './openers';

// Prestige: CROWNs from risk-weighted Lines, spent between runs.
//
// Total crowns ever = ∛(lifetime risk / riskPerCrown). An ascension pays the
// growth of that total since the last one, times (1 + this run's tech
// score), rounded down. The cube root makes each next crown dearer, so many
// short runs earn less than one long one.
export const PRESTIGE = {
  // Calibrated so the first crown comes after about 2.5 hours of play: the
  // simulator's default player (0.5 PPS, 0.9 Lines a piece) playing
  // continuously at an average level of 4 earns ~48K Lines by hand in 2.5 h;
  // assuming 70% of it is banked before a top-out, at level 4 that weighs
  // ~135K.   1 h 32K · 2 h 99K · 2.5 h 135K · 3 h 171K · 4 h 252K
  riskPerCrown: 135_000,
  // Ten checks at 0.15 overshoot the 1.0 cap, so seven are enough until
  // TECH CAP +0.5 lets all ten count.
  techPerCheck: 0.15,
  techCapBase: 1.0,
};

// Tech checklist: each met in a run adds techPerCheck to that run's score.
// Every check is a run statistic reaching a count, so a new check is data.
export interface TechCheck {
  id: string;
  label: string;
  when: Condition[];
}

const HC: Condition = { type: 'hardcore' };

export const TECH_CHECKS: TechCheck[] = [
  { id: 'tss', label: 'T-SPIN SINGLE', when: [{ type: 'stat', stat: 'tss', gte: 1 }] },
  { id: 'tsd', label: 'T-SPIN DOUBLE', when: [{ type: 'stat', stat: 'tsd', gte: 1 }] },
  { id: 'tst', label: 'T-SPIN TRIPLE', when: [{ type: 'stat', stat: 'tst', gte: 1 }] },
  { id: 'pc', label: 'PERFECT CLEAR', when: [{ type: 'stat', stat: 'pcs', gte: 1 }] },
  { id: 'combo5', label: '5 COMBO', when: [{ type: 'stat', stat: 'combo5', gte: 1 }] },
  { id: 'combo10', label: '10 COMBO', when: [{ type: 'stat', stat: 'combo10', gte: 1 }] },
  { id: 'b2b5', label: 'B2B ×5', when: [{ type: 'stat', stat: 'b2b5', gte: 1 }] },
  { id: 'tetris10', label: '10 TETRISES', when: [{ type: 'stat', stat: 'tetrises', gte: 10 }] },
  { id: 'level10', label: 'REACH LEVEL 10', when: [{ type: 'stat', stat: 'maxLevel', gte: 10 }] },
  { id: 'golden3', label: '3 GOLDEN PIECES', when: [{ type: 'stat', stat: 'goldens', gte: 3 }] },
  // Hardcore only. "Alive" is read when the run ascends: a voluntary
  // ascension has no death behind it, a top-out has one.
  { id: 'hc_level15', label: 'HARDCORE LEVEL 15', when: [HC, { type: 'stat', stat: 'maxLevel', gte: 15 }] },
  { id: 'hc_checkpoints10', label: 'HARDCORE 10 CHECKPOINTS', when: [HC, { type: 'stat', stat: 'checkpoints', gte: 10 }] },
  { id: 'hc_alive', label: 'HARDCORE ASCEND ALIVE', when: [HC, { type: 'stat', stat: 'deaths', lte: 0 }, { type: 'stat', stat: 'rounds', gte: 1 }] },
  { id: 'hc_30min', label: 'HARDCORE 30 MINUTES', when: [HC, { type: 'stat', stat: 'maxLifeSeconds', gte: 1800 }] },
];

// Prestige upgrades: chains, bought only on the ascension screen.
export type Branch = 'production' | 'survival' | 'proportion' | 'synergy' | 'elder' | 'opener' | 'mission' | 'event';

export interface PrestigeDef {
  id: string;
  branch: Branch;
  name: string;
  price: number;
  effects: Effect[];
}

const PRICES = [1, 3, 9, 27, 81];

function branch(id: Branch, steps: { name: string; effects: Effect[] }[]): PrestigeDef[] {
  return steps.map((s, i) => ({ id: `${id}_${i + 1}`, branch: id, price: PRICES[i]!, ...s }));
}

export const PRESTIGE_UPGRADES: PrestigeDef[] = [
  ...branch('production', [
    { name: 'ALL INCOME ×2', effects: [{ target: 'income', op: 'mul', value: 2 }] },
    { name: 'START WITH 2K LINES', effects: [{ target: 'start_lines', op: 'add', value: 2_000 }] },
    { name: 'MANUAL ×3', effects: [{ target: 'income', filter: ['board:manual'], op: 'mul', value: 3 }] },
    { name: 'ALL INCOME ×2', effects: [{ target: 'income', op: 'mul', value: 2 }] },
    { name: 'ALL INCOME ×3', effects: [{ target: 'income', op: 'mul', value: 3 }] },
  ]),
  ...branch('survival', [
    { name: 'GRAVITY ×0.8', effects: [{ target: 'gravity', op: 'mul', value: 0.8 }] },
    { name: 'KEEP 25% OF THE VAULT ON A TOP-OUT', effects: [{ target: 'retain', op: 'add', value: 0.25 }] },
    { name: 'PURCHASE GARBAGE ×0.8', effects: [{ target: 'buy_garbage', op: 'mul', value: 0.8 }] },
    { name: 'KEEP 50% OF THE VAULT ON A TOP-OUT', effects: [{ target: 'retain', op: 'add', value: 0.25 }] },
    { name: 'KEEP 75% OF THE VAULT ON A TOP-OUT', effects: [{ target: 'retain', op: 'add', value: 0.25 }] },
  ]),
  ...branch('proportion', [
    { name: 'RISK WEIGHT ×1.5', effects: [{ target: 'risk_weight', op: 'mul', value: 1.5 }] },
    { name: 'TECH CAP +0.5', effects: [{ target: 'tech_cap', op: 'add', value: 0.5 }] },
    { name: 'RISK WEIGHT ×2', effects: [{ target: 'risk_weight', op: 'mul', value: 2 }] },
    { name: 'START LEVEL +2', effects: [{ target: 'start_level', op: 'add', value: 2 }] },
    { name: 'RISK WEIGHT ×3', effects: [{ target: 'risk_weight', op: 'mul', value: 3 }] },
  ]),
  // Wrath pieces (shown as WRATH; the id keeps clear of the run upgrades
  // wrath_1..3): the first step lets them appear at all, the rest soften them.
  ...branch('elder', [
    { name: 'WRATH PIECES: wrath upgrades turn golden pieces into wrath pieces', effects: [{ target: 'wrath_pieces', op: 'flag', value: 1 }] },
    { name: 'ELDER FRENZY LASTS 12 S', effects: [{ target: 'buff_duration', filter: ['buff:elder_frenzy'], op: 'mul', value: 2 }] },
    { name: 'RUIN TAKES 10%', effects: [{ target: 'ruin_share', op: 'mul', value: 0.5 }] },
    { name: 'CLOT HALF AS LIKELY', effects: [{ target: 'wrath_weight', filter: ['wrath:clot'], op: 'mul', value: 0.5 }] },
    { name: 'NO RUIN', effects: [{ target: 'wrath_weight', filter: ['wrath:ruin'], op: 'mul', value: 0 }] },
  ]),
  // Life missions (src/data/missions.ts): more of them, harder ones, more pay.
  ...branch('mission', [
    { name: 'MISSION PAY ×1.5', effects: [{ target: 'mission_pay', op: 'mul', value: 1.5 }] },
    { name: 'FOUR MISSIONS A LIFE', effects: [{ target: 'mission_count', op: 'add', value: 1 }] },
    { name: 'HARD MISSIONS: TETRIS ×6, PERFECT CLEAR, 10 COMBO', effects: [{ target: 'hard_missions', op: 'flag', value: 1 }] },
    { name: 'MISSION PAY ×2', effects: [{ target: 'mission_pay', op: 'mul', value: 2 }] },
    { name: 'EACH MISSION DONE: +10% INCOME FOR THE REST OF THE LIFE', effects: [{ target: 'income', op: 'mul_pct', value: 10, stack: { type: 'stat', stat: 'lifeMissions' } }] },
  ]),
  // Life events (src/data/events.ts): more often, kinder, better paid.
  ...branch('event', [
    { name: 'EVENTS 25% MORE OFTEN', effects: [{ target: 'event_rate', op: 'mul', value: 1.25 }] },
    { name: 'GOOD EVENTS TWICE AS LIKELY', effects: [{ target: 'good_event_weight', op: 'mul', value: 2 }] },
    { name: 'EVENT REWARDS ×1.5', effects: [{ target: 'event_reward', op: 'mul', value: 1.5 }] },
    { name: 'BOSS HP ×0.75', effects: [{ target: 'boss_hp', op: 'mul', value: 0.75 }] },
    { name: 'EVENTS 50% MORE OFTEN · REWARDS ×2', effects: [{ target: 'event_rate', op: 'mul', value: 1.2 }, { target: 'event_reward', op: 'mul', value: 2 }] },
  ]),
  // Research: each opens one synergy for every later run (bought there with
  // Lines). Up the ladder, a crown dearer each step, so they come a few per
  // ascension rather than all at once.
  ...SYNERGIES.map((s, i): PrestigeDef => ({
    id: s.research, branch: 'synergy', name: `${s.pair.map((p) => buildingById(p)?.name ?? p).join(' + ')}`, price: i + 1, effects: [],
  })),
  // Named builds for the OPENER bot, one step each, two crowns dearer each
  // time (src/data/openers.ts; empty until their fumens are in).
  ...OPENERS.map((o, i): PrestigeDef => ({ id: `opener_${i + 1}`, branch: 'opener', name: `OPENER BUILD: ${o.name}`, price: 2 * (i + 1), effects: [] })),
];

export const prestigeById = (id: string): PrestigeDef | undefined => PRESTIGE_UPGRADES.find((u) => u.id === id);

// The previous step of the same chain, which must be bought first.
export function prestigeRequires(id: string): string | null {
  const def = prestigeById(id);
  if (!def) return null;
  const i = PRESTIGE_UPGRADES.filter((u) => u.branch === def.branch).indexOf(def);
  return i > 0 ? `${def.branch}_${i}` : null;
}

// Every crown ever earned adds 1% to all income, spent or not.
export const CROWN_EFFECT: Effect = { target: 'income', op: 'mul_pct', value: 1, stack: { type: 'stat', stat: 'crownsEarned' } };
