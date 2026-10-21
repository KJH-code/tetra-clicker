import type { Piece } from '../sim/pieces';
import { GOLD, PIECE_COLORS, THEME, VIEW, shade } from './theme';

// Each building's shop icon: a 5×5 picture of what its bot does, in piece
// letters ('G' garbage grey, '*' gold, '.' empty). Pictures, not data: the
// shop draws them, nothing reads them.
const ICONS: Record<string, string[]> = {
  single: ['.....', '.....', '.....', '..T..', 'LL.LL'],
  double: ['.....', '.....', '..O..', 'JJ.JJ', 'JJ.JJ'],
  triple: ['.....', '..I..', 'LL.LL', 'LL.LL', 'LL.LL'],
  tetris: ['..I..', 'SS.SS', 'SS.SS', 'SS.SS', 'SS.SS'],
  tspin: ['.....', '.TTT.', 'JJTJJ', 'J...J', 'JJ.JJ'],
  allspin: ['.....', '..SS.', 'LSSLL', 'L...L', 'LLLLL'],
  combo: ['GGG.G', 'GGG.G', 'G.GGG', 'GG.GG', 'GGG.G'],
  b2b: ['..I..', 'TT.TT', 'TT.TT', '..I..', 'TT.TT'],
  pc: ['.....', '.....', '*****', '*...*', '*****'],
  downstack: ['.....', '..Z..', 'GG.GG', 'G.GGG', 'GGG.G'],
  fourwide: ['G...G', 'G...G', 'GOO.G', 'GOOIG', 'GJJJG'],
  opener: ['.....', 'LL..Z', 'LIIZZ', 'LIIZ.', 'TTTOO'],
  helper: ['.....', '..*..', '.***.', '..*..', 'GG.GG'],
  invader: ['Z...Z', '.ZZZ.', 'Z.Z.Z', 'ZZZZZ', 'Z.Z.Z'],
  rival: ['II.LL', 'II.LL', '.....', 'TT.SS', 'TT.SS'],
  master: ['*.*.*', '*****', 'IOTSZ', 'JLTIO', 'SZJLT'],
  grandmaster: ['IIIII', 'I...I', '*.*.*', 'I...I', 'IIIII'],
};

function colorOf(ch: string): string | null {
  if (ch === '.') return null;
  if (ch === 'G') return THEME.dim;
  if (ch === '*') return GOLD;
  return PIECE_COLORS[ch as Piece] ?? null;
}

// One block. Pixel style: a flat face with a one-pixel-step bevel; classic:
// the face and a lit top strip.
export function paintBlock(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, alpha = 1): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (VIEW.pixel) {
    const px = Math.round(x);
    const py = Math.round(y);
    const s = Math.round(size);
    const b = Math.max(1, Math.round(s / 7));
    ctx.fillStyle = shade(color, -0.45);
    ctx.fillRect(px, py, s, s);
    ctx.fillStyle = shade(color, 0.45);
    ctx.fillRect(px, py, s - b, s - b);
    ctx.fillStyle = color;
    ctx.fillRect(px + b, py + b, s - 2 * b, s - 2 * b);
    // A single bright pixel of shine in the top-left corner.
    if (s >= 10) {
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = alpha * 0.8;
      ctx.fillRect(px + b, py + b, b, b);
    }
  } else {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = alpha * 0.25;
    ctx.fillRect(x, y, size, Math.max(1, size * 0.18));
  }
  ctx.restore();
}

export const ICON_PX = 30;

export function drawBuildingIcon(canvas: HTMLCanvasElement, id: string): void {
  const art = ICONS[id] ?? ICONS['single']!;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = ICON_PX * dpr;
  canvas.height = ICON_PX * dpr;
  canvas.style.width = `${ICON_PX}px`;
  canvas.style.height = `${ICON_PX}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, ICON_PX, ICON_PX);
  const c = ICON_PX / 5;
  art.forEach((row, y) => [...row].forEach((ch, x) => {
    const color = colorOf(ch);
    if (color) paintBlock(ctx, x * c, y * c, c, color);
  }));
}
