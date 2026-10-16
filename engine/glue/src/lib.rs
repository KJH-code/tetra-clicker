// Tetra Clicker's bridge to Cold Clear: a flat i32 buffer in, one decision
// out. No wasm-bindgen, so the module has no imports and loads the same in
// Node, a page and a worker. Layout (kept in step with src/sim/bot/ccWasm.ts):
//   in   0..40  rows, bit x set when occupied, row 0 at the bottom
//        40 hold piece (-1 none)   41 back-to-back   42 combo
//        43 queue length           44..64 queue, current piece first
//        64 bitmask of forbidden PlacementKinds   65 all-spins on
//        100.. weights (see WEIGHT_FIELDS in ccWasm.ts)
//   out  300 found   301 hold   302..310 four landing cells (x, y)
//        310 spin (0 none, 1 mini, 2 full)   311 input count   312.. inputs
//        400 nodes searched
use cold_clear::evaluation::Standard;
use cold_clear::{BotState, Options};
use libtetris::*;

static mut IO: [i32; 512] = [0; 512];

#[no_mangle]
pub extern "C" fn io() -> *mut i32 {
    unsafe { IO.as_mut_ptr() }
}

const PIECES: [Piece; 7] = [Piece::I, Piece::O, Piece::T, Piece::S, Piece::Z, Piece::J, Piece::L];

fn kind_index(k: PlacementKind) -> i32 {
    use PlacementKind::*;
    match k {
        None => 0, Clear1 => 1, Clear2 => 2, Clear3 => 3, Clear4 => 4,
        MiniTspin => 5, MiniTspin1 => 6, MiniTspin2 => 7,
        Tspin => 8, Tspin1 => 9, Tspin2 => 10, Tspin3 => 11,
        AllSpin => 12, AllSpin1 => 13, AllSpin2 => 14, AllSpin3 => 15, AllSpin4 => 16,
    }
}

fn weights(w: &[i32]) -> Standard {
    let mut e = Standard::default();
    e.back_to_back = w[0]; e.bumpiness = w[1]; e.bumpiness_sq = w[2]; e.row_transitions = w[3];
    e.height = w[4]; e.top_half = w[5]; e.top_quarter = w[6]; e.jeopardy = w[7];
    e.cavity_cells = w[8]; e.cavity_cells_sq = w[9]; e.overhang_cells = w[10]; e.overhang_cells_sq = w[11];
    e.covered_cells = w[12]; e.covered_cells_sq = w[13];
    e.tslot = [w[14], w[15], w[16], w[17]];
    e.well_depth = w[18]; e.max_well_depth = w[19];
    for i in 0..10 { e.well_column[i] = w[20 + i]; }
    e.b2b_clear = w[30]; e.clear1 = w[31]; e.clear2 = w[32]; e.clear3 = w[33]; e.clear4 = w[34];
    e.tspin1 = w[35]; e.tspin2 = w[36]; e.tspin3 = w[37]; e.mini_tspin1 = w[38]; e.mini_tspin2 = w[39];
    e.perfect_clear = w[40]; e.combo_garbage = w[41]; e.move_time = w[42]; e.wasted_t = w[43];
    e.allspin = [w[44], w[45], w[46], w[47]];
    e
}

/// Search `nodes` nodes from the position in the buffer and write the move.
/// The same buffer, node count and seed always give the same move.
#[no_mangle]
pub extern "C" fn suggest(nodes: u32, seed: u32) -> i32 {
    let io = unsafe { &mut IO };
    let mut field = [[false; 10]; 40];
    for y in 0..40 {
        for x in 0..10 {
            field[y][x] = io[y] & (1 << x) != 0;
        }
    }
    let hold = if io[40] < 0 { None } else { Some(PIECES[io[40] as usize]) };
    let mut board: Board = Board::new_with_state(field, enumset::EnumSet::empty(), hold, io[41] != 0, io[42] as u32);
    for i in 0..io[43] as usize {
        board.add_next_piece(PIECES[io[44 + i] as usize]);
    }
    let forbidden = io[64];
    set_all_spin(io[65] != 0);
    let eval = weights(&io[100..]);

    let mut opts = Options::default();
    opts.speculate = false;
    opts.max_nodes = nodes;
    let mut bot: BotState<Standard> = BotState::new(board, opts);
    bot.reseed(seed as u64);
    let mut done = 0;
    while done < nodes {
        match bot.think() {
            Ok(t) => {
                let r = t.think(&eval);
                bot.finish_thinking(r);
                done += 1;
            }
            Err(_) => break,
        }
    }
    io[400] = done as i32;
    let mv = bot.suggest_filtered(&eval, |lock, _| forbidden & (1 << kind_index(lock.placement_kind)) == 0);
    match mv {
        Some(mv) => {
            io[300] = 1;
            io[301] = mv.hold as i32;
            for (i, (x, y)) in mv.expected_location.cells().iter().enumerate() {
                io[302 + 2 * i] = *x;
                io[303 + 2 * i] = *y;
            }
            io[310] = match mv.expected_location.tspin {
                TspinStatus::None => 0,
                TspinStatus::Mini => 1,
                TspinStatus::Full => 2,
            };
            io[311] = mv.inputs.len() as i32;
            for (i, m) in mv.inputs.iter().enumerate() {
                io[312 + i] = match m {
                    PieceMovement::Left => 0,
                    PieceMovement::Right => 1,
                    PieceMovement::Cw => 2,
                    PieceMovement::Ccw => 3,
                    PieceMovement::SonicDrop => 4,
                };
            }
            1
        }
        None => {
            io[300] = 0;
            0
        }
    }
}
