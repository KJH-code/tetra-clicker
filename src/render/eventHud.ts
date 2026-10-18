import type { BoardRenderer } from './boardRenderer';
import type { LifeEvent } from '../sim/events';
import { HEIGHT, WIDTH, TOP_VISIBLE_ROW, occupiedCells } from '../sim/board';
import { pieceFromId } from '../sim/pieces';
import { PIECE_COLORS, THEME, VIEW } from './theme';
import { t } from '../ui/i18n';

const NAMES = { rival: 'RIVAL', invader: 'INVADER', helper: 'HELPER' } as const;
const COLORS = { rival: '#ff5050', invader: '#ff8c1a', helper: '#39ff14' } as const;

// A life event on the manual board: a banner over the well with the time
// left, garbage gauges (rows waiting for each side), and in a rival fight
// the rival's board, small, under the NEXT column.
export function drawEventHud(ctx: CanvasRenderingContext2D, r: BoardRenderer, ev: LifeEvent | null, nextShown = 5): void {
  if (!ev) return;
  const c = r.layout.cell;
  const left = r.cellX(0);
  const top = r.cellY(TOP_VISIBLE_ROW);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = COLORS[ev.kind];
  ctx.font = `800 ${Math.round(c * 0.5 * VIEW.textScale)}px system-ui, sans-serif`;
  const time = ev.kind === 'rival' ? t('UNTIL ONE TOPS OUT') : `${Math.ceil(ev.msLeft / 1000)}s`;
  ctx.fillText(`${NAMES[ev.kind]} · ${time}`, left + (WIDTH * c) / 2, top + c * 0.2);
  ctx.restore();

  // Rows waiting for me: a red bar up the well's left edge.
  const mine = ev.kind === 'rival' ? ev.toMe : 0;
  if (mine > 0) gauge(ctx, left - 5, r.cellY(HEIGHT), Math.min(20, mine) * c, '#ff3b3b');
  if (ev.kind === 'invader' && ev.shield > 0) gauge(ctx, left - 5, r.cellY(HEIGHT), Math.min(20, ev.shield) * c, '#00f0ff');

  if (ev.kind !== 'rival') return;
  // The rival's board, scaled into the NEXT column below the previews.
  const colX = r.cellX(WIDTH) + 4;
  const colW = r.layout.rightCells * c - 8;
  const rows = HEIGHT - TOP_VISIBLE_ROW;
  // Below the last preview (each takes three rows from row one), with room for its label.
  const room = r.cellY(HEIGHT) - (1 + nextShown * 3) * c - c;
  const mini = Math.max(3, Math.floor(Math.min(colW / WIDTH, room / rows)));
  const ox = colX + (colW - mini * WIDTH) / 2;
  const oy = r.cellY(HEIGHT) - rows * mini - 4;
  ctx.save();
  ctx.fillStyle = THEME.background;
  ctx.fillRect(ox, oy, mini * WIDTH, mini * rows);
  ctx.strokeStyle = COLORS.rival;
  ctx.strokeRect(ox - 0.5, oy - 0.5, mini * WIDTH + 1, mini * rows + 1);
  const g = ev.game;
  for (let y = TOP_VISIBLE_ROW; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const id = g.grid[y * WIDTH + x]!;
      if (!id) continue;
      const p = pieceFromId(id);
      ctx.fillStyle = p ? PIECE_COLORS[p] : THEME.dim;
      ctx.fillRect(ox + x * mini, oy + (y - TOP_VISIBLE_ROW) * mini, mini - 1, mini - 1);
    }
  }
  if (g.active) {
    ctx.fillStyle = PIECE_COLORS[g.active.piece];
    for (const [x, y] of occupiedCells(g.active)) if (y >= TOP_VISIBLE_ROW) ctx.fillRect(ox + x * mini, oy + (y - TOP_VISIBLE_ROW) * mini, mini - 1, mini - 1);
  }
  ctx.fillStyle = COLORS.rival;
  ctx.font = `700 ${Math.round(c * 0.36 * VIEW.textScale)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(`RIVAL L${ev.level}`, ox + (mini * WIDTH) / 2, oy - c * 0.5);
  if (ev.toRival > 0) gauge(ctx, ox - 4, oy + mini * rows, Math.min(rows, ev.toRival) * mini, '#ff3b3b');
  ctx.restore();
}

function gauge(ctx: CanvasRenderingContext2D, x: number, bottom: number, h: number, color: string): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.fillRect(x, bottom - h, 3, h);
  ctx.restore();
}

// The RIVAL building's rows waiting for the manual board, up its left edge.
export function drawDuelGauge(ctx: CanvasRenderingContext2D, r: BoardRenderer, rows: number): void {
  if (rows <= 0) return;
  gauge(ctx, r.cellX(0) - 5, r.cellY(HEIGHT), Math.min(20, rows) * r.layout.cell, '#ff3b3b');
}
