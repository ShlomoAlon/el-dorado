/* UI icons: Lucide (https://lucide.dev, ISC licence, © Lucide contributors), vendored: only the icons the page uses, as inline
   SVG (24×24, 2 stroke, round caps and joins). Every control uses this set; no Unicode glyphs as icons.
   Game symbols (machete, paddle, coin, joker) are not here: they are the cards' own art (shell.html <symbol>s).
   build.mjs writes the static ones into the page (<!--I:name-->); scripts call ico(name). Name → Lucide icon in the comments. */
const VOL = '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/>';
const CCW = '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>';
export const ICONS = {
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>', // plus
  minus: '<path d="M5 12h14"/>', // minus
  fit: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect width="10" height="8" x="7" y="8" rx="1"/>', // fullscreen
  full: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>', // maximize
  unfull: '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>', // minimize
  sound: VOL + '<path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>', // volume-2
  mute: VOL + '<line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>', // volume-x
  history: CCW + '<path d="M12 7v5l4 2"/>', // history
  home: CCW, // rotate-ccw
  grip: '<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>', // grip-vertical
  resize: '<polyline points="5 11 5 5 11 5"/><polyline points="19 13 19 19 13 19"/><line x1="5" x2="19" y1="5" y2="19"/>', // move-diagonal-2
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', // x
  first: '<polygon points="19 20 9 12 19 4 19 20"/><line x1="5" x2="5" y1="19" y2="5"/>', // skip-back
  prevTurn: '<path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/>', // chevrons-left
  prev: '<path d="m15 18-6-6 6-6"/>', // chevron-left
  play: '<polygon points="6 3 20 12 6 21 6 3"/>', // play
  pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>', // pause
  next: '<path d="m9 18 6-6-6-6"/>', // chevron-right
  nextTurn: '<path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/>', // chevrons-right
  last: '<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/>', // skip-forward
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>', // arrow-right
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>', // star
  check: '<path d="M20 6 9 17l-5-5"/>', // check
};
export const ico = (n, s = 16, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;
