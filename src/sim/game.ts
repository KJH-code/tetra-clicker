import {
  WIDTH, HEIGHT, TOP_VISIBLE_ROW, createGrid, collides, dropDistance, lockPiece,
  clearFullRows, isEmpty, occupiedCells, type Grid, type Placement,
  serializeGrid, deserializeGrid,
} from './board';
import { boxSize, pieceId, type Piece, type Rotation } from './pieces';
import { kicksFor } from './kicks';
import { createBag, type Bag } from './bag';
import { createRng, restoreRng, type Rng } from './rng';
import { detectSpin, type SpinKind } from './spin';
import { LEVELS, GARBAGE_ID, CHEESE_ID } from '../data/levels';

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
  // The piece was the golden one, and a wrath piece in its place.
  golden?: boolean;
  wrath?: boolean;
  // Cleared rows that were garbage, by kind (missing when none were).
  garbageCleared?: { clean: number; cheese: number };
}

// Boards that play by other rules than a plain well; bot buildings use them,
// and they ride in the snapshot so a worker's copy plays the same game.
export interface BoardMode {
  // Columns kept filled on each side, refilled after every lock (4-wide).
  walls?: number;
  // A garbage row comes up every this many pieces; `cheese` is the share of
  // rows whose hole moves (the rest keep the last hole).
  garbageEvery?: number;
  cheese?: number;
}

export interface BoardModeState {
  mode: BoardMode;
  rng: number;
  pieces: number;
  hole: number;
}

// Where the golden piece is: a queue index (-1 = not in the queue), the
// piece in play, or a hold slot (parallel to `holds`).
export interface GoldenMarks {
  queue: number;
  active: boolean;
  holds: boolean[];
  // The one golden piece is a wrath piece (missing in older saves).
  wrath?: boolean;
}

export interface GameSnapshot {
  grid: string;
  // Oldest first. A single slot is the guideline hold.
  holds: Piece[];
  holdUsed: boolean;
  queue: Piece[];
  rng: number;
  combo: number;
  b2b: number;
  active: Placement | null;
  graceUsed: number;
  shieldSpent: boolean;
  golden?: GoldenMarks;
  board?: BoardModeState;
}

// Rule changes upgrades can buy for the manual board. The defaults are plain
// guideline Tetris, which is what bots and a fresh game play.
export interface GameRules {
  // Non-clearing pieces a running combo survives.
  comboGrace: number;
  // One non-qualifying clear per chain does not break back-to-back; it
  // recharges on the next back-to-back clear.
  b2bShield: boolean;
  nextCount: number;
  holdSlots: number;
}

// Spawn at the top of the visible area. With no gravity a piece spawned in
// the buffer would be invisible, so unlike the guideline it starts on the
// first visible row. Bots plan from here too.
export function spawnPlacementFor(piece: Piece): Placement {
  const size = boxSize(piece);
  const x = Math.floor((WIDTH - size) / 2);
  // The I box has an empty top row, so shift it up to put the bar on the top visible row.
  const y = piece === 'I' ? TOP_VISIBLE_ROW - 1 : TOP_VISIBLE_ROW;
  return { piece, rot: 0, x, y };
}

export const DEFAULT_RULES: GameRules = { comboGrace: 0, b2bShield: false, nextCount: 5, holdSlots: 1 };

// Pieces kept in the queue: enough for the longest preview a rule can show.
const QUEUE_LOOKAHEAD = 6;

export class Game {
  grid: Grid = createGrid();
  active: Placement | null = null;
  holds: Piece[] = [];
  holdUsed = false;
  rules: GameRules = { ...DEFAULT_RULES };
  golden: GoldenMarks = { queue: -1, active: false, holds: [] };
  // Non-clearing pieces placed since the combo's last clear.
  private graceUsed = 0;
  private shieldSpent = false;
  // Gravity and lock delay, used only when a round turns gravity on.
  private fallMs = 0;
  private lockMs = 0;
  private lockResets = 0;
  // -1 = no run in progress; otherwise the index the next clear will use.
  combo = -1;
  // -1 = no chain; 0 = one qualifying clear made, the next one extends it.
  b2b = -1;
  private bag: Bag;
  private lastActionWasRotation = false;
  private lastKickIndex = -1;
  private boardMode: BoardModeState | null = null;
  private garbageRng: Rng | null = null;

