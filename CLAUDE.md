# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A classic Tetris implementation in vanilla JavaScript (ES6+), HTML5 Canvas, and CSS. No dependencies, no build step, no `package.json`, no bundler, no test framework — everything is three static files.

## Running the game

Open `index.html` directly, or serve it with any static server:

```bash
open index.html          # macOS, opens directly in browser
python3 -m http.server 8000   # or any static file server
```

There is no build, lint, or test command — there is nothing to compile and no test suite. Verify changes by reloading the page in a browser and playing.

## Architecture

Three files, each with one responsibility:

- `index.html` — DOM structure: the main `#board` canvas (300×600, 10×20 grid at `BLOCK=30`px), the `#next-canvas` preview, HUD spans (`#score`, `#lines`, `#level`), and the pause/game-over `#overlay`.
- `style.css` — dark/retro arcade visual theme only.
- `game.js` — all game logic, in one file, driven by global mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, plus loop timing vars). There is no module system or class hierarchy; everything is top-level functions operating on these globals.

### Core data model

- `board`: a `ROWS × COLS` matrix; each cell is `0` (empty) or an integer 1–7 identifying the piece color (`COLORS` array).
- `PIECES`: the 7 tetrominoes as small square matrices of color-index integers.
- `current` / `next`: `{ type, shape, x, y }` — `shape` is the piece's own matrix (mutated in place on rotation), `x`/`y` are the piece's board offset.

### Key functions and how they connect

- `collide(shape, ox, oy)` — the single collision primitive; checks board bounds and existing fixed blocks. Used by movement, rotation, ghost-piece projection, and spawn (to detect game over).
- `rotateCW(shape)` — matrix transpose + reverse rows. `tryRotate()` wraps it with wall-kick offsets `[0, -1, 1, -2, 2]`, trying each until one doesn't collide.
- `ghostY()` — projects `current` straight down via repeated `collide` checks; used both for hard drop and for rendering the ghost piece at `globalAlpha = 0.2`.
- `lockPiece()` → `merge()` (writes piece into `board`) → `clearLines()` (scans bottom-up, splices full rows, unshifts empty ones, updates score/level/`dropInterval`) → `spawn()` (promotes `next` to `current`, generates a new `next`, calls `endGame()` if the new piece immediately collides).
- `loop(ts)` — the `requestAnimationFrame` game loop; accumulates elapsed time in `dropAccum` and advances the piece (or locks it) once `dropAccum >= dropInterval`.
- Scoring: `LINE_SCORES = [0, 100, 300, 500, 800]` multiplied by `level`; hard drop adds 2 points/row dropped, soft drop adds 1 point/row. Level increments every 10 lines; `dropInterval = max(100, 1000 - (level-1)*90)`.

### Input

A single `keydown` listener switches on `e.code` (arrows, `Space` for hard drop, `KeyX`/`ArrowUp` for rotate, `KeyP` for pause). `init()` resets all state and is also bound to the restart button.

### Tunable constants (top of `game.js`)

`COLS`, `ROWS`, `BLOCK`, `COLORS`, `LINE_SCORES`, `dropInterval`. If `COLS`/`ROWS`/`BLOCK` change, the `#board` canvas `width`/`height` in `index.html` must be updated to match (`COLS×BLOCK` by `ROWS×BLOCK`).
