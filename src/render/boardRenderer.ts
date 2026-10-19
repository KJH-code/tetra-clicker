import { WIDTH, HEIGHT, TOP_VISIBLE_ROW, occupiedCells, type Grid, type Placement } from '../sim/board';
import { cellsOf, pieceFromId, type Piece } from '../sim/pieces';
import { GOLD, PIECE_COLORS, THEME, VIEW, WRATH_FILL, WRATH_RIM, font } from './theme';
import type { Fx } from './fx';

// Two buffer rows are drawn above the visible twenty, dimmed, so a piece
// kicked above the ceiling is still seen rather than vanishing.
export const BUFFER_ROWS_SHOWN = 2;
const FIRST_DRAWN_ROW = TOP_VISIBLE_ROW - BUFFER_ROWS_SHOWN;

export interface BoardLayout {
  cell: number;
  leftCells: number; // hold column width (0 = no hold shown)
  rightCells: number; // next column width (0 = no queue shown)
}

export interface BoardView {
  grid: Grid;
  active: Placement | null;
  ghostY: number | null;
  holds: Piece[];
  holdUsed: boolean;
  next: Piece[];
  // Golden piece marks: in play, per hold slot, and a NEXT index (-1 = none).
  golden?: { active: boolean; holds: boolean[]; next: number; wrath?: boolean };
}

export class BoardRenderer {
  readonly ctx: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  accent: string | undefined;
  wellBackground: string | undefined;
  wellGrid: string | undefined;
  private readonly originX: number;

  constructor(readonly canvas: HTMLCanvasElement, readonly layout: BoardLayout) {
    const rows = HEIGHT - FIRST_DRAWN_ROW;
    this.originX = layout.leftCells * layout.cell;
    this.width = (WIDTH + layout.leftCells + layout.rightCells) * layout.cell;
    this.height = rows * layout.cell;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = this.width * dpr;
    canvas.height = this.height * dpr;
    canvas.style.width = `${this.width}px`;
    canvas.style.height = `${this.height}px`;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.scale(dpr, dpr);
  }

  cellX(x: number): number { return this.originX + x * this.layout.cell; }
  cellY(y: number): number { return (y - FIRST_DRAWN_ROW) * this.layout.cell; }

