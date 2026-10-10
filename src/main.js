// Game controller: rendering, input, scoring and levels.
(function () {
  'use strict';

  const { Board, isAdjacent } = window.Match3;

  const ROWS = 8;
  const COLS = 8;
  const SWAP_MS = 180;
  const FALL_MS = 260;
  const POP_MS = 240;
  const HINT_DELAY_MS = 6000;
  const POINTS_PER_CANDY = 60;
  const SPECIAL_BONUS = 120;
  const MOVE_BONUS = 250;
  const CHEERS = ['', '', 'Sweet!', 'Tasty!', 'Delicious!', 'Divine!', 'Sugar Crush!'];

  const els = {
    board: document.getElementById('board'),
    level: document.getElementById('level'),
    score: document.getElementById('score'),
    moves: document.getElementById('moves'),
    target: document.getElementById('target'),
    progress: document.getElementById('progress'),
    toast: document.getElementById('toast'),
    hintBtn: document.getElementById('hint-btn'),
    restartBtn: document.getElementById('restart-btn'),
    overlay: document.getElementById('overlay'),
    dialogTitle: document.getElementById('dialog-title'),
    dialogText: document.getElementById('dialog-text'),
    dialogBtn: document.getElementById('dialog-btn'),
  };

  const state = {
    board: null,
    level: 1,
    score: 0,
    moves: 0,
    target: 0,
    busy: false,
    selected: null,
    hintTimer: 0,
    nodes: new Map(), // candy id -> element
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function levelConfig(level) {
    return { target: 2000 + level * 1500, moves: Math.max(15, 22 - level) };
  }

  function loadLevel() {
    try {
      const saved = parseInt(localStorage.getItem('sugar-rush-level'), 10);
      return saved > 0 ? saved : 1;
    } catch (e) {
      return 1;
    }
  }

  function saveLevel(level) {
    try {
      localStorage.setItem('sugar-rush-level', String(level));
    } catch (e) {
      /* storage unavailable: progress just won't persist */
    }
  }

  // ---------- Rendering ----------

  function candyClass(candy) {
    let cls = 'candy';
    if (candy.type >= 0) cls += ' t' + candy.type;
    if (candy.special) cls += ' special-' + candy.special;
    return cls;
  }

  function place(node, r, c) {
    node.style.setProperty('--r', r);
    node.style.setProperty('--c', c);
  }

  // Bring the DOM in line with the board. Candies that left the board pop,
  // new ones fall in from `spawns` rows (or grow in place if not listed).
  function render(spawns = new Map(), { swapping = false } = {}) {
    const { board, nodes } = state;
    const live = new Set();
    const entering = [];

    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        const candy = board.cells[r][c];
        if (!candy) continue;
        live.add(candy.id);
        let node = nodes.get(candy.id);
        if (!node) {
          node = document.createElement('div');
          node.className = candyClass(candy);
          node.dataset.id = candy.id;
          const body = document.createElement('div');
          body.className = 'body';
          node.appendChild(body);
          if (spawns.has(candy.id)) {
            place(node, spawns.get(candy.id), c);
            entering.push([node, r, c]);
          } else {
            place(node, r, c);
            node.classList.add('appear');
            setTimeout(() => node.classList.remove('appear'), 300);
          }
          nodes.set(candy.id, node);
          els.board.appendChild(node);
        } else {
          node.classList.toggle('swapping', swapping);
          place(node, r, c);
        }
      }
    }

    for (const [id, node] of nodes) {
      if (live.has(id)) continue;
      nodes.delete(id);
      node.classList.add('popping');
      setTimeout(() => node.remove(), POP_MS);
    }

    if (entering.length) {
      // force a layout so the start position is applied before moving
      void els.board.offsetWidth;
      for (const [node, r, c] of entering) place(node, r, c);
    }
  }

  function rebuildBoard() {
    els.board.textContent = '';
    state.nodes.clear();
    els.board.style.setProperty('--rows', state.board.rows);
    els.board.style.setProperty('--cols', state.board.cols);
    render();
  }

  function updateHud() {
    els.level.textContent = state.level;
    els.score.textContent = state.score.toLocaleString();
    els.moves.textContent = state.moves;
    els.moves.classList.toggle('low', state.moves <= 3);
    els.target.textContent = state.target.toLocaleString();
    els.progress.style.width = Math.min(100, (state.score / state.target) * 100) + '%';
  }

  function floatText(text, r, c) {
    const el = document.createElement('div');
    el.className = 'float';
    el.textContent = text;
    el.style.left = ((c + 0.5) / state.board.cols) * 100 + '%';
    el.style.top = ((r + 0.5) / state.board.rows) * 100 + '%';
    els.board.appendChild(el);
    setTimeout(() => el.remove(), 800);
  }

  function showToast(text) {
    els.toast.textContent = text;
    els.toast.classList.remove('show');
    void els.toast.offsetWidth;
    els.toast.classList.add('show');
  }

  function setSelected(pos) {
    if (state.selected) {
      const prev = state.board.get(state.selected[0], state.selected[1]);
      const node = prev && state.nodes.get(prev.id);
      if (node) node.classList.remove('selected');
    }
    state.selected = pos;
    if (pos) {
      const candy = state.board.get(pos[0], pos[1]);
      const node = candy && state.nodes.get(candy.id);
      if (node) node.classList.add('selected');
    }
  }

  // ---------- Hints ----------

  function clearHint() {
    clearTimeout(state.hintTimer);
    for (const node of els.board.querySelectorAll('.hint')) node.classList.remove('hint');
  }

  function showHint() {
    clearHint();
    const move = state.board.findMove();
    if (!move) return;
    for (const [r, c] of move) {
      const node = state.nodes.get(state.board.get(r, c).id);
      if (node) node.classList.add('hint');
    }
  }

  function scheduleHint() {
    clearHint();
    state.hintTimer = setTimeout(() => {
      if (!state.busy) showHint();
    }, HINT_DELAY_MS);
  }

  // ---------- Turn logic ----------

  async function playResult(result, cascade) {
    const points = result.cleared.length * POINTS_PER_CANDY * cascade + result.created.length * SPECIAL_BONUS;
    state.score += points;
    updateHud();

    const n = result.cleared.length || 1;
    const r = result.cleared.reduce((sum, x) => sum + x.r, 0) / n;
    const c = result.cleared.reduce((sum, x) => sum + x.c, 0) / n;
    floatText('+' + points, r, c);
    const cheer = CHEERS[Math.min(cascade, CHEERS.length - 1)];
    if (cheer) showToast(cheer);
    else if (result.triggered.length >= 2) showToast('Sweet!');

    render();
    await sleep(POP_MS);
    const spawns = state.board.collapse();
    render(spawns);
    await sleep(FALL_MS);
  }

  async function trySwap(p1, p2) {
    if (state.busy || !isAdjacent(p1, p2)) return;
    state.busy = true;
    clearHint();
    setSelected(null);

    const { board } = state;
    const valid = board.isValidSwap(p1, p2);
    board.swap(p1, p2);
    render(undefined, { swapping: true });
    await sleep(SWAP_MS);

    if (!valid) {
      board.swap(p1, p2);
      render(undefined, { swapping: true });
      els.board.classList.remove('shake');
      void els.board.offsetWidth;
      els.board.classList.add('shake');
      await sleep(SWAP_MS);
      render();
      state.busy = false;
      scheduleHint();
      return;
    }

    render();
    state.moves--;
    updateHud();

    let cascade = 0;
    let result = board.activateSwap(p1, p2);
    if (result) await playResult(result, ++cascade);
    const focus = cascade === 0 ? [p1, p2] : [];
    let first = true;
    while ((result = board.resolveMatches(first ? focus : []))) {
      first = false;
      await playResult(result, ++cascade);
    }

    if (state.score >= state.target) {
      await finishLevel(true);
    } else if (state.moves <= 0) {
      await finishLevel(false);
    } else {
      if (!board.findMove()) {
        showToast('Shuffle!');
        await sleep(400);
        board.shuffle();
        render();
        await sleep(FALL_MS);
      }
      state.busy = false;
      scheduleHint();
    }
  }

  async function finishLevel(won) {
    clearHint();
    await sleep(300);
    if (won) {
      const bonus = state.moves * MOVE_BONUS;
      state.score += bonus;
      updateHud();
      showToast('Level Clear!');
      saveLevel(state.level + 1);
      await sleep(900);
      showDialog(
        'Level ' + state.level + ' complete!',
        'Score ' + state.score.toLocaleString() +
          (bonus ? ' (including ' + bonus.toLocaleString() + ' bonus for ' + state.moves + ' moves left)' : '') + '.',
        'Next level',
        () => startLevel(state.level + 1)
      );
    } else {
      showDialog(
        'Out of moves',
        'You scored ' + state.score.toLocaleString() + ' of ' + state.target.toLocaleString() + '. Have another go!',
        'Try again',
        () => startLevel(state.level)
      );
    }
  }

  function showDialog(title, text, buttonLabel, onClose) {
    els.dialogTitle.textContent = title;
    els.dialogText.textContent = text;
    els.dialogBtn.textContent = buttonLabel;
    els.overlay.hidden = false;
    els.dialogBtn.focus();
    els.dialogBtn.onclick = () => {
      els.overlay.hidden = true;
      onClose();
    };
  }

  function startLevel(level) {
    const config = levelConfig(level);
    state.level = level;
    state.score = 0;
    state.moves = config.moves;
    state.target = config.target;
    state.busy = false;
    state.selected = null;
    state.board = new Board({ rows: ROWS, cols: COLS });
    rebuildBoard();
    updateHud();
    scheduleHint();
  }

  // ---------- Input ----------

  function cellAt(event) {
    const rect = els.board.getBoundingClientRect();
    const c = Math.floor(((event.clientX - rect.left) / rect.width) * state.board.cols);
    const r = Math.floor(((event.clientY - rect.top) / rect.height) * state.board.rows);
    return state.board.inBounds(r, c) ? [r, c] : null;
  }

  let drag = null;

  els.board.addEventListener('pointerdown', (event) => {
    if (state.busy) return;
    const cell = cellAt(event);
    if (!cell) return;
    drag = { cell, x: event.clientX, y: event.clientY, moved: false };
    els.board.setPointerCapture(event.pointerId);
  });

  els.board.addEventListener('pointermove', (event) => {
    if (!drag || drag.moved) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const threshold = els.board.getBoundingClientRect().width / state.board.cols / 3;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return;
    drag.moved = true;
    const [r, c] = drag.cell;
    const target = Math.abs(dx) > Math.abs(dy) ? [r, c + Math.sign(dx)] : [r + Math.sign(dy), c];
    if (state.board.inBounds(target[0], target[1])) trySwap(drag.cell, target);
  });

  els.board.addEventListener('pointerup', () => {
    if (!drag) return;
    const { cell, moved } = drag;
    drag = null;
    if (moved || state.busy) return;
    const sel = state.selected;
    if (sel && isAdjacent(sel, cell)) trySwap(sel, cell);
    else if (sel && sel[0] === cell[0] && sel[1] === cell[1]) setSelected(null);
    else setSelected(cell);
  });

  els.board.addEventListener('pointercancel', () => {
    drag = null;
  });

  els.hintBtn.addEventListener('click', () => {
    if (!state.busy) showHint();
  });

  els.restartBtn.addEventListener('click', () => {
    if (!state.busy) startLevel(state.level);
  });

  startLevel(loadLevel());
})();
