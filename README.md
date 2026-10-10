# Game_ahh
Recent trend for candy crush

**Sugar Rush** is a Candy Crush-style match-3 game written in plain HTML, CSS and JavaScript. It has no dependencies and no build step.

## Play

Open `index.html` in any modern browser, on desktop or mobile.

- Swipe a candy (or tap it, then tap a neighbour) to swap the two.
- Line up 3 or more of the same candy to clear them. Chain reactions score extra.
- Reach the target score before you run out of moves to clear the level. Moves you have left earn bonus points.
- If you get stuck, press **Hint**. A hint also appears by itself after a few seconds.

### Special candies

| Match | Creates | Effect |
| --- | --- | --- |
| 4 in a line | Striped candy | Clears a whole row or column |
| L or T shape | Wrapped candy | Blows up the 3×3 area around it |
| 5 in a line | Color bomb | Swap it with a candy to clear every candy of that color |

Swapping two special candies together sets off a combo. Two striped candies clear a cross, a striped and a wrapped candy clear three rows and three columns, and two wrapped candies clear a 5×5 area. A color bomb swapped with a striped or wrapped candy turns every candy of that color into the same special.

## Project layout

- `index.html`: the page
- `style.css`: the look, including the candy shapes and animations
- `src/board.js`: game rules (matching, specials, gravity, shuffling), with no DOM code
- `src/main.js`: rendering, input, scoring and levels
- `tests/board.test.js`: tests for the game rules

## Tests

```sh
npm test
```

This needs Node.js 18 or newer and installs nothing.