  render(view: BoardView, fx: Fx | null, overlay?: (ctx: CanvasRenderingContext2D) => void): void {
    const { ctx, layout } = this;
    const c = layout.cell;
    ctx.save();
    ctx.clearRect(0, 0, this.width, this.height);
    if (fx) {
      const s = fx.shakeOffset();
      ctx.translate(s.x, s.y);
    }
    // Playfield background and grid.
    ctx.fillStyle = this.wellBackground ?? THEME.background;
    ctx.fillRect(this.originX, 0, WIDTH * c, this.height);
    ctx.strokeStyle = this.wellGrid ?? THEME.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= WIDTH; x++) {
      ctx.moveTo(this.cellX(x) + 0.5, this.cellY(TOP_VISIBLE_ROW));
      ctx.lineTo(this.cellX(x) + 0.5, this.height);
    }
    for (let y = TOP_VISIBLE_ROW; y <= HEIGHT; y++) {
      ctx.moveTo(this.originX, this.cellY(y) + 0.5);
      ctx.lineTo(this.originX + WIDTH * c, this.cellY(y) + 0.5);
    }
    ctx.stroke();
    // The well's walls and floor, solid; the ceiling only a faint line,
    // since pieces start above it. `accent` recolours them (level theme,
    // building stars).
    ctx.strokeStyle = this.accent ?? THEME.frame;
    ctx.beginPath();
    ctx.moveTo(this.originX, this.cellY(TOP_VISIBLE_ROW) + 0.5);
    ctx.lineTo(this.originX + WIDTH * c, this.cellY(TOP_VISIBLE_ROW) + 0.5);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.originX + 1, this.cellY(TOP_VISIBLE_ROW));
    ctx.lineTo(this.originX + 1, this.height - 1);
    ctx.lineTo(this.originX + WIDTH * c - 1, this.height - 1);
    ctx.lineTo(this.originX + WIDTH * c - 1, this.cellY(TOP_VISIBLE_ROW));
    ctx.stroke();

    // Locked cells.
    for (let y = FIRST_DRAWN_ROW; y < HEIGHT; y++) {
      const dim = y < TOP_VISIBLE_ROW;
      for (let x = 0; x < WIDTH; x++) {
        const id = view.grid[y * WIDTH + x]!;
        if (id === 0) continue;
        const piece = pieceFromId(id);
        this.drawCell(x, y, piece ? PIECE_COLORS[piece] : THEME.dim, dim ? 0.35 : 1, false, piece);
      }
    }
    // Ghost, then the active piece on top of it.
    if (view.active && view.ghostY !== null && view.ghostY !== view.active.y) {
      for (const [x, y] of occupiedCells({ ...view.active, y: view.ghostY })) this.drawGhost(x, y, PIECE_COLORS[view.active.piece]);
    }
    if (view.active) {
      const gold = view.golden?.active ?? false;
      const wrath = gold && !!view.golden?.wrath;
      for (const [x, y] of occupiedCells(view.active)) {
        if (y < FIRST_DRAWN_ROW) continue;
        this.drawCell(x, y, wrath ? WRATH_FILL : gold ? GOLD : PIECE_COLORS[view.active.piece], y < TOP_VISIBLE_ROW ? 0.6 : 1, true, view.active.piece);
        if (gold) this.drawGoldEdge(this.cellX(x) + 1, this.cellY(y) + 1, layout.cell - 2, wrath);
      }
    }
    if (fx) fx.drawRowFlashes(ctx, this);
    if (overlay) overlay(ctx);

    // Side panels.
    if (layout.leftCells > 0) {
      this.drawBox('HOLD', 0, layout.leftCells, Math.max(1, view.holds.length));
      view.holds.forEach((p, i) => this.drawPreview(p, 0, 1 + i * 3, layout.leftCells, view.holdUsed ? 0.35 : 1, view.golden?.holds[i] ?? false, !!view.golden?.wrath));
    }
    if (layout.rightCells > 0) {
      this.drawBox('NEXT', this.originX + WIDTH * c, layout.rightCells, Math.max(1, view.next.length));
      view.next.forEach((p, i) => this.drawPreview(p, this.originX + WIDTH * c, 1 + i * 3, layout.rightCells, 1, view.golden?.next === i, !!view.golden?.wrath));
    }
    if (fx) fx.drawFloaters(ctx);
    ctx.restore();
  }

  drawCell(x: number, y: number, color: string, alpha = 1, glow = false, piece: Piece | null = null): void {
    const { ctx, layout } = this;
    const c = layout.cell;
    const px = this.cellX(x);
    const py = this.cellY(y);
    this.paintCell(px, py, c, color, alpha, glow, piece);
  }

  // One block at pixel (px, py), size c: fill, lit top edge, and the
  // display options (a pattern per piece, a dark outline in high contrast).
  private paintCell(px: number, py: number, c: number, color: string, alpha: number, glow: boolean, piece: Piece | null): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = c * 0.6;
    }
    ctx.fillStyle = color;
    ctx.fillRect(px + 1, py + 1, c - 2, c - 2);
    ctx.shadowBlur = 0;
    // Inner highlight gives the block a lit edge without a texture.
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = alpha * 0.25;
    ctx.fillRect(px + 1, py + 1, c - 2, Math.max(1, c * 0.18));
    if (piece && VIEW.patterns) drawPattern(ctx, piece, px + 1, py + 1, c - 2, alpha);
    if (VIEW.highContrast) {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = Math.max(1, c * 0.08);
      ctx.strokeRect(px + 1.5, py + 1.5, c - 3, c - 3);
    }
    ctx.restore();
  }

  drawGhost(x: number, y: number, color: string): void {
    const { ctx, layout } = this;
    const c = layout.cell;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(this.cellX(x) + 2.5, this.cellY(y) + 2.5, c - 5, c - 5);
    ctx.restore();
  }

  // A side box: a title bar, then a panel behind `slots` previews (three
  // rows each, from row one).
  private drawBox(text: string, px: number, cells: number, slots: number): void {
    const { ctx, layout } = this;
    const c = layout.cell;
    const x = px + 3;
    const w = cells * c - 6;
    const head = c * 0.9;
    ctx.save();
    ctx.fillStyle = THEME.box;
    ctx.fillRect(x, 0, w, (1 + slots * 3) * c + c * 0.2);
    ctx.fillStyle = THEME.boxHead;
    ctx.fillRect(x, 0, w, head);
    // Too small to read on a shrunken bot board: the bar alone says enough.
    if (c < 14) { ctx.restore(); return; }
    ctx.fillStyle = THEME.text;
    ctx.font = font(800, c * 0.46);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(text, x + c * 0.3, head / 2 + 1);
    ctx.restore();
  }

  // A preview piece centred in a side column; drawn at 80% cell size so the
  // five-deep queue fits beside the board.
  // White rim on golden cells: gold alone sits too close to the yellow O.
  // A wrath piece's rim is red and throbs.
  private drawGoldEdge(px: number, py: number, size: number, wrath = false): void {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = wrath ? WRATH_RIM : '#ffffff';
    ctx.globalAlpha = wrath && !VIEW.reduceMotion ? 0.55 + 0.45 * Math.sin(performance.now() / 160) ** 2 : 0.9;
    ctx.lineWidth = wrath ? 2.5 : 1.5;
    if (wrath) {
      ctx.shadowColor = WRATH_RIM;
      ctx.shadowBlur = size * 0.5;
    }
    ctx.strokeRect(px + 1.5, py + 1.5, size - 3, size - 3);
    ctx.restore();
  }

  private drawPreview(piece: Piece, px: number, row: number, span: number, alpha: number, gold = false, wrath = false): void {
    const { ctx, layout } = this;
    const c = layout.cell * 0.8;
    const cells = cellsOf(piece, 0);
    const minX = Math.min(...cells.map(([x]) => x));
    const maxX = Math.max(...cells.map(([x]) => x));
    const minY = Math.min(...cells.map(([, y]) => y));
    const w = (maxX - minX + 1) * c;
    const ox = px + (span * layout.cell - w) / 2;
    const oy = row * layout.cell + 8;
    ctx.save();
    ctx.globalAlpha = alpha;
    const color = gold ? (wrath ? WRATH_FILL : GOLD) : PIECE_COLORS[piece];
    ctx.fillStyle = color;
    ctx.shadowColor = gold && wrath ? WRATH_RIM : color;
    ctx.shadowBlur = c * (gold ? 1.2 : 0.5);
    for (const [x, y] of cells) ctx.fillRect(ox + (x - minX) * c + 1, oy + (y - minY) * c + 1, c - 2, c - 2);
    ctx.restore();
    if (VIEW.patterns) for (const [x, y] of cells) drawPattern(ctx, piece, ox + (x - minX) * c + 1, oy + (y - minY) * c + 1, c - 2, alpha);
    if (gold) for (const [x, y] of cells) this.drawGoldEdge(ox + (x - minX) * c + 1, oy + (y - minY) * c + 1, c - 2, wrath);
  }
}

