import {
  WIDTH, TOP_VISIBLE_ROW, createGrid, collides, dropDistance, lockPiece,
  clearFullRows, isEmpty, occupiedCells, type Grid, type Placement,
  serializeGrid, deserializeGrid,
} from './board';
import { boxSize, pieceId, type Piece, type Rotation } from './pieces';
import { kicksFor } from './kicks';
import { createBag, type Bag } from './bag';
import { createRng, restoreRng } from './rng';
import { detectSpin, type SpinKind } from './spin';

// What one locked piece did. attack.ts turns this into Lines; the renderer
// turns it into flashes.
export interface LockResult {
  piece: Piece;
  lines: number;
  spin: SpinKind;
  perfectClear: boolean;
  // Index into the combo table: 0 for the first clear of a run, -1 when the
  // placement cleared nothing.
  comboIndex: number;
  // True when this clear kept a back-to-back chain alive (and so earns the bonus).
  b2bExtended: boolean;
  // The board was reset because the next piece could not spawn.
  topped: boolean;
  clearedRows: number[]; // absolute row indices, for effects
}

export interface GameSnapshot {
  grid: string;
  hold: Piece | null;
  holdUsed: boolean;
  queue: Piece[];
  rng: number;
  combo: number;
  b2b: number;
  active: Placement | null;
}

export class Game {
  grid: Grid = createGrid();
  active: Placement | null = null;
  hold: Piece | null = null;
  holdUsed = false;
  // -1 = no run in progress; otherwise the index the next clear will use.
  combo = -1;
  // -1 = no chain; 0 = one qualifying clear made, the next one extends it.
  b2b = -1;
  private bag: Bag;
  private lastActionWasRotation = false;
  private lastKickIndex = -1;

  constructor(seed: number, snapshot?: GameSnapshot) {
    if (snapshot) {
      this.grid = deserializeGrid(snapshot.grid);
      this.hold = snapshot.hold;
      this.holdUsed = snapshot.holdUsed;
      this.combo = snapshot.combo;
      this.b2b = snapshot.b2b;
      this.bag = createBag(restoreRng(snapshot.rng), 5, snapshot.queue);
      this.active = snapshot.active;
      if (!this.active) this.spawn();
    } else {
      this.bag = createBag(createRng(seed));
      this.spawn();
    }
  }

  // Whether the next lock would be judged as a spin: the last thing that
  // changed the piece's position was a rotation.
  get spinArmed(): boolean {
    return this.lastActionWasRotation;
  }

  next(n = 5): Piece[] {
    return this.bag.peek(n);
  }

  snapshot(): GameSnapshot {
    const { queue, rng } = this.bag.snapshot();
    return {
      grid: serializeGrid(this.grid),
      hold: this.hold,
      holdUsed: this.holdUsed,
      queue,
      rng,
      combo: this.combo,
      b2b: this.b2b,
      active: this.active ? { ...this.active } : null,
    };
  }

  // Spawn at the top of the visible area. With no gravity a piece spawned in
  // the buffer would be invisible, so unlike the guideline it starts on the
  // first visible row. Returns false when the spawn position is blocked.
  private spawnPlacement(piece: Piece): Placement {
    const size = boxSize(piece);
    const x = Math.floor((WIDTH - size) / 2);
    // The I box has an empty top row, so shift it up to put the bar on the top visible row.
    const y = piece === 'I' ? TOP_VISIBLE_ROW - 1 : TOP_VISIBLE_ROW;
    return { piece, rot: 0, x, y };
  }

  private spawn(piece?: Piece): boolean {
    const p = this.spawnPlacement(piece ?? this.bag.take());
    this.lastActionWasRotation = false;
    this.lastKickIndex = -1;
    if (collides(this.grid, p)) {
      this.active = p;
      return false;
    }
    this.active = p;
    return true;
  }

  private tryMove(dx: number, dy: number): boolean {
    if (!this.active) return false;
    const moved = { ...this.active, x: this.active.x + dx, y: this.active.y + dy };
    if (collides(this.grid, moved)) return false;
    this.active = moved;
    this.lastActionWasRotation = false;
    return true;
  }

  moveLeft(): boolean { return this.tryMove(-1, 0); }
  moveRight(): boolean { return this.tryMove(1, 0); }
  softDrop(): boolean { return this.tryMove(0, 1); }