  constructor(seed: number, snapshot?: GameSnapshot) {
    if (snapshot) {
      this.grid = deserializeGrid(snapshot.grid);
      this.holds = [...snapshot.holds];
      this.holdUsed = snapshot.holdUsed;
      this.combo = snapshot.combo;
      this.b2b = snapshot.b2b;
      this.graceUsed = snapshot.graceUsed;
      this.shieldSpent = snapshot.shieldSpent;
      this.bag = createBag(restoreRng(snapshot.rng), QUEUE_LOOKAHEAD, snapshot.queue);
      this.active = snapshot.active;
      if (snapshot.golden) this.golden = { ...snapshot.golden, holds: [...snapshot.golden.holds] };
      if (snapshot.board) {
        this.boardMode = { ...snapshot.board, mode: { ...snapshot.board.mode } };
        this.garbageRng = restoreRng(snapshot.board.rng);
      }
      if (!this.active) this.spawn();
    } else {
      this.bag = createBag(createRng(seed), QUEUE_LOOKAHEAD);
      this.spawn();
    }
  }

  // Whether the next lock would be judged as a spin: the last thing that
  // changed the piece's position was a rotation.
  get spinArmed(): boolean {
    return this.lastActionWasRotation;
  }

  // The piece the next hold press would bring back.
  get hold(): Piece | null {
    return this.holds.length >= this.rules.holdSlots ? this.holds[0] ?? null : null;
  }

  next(n = this.rules.nextCount): Piece[] {
    return this.bag.peek(n);
  }

  // Further ahead than the preview shows; the PC bot plans ten pieces out.
  preview(n: number): Piece[] {
    this.bag.ensure(n);
    return this.bag.peek(n);
  }

  snapshot(): GameSnapshot {
    const { queue, rng } = this.bag.snapshot();
    return {
      grid: serializeGrid(this.grid),
      holds: [...this.holds],
      holdUsed: this.holdUsed,
      queue,
      rng,
      combo: this.combo,
      b2b: this.b2b,
      active: this.active ? { ...this.active } : null,
      graceUsed: this.graceUsed,
      shieldSpent: this.shieldSpent,
      ...(this.boardMode ? { board: { ...this.boardMode, mode: { ...this.boardMode.mode }, rng: this.garbageRng!.state() } } : {}),
      golden: { ...this.golden, holds: [...this.golden.holds] },
    };
  }

  private spawnPlacement(piece: Piece): Placement {
    return spawnPlacementFor(piece);
  }

  // Turn this board into a mode's board (a building's bot board, once).
  setMode(mode: BoardMode, seed: number): void {
    this.boardMode = { mode: { ...mode }, rng: 0, pieces: 0, hole: 0 };
    this.garbageRng = createRng(seed ^ 0x5bd1e995);
    this.boardMode.hole = this.garbageRng.nextInt(WIDTH);
    this.fillWalls();
  }

  get mode(): BoardMode {
    return this.boardMode?.mode ?? {};
  }

  // Wall columns full from the top visible row down; the buffer above stays
  // open so pieces spawn and turn as usual.
  private fillWalls(): void {
    const w = this.boardMode?.mode.walls ?? 0;
    if (w <= 0) return;
    for (let y = TOP_VISIBLE_ROW; y < HEIGHT; y++) {
      for (let i = 0; i < w; i++) {
        this.grid[y * WIDTH + i] = GARBAGE_ID;
        this.grid[y * WIDTH + WIDTH - 1 - i] = GARBAGE_ID;
      }
    }
  }

  // A board's own garbage (DOWNSTACK): every so many pieces a row comes up.
  // Returns true if it pushed the stack through the ceiling.
  private boardGarbage(): boolean {
    const st = this.boardMode;
    const every = st?.mode.garbageEvery ?? 0;
    if (!st || every <= 0) return false;
    st.pieces += 1;
    if (st.pieces < every) return false;
    st.pieces = 0;
    const rng = this.garbageRng!;
    const cheese = rng.next() < (st.mode.cheese ?? 0);
    if (cheese) {
      // A cheese row's hole always moves.
      st.hole = (st.hole + 1 + rng.nextInt(WIDTH - 1)) % WIDTH;
    }
    // The piece just locked is part of the stack now, not one to push up.
    const locked = this.active;
    this.active = null;
    const over = this.addGarbage(st.hole, cheese);
    this.active = locked;
    return over;
  }

  get hasGolden(): boolean {
    return this.golden.queue >= 0 || this.golden.active || this.golden.holds.some(Boolean);
  }

