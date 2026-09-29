# Design rules (read before adding or changing UI)

The game objects (board, cards, explorer figures) are the character. The chrome around them (HUD, menus, panels, buttons)
is quiet and consistent. Every value comes from the tokens at the top of `src/client/shell.html` (`:root`, between
`/*TOKENS*/` and `/*END TOKENS*/`); new UI never invents its own.

## Tokens

| kind | tokens | use |
|---|---|---|
| surfaces | `--bg` < `--surface-sunk` < `--surface-raised` < `--surface` < `--surface-on` | page · inputs, lists, segmented tracks · small buttons · dialogs · the selected segment |
| floating panels | `--glass`, `--glass2` (hover) | anything over the board (opaque: no `backdrop-filter`) |
| lines | `--line` (dividers), `--line2` (control borders) | |
| text | `--text`, `--text2` (long text), `--muted`, `--faint` | |
| accent | `--gold` (fills, borders), `--gold2` (text, highlights), `--goldInk` (text on gold), `--gold-hi/lo/rim` (the primary button) | gold means "you can act on this" |
| states | `--ok`/`--okInk` (can buy), `--danger`/`--dangerText`, `--warn`, `--neg`, `--camp`, `--easy/medium/hard` | never a player colour |
| type | `--fs-s 12` `--fs-m 14` `--fs-l 16` `--fs-xl 20` `--fs-2xl 28` `--fs-3xl 40` | Figtree for UI, Young Serif (`--display`) for titles |
| space | `--sp-1 4` `--sp-2 8` `--sp-3 16` `--sp-4 24` `--sp-5 32` | gaps and padding |
| control heights | `--h-s 36` (HUD, lists), `--h-m 44` (main actions, touch) | |
| radii | `--r-xs 4` (tags) `--r-sm 8` (small controls) `--r-md 10` (controls, rows) `--r-lg 12` (panels) `--r-xl 18` (dialogs) `--r-full` | |
| motion | `--ease`, 0.12–0.45 s, `transform`/`opacity` only | respect `prefers-reduced-motion` |

Art keeps its own colours: card faces (`.k-*`, `.c-*`, `.cface`), the deck back, the board (`board/`), `art.js`, `meeple.js`.

## Never

- **No raw values in new CSS**: no hex colours, no `px` font sizes, no radii outside the tokens. (Existing half sizes such as
  10.5 / 11.5 / 12.5 / 13.5 px are legacy: fold them into the scale when that screen is next redesigned, checking the layout.)
- **No inline styles.** Markup in scripts uses classes; data that styling needs (a player's colour, a bar's share, a position in
  board units) is passed as a custom property: `style="--pc:${color}"`, and the CSS uses `var(--pc)`.
- **No Unicode glyphs as icons** (`✕ ▶ ⤢ ★ ‹ ›` …): use the SVG icon set.
- **No letter-spaced uppercase labels below 12 px.** Labels are sentence case.
- **No native-looking form controls**: radios, selects and checkboxes are styled (segmented buttons, cards, swatches).
- **No glows** (coloured box-shadows) as a state; use a border or fill from the tokens.
- **No `backdrop-filter`** over the board, no CSS variables set on `#app` at runtime, no `:has()` on `#app` (see CLAUDE.md).
- **No new UI floating over other controls**: give it a grid cell or a clearance variable (CLAUDE.md, Layout).
