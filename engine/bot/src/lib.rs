// Cold Clear (MinusKelvin/cold-clear @ 279edd7), MPL-2.0. Modified for
// Tetra Clicker; see engine/README.md for what changed.

pub use opening_book::{Book, MemoryBook};
use serde::{Deserialize, Serialize};

mod dag;
pub mod evaluation;
pub mod modes { pub mod normal; }
use libtetris::*;

pub use crate::modes::normal::{BotState, ThinkResult, Thinker};

#[derive(Copy, Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct Options {
    pub mode: MovementMode,
    pub spawn_rule: SpawnRule,
    pub use_hold: bool,
    pub speculate: bool,
    pub min_nodes: u32,
    pub max_nodes: u32,
    pub threads: u32,
}

#[derive(Serialize, Deserialize)]
enum BotMsg {
    Reset {
        #[serde(with = "BigArray")]
        field: [[bool; 10]; 40],
        b2b: bool,
        combo: u32,
    },
    NewPiece(Piece),
    SuggestMove(u32),
    PlayMove(FallingPiece),
    ForceAnalysisLine(Vec<FallingPiece>),
}

#[derive(Clone, Debug, Serialize, Deserialize, Eq, PartialEq, Hash)]
pub enum Info {
    Normal(modes::normal::Info),
    Book,
}

impl Info {
    pub fn plan(&self) -> &[(FallingPiece, LockResult)] {
        match self {
            Info::Normal(info) => &info.plan,
            Info::Book => &[],
        }
    }
}

#[derive(Serialize, Deserialize)]
pub enum BotPollState {
    Waiting,
    Dead,
}

impl Default for Options {
    fn default() -> Self {
        Options {
            mode: MovementMode::ZeroG,
            spawn_rule: SpawnRule::Row19Or20,
            use_hold: true,
            speculate: true,
            min_nodes: 0,
            max_nodes: 4_000_000_000,
            threads: 1,
        }
    }
}

use serde_big_array::big_array;
big_array!( BigArray; 40, );
