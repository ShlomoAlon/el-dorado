# The three looks (Brass, Jungle, Water), kept for the theme

Made in the old design editor (2026-10-05), removed with it the same day. The owner wants them kept, to become presets of
the theme later (owner, 2026-10-05: "we're going to want to save somewhere else so we can eventually move them into
themes"). Nothing here is loaded by the site.

- `looks.css`: the looks as they were, copied from the old editor. Each look is a set of `--k-*` tokens on
  `html[data-edcolors=b|c|d]` (b Brass, c Jungle, d Water), three accent choices each (`data-edacc="1|2|3"`), and rules on
  `html[data-edlook]` that restyle the page's parts from those tokens. Six tuning rows each change one thing, whatever the
  look: accent (`data-edacc`), headings (`data-edhd`), ornament (`data-edorn`), corners (`data-edcor`), main button
  (`data-edpri`), board backdrop (`data-edbg`).
- `*-menu.jpg`, `*-game.jpg`: each look with its own settings, at the owner's 1536×639 at 125%.

Each look's own settings (what the tuning rows started at):

| Look | Accents (1, 2, 3) | Headings | Ornament | Corners | Main button | Board backdrop |
|---|---|---|---|---|---|---|
| Brass (b): the expedition kit | Polished gold, Aged bronze, Copper | serif | framed | brass (9/14/8 px) | metal | tinted |
| Jungle (c): a field notebook | Lime, Emerald, Orchid | italic serif | textured | leaf (uneven corners) | solid | tinted |
| Water (d): a river chart | Signal cyan, Deep teal, Coral | capitals | framed | sharp | flat | tinted |

The other values of each row: headings serif / italic serif / capitals; ornament plain / textured / framed; corners soft /
round / sharp (plus each look's own); main button metal / solid / flat / outlined; board backdrop tinted / neutral.

To make one a theme preset: map its `--k-*` tokens onto the theme's tokens (shell.html's first `:root`: `--panel`,
`--well`, `--line`, `--text`, `--muted`, `--gold`/`--gold2`, `--priA`/`--priB`/`--priEdge`, `--r-*`), and turn the rule-level
differences (the rule line after a field's label, the underlined tabs, the framed ornament, heading styles) into theme
variants of the parts.
