import type { Piece } from '../sim/pieces';

// Neon on near-black. Each piece keeps its guideline hue so hands trained on
// other games still read the queue at a glance.
export const PIECE_COLORS: Record<Piece, string> = {
  I: '#00f0ff',
  O: '#ffe600',
  T: '#ff2ed2',
  S: '#39ff14',
  Z: '#ff3b3b',
  J: '#3b6bff',
  L: '#ff8c1a',
};

// Golden pieces. Brighter and warmer than the O so the two never read alike.
export const GOLD = '#ffb800';
// Wrath pieces: dark blood red with a bright rim, so they read as a threat
// next to the golden glow.
export const WRATH_FILL = '#5c0000';
export const WRATH_RIM = '#ff2a2a';

export const THEME = {
  background: '#06060d',
  grid: '#15152a',
  frame: '#2a2a4a',
  ghost: '#ffffff',
  text: '#e8e8ff',
  dim: '#7a7aa0',
  flash: '#ffffff',
};