// A mark per piece so pieces differ by more than colour: a bar for I, a dot
// for O, a chevron for T, a slash each way for S and Z, an upright for J,
// a corner for L. Dark ink over the block, thin enough to keep its colour.
function drawPattern(ctx: CanvasRenderingContext2D, piece: Piece, x: number, y: number, s: number, alpha: number): void {
  const m = s * 0.25;
  ctx.save();
  ctx.globalAlpha = alpha * 0.55;
  ctx.strokeStyle = '#000000';
  ctx.fillStyle = '#000000';
  ctx.lineWidth = Math.max(1, s * 0.13);
  ctx.lineCap = 'round';
  ctx.beginPath();
  switch (piece) {
    case 'I': ctx.moveTo(x + m, y + s / 2); ctx.lineTo(x + s - m, y + s / 2); break;
    case 'O': ctx.arc(x + s / 2, y + s / 2, s * 0.14, 0, Math.PI * 2); ctx.fill(); break;
    case 'T': ctx.moveTo(x + m, y + s - m); ctx.lineTo(x + s / 2, y + m); ctx.lineTo(x + s - m, y + s - m); break;
    case 'S': ctx.moveTo(x + m, y + s - m); ctx.lineTo(x + s - m, y + m); break;
    case 'Z': ctx.moveTo(x + m, y + m); ctx.lineTo(x + s - m, y + s - m); break;
    case 'J': ctx.moveTo(x + s / 2, y + m); ctx.lineTo(x + s / 2, y + s - m); break;
    case 'L': ctx.moveTo(x + m, y + m); ctx.lineTo(x + m, y + s - m); ctx.lineTo(x + s - m, y + s - m); break;
  }
  ctx.stroke();
  ctx.restore();
}
