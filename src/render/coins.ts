import { VIEW } from './theme';

interface Coin { x0: number; y0: number; x1: number; y1: number; cx: number; cy: number; t: number; dur: number; color: string; size: number }

const MAX_PER_SECOND = 20;

// Sparks that fly from a bot board that just cleared to the balance, along
// a curve, so income reads as something arriving rather than a number
// ticking. At most twenty a second; less motion turns them off.
export class Coins {
  private ctx: CanvasRenderingContext2D;
  private coins: Coin[] = [];
  private budget = MAX_PER_SECOND;

  constructor(private canvas: HTMLCanvasElement, private onArrive: () => void) {
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

  spawn(from: DOMRect, to: DOMRect, color: string): void {
    if (VIEW.reduceMotion || !VIEW.hitEffects || this.budget < 1) return;
    if (from.width === 0 || to.width === 0) return;
    this.budget -= 1;
    const x0 = from.left + from.width / 2;
    const y0 = from.top + from.height / 2;
    const x1 = to.left + to.width / 2;
    const y1 = to.top + to.height / 2;
    // The bend: up and off to one side, so sparks from one board fan out.
    const cx = (x0 + x1) / 2 + (Math.random() * 2 - 1) * 120;
    const cy = Math.min(y0, y1) - 60 - Math.random() * 80;
    this.coins.push({ x0, y0, x1, y1, cx, cy, t: 0, dur: 600 + Math.random() * 300, color, size: 3 + Math.random() * 2 });
  }

  update(dt: number): void {
    this.budget = Math.min(MAX_PER_SECOND, this.budget + (dt / 1000) * MAX_PER_SECOND);
    const ctx = this.ctx;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    let arrived = false;
    for (const c of this.coins) {
      c.t += dt;
      if (c.t >= c.dur) { arrived = true; continue; }
      const k = c.t / c.dur;
      // Ease in: slow off the board, fast into the balance.
      const e = k * k;
      const x = (1 - e) * (1 - e) * c.x0 + 2 * (1 - e) * e * c.cx + e * e * c.x1;
      const y = (1 - e) * (1 - e) * c.y0 + 2 * (1 - e) * e * c.cy + e * e * c.y1;
      ctx.save();
      ctx.globalAlpha = k < 0.85 ? 1 : (1 - k) / 0.15;
      ctx.fillStyle = c.color;
      ctx.shadowColor = c.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(x, y, c.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    this.coins = this.coins.filter((c) => c.t < c.dur);
    if (arrived) this.onArrive();
  }
}

// 1K, 1M, 1B, …: the number of thousands-steps a balance has passed.
export function unitStep(balance: number): number {
  return balance >= 1_000 ? Math.floor(Math.log10(balance) / 3 + 1e-9) : 0;
}
