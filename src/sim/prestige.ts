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
}

export interface MetaSnapshot {
  crowns: number;
  crownsEarned: number;
  riskBanked: number;
  ascensions: number;
  prestige: string[];
  lifetime: Stats;
  ascending: boolean;
}

export const emptyMeta = (): Meta => ({
  crowns: 0, crownsEarned: 0, riskBanked: 0, ascensions: 0, prestige: new Set(), lifetime: emptyStats(), ascending: false,
});

export function metaFrom(s: MetaSnapshot | undefined): Meta {
  if (!s) return emptyMeta();
  return { ...s, prestige: new Set(s.prestige), lifetime: { ...emptyStats(), ...s.lifetime } };
}

export function metaSnapshot(m: Meta): MetaSnapshot {
  return { ...m, prestige: [...m.prestige].sort(), lifetime: { ...m.lifetime } };
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
