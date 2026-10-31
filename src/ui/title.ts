import { Game } from '../sim/game';
import { HEIGHT, WIDTH } from '../sim/board';
import { pieceFromId, type Piece } from '../sim/pieces';
import { playOne } from '../sim/bot/index';
import { singleBot } from '../sim/bot/singleBot';
import { sizeBot } from '../sim/bot/sizeBot';
import type { BotPolicy } from '../sim/bot/policy';
import { paintBlock } from '../render/icons';
import { PIECE_COLORS } from '../render/theme';

// The title screen, an arcade cabinet switching on: the tube warms up from a
// line, the logo resolves out of coarse pixels, bot boards play behind it,
// NOW LOADING fills while the engine loads, then PRESS ANY KEY. The key that
// dismisses it never reaches the game. Always in the pixel style, whatever
// STYLE says: it is the game's face. Its bots are the TypeScript ones, so it
// runs before the wasm engine has loaded.

// 5×7 letters, only the ones the logo needs.
const GLYPHS: Record<string, string[]> = {
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
};
const LINES = ['TETRA', 'CLICKER'];
// A piece colour per letter, round the guideline set.
const LETTER_PIECES: Piece[] = ['T', 'S', 'L', 'I', 'Z', 'O', 'J'];

const BOOT_MS = 600; // the tube's line opening to a picture
const RESOLVE_MS = 1300; // the logo from coarse pixels to sharp
const OUT_MS = 450; // dismissed: back to coarse pixels and gone
const BLOCKS = [64, 48, 32, 24, 16, 12, 8, 6, 4, 3, 2, 1];
const BOARD_CELL = 9;
const BOARD_STEP_MS = 140;

interface BackBoard { game: Game; bot: BotPolicy; x: number; y: number; timer: number; flash: { rows: number[]; t: number } | null }
interface Shard { x: number; y: number; vx: number; vy: number; size: number; color: string; t: number; life: number }

const IMPACT_MS = 380; // the logo landing sharp: flash and shake
const SHARD_GRAVITY = 1600; // px/s²
const GLITCH_MS = 170;
const ROW_FLASH_MS = 220;
// Cyber neon: cyan and magenta for everything but the logo's piece colours.
const CYAN = '#00f0ff';
const MAGENTA = '#ff2ed2';

export interface TitleText { prompt: string; subtitle: string }

