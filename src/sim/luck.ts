import { BUFFS, GOLDEN, WRATH, type GoldenOutcome } from '../data/golden';
import { MISSIONS, MISSIONS_PER_LIFE, type MissionDef } from '../data/missions';
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
  const total = Object.values(w).reduce((n, v) => n + v, 0);
  // Rewards sized on PER SECOND. The game uses the hand's rate before the
  // first bot, a minute or so; modelling that switch would make the first
  // purchase look like a loss, so the model leaves it out.
  const perSecond = s.bots;
  const value: Record<string, number> = {
    rival: win * s.bots * EVENTS.rival.rewardSecondsPerLevel * level,
    invader: win * EVENTS.invader.payout * s.manual * EVENTS.invader.seconds,
    // Kind ones pay by the multiplier on what the hand makes anyway.
    bonus: (EVENTS.bonus.incomeMul - 1) * s.manual * EVENTS.bonus.seconds,
    mystery: (EVENTS.mystery.incomeMul - 1) * s.manual * EVENTS.mystery.seconds,
    boss: win * perSecond * level * EVENTS.boss.rewardMinutes * 60,
    tech: win * perSecond * EVENTS.tech.rewardMinutes * 60,
  };
  return (Object.keys(w) as (keyof typeof w)[]).reduce((sum, k) => sum + w[k] * (value[k] ?? 0), 0) / total;
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

// Minutes of income the missions of one life pay a player clearing
// `rowsPerSecond` rows at `pps`, if the life lasts `lifeSeconds`: the
// missions they can meet in that time (a singles player meets no technique
// mission), times the chance each is among the three drawn.
export function missionMinutesPerLife(pps: number, rowsPerSecond: number, lifeSeconds: number): number {
  const secondsFor = (m: MissionDef): number => {
    if (m.kind === 'seconds') return m.goal;
    if (m.kind === 'levels') return rowsPerSecond > 0 ? (m.goal * LEVELS.rowsPerLevel) / rowsPerSecond : Infinity;
    if (m.stat === 'manualPieces') return pps > 0 ? m.goal / pps : Infinity;
    if (m.stat === 'checkpoints') return rowsPerSecond > 0 ? (m.goal * LEVELS.checkpointRows) / rowsPerSecond : Infinity;
    return Infinity;
  };
  // Hard missions need a prestige upgrade the model does not buy.
  const pool = MISSIONS.filter((m) => !m.hard);
  const met = pool.filter((m) => secondsFor(m) <= lifeSeconds);
  return (MISSIONS_PER_LIFE / pool.length) * met.reduce((sum, m) => sum + m.minutes, 0);
}
