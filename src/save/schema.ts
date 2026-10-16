import type { WorldSnapshot } from '../sim/world';
import type { HandlingSettings } from '../data/handling';

export const SAVE_VERSION = 5;

export interface SaveData {
  version: number;
  savedAt: number;
  world: WorldSnapshot;
  settings: HandlingSettings;
}

// Each entry upgrades a save from version n to n+1. A new schema version
// means appending a function here, never editing older ones.
type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;
const MIGRATIONS: Migration[] = [
  // 1 → 2: run upgrades and manual stats arrive; hold becomes a queue; the
  // manual game tracks combo grace and the B2B shield.
  (raw) => {
    const world = raw['world'] as Record<string, unknown>;
    const economy = world['economy'] as Record<string, unknown>;
    economy['upgrades'] ??= [];
    economy['stats'] ??= { manualLines: 0, manualPieces: 0, spins: 0, combo5: 0, b2bs: 0, pcs: 0 };
    const games = [world['manual'], ...((world['autoBoards'] as { game: unknown }[] | undefined) ?? []).map((b) => b.game)];
    for (const g of games as Record<string, unknown>[]) {
      if (!g) continue;
      if (!Array.isArray(g['holds'])) g['holds'] = g['hold'] ? [g['hold']] : [];
      delete g['hold'];
      g['graceUsed'] ??= 0;
      g['shieldSpent'] ??= false;
    }
    return raw;
  },
  // 2 → 3: rounds arrive. An old save is between rounds; new stats default
  // to zero when the world loads.
  (raw) => {
    const world = raw['world'] as Record<string, unknown>;
    world['round'] ??= null;
    return raw;
  },
  // 3 → 4: buffs and golden pieces arrive. No buff is running; the golden
  // timer and marks start fresh when the world loads.
  (raw) => {
    const world = raw['world'] as Record<string, unknown>;
    world['buffs'] ??= [];
    return raw;
  },
  // 4 → 5: prestige arrives. A save without it has never ascended; the new
  // tech counters default to zero when the world loads.
  (raw) => {
    const world = raw['world'] as Record<string, unknown>;
    world['meta'] ??= { crowns: 0, crownsEarned: 0, riskBanked: 0, ascensions: 0, prestige: [], lifetime: {}, ascending: false };
    return raw;
  },
];

export function migrate(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  let data = raw as Record<string, unknown>;
  let version = typeof data['version'] === 'number' ? data['version'] : 0;
  if (version < 1 || version > SAVE_VERSION) return null;
  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version - 1];
    if (!step) return null;
    data = step(data);
    version++;
    data['version'] = version;
  }
  return data as unknown as SaveData;
}
