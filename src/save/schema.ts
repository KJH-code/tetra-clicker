import type { WorldSnapshot } from '../sim/world';
import { BUILDINGS } from '../data/buildings';
import { UPGRADES } from '../data/upgrades';
import type { HandlingSettings } from '../data/handling';

export const SAVE_VERSION = 11;

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
  // 6 → 7: hardcore arrives. Every run so far was normal, with no hardcore
  // record; the new life-length stats default to zero when the world loads.
  (raw) => {
    const world = raw['world'] as Record<string, unknown>;
    const meta = world['meta'] as Record<string, unknown> | undefined;
    if (meta) {
      meta['hardcore'] ??= false;
      meta['nextHardcore'] ??= false;
      meta['hardcoreBest'] ??= { level: 0, rows: 0 };
    }
    return raw;
  },
  // 7 → 8: wrath pieces and achievements arrive. Nothing is met yet; the
  // sweep after loading awards whatever the save already qualifies for.
  // Lines earned were never counted, so that total starts from here.
  (raw) => {
    const world = raw['world'] as Record<string, unknown>;
    const meta = world['meta'] as Record<string, unknown> | undefined;
    if (meta) {
      meta['achievements'] ??= [];
      meta['hardcoreAscensions'] ??= 0;
      meta['emptyAscensions'] ??= 0;
    }
    const golden = (world['manual'] as Record<string, unknown> | undefined)?.['golden'] as Record<string, unknown> | undefined;
    if (golden) golden['wrath'] ??= false;
    return raw;
  },
  // 8 → 9: buildings bought ever are tracked, and Lines earned before
  // version 8 are estimated. A building counts as bought if its FIRST
  // achievement is met or it is owned now. The estimate is a floor: this
  // run's balance, plus what its buildings and upgrades cost (at list price,
  // and nothing discounts prices yet), plus Lines made by hand, plus for
  // finished runs the larger of their hand Lines and banked risk over the
  // level-4 average the prices were fitted to.
  (raw) => {
    const world = raw['world'] as Record<string, unknown>;
    const meta = world['meta'] as Record<string, unknown> | undefined;
    const economy = world['economy'] as Record<string, unknown>;
    const owned = (economy['owned'] ?? {}) as Record<string, number>;
    if (!meta) return raw;
    const achievements = (meta['achievements'] ?? []) as string[];
    const seen = new Set((meta['buildingsSeen'] ?? []) as string[]);
    for (const b of BUILDINGS) if (achievements.includes(`own_${b.id}_1`) || (owned[b.id] ?? 0) > 0) seen.add(b.id);
    meta['buildingsSeen'] = [...seen].sort();
    let spent = 0;
    for (const b of BUILDINGS) for (let k = 0; k < (owned[b.id] ?? 0); k++) spent += Math.ceil(b.basePrice * b.priceGrowth ** k - 1e-9);
    for (const id of (economy['upgrades'] ?? []) as string[]) spent += UPGRADES.find((u) => u.id === id)?.price ?? 0;
    const stats = (economy['stats'] ?? {}) as Record<string, number>;
    const lifetime = (meta['lifetime'] ?? {}) as Record<string, number>;
    const past = Math.max(lifetime['manualLines'] ?? 0, (Number(meta['riskBanked']) || 0) / 4);
    const estimate = Number(economy['balance'] ?? 0) + spent + (stats['manualLines'] ?? 0) + past;
    const counted = (lifetime['linesEarned'] ?? 0) + (stats['linesEarned'] ?? 0);
    if (estimate > counted) lifetime['linesEarned'] = (lifetime['linesEarned'] ?? 0) + Math.floor(estimate - counted);
    meta['lifetime'] = lifetime;
    return raw;
  },
  // 9 → 10: the RIVAL building's streak (none yet) and the accessibility
  // and language settings, which take their defaults when settings merge.
  (raw) => {
    const world = raw['world'] as Record<string, unknown>;
    const meta = world['meta'] as Record<string, unknown> | undefined;
    if (meta) { meta['rivalStreak'] ??= 0; meta['rivalBest'] ??= 0; }
    return raw;
  },
  // 10 → 11: HOLD ×2 is gone, bought or not; a run that bought it gets its
  // price back, and the second hold slot is emptied. Purchase garbage
  // starts with an empty queue (the world defaults it).
  (raw) => {
    const world = raw['world'] as Record<string, unknown>;
    const eco = world['economy'] as { balance: string; upgrades: string[] } | undefined;
    if (eco?.upgrades.includes('hold2')) {
      eco.upgrades = eco.upgrades.filter((u) => u !== 'hold2');
      eco.balance = String(Number(eco.balance) + HOLD2_REFUND);
    }
    const manual = world['manual'] as { holds?: unknown[]; golden?: { holds: unknown[] } } | undefined;
    if (manual?.holds && manual.holds.length > 1) manual.holds = manual.holds.slice(0, 1);
    if (manual?.golden && manual.golden.holds.length > 1) manual.golden.holds = manual.golden.holds.slice(0, 1);
    return raw;
  },
];

// What HOLD ×2 cost when it was sold.
const HOLD2_REFUND = 20_000;

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
