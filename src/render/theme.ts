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
  // Hit-stop, shards, technique popups and the garbage jolt.
  hitEffects: true,
  // 0..1: how strongly the drifting pieces behind the panes show.
  backdrop: 0.5,
  highContrast: false,
  // Multiplies text drawn on the boards.
  textScale: 1,
  // Arcade pixel look (settings STYLE): bevelled blocks, hard edges, a bitmap font.
  pixel: true,
};

// Golden pieces. Brighter and warmer than the O so the two never read alike.
export const GOLD = '#ffb800';
// Wrath pieces: dark blood red with a bright rim, so they read as a threat
// next to the golden glow.
export const WRATH_FILL = '#5c0000';
export const WRATH_RIM = '#ff2a2a';

// Mutable: high contrast brightens the grid.
export const THEME = {
  background: '#090b10',
  grid: '#161a25',
  frame: '#3a4157',
  // The HOLD / NEXT boxes and their title bars.
  box: '#12151d',
  boxHead: '#242a3a',
  ghost: '#ffffff',
  text: '#f2f4fa',
  dim: '#8d93ab',
  flash: '#ffffff',
};

// The page's fonts, for text drawn on the boards (loaded before the first frame).
const SMOOTH_FONT = "'Exo 2', 'Pretendard Variable', Pretendard, system-ui, sans-serif";
const PIXEL_FONT = "'Galmuri11', 'Exo 2', 'Pretendard Variable', monospace";
export const fontFamily = (): string => (VIEW.pixel ? PIXEL_FONT : SMOOTH_FONT);
export const font = (weight: number, px: number): string => `${weight} ${Math.round(px)}px ${fontFamily()}`;

// A piece colour lit (k > 0, toward white) or shaded (k < 0, toward black),
// for the pixel blocks' bevels.
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const ch = (v: number): number => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

// Each building's colour, down the ladder through the piece colours (read
// live, so the colour-blind palette carries over).
const BUILDING_HUES: Piece[] = ['S', 'I', 'O', 'L', 'T', 'J', 'Z'];
export const buildingColor = (index: number): string => PIECE_COLORS[BUILDING_HUES[index % BUILDING_HUES.length]!];

// The manual well changes colour every ten levels, so climbing shows on the
// board itself: cyan, violet, orange, red, then white once pieces land at
// once (20G), whatever the level.
const LEVEL_BANDS = [
  { frame: '#00c8d8', grid: '#10202a', background: '#080d12' },
  { frame: '#a050ff', grid: '#1a1530', background: '#0b0912' },
  { frame: '#ff8c1a', grid: '#2a1c10', background: '#110c08' },
  { frame: '#ff3b3b', grid: '#2c1216', background: '#120808' },
];
const BAND_20G = { frame: '#f2f4fa', grid: '#24262e', background: '#0d0e12' };

export function levelTheme(level: number, twentyG: boolean): { frame: string; grid: string; background: string } {
  if (twentyG) return BAND_20G;
  return LEVEL_BANDS[Math.min(LEVEL_BANDS.length - 1, Math.floor(Math.max(0, level - 1) / 10))]!;
}