  // Gild the queue piece at `index` (the last one shown, so it scrolls into
  // view). Only one golden piece exists at a time, golden or wrath.
  markGolden(index: number, wrath = false): boolean {
    if (this.hasGolden) return false;
    this.golden.queue = index;
    this.golden.wrath = wrath;
    return true;
  }

  clearGolden(): void {
    this.golden = { queue: -1, active: false, holds: this.holds.map(() => false) };
  }

  private spawn(piece?: Piece, golden = false): boolean {
    if (piece === undefined) {
      golden = this.golden.queue === 0;
      if (this.golden.queue >= 0) this.golden.queue -= 1;
    }
    this.golden.active = golden;
    const p = this.spawnPlacement(piece ?? this.bag.take());
    this.lastActionWasRotation = false;
    this.lastKickIndex = -1;
    this.fallMs = 0;
    this.lockMs = 0;
    this.lockResets = 0;
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
    this.touched();
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
        this.touched();
        return true;
      }
    }
    return false;
  }

  // A move or turn while resting buys more lock delay, up to the reset limit,
  // so a piece cannot be stalled forever.
  private touched(): void {
    if (this.lockMs > 0 && this.lockResets < LEVELS.lockResetLimit) {
      this.lockMs = 0;
      this.lockResets += 1;
    }
  }

  // Gravity for `dtMs` at `cellsPerSecond`, with lock delay once the piece
  // rests. Returns the lock result if the piece locked on its own.
  tick(dtMs: number, cellsPerSecond: number): LockResult | null {
    if (!this.active || cellsPerSecond <= 0) return null;
    let piece: Placement = this.active;
    // 20G: the piece sits on the floor the moment it appears.
    if (!Number.isFinite(cellsPerSecond)) {
      const d = dropDistance(this.grid, piece);
      if (d > 0) {
        this.active = piece = { ...piece, y: piece.y + d };
        this.lastActionWasRotation = false;
        this.lockMs = 0;
      }
    }
    this.fallMs += dtMs;
    const interval = Number.isFinite(cellsPerSecond) ? 1000 / cellsPerSecond : Infinity;
    while (this.fallMs >= interval) {
      this.fallMs -= interval;
      const down: Placement = { ...piece, y: piece.y + 1 };
      if (collides(this.grid, down)) { this.fallMs = 0; break; }
      // A fall is not a manipulation: it clears the lock timer without
      // spending the reset budget, and like any move it disarms a spin.
      this.active = piece = down;
      this.lastActionWasRotation = false;
      this.lockMs = 0;
    }
    if (dropDistance(this.grid, piece) === 0) {
      this.lockMs += dtMs;
      if (this.lockMs >= LEVELS.lockDelayMs) return this.lock();
    } else {
      this.lockMs = 0;
    }
    return null;
  }

  // Push one cheese garbage row in from the bottom with its hole at `holeX`.
  // Returns true when that tops the player out: a block is pushed off the
  // top of the matrix, or the active piece has nowhere to go.
  addGarbage(holeX: number, cheese = false): boolean {
    let overflow = false;
    for (let x = 0; x < WIDTH; x++) if (this.grid[x] !== 0) overflow = true;
    this.grid.copyWithin(0, WIDTH);
    const bottom = (HEIGHT - 1) * WIDTH;
    for (let x = 0; x < WIDTH; x++) this.grid[bottom + x] = x === holeX ? 0 : cheese ? CHEESE_ID : GARBAGE_ID;
    if (this.active && collides(this.grid, this.active)) {
      const lifted = { ...this.active, y: this.active.y - 1 };
      if (collides(this.grid, lifted)) overflow = true;
      else this.active = lifted;
    }
    return overflow;
  }

  // Lift the lowest garbage row out of the stack (a helper's gift); the rows
  // above it drop by one. False if there is no garbage.
  // Rows holding any garbage cell (what slows the bots).
  garbageRows(): number {
    let n = 0;
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const c = this.grid[y * WIDTH + x];
        if (c === GARBAGE_ID || c === CHEESE_ID) { n++; break; }
      }
    }
    return n;
  }

  removeGarbageRow(): boolean {
    for (let y = HEIGHT - 1; y >= 0; y--) {
      let garbage = false;
      for (let x = 0; x < WIDTH; x++) {
        const c = this.grid[y * WIDTH + x];
        if (c === GARBAGE_ID || c === CHEESE_ID) { garbage = true; break; }
      }
      if (!garbage) continue;
      this.grid.copyWithin(WIDTH, 0, y * WIDTH);
      this.grid.fill(0, 0, WIDTH);
      return true;
    }
    return false;
  }

  // Clear the stack and chains: a round ending, or a top-out.
  reset(): void {
    this.resetBoard();
  }

  rotateCW(): boolean { return this.rotate(1); }
  rotateCCW(): boolean { return this.rotate(-1); }
  rotate180(): boolean { return this.rotate(2); }

  // Hold is a queue: the current piece goes to the back, and once every slot
  // is full the oldest comes out. With one slot this is the guideline swap.
  swapHold(): boolean {
    if (!this.active || this.holdUsed || this.rules.holdSlots <= 0) return false;
    this.holds.push(this.active.piece);
    this.golden.holds.push(this.golden.active);
    const incoming = this.holds.length > this.rules.holdSlots ? this.holds.shift() : undefined;
    const incomingGolden = incoming !== undefined ? this.golden.holds.shift() ?? false : false;
    this.holdUsed = true;
    this.spawn(incoming, incomingGolden);
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
    const golden = this.golden.active;
    const wrath = golden && !!this.golden.wrath;
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
    // Garbage rows among the cleared ones; wall columns do not count.
    const walls = this.boardMode?.mode.walls ?? 0;
    let clean = 0, cheese = 0;
    for (const y of clearedRows) {
      let kind = 0;
      for (let x = walls; x < WIDTH - walls; x++) {
        const c = this.grid[y * WIDTH + x];
        if (c === CHEESE_ID) kind = CHEESE_ID;
        else if (c === GARBAGE_ID && kind === 0) kind = GARBAGE_ID;
      }
      if (kind === CHEESE_ID) cheese++;
      else if (kind === GARBAGE_ID) clean++;
    }
    const lines = clearFullRows(this.grid);
    this.fillWalls();
    const perfectClear = lines > 0 && isEmpty(this.grid);

    let comboIndex = -1;
    if (lines > 0) {
      this.combo += 1;
      comboIndex = this.combo;
      this.graceUsed = 0;
    } else if (this.combo >= 0 && this.graceUsed < this.rules.comboGrace) {
      this.graceUsed += 1;
    } else {
      this.combo = -1;
      this.graceUsed = 0;
    }

    // Back-to-back: quads and T-spins (minis included) keep the chain; any other
    // clear breaks it; a placement that cleared nothing leaves it alone.
    let b2bExtended = false;
    if (lines > 0) {
      const qualifies = lines === 4 || (p.piece === 'T' && spin !== 'none');
      if (qualifies) {
        b2bExtended = this.b2b >= 0;
        this.b2b += 1;
        if (b2bExtended) this.shieldSpent = false;
      } else if (this.b2b >= 0 && this.rules.b2bShield && !this.shieldSpent) {
        this.shieldSpent = true;
      } else {
        this.b2b = -1;
      }
    }

    this.holdUsed = false;
    // The board's own garbage comes up before the next piece spawns.
    const buried = this.boardGarbage();
    const spawned = !buried && this.spawn();
    let topped = false;
    if (lockedOut || !spawned) {
      topped = true;
      this.resetBoard();
      if (buried) this.spawn();
    }
    const garbageCleared = clean + cheese > 0 ? { garbageCleared: { clean, cheese } } : {};
    return { piece: p.piece, lines, spin, perfectClear, comboIndex, b2bExtended, topped, clearedRows, golden, wrath, ...garbageCleared };
  }

  // Reaching the ceiling costs the stack, the combo, the back-to-back chain
  // and the held piece; only the queue carries over.
  private resetBoard(): void {
    this.grid = createGrid();
    this.combo = -1;
    this.b2b = -1;
    this.holds = [];
    this.golden.holds = [];
    this.holdUsed = false;
    this.graceUsed = 0;
    this.shieldSpent = false;
    this.fillWalls();
    if (this.active) this.active = this.spawnPlacement(this.active.piece);
  }

  // A fresh 7-bag from `seed`, with hold and the piece in play cleared:
  // every life starts from the same kind of opening.
  newBag(seed: number): void {
    this.bag = createBag(createRng(seed), QUEUE_LOOKAHEAD);
    this.holds = [];
    this.golden = { queue: -1, active: false, holds: [] };
    this.holdUsed = false;
    this.active = null;
    this.spawn();
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
