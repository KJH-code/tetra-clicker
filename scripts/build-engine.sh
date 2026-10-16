#!/bin/sh
# Builds the Cold Clear engine (engine/) to the wasm module the game loads.
# The output is committed, so neither the deploy nor the tests need Rust.
set -e
cd "$(dirname "$0")/../engine"
cargo build --release --target wasm32-unknown-unknown -p cc-glue
cp target/wasm32-unknown-unknown/release/cc_glue.wasm ../src/engine/cold-clear.wasm
