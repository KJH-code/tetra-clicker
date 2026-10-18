import type { Piece } from '../sim/pieces';

// Neon on near-black. Each piece keeps its guideline hue so hands trained on
// other games still read the queue at a glance.
const STANDARD: Record<Piece, string> = {
  I: '#00f0ff',
  O: '#ffe600',
  T: '#ff2ed2',
  S: '#39ff14',
  Z: '#ff3b3b',
  J: '#3b6bff',
  L: '#ff8c1a',
};

// Colour-blind safe: the Okabe–Ito set, one hue per piece, kept at varied
// lightness on purpose (lightness is what a colour-blind eye reads best).
// Seven pieces can all touch, and no seven hues stay apart for every pair
// under every colour-vision type (the dataviz validator puts the closest,
// S against T, at ΔE 7.6 for deutans), so this palette turns the per-piece
// patterns on as the second cue.
const CVD: Record<Piece, string> = {
  I: '#56B4E9',
  O: '#F0E442',
  T: '#CC79A7',
  S: '#009E73',
  Z: '#D55E00',
  J: '#0072B2',
  L: '#E69F00',
};

export type PaletteName = 'standard' | 'cvd';
export const PALETTES: Record<PaletteName, Record<Piece, string>> = { standard: STANDARD, cvd: CVD };

// One object everyone reads, so a palette switch reaches every board at once.
export const PIECE_COLORS: Record<Piece, string> = { ...STANDARD };

export function setPalette(name: PaletteName): void {
  Object.assign(PIECE_COLORS, PALETTES[name]);
}

// Display options the renderers read (settings set them).
export const VIEW = {
  patterns: false,
  reduceMotion: false,
  highContrast: false,
  // Multiplies text drawn on the boards.
  textScale: 1,
};

// Golden pieces. Brighter and warmer than the O so the two never read alike.
export const GOLD = '#ffb800';
// Wrath pieces: dark blood red with a bright rim, so they read as a threat
// next to the golden glow.
export const WRATH_FILL = '#5c0000';
export const WRATH_RIM = '#ff2a2a';

// Mutable: high contrast brightens the grid.
export const THEME = {
  background: '#06060d',
  grid: '#15152a',
  frame: '#2a2a4a',
  ghost: '#ffffff',
  text: '#e8e8ff',
  dim: '#7a7aa0',
  flash: '#ffffff',
};
