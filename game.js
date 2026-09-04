'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');

const startScreen = document.getElementById('start-screen');
const startRecordsList = document.getElementById('start-records-list');
const startBestCombo = document.getElementById('start-best-combo');
const startMaxLines = document.getElementById('start-max-lines');
const playBtn = document.getElementById('play-btn');
const resetScoresStartBtn = document.getElementById('reset-scores-start');

const overlayRecords = document.getElementById('overlay-records');
const overlayRecordsList = document.getElementById('overlay-records-list');
const overlayBestCombo = document.getElementById('overlay-best-combo');
const overlayMaxLines = document.getElementById('overlay-max-lines');
const nameEntry = document.getElementById('name-entry');
const nameInput = document.getElementById('name-input');
const nameSubmitBtn = document.getElementById('name-submit');
const resetScoresOverlayBtn = document.getElementById('reset-scores-overlay');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let started = false;
let combo = 0;
let pendingGameOverData = null;

const THEME_KEY = 'tetris-theme';
const HIGHSCORES_KEY = 'tetris-highscores';

function applyTheme(theme) {
  document.body.classList.toggle('light-mode', theme === 'light');
  themeToggle.checked = theme === 'light';
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

themeToggle.addEventListener('change', () => {
  const theme = themeToggle.checked ? 'light' : 'dark';
  applyTheme(theme);
  localStorage.setItem(THEME_KEY, theme);
});

function loadHighScores() {
  try {
    const raw = localStorage.getItem(HIGHSCORES_KEY);
    if (!raw) return { top: [], bestCombo: 0, maxLines: 0 };
    const data = JSON.parse(raw);
    return {
      top: Array.isArray(data.top) ? data.top : [],
      bestCombo: Number.isFinite(data.bestCombo) ? data.bestCombo : 0,
      maxLines: Number.isFinite(data.maxLines) ? data.maxLines : 0,
    };
  } catch {
    return { top: [], bestCombo: 0, maxLines: 0 };
  }
}

function saveHighScores(data) {
  try {
    localStorage.setItem(HIGHSCORES_KEY, JSON.stringify(data));
  } catch {}
}

function qualifiesForTopFive(candidateScore, top) {
  if (top.length < 5) return true;
  return candidateScore > top[top.length - 1].score;
}

function insertHighScore(top, entry) {
  return [...top, entry].sort((a, b) => b.score - a.score).slice(0, 5);
}

function renderRecordsList(listEl, top, highlightIndex) {
  listEl.innerHTML = '';
  if (!top.length) {
    const li = document.createElement('li');
    li.className = 'records-empty';
    li.textContent = 'Sin récords todavía';
    listEl.appendChild(li);
    return;
  }
  top.forEach((entry, i) => {
    const li = document.createElement('li');
    li.className = 'records-row' + (i === highlightIndex ? ' records-row--new' : '');
    const rank = document.createElement('span');
    rank.className = 'records-rank';
    rank.textContent = `${i + 1}.`;
    const name = document.createElement('span');
    name.className = 'records-name';
    name.textContent = entry.name;
    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'records-score';
    scoreSpan.textContent = entry.score.toLocaleString();
    const meta = document.createElement('span');
    meta.className = 'records-meta';
    meta.textContent = `L${entry.lines} · Nv${entry.level}`;
    li.append(rank, name, scoreSpan, meta);
    listEl.appendChild(li);
  });
}

function renderStartScreen() {
  const data = loadHighScores();
  renderRecordsList(startRecordsList, data.top, -1);
  startBestCombo.textContent = data.bestCombo;
  startMaxLines.textContent = data.maxLines;
}

function resetHighScores() {
  if (!window.confirm('¿Seguro que quieres borrar todos los récords?')) return;
  try {
    localStorage.removeItem(HIGHSCORES_KEY);
  } catch {}
  renderStartScreen();
  if (pendingGameOverData) {
    pendingGameOverData = { top: [], bestCombo: combo, maxLines: lines };
  } else if (gameOver && !overlayRecords.classList.contains('hidden')) {
    const data = loadHighScores();
    renderRecordsList(overlayRecordsList, data.top, -1);
    overlayBestCombo.textContent = data.bestCombo;
    overlayMaxLines.textContent = data.maxLines;
  }
}

resetScoresStartBtn.addEventListener('click', resetHighScores);
resetScoresOverlayBtn.addEventListener('click', resetHighScores);

function showStartScreen() {
  renderStartScreen();
  startScreen.classList.remove('hidden');
}

function hideStartScreen() {
  startScreen.classList.add('hidden');
}

playBtn.addEventListener('click', () => {
  hideStartScreen();
  init();
});

function submitHighScoreName() {
  if (!pendingGameOverData) return;
  const raw = nameInput.value.trim().slice(0, 10);
  const name = raw || 'Jugador';
  const entry = { name, score, lines, level, date: new Date().toISOString() };
  pendingGameOverData.top = insertHighScore(pendingGameOverData.top, entry);
  saveHighScores(pendingGameOverData);
  const highlightIndex = pendingGameOverData.top.indexOf(entry);
  nameEntry.classList.add('hidden');
  overlayRecords.classList.remove('hidden');
  renderRecordsList(overlayRecordsList, pendingGameOverData.top, highlightIndex);
  overlayBestCombo.textContent = pendingGameOverData.bestCombo;
  overlayMaxLines.textContent = pendingGameOverData.maxLines;
  pendingGameOverData = null;
}

nameSubmitBtn.addEventListener('click', submitHighScoreName);
nameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') submitHighScoreName();
});

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    combo++;
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  } else {
    combo = 0;
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
    return;
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--grid-color').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  if (!gameOver) {
    // ghost
    const gy = ghostY();
    for (let r = 0; r < current.shape.length; r++)
      for (let c = 0; c < current.shape[r].length; c++)
        if (current.shape[r][c])
          drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

    // current piece
    for (let r = 0; r < current.shape.length; r++)
      for (let c = 0; c < current.shape[r].length; c++)
        drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
  }
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  animId = null;
  draw();
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;

  const data = loadHighScores();
  if (combo > data.bestCombo) data.bestCombo = combo;
  if (lines > data.maxLines) data.maxLines = lines;

  resetScoresOverlayBtn.classList.remove('hidden');

  const qualifies = qualifiesForTopFive(score, data.top);
  if (qualifies) {
    pendingGameOverData = data;
    nameEntry.classList.remove('hidden');
    overlayRecords.classList.add('hidden');
    nameInput.value = 'Jugador';
  } else {
    saveHighScores(data);
    nameEntry.classList.add('hidden');
    overlayRecords.classList.remove('hidden');
    renderRecordsList(overlayRecordsList, data.top, -1);
    overlayBestCombo.textContent = data.bestCombo;
    overlayMaxLines.textContent = data.maxLines;
  }

  overlay.classList.remove('hidden');

  if (qualifies) {
    nameInput.focus();
    nameInput.select();
  }
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  cancelAnimationFrame(animId);
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  combo = 0;
  started = true;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  nameEntry.classList.add('hidden');
  overlayRecords.classList.add('hidden');
  resetScoresOverlayBtn.classList.add('hidden');
  pendingGameOverData = null;
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (!started) return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

initTheme();
showStartScreen();
