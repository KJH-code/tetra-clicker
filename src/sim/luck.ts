import { BUFFS, GOLDEN, WRATH, type GoldenOutcome } from '../data/golden';
import { LEVELS } from '../data/levels';
import { EVENTS } from '../data/events';
import { hasAll } from './tags';

// Expected value of a golden or wrath piece, in Lines, for a given moment of
// a run. The game never reads this; the simulator and the tuning tests do,
// so both price luck the same way.
export interface LuckState {
  // Lines per second without buffs: the bots, and the hand while playing.
  bots: number;
  manual: number;
  // Unbanked Lines a ruin would cut into.
  vault: number;
}

// How a run reweighs the tables (prestige steps): duration and weight
// factors per outcome id, and the ruin share.
export interface LuckMods {
  duration?: (buff: string) => number;
  weight?: (id: string) => number;
  ruinShare?: number;
}

// Extra Lines a buff adds over its run: each income effect scales the
// boards its filter matches.
function buffValue(id: string, s: LuckState, scale: number): number {
  const def = BUFFS[id];
  if (!def) return 0;
  const seconds = (def.durationMs / 1000) * scale;
  let extra = 0;
  for (const e of def.effects) {
    if (e.target !== 'income' || e.op !== 'mul') continue;
    const f = e.filter ?? [];
    const bots = hasAll(['board:auto'], f) ? s.bots : 0;
    const manual = hasAll(['board:manual'], f) ? s.manual : 0;
    // Filters naming one building are left out: they are synergy buffs, not luck.
    if (f.some((t) => t.startsWith('building:'))) continue;
    extra += (e.value - 1) * (bots + manual) * seconds;
  }
  return extra;
}

export function outcomeValue(o: GoldenOutcome, s: LuckState, mods: LuckMods = {}): number {
  switch (o.kind) {
    case 'buff': return buffValue(o.buff, s, mods.duration?.(o.buff) ?? 1);
    case 'lucky': return o.seconds * s.bots;
    case 'ruin': return -(mods.ruinShare ?? o.share) * s.vault;
  }
}

export function expectedValue(table: readonly GoldenOutcome[], s: LuckState, mods: LuckMods = {}): number {
  const w = table.map((o) => o.weight * (mods.weight?.(o.id) ?? 1));
  const total = w.reduce((a, b) => a + b, 0);
  return table.reduce((sum, o, i) => sum + (w[i]! / total) * outcomeValue(o, s, mods), 0);
}

export const goldenValue = (s: LuckState, mods?: LuckMods): number => expectedValue(GOLDEN.outcomes, s, mods);
export const wrathValue = (s: LuckState, mods?: LuckMods): number => expectedValue(WRATH.outcomes, s, mods);

// Expected Lines of one life event at `level` (none below the first level
// events come at). `win` is the chance of beating a rival or outlasting an
// invader; a helper's rows are small change and left out.
export function eventValue(s: LuckState, level: number, win: number): number {
  if (level < EVENTS.fromLevel) return 0;
  const w = EVENTS.weights(level);
  const total = w.rival + w.invader + w.helper;
  const rival = win * s.bots * EVENTS.rival.rewardSecondsPerLevel * level;
  const invader = win * EVENTS.invader.payout * s.manual * EVENTS.invader.seconds;
  return (w.rival * rival + w.invader * invader) / total;
}
export const eventMeanSeconds = (EVENTS.minSeconds + EVENTS.maxSeconds) / 2;

// Mean life time between golden pieces, in seconds.
export const goldenMeanSeconds = (GOLDEN.minSeconds + GOLDEN.maxSeconds) / 2;

// A vault fills from empty to a checkpoint, so at a random moment it holds
// about half a checkpoint's Lines. `rowsPerSecond` is the player's pace.
export function averageVault(manualPerSecond: number, rowsPerSecond: number): number {
  if (rowsPerSecond <= 0) return 0;
  return (manualPerSecond * LEVELS.checkpointRows) / rowsPerSecond / 2;
}
