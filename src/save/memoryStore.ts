import type { SaveStore } from './SaveStore';
import type { SaveData } from './schema';

// For tests and for browsers with storage disabled.
export class MemoryStore implements SaveStore {
  private data: string | null = null;
  load(): SaveData | null {
    return this.data ? (JSON.parse(this.data) as SaveData) : null;
  }
  save(data: SaveData): void {
    this.data = JSON.stringify(data);
  }
  clear(): void {
    this.data = null;
  }
}
