'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { Board, createRng, BOMB } = require('../src/board.js');

// Build a board from a grid of type numbers (letters for specials:
// R/C = striped row/col, W = wrapped, B = bomb, followed by the color digit).
function boardFrom(grid, seed = 1) {
  const board = new Board({ rows: grid.length, cols: grid[0].split(' ').length, rng: createRng(seed) });
  board.cells = grid.map((row) =>
    row.split(' ').map((tok) => {
      if (tok === '.') return null;
      if (tok === 'B') return board.candy(BOMB, 'bomb');
      const special = { R: 'row', C: 'col', W: 'wrap' }[tok[0]] || null;
      return board.candy(Number(special ? tok.slice(1) : tok), special);
    })
  );
  return board;
}

function countCandies(board) {
  return board.cells.flat().filter(Boolean).length;
}

test('a new board has no matches and at least one move', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const board = new Board({ rng: createRng(seed) });
    assert.strictEqual(board.findRuns().length, 0, `seed ${seed} starts with a match`);
    assert.ok(board.findMove(), `seed ${seed} has no move`);
    assert.strictEqual(countCandies(board), 64);
  }
});

test('findRuns finds horizontal and vertical runs', () => {
  const board = boardFrom([
    '0 0 0 1',
    '2 3 4 1',
    '3 4 5 1',
    '4 5 0 2',
  ]);
  const runs = board.findRuns();
  assert.strictEqual(runs.length, 2);
  assert.deepStrictEqual(runs.find((r) => r.dir === 'h').cells, [[0, 0], [0, 1], [0, 2]]);
  assert.deepStrictEqual(runs.find((r) => r.dir === 'v').cells, [[0, 3], [1, 3], [2, 3]]);
});

test('swaps are only valid when they make a match', () => {
  const board = boardFrom([
    '0 0 1 0',
    '2 3 4 5',
    '3 4 5 2',
    '4 5 2 3',
  ]);
  assert.ok(board.isValidSwap([0, 2], [0, 3]));
  assert.ok(!board.isValidSwap([1, 0], [1, 1]));
  assert.ok(!board.isValidSwap([0, 0], [2, 0]), 'non-adjacent swap');
  // the check must leave the board untouched
  assert.strictEqual(board.get(0, 2).type, 1);
});

test('matching 4 in a row makes a striped candy at the swapped cell', () => {
  const board = boardFrom([
    '0 0 1 0 2',
    '2 3 0 4 5',
    '3 4 5 2 3',
  ]);
  board.swap([0, 2], [1, 2]);
  const result = board.resolveMatches([[0, 2], [1, 2]]);
  assert.strictEqual(result.created.length, 1);
  const { r, c, candy } = result.created[0];
  assert.deepStrictEqual([r, c], [0, 2]);
  assert.strictEqual(candy.special, 'col');
  assert.strictEqual(candy.type, 0);
  assert.strictEqual(board.get(0, 2), candy);
  assert.strictEqual(board.get(0, 0), null);
});

test('matching 5 in a row makes a color bomb', () => {
  const board = boardFrom([
    '0 0 0 0 0',
    '2 3 4 5 1',
  ]);
  const result = board.resolveMatches();
  assert.strictEqual(result.created[0].candy.special, 'bomb');
});

test('an L shape makes a wrapped candy at the corner', () => {
  const board = boardFrom([
    '0 0 0 1',
    '0 3 4 5',
    '0 4 5 2',
    '1 5 2 3',
  ]);
  const result = board.resolveMatches();
  assert.strictEqual(result.created.length, 1);
  assert.deepStrictEqual([result.created[0].r, result.created[0].c], [0, 0]);
  assert.strictEqual(result.created[0].candy.special, 'wrap');
});

test('a striped candy in a match clears its whole row', () => {
  const board = boardFrom([
    '1 2 3 4 5',
    'R0 0 0 4 5',
    '2 3 4 5 1',
  ]);
  const result = board.resolveMatches();
  assert.strictEqual(result.triggered.length, 1);
  for (let c = 0; c < 5; c++) assert.strictEqual(board.get(1, c), null);
  assert.ok(board.get(0, 0));
});

test('swapping a color bomb clears every candy of that color', () => {
  const board = boardFrom([
    'B 1 2 1',
    '3 4 1 5',
    '1 2 3 4',
  ]);
  const result = board.activateSwap([0, 0], [0, 1]);
  assert.ok(result);
  for (const row of board.cells) for (const cell of row) assert.ok(!cell || cell.type !== 1);
  // 4 candies of color 1 plus the bomb
  assert.strictEqual(result.cleared.length, 5);
});

test('two striped candies swapped clear a row and a column', () => {
  const board = boardFrom([
    '1 2 3 4',
    '2 R0 C1 5',
    '3 4 5 1',
    '4 5 1 2',
  ]);
  board.swap([1, 1], [1, 2]);
  const result = board.activateSwap([1, 1], [1, 2]);
  assert.strictEqual(result.cleared.length, 4 + 4 - 1);
  for (let c = 0; c < 4; c++) assert.strictEqual(board.get(1, c), null);
  for (let r = 0; r < 4; r++) assert.strictEqual(board.get(r, 2), null);
});

test('collapse drops candies down and refills from the top', () => {
  const board = boardFrom([
    '1 2',
    '. 3',
    '. .',
  ]);
  const top = board.get(0, 0);
  const spawns = board.collapse();
  assert.strictEqual(board.get(2, 0), top);
  assert.strictEqual(countCandies(board), 6);
  assert.strictEqual(spawns.size, 3);
  // new candies start above the board, the top-most one highest
  assert.deepStrictEqual([...spawns.values()].sort(), [-1, -1, -2].sort());
});

test('shuffle keeps the same candies and leaves a playable board', () => {
  const board = new Board({ rng: createRng(7) });
  const ids = board.cells.flat().map((c) => c.id).sort();
  board.shuffle();
  assert.deepStrictEqual(board.cells.flat().map((c) => c.id).sort(), ids);
  assert.strictEqual(board.findRuns().length, 0);
  assert.ok(board.findMove());
});

test('a long random game never loses candies or gets stuck', () => {
  const rng = createRng(42);
  const board = new Board({ rng });
  for (let move = 0; move < 300; move++) {
    const [p1, p2] = board.findMove();
    board.swap(p1, p2);
    let result = board.activateSwap(p1, p2);
    if (result) board.collapse();
    let first = true;
    while ((result = board.resolveMatches(first ? [p1, p2] : []))) {
      first = false;
      board.collapse();
    }
    assert.strictEqual(countCandies(board), 64);
    assert.strictEqual(board.findRuns().length, 0);
    if (!board.findMove()) board.shuffle();
  }
});
