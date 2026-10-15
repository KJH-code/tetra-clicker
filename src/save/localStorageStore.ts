import type { SaveStore } from './SaveStore';
import { migrate, type SaveData } from './schema';

export const SAVE_KEY = 'tetra-clicker/save';

export class LocalStorageStore implements SaveStore {
  constructor(private readonly key: string = SAVE_KEY) {}

  load(): SaveData | null {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return null;
      return migrate(JSON.parse(raw));
    } catch {
      // A corrupt or blocked store is treated as no save rather than a crash.
      return null;
    }
  }

  save(data: SaveData): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(data));
    } catch {
      // Quota or private mode: the game keeps running without persistence.
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(this.key);
    } catch {
      // Nothing to do.
    }
  }
}
