import { decoder, Mino } from 'tetris-fumen';
import { HEIGHT, WIDTH } from './board';
import { PIECES, type Piece } from './pieces';

// Named builds come as fumen strings (the community's board-diagram format,
// decoded with knewjade's tetris-fumen, MIT; see THIRD_PARTY.md). A build is
// a list of stages: each the board as it should look once that page's
// pieces are down, before any clear. Cells hold the piece that goes there,
// 'X' for garbage already on the board, null for empty.
export type StageCell = Piece | 'X' | null;
export type BuildStage = StageCell[];

// Fumen rows count up from the floor; this project's grid counts down.
const FUMEN_ROWS = 23;

export function decodeBuild(fumen: string): BuildStage[] {
  return decoder.decode(fumen).map((page) => {
    const field = page.field.copy();
    if (page.operation) field.fill(Mino.from(page.operation), true);
    const stage: BuildStage = new Array<StageCell>(WIDTH * HEIGHT).fill(null);
    for (let fy = 0; fy < FUMEN_ROWS; fy++) {
      for (let x = 0; x < WIDTH; x++) {
        const t = field.at(x, fy);
        if (t === '_') continue;
        stage[(HEIGHT - 1 - fy) * WIDTH + x] = t === 'X' ? 'X' : (PIECES as readonly string[]).includes(t) ? (t as Piece) : 'X';
      }
    }
    return stage;
  });
}

// A build drawn as text pictures (src/data/openers.ts): rows top to bottom
// joined by '/', the last row on the floor.
export function pictureStages(pictures: readonly string[]): BuildStage[] {
  return pictures.map((picture) => {
    const rows = picture.split('/');
    const stage: BuildStage = new Array<StageCell>(WIDTH * HEIGHT).fill(null);
    rows.forEach((row, i) => {
      const y = HEIGHT - rows.length + i;
      for (let x = 0; x < WIDTH; x++) {
        const ch = row[x];
        if (!ch || ch === '_') continue;
        stage[y * WIDTH + x] = (PIECES as readonly string[]).includes(ch) ? (ch as Piece) : 'X';
      }
    });
    return stage;
  });
}
