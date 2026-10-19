import { PIECES, type Piece } from '../sim/pieces';
import { PIECE_COLORS, VIEW } from './theme';

interface Drifter { piece: Piece; x: number; y: number; vy: number; rot: number; spin: number; size: number; alpha: number }

const MAX_PIECES = 40;
const FRAME_MS = 1000 / 30;

// Faint tetrominoes drifting down behind the panes. The richer the run
// (log10 of PER SECOND), the more of them and the faster they fall, so the
// economy shows in the room as well as in the numbers. Thirty frames a
// second is plenty for something this slow; less motion stops it.
export class Backdrop {
  private ctx: CanvasRenderingContext2D;
  private drifters: Drifter[] = [];
  private acc = 0;
  private wealth = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // 0 with no income, about 1 per tenfold of PER SECOND.
  setIncome(perSecond: number): void {
    this.wealth = perSecond > 1 ? Math.log10(perSecond) : 0;
  }

  update(dt: number): void {
    this.acc += dt;
    if (this.acc < FRAME_MS) return;
    const step = this.acc / 1000;
    this.acc = 0;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const target = VIEW.reduceMotion ? 0 : Math.min(MAX_PIECES, 6 + Math.round(this.wealth * 3));
    while (this.drifters.length < target) this.drifters.push(this.spawn(w, h, this.drifters.length < target / 2));
    const speed = 1 + this.wealth * 0.15;
    for (const d of this.drifters) {
      d.y += d.vy * speed * step;
      d.rot += d.spin * step;
    }
    this.drifters = this.drifters.filter((d) => d.y < h + d.size * 4).slice(0, target);
    this.draw(w, h);
  }

  private spawn(w: number, h: number, anywhere: boolean): Drifter {
    const piece = PIECES[Math.floor(Math.random() * PIECES.length)]!;
    const size = 10 + Math.random() * 22;
    return {
      piece, x: Math.random() * w, y: anywhere ? Math.random() * h : -size * 4,
      vy: 8 + Math.random() * 22, rot: Math.random() * Math.PI * 2, spin: (Math.random() * 2 - 1) * 0.3,
      size, alpha: 0.08 + Math.random() * 0.1,
    };
  }

  private draw(w: number, h: number): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    for (const d of this.drifters) {
      ctx.save();
      ctx.globalAlpha = d.alpha;
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      ctx.fillStyle = PIECE_COLORS[d.piece];
      for (const [cx, cy] of SHAPES[d.piece]) ctx.fillRect((cx - 1.5) * d.size, (cy - 1) * d.size, d.size - 2, d.size - 2);
      ctx.restore();
    }
  }
}

// Spawn-orientation cells, enough to draw a silhouette.
const SHAPES: Record<Piece, [number, number][]> = {
  I: [[0, 1], [1, 1], [2, 1], [3, 1]],
  O: [[1, 0], [2, 0], [1, 1], [2, 1]],
  T: [[1, 0], [0, 1], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]],
};
