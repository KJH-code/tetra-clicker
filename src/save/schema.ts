import type { WorldSnapshot } from '../sim/world';
import type { HandlingSettings } from '../data/handling';

export const SAVE_VERSION = 1;

export interface SaveData {
  version: number;
  savedAt: number;
  world: WorldSnapshot;
  settings: HandlingSettings;
}

// Each entry upgrades a save from version n to n+1. A new schema version
// means appending a function here, never editing older ones.
type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;
const MIGRATIONS: Migration[] = [];

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