  rotate(dir: 1 | -1 | 2): boolean {
    if (!this.active || this.active.piece === 'O') return false;
    const from = this.active.rot;
    const to = (((from + dir) % 4) + 4) % 4 as Rotation;
    const kicks = kicksFor(this.active.piece, from, to);
    for (let i = 0; i < kicks.length; i++) {
      const [kx, ky] = kicks[i]!;
      // Kick tables are y-up; the grid is y-down.
      const candidate: Placement = { ...this.active, rot: to, x: this.active.x + kx, y: this.active.y - ky };
      if (!collides(this.grid, candidate)) {
        this.active = candidate;
        this.lastActionWasRotation = true;
        this.lastKickIndex = i;
        return true;
      }
    }
    return false;
  }

  rotateCW(): boolean { return this.rotate(1); }
  rotateCCW(): boolean { return this.rotate(-1); }
  rotate180(): boolean { return this.rotate(2); }

  swapHold(): boolean {
    if (!this.active || this.holdUsed) return false;
    const current = this.active.piece;
    const incoming = this.hold;
    this.hold = current;
    this.holdUsed = true;
    this.spawn(incoming ?? undefined);
    return true;
  }

  ghostY(): number {
    if (!this.active) return 0;
    return this.active.y + dropDistance(this.grid, this.active);
  }

  hardDrop(): LockResult {
    if (!this.active) throw new Error('no active piece');
    const d = dropDistance(this.grid, this.active);
    if (d > 0) {
      this.active = { ...this.active, y: this.active.y + d };
      // A drop that travelled is a movement, so the placement is no longer a spin.
      this.lastActionWasRotation = false;
    }
    return this.lock();
  }

  // Lock the active piece where it is. Public so the bot, which chooses a
  // placement directly, can commit it.
  lock(): LockResult {
    const p = this.active!;
    const spin = detectSpin(this.grid, p, {
      lastActionWasRotation: this.lastActionWasRotation,
      lastKickIndex: this.lastKickIndex,
    });
    const cells = occupiedCells(p);
    // Locking entirely above the visible rows is a lock-out: nothing the
    // player can see holds the piece up, so treat it like a blocked spawn.
    const lockedOut = cells.every(([, y]) => y < TOP_VISIBLE_ROW);
    const rowsBefore = new Set(cells.map(([, y]) => y));
    lockPiece(this.grid, p, pieceId(p.piece));
    const clearedRows = [...rowsBefore].filter((y) => {
      for (let x = 0; x < WIDTH; x++) if (this.grid[y * WIDTH + x] === 0) return false;
      return true;
    }).sort((a, b) => a - b);
    const lines = clearFullRows(this.grid);
    const perfectClear = lines > 0 && isEmpty(this.grid);

    let comboIndex = -1;
    if (lines > 0) {
      this.combo += 1;
      comboIndex = this.combo;
    } else {
      this.combo = -1;
    }

    // Back-to-back: quads and T-spins (minis included) keep the chain; any other
    // clear breaks it; a placement that cleared nothing leaves it alone.
    let b2bExtended = false;
    if (lines > 0) {
      const qualifies = lines === 4 || (p.piece === 'T' && spin !== 'none');
      if (qualifies) {
        b2bExtended = this.b2b >= 0;
        this.b2b += 1;
      } else {
        this.b2b = -1;
      }
    }

    this.holdUsed = false;
    const spawned = this.spawn();
    let topped = false;
    if (lockedOut || !spawned) {
      topped = true;
      this.resetBoard();
    }
    return { piece: p.piece, lines, spin, perfectClear, comboIndex, b2bExtended, topped, clearedRows };
  }

  // Reaching the ceiling costs nothing but the stack: combo and back-to-back
  // are dropped with it, hold and the queue stay.
  private resetBoard(): void {
    this.grid = createGrid();
    this.combo = -1;
    this.b2b = -1;
    if (this.active) this.active = this.spawnPlacement(this.active.piece);
  }

  // Place the active piece at an explicit position (bot use). Returns false if
  // the position collides.
  setActive(p: Placement): boolean {
    if (collides(this.grid, p)) return false;
    this.active = p;
    this.lastActionWasRotation = false;
    return true;
  }
}
