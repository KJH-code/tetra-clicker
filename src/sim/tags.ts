// Tags describe where and how an amount of Lines was earned. Effects filter
// on them, so a new building or technique only needs a new tag string.
export type Tag = string;

export const tag = {
  board: (kind: 'manual' | 'auto'): Tag => `board:${kind}`,
  building: (id: string): Tag => `building:${id}`,
  clear: (lines: number): Tag => `clear:${CLEAR_NAMES[lines] ?? String(lines)}`,
  piece: (p: string): Tag => `piece:${p}`,
  tech: (t: 'spin' | 'mini' | 'b2b' | 'combo' | 'pc' | 'none'): Tag => `tech:${t}`,
};

const CLEAR_NAMES: Record<number, string> = { 1: 'single', 2: 'double', 3: 'triple', 4: 'tetris' };

export const hasAll = (tags: readonly Tag[], filter: readonly Tag[]): boolean =>
  filter.every((f) => tags.includes(f));