export class TitleScreen {
  private root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private logo = document.createElement('canvas');
  private small = document.createElement('canvas');
  private boards: BackBoard[] = [];
  private start = performance.now();
  private last = performance.now();
  private loaded = 0;
  private text: TitleText | null = null;
  private leaving = -1;
  private still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  private onGo: (() => void) | null = null;
  private resolveDone: (() => void) | null = null;
  readonly done: Promise<void>;
  private raf = 0;
  private impactAt = -1;
  private shards: Shard[] = [];
  // The first glitch just after the logo lands, then every five to eight seconds.
  private nextGlitch = BOOT_MS * 0.6 + RESOLVE_MS + 450;
  private glitchAt = -1;
  // The logo tinted red and blue, for the tube's colour fringes in a glitch.
  private tintRed = document.createElement('canvas');
  private tintBlue = document.createElement('canvas');

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'title';
    this.canvas = document.createElement('canvas');
    const glass = document.createElement('div');
    glass.className = 'title-glass';
    this.root.append(this.canvas, glass);
    parent.append(this.root);
    this.ctx = this.canvas.getContext('2d')!;
    this.done = new Promise((r) => { this.resolveDone = r; });
    this.resize();
    window.addEventListener('resize', this.resize);
    // Capture, so the game's own key handlers never see a key meant for the title.
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('keyup', this.swallow, true);
    this.root.addEventListener('pointerdown', this.onPointer);
    this.raf = requestAnimationFrame(this.frame);
    // Dev server only: lets a browser script set off a glitch for screenshots.
    if (import.meta.env.DEV) Object.assign(window, { titleGlitch: () => { this.glitchAt = performance.now(); } });
  }

  // 0..1 of the loading done.
  progress(k: number): void { this.loaded = Math.max(this.loaded, Math.min(1, k)); }

  // Loaded: show the prompt and wait for a key (or go at once when the
  // player turned the title off). `onGo` runs on the dismissing gesture,
  // which is when audio may start.
  ready(text: TitleText, opts: { auto: boolean; reduceMotion: boolean; onGo: () => void }): void {
    this.loaded = 1;
    this.text = text;
    this.still = this.still || opts.reduceMotion;
    this.onGo = opts.onGo;
    if (opts.auto) this.leave(false);
  }

  private swallow = (e: Event): void => { e.stopImmediatePropagation(); };

  private onKey = (e: KeyboardEvent): void => {
    e.stopImmediatePropagation();
    e.preventDefault();
    if (this.text && this.leaving < 0 && !e.repeat) this.leave(true);
  };

  private onPointer = (e: PointerEvent): void => {
    e.preventDefault();
    if (this.text && this.leaving < 0) this.leave(true);
  };

  private leave(byHand: boolean): void {
    this.leaving = performance.now();
    if (byHand) this.onGo?.();
    if (this.still || !byHand) this.finish();
  }

  private finish(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.onKey, true);
    // The key is still down; let its release go by before the game listens.
    window.setTimeout(() => window.removeEventListener('keyup', this.swallow, true), 0);
    this.root.remove();
    this.resolveDone?.();
  }

  private resize = (): void => {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawLogo(w);
    this.tint(this.tintRed, '#ff2050');
    this.tint(this.tintBlue, '#20c0ff');
    this.placeBoards(w, h);
  };

  // The logo at full sharpness, once per size; the frames pixelate a copy.
  private drawLogo(w: number): void {
    const cols = Math.max(...LINES.map((l) => l.length * 6 - 1));
    const rows = LINES.length * 8 - 1;
    const cell = Math.max(4, Math.min(22, Math.floor((w * 0.82) / cols)));
    this.logo.width = cols * cell;
    this.logo.height = rows * cell;
    const g = this.logo.getContext('2d')!;
    g.clearRect(0, 0, this.logo.width, this.logo.height);
    let n = 0;
    LINES.forEach((line, row) => {
      const ox = Math.floor(((cols - (line.length * 6 - 1)) * cell) / 2);
      [...line].forEach((ch, i) => {
        const color = PIECE_COLORS[LETTER_PIECES[n++ % LETTER_PIECES.length]!];
        GLYPHS[ch]!.forEach((r, y) => [...r].forEach((p, x) => {
          if (p === '#') paintBlock(g, ox + (i * 6 + x) * cell, (row * 8 + y) * cell, cell, color);
        }));
      });
    });
  }

  private tint(into: HTMLCanvasElement, color: string): void {
    into.width = this.logo.width;
    into.height = this.logo.height;
    const g = into.getContext('2d')!;
    g.clearRect(0, 0, into.width, into.height);
    g.drawImage(this.logo, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, into.width, into.height);
  }

  // The logo lands: shards of its blocks burst out from where they sit.
  private burst(lx: number, ly: number): void {
    const g = this.logo.getContext('2d')!;
    const { width, height } = this.logo;
    const data = g.getImageData(0, 0, width, height).data;
    for (let i = 0; i < 320; i++) {
      const x = Math.floor(Math.random() * width);
      const y = Math.floor(Math.random() * height);
      const k = (y * width + x) * 4;
      if (data[k + 3]! < 200) continue;
      const fromCentre = (x - width / 2) / (width / 2);
      this.shards.push({
        x: lx + x, y: ly + y,
        vx: fromCentre * 260 + (Math.random() * 2 - 1) * 160,
        vy: -(140 + Math.random() * 380),
        size: 6 + Math.random() * 9,
        color: `rgb(${data[k]},${data[k + 1]},${data[k + 2]})`,
        t: 0, life: 900 + Math.random() * 700,
      });
    }
  }

  private placeBoards(w: number, h: number): void {
    const bw = WIDTH * BOARD_CELL;
    const count = Math.max(3, Math.min(7, Math.floor(w / (bw + 40))));
    const gap = (w - count * bw) / (count + 1);
    const bots = [singleBot, sizeBot(2), sizeBot(3), sizeBot(4)];
    const kept = this.boards;
    this.boards = Array.from({ length: count }, (_, i) => kept[i] ?? {
      game: new Game(1000 + i * 77), bot: bots[i % bots.length]!, x: 0, y: 0, timer: (i * BOARD_STEP_MS) / count, flash: null,
    });
    this.boards.forEach((b, i) => {
      b.x = Math.round(gap + i * (bw + gap));
      // Staggered heights, like a row of cabinets.
      b.y = Math.round(h - 20 * BOARD_CELL - 24 - (i % 2) * 18);
    });
  }

  private frame = (now: number): void => {
    const dt = Math.min(100, now - this.last);
    this.last = now;
    const t = now - this.start;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const ctx = this.ctx;
    ctx.fillStyle = '#050608';
    ctx.fillRect(0, 0, w, h);
    this.drawGrid(w, h, t);

    // The bots play on, a step every so often; a board that tops out starts over.
    for (const b of this.boards) {
      b.timer -= dt;
      if (b.timer > 0) continue;
      b.timer += BOARD_STEP_MS;
      const m = playOne(b.game, b.bot);
      if (!m || m.result.topped) b.game = new Game((b.game.grid.length + now) | 0);
      else if (m.result.lines > 0 && !this.still) b.flash = { rows: m.result.clearedRows, t: 0 };
    }
    for (const b of this.boards) if (b.flash && (b.flash.t += dt) > ROW_FLASH_MS) b.flash = null;
    ctx.save();
    ctx.globalAlpha = 0.45;
    for (const b of this.boards) this.drawBoard(b);
    ctx.restore();

    // The tube warming up: a line that opens to the picture.
    const boot = this.still ? 1 : Math.min(1, t / BOOT_MS);
    // Leaving: the picture breaks back into pixels and fades.
    const out = this.leaving >= 0 && !this.still ? Math.min(1, (now - this.leaving) / OUT_MS) : 0;
    const resolve = this.still ? 1 : Math.min(1, Math.max(0, (t - BOOT_MS * 0.6) / RESOLVE_MS));
    // BLOCKS runs coarse to sharp: in, the index climbs with `resolve`; out, it falls back.
    const sharp = out > 0 ? 1 - out : resolve;
    const level = Math.round(sharp * (BLOCKS.length - 1));
    const baseX = Math.round((w - this.logo.width) / 2);
    const baseY = Math.round(h * 0.26 - this.logo.height / 2 + 40);
    // The moment it lands sharp: a flash, a shake and a burst of its blocks.
    if (resolve >= 1 && this.impactAt < 0 && !this.still) {
      this.impactAt = now;
      this.burst(baseX, baseY);
    }
    const sinceImpact = this.impactAt < 0 ? Infinity : now - this.impactAt;
    const shake = sinceImpact < IMPACT_MS ? 10 * (1 - sinceImpact / IMPACT_MS) ** 2 : 0;
    const sx = shake ? Math.round((Math.random() * 2 - 1) * shake) : 0;
    const sy = shake ? Math.round((Math.random() * 2 - 1) * shake) : 0;
    // Settled, it floats a little.
    const bob = this.still || this.impactAt < 0 ? 0 : Math.round(Math.sin(sinceImpact / 700) * 4);
    const lx = baseX + sx;
    const ly = baseY + sy + bob;
    // Now and then the tube glitches: colour fringes and torn rows.
    if (!this.still && resolve >= 1 && out === 0 && now >= this.nextGlitch + this.start) {
      this.glitchAt = now;
      this.nextGlitch = t + 5000 + Math.random() * 3000;
    }
    const glitching = this.glitchAt >= 0 && now - this.glitchAt < GLITCH_MS;
    if (resolve > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, resolve * 3) * (1 - out);
      if (glitching) this.drawGlitch(lx, ly);
      else this.drawPixelated(lx, ly, BLOCKS[level]!);
      ctx.restore();
    }
    this.drawShards(dt);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = "700 24px Galmuri11, monospace";
    if (resolve >= 1 && out === 0) {
      if (this.text) {
        ctx.fillStyle = CYAN;
        ctx.fillText(this.text.subtitle, w / 2, ly + this.logo.height + 44);
        // PRESS ANY KEY, blinking on a half-second beat.
        if (this.still || Math.floor(t / 500) % 2 === 0) {
          // Split into magenta and cyan behind the yellow, like a misaligned tube.
          ctx.font = "700 36px Galmuri11, monospace";
          ctx.fillStyle = MAGENTA;
          ctx.fillText(this.text.prompt, w / 2 - 3, h * 0.62);
          ctx.fillStyle = CYAN;
          ctx.fillText(this.text.prompt, w / 2 + 3, h * 0.62);
          ctx.fillStyle = '#ffe600';
          ctx.fillText(this.text.prompt, w / 2, h * 0.62);
        }
      } else {
        this.drawLoading(w / 2, h * 0.62);
      }
    }
    // Arcade furniture: credits and the year.
    ctx.font = "400 12px Galmuri11, monospace";
    ctx.fillStyle = '#00f0ff80';
    ctx.textAlign = 'left';
    ctx.fillText('CREDIT 00', 20, 24);
    ctx.textAlign = 'right';
    ctx.fillText(`© 2026 KJH · v${__APP_VERSION__}`, w - 20, 24);
    ctx.restore();

    if (glitching) this.glitchScreen(w, h, now - this.glitchAt === 0 || now - this.glitchAt < 34);
    if (boot < 1) this.drawBoot(w, h, boot);
    if (sinceImpact < IMPACT_MS * 0.6) {
      ctx.fillStyle = `rgba(255,255,255,${0.55 * (1 - sinceImpact / (IMPACT_MS * 0.6))})`;
      ctx.fillRect(0, 0, w, h);
    }
    // Dismissed: a white flash at the start of the way out.
    if (out > 0 && out < 0.25) {
      ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - out / 0.25)})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (out >= 1) {
      this.root.style.opacity = '0';
      this.finish();
      return;
    }
    if (out > 0) this.root.style.opacity = String(1 - out * 0.8);
    this.raf = requestAnimationFrame(this.frame);
  };

  // Shrink the logo to one sample per `block` pixels and draw it back up
  // unsmoothed: coarse blocks that sharpen as `block` falls to 1.
  private drawPixelated(x: number, y: number, block: number): void {
    const ctx = this.ctx;
    if (block <= 1) { ctx.drawImage(this.logo, x, y); return; }
    const sw = Math.max(1, Math.ceil(this.logo.width / block));
    const sh = Math.max(1, Math.ceil(this.logo.height / block));
    this.small.width = sw;
    this.small.height = sh;
    const g = this.small.getContext('2d')!;
    g.imageSmoothingEnabled = true;
    g.clearRect(0, 0, sw, sh);
    g.drawImage(this.logo, 0, 0, sw, sh);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.small, 0, 0, sw, sh, x, y, sw * block, sh * block);
    ctx.imageSmoothingEnabled = true;
  }

  // Red and blue copies pulled apart, and a few rows of the logo torn sideways.
  private drawGlitch(x: number, y: number): void {
    const ctx = this.ctx;
    const d = 10 + Math.round(Math.random() * 12);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= 0.7;
    ctx.drawImage(this.tintRed, x - d, y);
    ctx.drawImage(this.tintBlue, x + d, y);
    ctx.restore();
    const { width, height } = this.logo;
    let row = 0;
    while (row < height) {
      const band = Math.min(height - row, 4 + Math.floor(Math.random() * 18));
      const shift = Math.random() < 0.35 ? Math.round((Math.random() * 2 - 1) * 24) : 0;
      ctx.drawImage(this.logo, 0, row, width, band, x + shift, y + row, width, band);
      row += band;
    }
  }

  // The whole picture in a glitch: bands of it torn sideways, blocks of
  // digital noise, and on its first frame the colours inverted.
  private glitchScreen(w: number, h: number, first: boolean): void {
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    for (let i = 0; i < 6; i++) {
      const y = Math.floor(Math.random() * h);
      const band = 4 + Math.floor(Math.random() * 28);
      const shift = Math.round((Math.random() * 2 - 1) * 60);
      ctx.drawImage(this.canvas, 0, y * dpr, w * dpr, band * dpr, shift, y, w, band);
    }
    const colors = [CYAN, MAGENTA, '#ffffff', '#ffe600'];
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = colors[i % colors.length]!;
      ctx.globalAlpha = 0.35 + Math.random() * 0.5;
      ctx.fillRect(Math.random() * w, Math.random() * h, 8 + Math.random() * 90, 2 + Math.random() * 10);
    }
    ctx.globalAlpha = 1;
    if (first) {
      ctx.save();
      ctx.globalCompositeOperation = 'difference';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  // A synthwave floor: neon lines running to a vanishing point and rows
  // sliding toward the viewer, a glowing horizon above the bot boards.
  private drawGrid(w: number, h: number, t: number): void {
    const ctx = this.ctx;
    const horizon = Math.round(h * 0.68);
    const vx = w / 2;
    ctx.save();
    const sky = ctx.createLinearGradient(0, horizon - 120, 0, horizon);
    sky.addColorStop(0, 'rgba(255,46,210,0)');
    sky.addColorStop(1, 'rgba(255,46,210,0.22)');
    ctx.fillStyle = sky;
    ctx.fillRect(0, horizon - 120, w, 120);
    ctx.lineWidth = 2;
    // Rows: evenly spaced in depth, so they bunch toward the horizon.
    const speed = this.still ? 0 : (t / 1400) % 1;
    for (let i = 0; i < 14; i++) {
      const z = (i + 1 - speed) / 14;
      const y = horizon + (h - horizon) * z * z;
      ctx.strokeStyle = `rgba(0,240,255,${0.12 + 0.5 * z})`;
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(w, Math.round(y) + 0.5);
      ctx.stroke();
    }
    // Columns from the vanishing point out past the screen's edges.
    for (let i = -12; i <= 12; i++) {
      ctx.strokeStyle = `rgba(255,46,210,${0.35 - Math.abs(i) * 0.015})`;
      ctx.beginPath();
      ctx.moveTo(vx + i * 14, horizon);
      ctx.lineTo(vx + i * (w / 7), h);
      ctx.stroke();
    }
    ctx.fillStyle = MAGENTA;
    ctx.fillRect(0, horizon - 1, w, 2);
    ctx.restore();
  }

  private drawShards(dt: number): void {
    if (this.shards.length === 0) return;
    const ctx = this.ctx;
    const s = dt / 1000;
    ctx.save();
    for (const p of this.shards) {
      p.t += dt;
      p.vy += SHARD_GRAVITY * s;
      p.x += p.vx * s;
      p.y += p.vy * s;
      ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
      paintBlock(ctx, p.x, p.y, p.size, p.color);
    }
    ctx.restore();
    this.shards = this.shards.filter((p) => p.t < p.life);
  }

  private drawBoard(b: BackBoard): void {
    const ctx = this.ctx;
    const top = HEIGHT - 20;
    ctx.fillStyle = '#0d1018';
    ctx.fillRect(b.x, b.y, WIDTH * BOARD_CELL, 20 * BOARD_CELL);
    ctx.strokeStyle = this.boards.indexOf(b) % 2 ? CYAN : MAGENTA;
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x - 1, b.y - 1, WIDTH * BOARD_CELL + 2, 20 * BOARD_CELL + 2);
    const g = b.game.grid;
    for (let y = top; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const id = g[y * WIDTH + x]!;
        if (!id) continue;
        const p = pieceFromId(id);
        paintBlock(ctx, b.x + x * BOARD_CELL, b.y + (y - top) * BOARD_CELL, BOARD_CELL, p ? PIECE_COLORS[p] : '#8d93ab');
      }
    }
    // A clear flashes its rows white, as on the real boards.
    if (b.flash) {
      ctx.save();
      ctx.globalAlpha *= 2.5 * (1 - b.flash.t / ROW_FLASH_MS);
      ctx.fillStyle = '#ffffff';
      for (const row of b.flash.rows) if (row >= top) ctx.fillRect(b.x, b.y + (row - top) * BOARD_CELL, WIDTH * BOARD_CELL, BOARD_CELL);
      ctx.restore();
    }
  }

  // NOW LOADING and a bar that fills in blocks.
  private drawLoading(cx: number, cy: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#f2f4fa';
    ctx.font = "700 24px Galmuri11, monospace";
    ctx.fillText('NOW LOADING', cx, cy - 26);
    const n = 20;
    const bw = 14;
    const gap = 4;
    const x0 = Math.round(cx - (n * (bw + gap) - gap) / 2);
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i < Math.floor(this.loaded * n) ? (i % 2 ? MAGENTA : CYAN) : '#1a1e2a';
      ctx.fillRect(x0 + i * (bw + gap), Math.round(cy), bw, 14);
    }
  }

  // The tube switching on: dark, a bright line across the middle that
  // opens up to the full picture, with a flicker.
  private drawBoot(w: number, h: number, k: number): void {
    const ctx = this.ctx;
    const open = Math.max(2, h * k * k);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, (h - open) / 2);
    ctx.fillRect(0, (h + open) / 2, w, (h - open) / 2);
    ctx.fillStyle = `rgba(220,240,255,${0.9 * (1 - k)})`;
    ctx.fillRect(0, (h - open) / 2, w, open);
  }
}
