// Pure match-3 board logic. No DOM access, so it can run in the browser
// (as window.Match3) and in Node (for tests).
(function (root) {
  'use strict';

  const NUM_TYPES = 6;
  const BOMB = -1; // color bombs have no color, so they never form runs

  // Small seedable PRNG (mulberry32) so tests are deterministic.
  function createRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function isAdjacent(p1, p2) {
    return Math.abs(p1[0] - p2[0]) + Math.abs(p1[1] - p2[1]) === 1;
  }

  class Board {
    constructor({ rows = 8, cols = 8, types = NUM_TYPES, rng = Math.random } = {}) {
      this.rows = rows;
      this.cols = cols;
      this.types = types;
      this.rng = rng;
      this.nextId = 1;
      this.cells = [];
      this.fill();
    }

    candy(type, special = null) {
      return { id: this.nextId++, type, special };
    }

    randomType() {
      return Math.floor(this.rng() * this.types);
    }

    inBounds(r, c) {
      return r >= 0 && r < this.rows && c >= 0 && c < this.cols;
    }

    get(r, c) {
      return this.inBounds(r, c) ? this.cells[r][c] : null;
    }

    key(r, c) {
      return r * this.cols + c;
    }

    // Fill the whole board with fresh candies: no ready-made matches and at
    // least one legal move.
    fill() {
      do {
        this.cells = [];
        for (let r = 0; r < this.rows; r++) {
          const row = [];
          this.cells.push(row);
          for (let c = 0; c < this.cols; c++) {
            let type;
            do {
              type = this.randomType();
            } while (
              (c >= 2 && row[c - 1].type === type && row[c - 2].type === type) ||
              (r >= 2 && this.cells[r - 1][c].type === type && this.cells[r - 2][c].type === type)
            );
            row.push(this.candy(type));
          }
        }
      } while (!this.findMove());
    }

    // Maximal horizontal and vertical runs of 3+ candies of the same color.
    findRuns() {
      const runs = [];
      const typeAt = (r, c) => {
        const cell = this.cells[r][c];
        return cell ? cell.type : BOMB;
      };
      for (let r = 0; r < this.rows; r++) {
        let c = 0;
        while (c < this.cols) {
          const t = typeAt(r, c);
          let end = c + 1;
          if (t !== BOMB) {
            while (end < this.cols && typeAt(r, end) === t) end++;
            if (end - c >= 3) {
              const cells = [];
              for (let i = c; i < end; i++) cells.push([r, i]);
              runs.push({ dir: 'h', type: t, cells });
            }
          }
          c = end;
        }
      }
      for (let c = 0; c < this.cols; c++) {
        let r = 0;
        while (r < this.rows) {
          const t = typeAt(r, c);
          let end = r + 1;
          if (t !== BOMB) {
            while (end < this.rows && typeAt(end, c) === t) end++;
            if (end - r >= 3) {
              const cells = [];
              for (let i = r; i < end; i++) cells.push([i, c]);
              runs.push({ dir: 'v', type: t, cells });
            }
          }
          r = end;
        }
      }
      return runs;
    }

    swap(p1, p2) {
      const a = this.cells[p1[0]][p1[1]];
      this.cells[p1[0]][p1[1]] = this.cells[p2[0]][p2[1]];
      this.cells[p2[0]][p2[1]] = a;
    }

    // A swap of two specials (or anything with a color bomb) fires a combo
    // even when it makes no ordinary match.
    isComboSwap(p1, p2) {
      const a = this.get(p1[0], p1[1]);
      const b = this.get(p2[0], p2[1]);
      if (!a || !b) return false;
      return a.special === 'bomb' || b.special === 'bomb' || (a.special !== null && b.special !== null);
    }

    isValidSwap(p1, p2) {
      if (!this.inBounds(p1[0], p1[1]) || !this.inBounds(p2[0], p2[1]) || !isAdjacent(p1, p2)) return false;
      if (!this.get(p1[0], p1[1]) || !this.get(p2[0], p2[1])) return false;
      if (this.isComboSwap(p1, p2)) return true;
      this.swap(p1, p2);
      const ok = this.findRuns().length > 0;
      this.swap(p1, p2);
      return ok;
    }

    // First legal move found, or null when the board is stuck.
    findMove() {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          for (const [dr, dc] of [[0, 1], [1, 0]]) {
            const p1 = [r, c];
            const p2 = [r + dr, c + dc];
            if (this.isValidSwap(p1, p2)) return [p1, p2];
          }
        }
      }
      return null;
    }

    // Color with the most candies on the board; what a color bomb targets
    // when another special sets it off.
    mostCommonType() {
      const counts = new Array(this.types).fill(0);
      for (const row of this.cells) {
        for (const cell of row) if (cell && cell.type !== BOMB) counts[cell.type]++;
      }
      return counts.indexOf(Math.max(...counts));
    }

    cellsOfType(type) {
      const out = [];
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const cell = this.cells[r][c];
          if (cell && cell.type === type) out.push([r, c]);
        }
      }
      return out;
    }

    area(r0, c0, r1, c1) {
      const out = [];
      for (let r = Math.max(0, r0); r <= Math.min(this.rows - 1, r1); r++) {
        for (let c = Math.max(0, c0); c <= Math.min(this.cols - 1, c1); c++) out.push([r, c]);
      }
      return out;
    }

    // Cells a special candy destroys when it goes off.
    effectCells(r, c, candy) {
      switch (candy.special) {
        case 'row': return this.area(r, 0, r, this.cols - 1);
        case 'col': return this.area(0, c, this.rows - 1, c);
        case 'wrap': return this.area(r - 1, c - 1, r + 1, c + 1);
        case 'bomb': return this.cellsOfType(this.mostCommonType());
        default: return [];
      }
    }

    // Clear the given cells, chaining through any specials hit along the way.
    // Specials whose keys are in `skipTrigger` are removed without firing
    // (used for swapped combos, whose effect is already in `initial`).
    clearCells(initial, skipTrigger = new Set()) {
      const cleared = new Map();
      const triggered = [];
      const queue = initial.slice();
      while (queue.length) {
        const [r, c] = queue.shift();
        if (!this.inBounds(r, c)) continue;
        const k = this.key(r, c);
        if (cleared.has(k)) continue;
        const candy = this.cells[r][c];
        if (!candy) continue;
        cleared.set(k, { r, c, candy });
        if (candy.special && !skipTrigger.has(k)) {
          triggered.push({ r, c, candy });
          for (const p of this.effectCells(r, c, candy)) queue.push(p);
        }
      }
      for (const { r, c } of cleared.values()) this.cells[r][c] = null;
      return { cleared: [...cleared.values()], triggered };
    }

    // Fire a special combo for a swap that was just made (p2 is where the
    // moved candy landed). Returns null if the swap is not a combo.
    activateSwap(p1, p2) {
      if (!this.isComboSwap(p1, p2)) return null;
      const a = this.get(p1[0], p1[1]);
      const b = this.get(p2[0], p2[1]);
      const [r, c] = p2;
      const skip = new Set([this.key(p1[0], p1[1]), this.key(p2[0], p2[1])]);
      let initial = [p1, p2];

      if (a.special === 'bomb' && b.special === 'bomb') {
        initial = this.area(0, 0, this.rows - 1, this.cols - 1);
      } else if (a.special === 'bomb' || b.special === 'bomb') {
        const other = a.special === 'bomb' ? b : a;
        const targets = this.cellsOfType(other.type);
        // Bomb + striped/wrapped turns every candy of that color into the
        // same special, and they all go off.
        if (other.special) {
          for (const [tr, tc] of targets) {
            const cur = this.cells[tr][tc];
            if (cur === other) continue;
            let special = other.special;
            if (special === 'row' || special === 'col') special = this.rng() < 0.5 ? 'row' : 'col';
            this.cells[tr][tc] = this.candy(cur.type, special);
          }
        }
        initial = initial.concat(targets);
      } else {
        const kinds = [a.special, b.special];
        const striped = kinds.filter((s) => s === 'row' || s === 'col').length;
        const wrapped = kinds.filter((s) => s === 'wrap').length;
        if (striped === 2) {
          initial = initial.concat(this.area(r, 0, r, this.cols - 1), this.area(0, c, this.rows - 1, c));
        } else if (striped === 1 && wrapped === 1) {
          initial = initial.concat(this.area(r - 1, 0, r + 1, this.cols - 1), this.area(0, c - 1, this.rows - 1, c + 1));
        } else {
          initial = initial.concat(this.area(r - 2, c - 2, r + 2, c + 2));
        }
      }
      const result = this.clearCells(initial, skip);
      return { ...result, created: [] };
    }

    // Clear every current match, creating special candies for big matches.
    // `focus` are preferred positions for new specials (the swapped cells).
    // Returns null when there is nothing to match.
    resolveMatches(focus = []) {
      const runs = this.findRuns();
      if (!runs.length) return null;

      const focusKeys = new Set(focus.map(([r, c]) => this.key(r, c)));
      const pickPos = (cells) => {
        const hit = cells.find(([r, c]) => focusKeys.has(this.key(r, c)));
        return hit || cells[Math.floor((cells.length - 1) / 2)];
      };

      const cellRuns = new Map();
      runs.forEach((run, i) => {
        for (const [r, c] of run.cells) {
          const k = this.key(r, c);
          if (!cellRuns.has(k)) cellRuns.set(k, []);
          cellRuns.get(k).push(i);
        }
      });

      const used = new Set();
      const creations = [];
      // 5 in a line -> color bomb
      runs.forEach((run, i) => {
        if (run.cells.length >= 5) {
          used.add(i);
          const [r, c] = pickPos(run.cells);
          creations.push({ r, c, type: BOMB, special: 'bomb' });
        }
      });
      // L / T shape -> wrapped candy at the crossing
      for (const [k, idxs] of cellRuns) {
        if (idxs.length >= 2 && idxs.every((i) => !used.has(i))) {
          idxs.forEach((i) => used.add(i));
          creations.push({ r: Math.floor(k / this.cols), c: k % this.cols, type: runs[idxs[0]].type, special: 'wrap' });
        }
      }
      // 4 in a line -> striped candy (a horizontal match clears a column)
      runs.forEach((run, i) => {
        if (!used.has(i) && run.cells.length === 4) {
          used.add(i);
          const [r, c] = pickPos(run.cells);
          creations.push({ r, c, type: run.type, special: run.dir === 'h' ? 'col' : 'row' });
        }
      });

      const initial = [];
      for (const run of runs) initial.push(...run.cells);
      const result = this.clearCells(initial);

      const created = creations.map(({ r, c, type, special }) => {
        const candy = this.candy(type, special);
        this.cells[r][c] = candy;
        return { r, c, candy };
      });
      return { ...result, created };
    }

    // Drop candies into the gaps and refill from the top. Returns a map of
    // new candy id -> the (negative) row it should fall in from.
    collapse() {
      const spawns = new Map();
      for (let c = 0; c < this.cols; c++) {
        let write = this.rows - 1;
        for (let r = this.rows - 1; r >= 0; r--) {
          const cell = this.cells[r][c];
          if (!cell) continue;
          if (r !== write) {
            this.cells[write][c] = cell;
            this.cells[r][c] = null;
          }
          write--;
        }
        const missing = write + 1;
        for (let r = write; r >= 0; r--) {
          const candy = this.candy(this.randomType());
          this.cells[r][c] = candy;
          spawns.set(candy.id, r - missing);
        }
      }
      return spawns;
    }

    // Rearrange the existing candies until there are no matches and at least
    // one move. Falls back to a fresh board if that keeps failing.
    shuffle() {
      const all = [];
      for (const row of this.cells) for (const cell of row) all.push(cell);
      for (let attempt = 0; attempt < 200; attempt++) {
        for (let i = all.length - 1; i > 0; i--) {
          const j = Math.floor(this.rng() * (i + 1));
          [all[i], all[j]] = [all[j], all[i]];
        }
        for (let r = 0; r < this.rows; r++) {
          for (let c = 0; c < this.cols; c++) this.cells[r][c] = all[r * this.cols + c];
        }
        if (!this.findRuns().length && this.findMove()) return;
      }
      this.fill();
    }
  }

  const api = { Board, createRng, isAdjacent, NUM_TYPES, BOMB };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Match3 = api;
})(typeof window !== 'undefined' ? window : globalThis);
