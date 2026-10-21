import type { Effect } from '../sim/effects';
import type { BuffDef } from './golden';
import type { LockResult } from '../sim/game';
import type { BotTech } from '../sim/attack';
import { BUILDINGS } from './buildings';

// Ties between the hand and the bots. A technique by hand doubles the bot
// built on it for a while; a low stack while a life runs speeds every bot;
// each bot levels up on its own technique; some buildings carry an ability
// that reaches into the manual board; and the bots can suggest a placement.
export const BOT_LINKS = {
  // A technique by hand: its bot ×2 for this long, more time on a repeat, up to the cap.
  linkMs: 30_000,
  linkMaxMs: 90_000,
  // Bots +maxPct% while the manual stack is at most fullRows high in a
  // running life, falling to nothing at zeroRows.
  stackFullRows: 4,
  stackZeroRows: 10,
  stackMaxPct: 20,
  // Bot levels: level n needs xpPerLevel × n(n+1)/2 of the bot's own
  // technique; each level is +levelPct% to that building, up to maxLevel.
  xpPerLevel: 50,
  levelPct: 5,
  // The cap before the BOTS prestige branch raises it (bot_level_cap).
  maxLevel: 20,
  // HINT: the bots' suggestion for the piece in play, as a ghost. Cooldown
  // shrinks with the bots owned: base ÷ (1 + bots / perBots), at least minMs.
  hintBaseMs: 30_000,
  hintMinMs: 5_000,
  hintPerBots: 50,
  hintShowMs: 4_000,
  // Abilities.
  allspinHintMs: 2_000, // ALL-SPIN: each spin takes this off the hint cooldown
  pcBurstMs: 5_000, // PERFECT: each PC, every bot ×2 this long
  comboPctPerStep: 10, // COMBO: +this % of a clear per combo step
  b2bPctPerStep: 2, // B2B: +this % of a clear per chain step
  downstackCooldownMs: 20_000, // DOWNSTACK: a garbage row off the manual board at most this often
  openerPieces: 10, // OPENER: the first pieces of each life pay double by hand
};

// What a building's bot counts as its technique: its clear size for the
// plain ones, its paid technique for the rest.
export function botTechHit(clearSize: number, tech: BotTech | undefined, r: LockResult): boolean {
  if (r.lines === 0) return false;
  switch (tech) {
    case undefined: return r.lines === clearSize;
    case 'tspin': return r.piece === 'T' && r.spin === 'full';
    case 'allspin': return r.spin === 'full';
    case 'combo': case 'fourwide': return r.comboIndex > 0;
    case 'b2b': return r.b2bExtended;
    case 'pc': return r.perfectClear;
    case 'downstack': return !!r.garbageCleared;
    case 'opener': return r.perfectClear || (r.piece === 'T' && r.spin === 'full');
    case 'master': return isTechnique(r);
  }
}

// Any of the techniques: a tetris, a spin, a combo, a chain or a PC.
function isTechnique(r: LockResult): boolean {
  return r.lines > 0 && (r.lines === 4 || r.spin === 'full' || r.comboIndex > 0 || r.b2bExtended || r.perfectClear);
}

// The buildings a manual clear lends a hand to. MASTER answers any technique.
export function linkedBuildings(r: LockResult): string[] {
  if (r.lines === 0) return [];
  const out: string[] = [];
  if (r.spin === 'none' || r.spin === 'mini') out.push((['single', 'double', 'triple', 'tetris'] as const)[Math.min(4, r.lines) - 1]!);
  if (r.piece === 'T' && r.spin === 'full') out.push('tspin');
  else if (r.spin === 'full') out.push('allspin');
  if (r.comboIndex > 0) out.push('combo');
  if (r.b2bExtended) out.push('b2b');
  if (r.perfectClear) out.push('pc');
  if (isTechnique(r)) out.push('master');
  return out;
}

// Bots' bonus percent for a manual stack this many rows high.
export function stackBonusPct(height: number): number {
  const { stackFullRows: full, stackZeroRows: zero, stackMaxPct: max } = BOT_LINKS;
  if (height <= full) return max;
  if (height >= zero) return 0;
  return (max * (zero - height)) / (zero - full);
}

// The level a bot is at with this much of its technique behind it.
export function botLevelFor(xp: number, cap: number = BOT_LINKS.maxLevel): number {
  // The largest n with xpPerLevel × n(n+1)/2 ≤ xp, solved rather than
  // counted: the simulator asks this for every building at every step.
  if (xp <= 0) return 0;
  const n = Math.floor((Math.sqrt(1 + (8 * xp) / BOT_LINKS.xpPerLevel) - 1) / 2 + 1e-9);
  return Math.min(cap, n);
}

// How far a bot is from its level to the next, 0..1 (1 at the cap).
export function botLevelProgress(xp: number, cap: number = BOT_LINKS.maxLevel): number {
  const n = botLevelFor(xp, cap);
  if (n >= cap) return 1;
  const at = (k: number): number => (BOT_LINKS.xpPerLevel * k * (k + 1)) / 2;
  return (xp - at(n)) / (at(n + 1) - at(n));
}

export const linkBuffId = (building: string): string => `link_${building}`;
export const linkUpgradeId = (building: string, step: 1 | 2): string => `link${step}_${building}`;

// Each building's two link upgrades: its link ×3 at 10 owned, then its
// link's time cap doubled (90 s → 180 s) at 50.
export const LINK_UPGRADE_STEPS = [
  { owned: 10, priceMul: 1_000 },
  { owned: 50, priceMul: 1_000_000 },
] as const;

export const LINK_BUFFS: Record<string, BuffDef> = Object.fromEntries([
  ...BUILDINGS.map((b): [string, BuffDef] => [linkBuffId(b.id), {
    id: linkBuffId(b.id), label: `${b.name} BOT ×2`, durationMs: BOT_LINKS.linkMs,
    // The first link upgrade makes it ×3 (src/data/upgrades.ts).
    effects: [
      { target: 'income', filter: [`building:${b.id}`], op: 'mul', value: 2 },
      { target: 'income', filter: [`building:${b.id}`], op: 'mul', value: 1.5, when: [{ type: 'upgrade', id: linkUpgradeId(b.id, 1) }] },
    ],
  }]),
  ['pc_burst', { id: 'pc_burst', label: 'PERFECT · BOTS ×2', durationMs: BOT_LINKS.pcBurstMs, effects: [{ target: 'income', filter: ['board:auto'], op: 'mul', value: 2 }] }],
]);

export const BOT_LINK_EFFECTS: Effect[] = [
  // The world reports the bonus percent as the stackBonus stat.
  { target: 'income', filter: ['board:auto'], op: 'mul_pct', value: 1, stack: { type: 'stat', stat: 'stackBonus' } },
  ...BUILDINGS.map((b): Effect => ({ target: 'income', filter: [`building:${b.id}`], op: 'mul_pct', value: BOT_LINKS.levelPct, stack: { type: 'stat', stat: `botLevel:${b.id}` } })),
];
