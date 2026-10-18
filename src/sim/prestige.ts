import { PRESTIGE } from '../data/prestige';
import { emptyStats, type Stats } from './stats';

// What survives an ascension.
export interface Meta {
  crowns: number; // unspent
  crownsEarned: number; // ever, spent or not: the +1% per crown reads this
  riskBanked: number; // lifetime risk-weighted Lines up to the last ascension
  ascensions: number;
  prestige: Set<string>;
  lifetime: Stats;
  // Between ascending and starting the next run, on the prestige shop.
  ascending: boolean;
  // This run is hardcore; the mode picked on the prestige shop for the next.
  hardcore: boolean;
  nextHardcore: boolean;
  // Best hardcore life: level reached and rows cleared.
  hardcoreBest: { level: number; rows: number };
  hardcoreAscensions: number;
  // Ascensions made with an empty bank (a hidden achievement).
  emptyAscensions: number;
  achievements: Set<string>;
  // Buildings bought at least once in any run: the achievement list names
  // only these, so it does not give the ladder away.
  buildingsSeen: Set<string>;
  // This run's challenge rules (rule id → step; empty when it is not a
  // challenge run), the pick for the next run, and the best cleared points.
  challenge: Record<string, number>;
  nextChallenge: Record<string, number>;
  challengeBest: number;
  // RIVAL building: wins in a row this life, and the best ever.
  rivalStreak: number;
  rivalBest: number;
}

export interface MetaSnapshot {
  crowns: number;
  crownsEarned: number;
  riskBanked: number;
  ascensions: number;
  prestige: string[];
  lifetime: Stats;
  ascending: boolean;
  hardcore: boolean;
  nextHardcore: boolean;
  hardcoreBest: { level: number; rows: number };
  hardcoreAscensions: number;
  emptyAscensions: number;
  achievements: string[];
  buildingsSeen: string[];
  challenge: Record<string, number>;
  nextChallenge: Record<string, number>;
  challengeBest: number;
  rivalStreak: number;
  rivalBest: number;
}

export const emptyMeta = (): Meta => ({
  crowns: 0, crownsEarned: 0, riskBanked: 0, ascensions: 0, prestige: new Set(), lifetime: emptyStats(), ascending: false,
  hardcore: false, nextHardcore: false, hardcoreBest: { level: 0, rows: 0 },
  hardcoreAscensions: 0, emptyAscensions: 0, achievements: new Set(), buildingsSeen: new Set(),
  challenge: {}, nextChallenge: {}, challengeBest: 0, rivalStreak: 0, rivalBest: 0,
});

export function metaFrom(s: MetaSnapshot | undefined): Meta {
  if (!s) return emptyMeta();
  return {
    ...emptyMeta(), ...s, prestige: new Set(s.prestige), lifetime: { ...emptyStats(), ...s.lifetime }, hardcoreBest: { ...s.hardcoreBest },
    achievements: new Set(s.achievements ?? []), buildingsSeen: new Set(s.buildingsSeen ?? []),
    challenge: { ...(s.challenge ?? {}) }, nextChallenge: { ...(s.nextChallenge ?? {}) },
  };
}

export function metaSnapshot(m: Meta): MetaSnapshot {
  return {
    ...m, prestige: [...m.prestige].sort(), lifetime: { ...m.lifetime }, hardcoreBest: { ...m.hardcoreBest },
    achievements: [...m.achievements].sort(), buildingsSeen: [...m.buildingsSeen].sort(),
    challenge: { ...m.challenge }, nextChallenge: { ...m.nextChallenge },
  };
}

// Crowns the whole of a lifetime's risk is worth, before tech.
export function crownCurve(risk: number): number {
  return Math.cbrt(Math.max(0, risk) / PRESTIGE.riskPerCrown);
}

// Crowns an ascension pays now: the curve's growth over this run, times
// (1 + tech score), rounded down.
export function crownGain(riskBanked: number, runRisk: number, techScore: number): number {
  const grown = crownCurve(riskBanked + runRisk) - crownCurve(riskBanked);
  // A hair of tolerance so an exact cube (8 × K → 2) does not floor to 1.
  return Math.floor(grown * (1 + techScore) + 1e-9);
}
