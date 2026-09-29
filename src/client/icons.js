/* UI icons: one drawn set (20×20, 1.8 stroke, round caps and joins: the style of the History, sound and full-screen icons),
   used for every control. No Unicode glyphs as icons (they take the system font's weight and metrics).
   Game symbols (machete, paddle, coin, joker) are not here: they are the cards' own art (shell.html <symbol>s).
   build.mjs writes the static ones into the page (<!--I:name-->); scripts call ico(name). */
const F = 'fill="currentColor"';
export const ICONS = {
  plus: '<path d="M10 4.5v11M4.5 10h11"/>',
  minus: '<path d="M4.5 10h11"/>',
  fit: '<path d="M3 6.5V3h3.5M13.5 3H17v3.5M17 13.5V17h-3.5M6.5 17H3v-3.5"/><path d="M10 6.2l3.3 1.9v3.8L10 13.8l-3.3-1.9V8.1z"/>',
  close: '<path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/>',
  first: `<path d="M5 4.5v11"/><path ${F} d="M15.5 5v10L8.5 10z"/>`,
  prevTurn: '<path d="M10 5 5 10l5 5M16 5l-5 5 5 5"/>',
  prev: '<path d="M12.5 5 7.5 10l5 5"/>',
  play: `<path ${F} d="M6.5 4.3v11.4L16 10z"/>`,
  pause: '<path stroke-width="2.4" d="M7.3 5v10M12.7 5v10"/>',
  next: '<path d="M7.5 5l5 5-5 5"/>',
  nextTurn: '<path d="M4 5l5 5-5 5M10 5l5 5-5 5"/>',
  last: `<path d="M15 4.5v11"/><path ${F} d="M4.5 5v10l7-5z"/>`,
  arrow: '<path d="M3.5 10h12M11.5 6l4 4-4 4"/>',
  star: `<path ${F} d="M10 2.8l2.1 4.6 5 .5-3.8 3.4 1.1 4.9L10 13.7l-4.4 2.5 1.1-4.9L2.9 7.9l5-.5z"/>`,
  check: '<path d="M4.5 10.5l3.5 3.5 7.5-8"/>',
};
export const ico = (n, s = 16, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 20 20" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;
