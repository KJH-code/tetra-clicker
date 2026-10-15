import type { SimResult } from '../sim/simulate';
import type { LadderEntry } from '../data/ladder';
import { formatDuration, formatLines } from './format';

// Income over time on log-log axes, one line. Buildings are identified by
// their labels, not by colour, so every marker shares the accent and the
// target curve is a dashed neutral.
const INK = '#e8e8ff';
const DIM = '#7a7aa0';
const GRID = '#15152a';
const ACCENT = '#00f0ff';
const TARGET = '#5a5a80';

export interface ChartState {
  result: SimResult;
  ladder: LadderEntry[];
  horizonSeconds: number;
}

export class IncomeChart {
  private ctx: CanvasRenderingContext2D;
  private state: ChartState | null = null;
  private w = 0;
  private h = 0;
  private pad = { l: 56, r: 20, t: 16, b: 32 };
  private tMin = 60;

  constructor(private canvas: HTMLCanvasElement, private tooltip: HTMLElement) {
    this.ctx = canvas.getContext('2d')!;
    canvas.addEventListener('mousemove', (e) => this.hover(e));
    canvas.addEventListener('mouseleave', () => { this.tooltip.hidden = true; this.draw(); });
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement!);
    this.resize();
  }

  setState(s: ChartState): void {
    this.state = s;
    this.draw();
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const parent = this.canvas.parentElement!;
    this.w = Math.max(320, parent.clientWidth - 32);
    this.h = Math.max(240, Math.min(420, Math.round(this.w * 0.5)));
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  private x(t: number): number {
    const s = this.state!;
    const k = (Math.log10(Math.max(t, this.tMin)) - Math.log10(this.tMin)) / (Math.log10(s.horizonSeconds) - Math.log10(this.tMin));
    return this.pad.l + k * (this.w - this.pad.l - this.pad.r);
  }

  private yRange(): [number, number] {
    const s = this.state!;
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of s.result.series) {
      if (p.income > 0) { lo = Math.min(lo, p.income); hi = Math.max(hi, p.income); }
    }
    if (!Number.isFinite(lo)) { lo = 0.1; hi = 1; }
    return [Math.pow(10, Math.floor(Math.log10(lo))), Math.pow(10, Math.ceil(Math.log10(hi * 1.01)))];
  }

  private y(v: number, range: [number, number]): number {
    const k = (Math.log10(Math.max(v, range[0])) - Math.log10(range[0])) / (Math.log10(range[1]) - Math.log10(range[0]));
    return this.h - this.pad.b - k * (this.h - this.pad.t - this.pad.b);
  }

  // Income in force at time t: the last sample at or before it.
  private incomeAt(t: number): number {
    const series = this.state!.result.series;
    let prev = series[0]!;
    for (const p of series) {
      if (p.t > t) return prev.income;
      prev = p;
    }
    return prev.income;
  }

  draw(hoverT?: number): void {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.w, this.h);
    if (!this.state) return;
    const s = this.state;
    const range = this.yRange();

    // Grid: decades on both axes, recessive.
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.fillStyle = DIM;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let e = Math.log10(range[0]); e <= Math.log10(range[1]); e++) {
      const v = Math.pow(10, e);
      const y = this.y(v, range);
      ctx.beginPath(); ctx.moveTo(this.pad.l, y + 0.5); ctx.lineTo(this.w - this.pad.r, y + 0.5); ctx.stroke();
      ctx.fillText(`${formatLines(v)}/s`, this.pad.l - 6, y);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const ticks = [60, 600, 3600, 6 * 3600, 86_400, 3 * 86_400, 7 * 86_400, 30 * 86_400, 90 * 86_400, 365 * 86_400];
    for (const t of ticks) {
      if (t < this.tMin || t > s.horizonSeconds) continue;
      const x = this.x(t);
      ctx.beginPath(); ctx.moveTo(x + 0.5, this.pad.t); ctx.lineTo(x + 0.5, this.h - this.pad.b); ctx.stroke();
      ctx.fillText(formatDuration(t), x, this.h - this.pad.b + 6);
    }

    // Target: the income needed to afford each building by its target time,
    // read as price ÷ time since the previous target. Dashed and neutral.
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = TARGET;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    s.ladder.forEach((b, i) => {
      const t = s.result.target[b.id]!;
      const prevT = i === 0 ? 0 : s.result.target[s.ladder[i - 1]!.id]!;
      const need = b.basePrice / Math.max(1, t - prevT);
      if (t < this.tMin || t > s.horizonSeconds) return;
      const x = this.x(t);
      const y = this.y(need, range);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();

    // Income line.
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let first = true;
    for (const p of s.result.series) {
      if (p.t < this.tMin || p.income <= 0) continue;
      const x = this.x(p.t);
      const y = this.y(p.income, range);
      if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Unlock markers with direct labels, alternating above and below so
    // neighbours do not collide.
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    s.ladder.forEach((b, i) => {
      const t = s.result.firstUnlock[b.id];
      if (t === undefined || t > s.horizonSeconds) return;
      const x = this.x(Math.max(t, this.tMin));
      const y = this.y(this.incomeAt(t), range);
      ctx.fillStyle = '#06060d';
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = ACCENT;
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = INK;
      ctx.textBaseline = i % 2 === 0 ? 'bottom' : 'top';
      ctx.fillText(b.name, x, i % 2 === 0 ? y - 9 : y + 9);
    });

    // One series and one reference line: a text legend is enough.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = DIM;
    ctx.fillText('— income /s   ┈ needed for target', this.pad.l + 4, this.pad.t);

    if (hoverT !== undefined) {
      const x = this.x(hoverT);
      ctx.strokeStyle = DIM;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(x + 0.5, this.pad.t); ctx.lineTo(x + 0.5, this.h - this.pad.b); ctx.stroke();
      ctx.setLineDash([]);
      const y = this.y(this.incomeAt(hoverT), range);
      ctx.fillStyle = '#06060d';
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = ACCENT;
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    }
  }

  private hover(e: MouseEvent): void {
    if (!this.state) return;
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    if (px < this.pad.l || px > this.w - this.pad.r) { this.tooltip.hidden = true; this.draw(); return; }
    const s = this.state;
    const k = (px - this.pad.l) / (this.w - this.pad.l - this.pad.r);
    const t = Math.pow(10, Math.log10(this.tMin) + k * (Math.log10(s.horizonSeconds) - Math.log10(this.tMin)));
    const sample = s.result.series.reduce((best, p) => (p.t <= t ? p : best), s.result.series[0]!);
    const owned = s.result.purchases.filter((p) => p.t <= t).length;
    this.tooltip.innerHTML =
      `<span class="k">t</span>${formatDuration(t)} ` +
      `<span class="k">income</span>${formatLines(sample.income)}/s ` +
      `<span class="k">balance</span>${formatLines(sample.balance)} ` +
      `<span class="k">bought</span>${owned}`;
    this.tooltip.hidden = false;
    this.tooltip.style.left = `${Math.min(px + 12, this.w - 260)}px`;
    this.tooltip.style.top = `${e.clientY - rect.top + 12}px`;
    this.draw(t);
  }
}
