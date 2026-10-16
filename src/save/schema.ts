import type { WorldSnapshot } from '../sim/world';
import type { HandlingSettings } from '../data/handling';

export const SAVE_VERSION = 6;

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
  // 4 → 5: prestige arrives, and Lines become whole numbers in a unit twice
  // the old one. A save without prestige has never ascended; the new tech
  // counters default to zero when the world loads. Amounts in Lines double
  // (rounded down), and upgrades named after a Lines threshold follow it.
  (raw) => {
    const world = raw['world'] as Record<string, unknown>;
    world['meta'] ??= { crowns: 0, crownsEarned: 0, riskBanked: 0, ascensions: 0, prestige: [], lifetime: {}, ascending: false };
    const economy = world['economy'] as Record<string, unknown>;
    economy['balance'] = String(Math.floor(Number(economy['balance'] ?? 0) * 2));
    const stats = (economy['stats'] ?? {}) as Record<string, number>;
    for (const k of ['manualLines', 'riskLines']) if (typeof stats[k] === 'number') stats[k] = stats[k] * 2;
    economy['upgrades'] = ((economy['upgrades'] ?? []) as string[]).map((id) => {
      const m = /^(manual|share)_(\d+)$/.exec(id);
      return m ? `${m[1]}_${Number(m[2]) * 2}` : id;
    });
    const round = world['round'] as Record<string, number> | null;
    if (round) round['vault'] = Math.floor((round['vault'] ?? 0) * 2);
    return raw;
  },
  // 5 → 6: rounds become lives with levels and checkpoints, and settling is
  // gone. A round in progress ends with its vault banked in full, so nobody
  // loses Lines to the change; the settle key binding is dropped.
  (raw) => {
    const world = raw['world'] as Record<string, unknown>;
    const economy = world['economy'] as Record<string, unknown>;
    const round = world['round'] as Record<string, number> | null;
    if (round) economy['balance'] = String(Number(economy['balance'] ?? 0) + Math.floor(round['vault'] ?? 0));
    world['round'] = null;
    const stats = economy['stats'] as Record<string, number> | undefined;
    if (stats) { delete stats['roundsSettled']; delete stats['hotSettles']; }
    const meta = world['meta'] as Record<string, unknown> | undefined;
    const lifetime = meta?.['lifetime'] as Record<string, number> | undefined;
    if (lifetime) { delete lifetime['roundsSettled']; delete lifetime['hotSettles']; }
    const keys = (raw['settings'] as Record<string, unknown> | undefined)?.['keys'] as Record<string, unknown> | undefined;
    if (keys) delete keys['settle'];
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
