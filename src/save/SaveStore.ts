import type { SaveData } from './schema';

// Where saves live. localStorage today; a server implementation later only
// has to satisfy this interface.
export interface SaveStore {
  load(): SaveData | null;
  save(data: SaveData): void;
  clear(): void;
}
