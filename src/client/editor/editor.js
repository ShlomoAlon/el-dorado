/* The design editor (owner, 2026-10-05): a mockup tool, loaded only from a link with ?edit (main.js); a page without it never
   fetches this file, so it costs nothing. It changes only this browser's view. Deliberately small (owner: more choice was
   decision paralysis); each part answers one question:
   - Layout: where does each thing go on this screen? Blocks moved on a fixed grid, a third, half or the whole width, hidden,
     tucked behind "More options", or put in the screen's top or bottom bar (each stays at its edge while the content
     scrolls under it), or deleted; any text changed (a double-click, then type); a list that scrolls shown whole or cut to
     its first few, so the screen scrolls instead; a button made one of the page's own kinds (Main, Plain, Link). How
     anything looks is not chosen here.
   - Flow: how does the player get from one menu to another? One flowchart: a box is a menu in one of the three states the
     player can be in (nowhere, in a game, in a room: always exactly one), laid out on its own; an arrow is a button on it or
     something that happens, to another box (another menu, another state, or both); ★ is where the menu opens in a state.
     It starts from a default flowchart, a proposal to change.
   - Options: how it looks, as a few sets to flip between (button colours, button shapes, headings); each set is
     designed, not adjusted here. Also game features to try out (how a reshuffle shows): the page's own, off unless set here.
   - Export: the design downloaded as a file (and loaded from one) for the owner to send; it is built into the page
     properly afterwards. Nothing here ships as the page's own. */
const ED = window.__ED, KEY = 'eldorado-design', $ = s => document.querySelector(s), form = $('#mform');
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } }; // (expected: storage off, or an old text)
const fresh = () => ({ v: 5, options: {}, screens: {}, extra: [], nodes: null, arrows: null, first: {} });
const D = (d => d && d.v === 5 ? d : d && d.v === 4 ? from4(d) : fresh())(load()); // (a design from an older editor: started afresh)
/* a design from the editor before the flowchart (v4): each screen's layout becomes that menu's in the state it belonged to, and
   each button made to go to a screen an arrow; the default flowchart is added around them */
function from4(d) { const st = sc => d.states[sc] || (sc === 'room' ? 'room' : 'none'), screens = {}, arrows = [];
  for (const [sc, c] of Object.entries(d.screens)) { const blocks = {};
    for (const [k, b] of Object.entries(c.blocks)) { if (!b.go) { blocks[k] = b; continue; } const id = 'v' + arrows.length, { go, label, ...rest } = b;
      arrows.push({ id, from: sc + '@' + st(sc), to: go + '@' + st(go), label, kind: 'button' }); blocks['go:' + id] = rest; }
    screens[sc + '@' + st(sc)] = { ...c, blocks }; }
  return { v: 5, options: d.options, screens, extra: d.extra, nodes: null, arrows, first: d.first }; }
const COLS = 6, WIDTHS = [[2, 'Third'], [3, 'Half'], [6, 'Full']];
/* a button's kind: one of the page's own (its looks are designed, not chosen here): Main (gold), Plain, Link (underlined words) */
const KINDS = [['pri', 'Main'], ['plain', 'Plain'], ['link', 'Link']];
const kindOf = el => el.classList.contains('linkbtn') ? 'link' : el.classList.contains('pri') ? 'pri' : 'plain';
function setKind(el, k) { if (!el.matches('button')) return; if (el.__kind === undefined) el.__kind = [kindOf(el), el.classList.contains('big')]; // (the page's own: back when unset)
  const [k0, big] = el.__kind; k = k || k0; el.classList.toggle('btn', k !== 'link'); el.classList.toggle('pri', k === 'pri'); el.classList.toggle('linkbtn', k === 'link'); el.classList.toggle('big', big && k !== 'link'); }

/* a control's type: one of the few kinds the page styles (owner, 2026-10-05: not each thing styled on its own, a limited set to slot
   between): a yes/no setting as a checkbox or two buttons; a choice of one as a row of buttons, a dropdown, or a list of cards. The
   page's own control stays the one that holds the value: the other kind is drawn beside it (it hidden) and sets it */
const CTYPES = { yesno: [['check', 'Checkbox'], ['two', 'Two buttons']], choice: [['seg', 'Row of buttons'], ['select', 'Dropdown'], ['clist', 'Cards']] };
function ctlOf(el) { if (!el || el.matches('button')) return null; const own = q => [...el.querySelectorAll(q)].filter(x => !x.closest('.ed-alt')), radios = own('input[type=radio]'), sels = own('select'), cbs = own('input[type=checkbox]'); // (not the kind drawn here)
  if (cbs.length === 1 && !radios.length && !sels.length) { const host = cbs[0].closest('label') || cbs[0]; return { kind: 'yesno', own: 'check', host, opts: () => [['0', 'No', !cbs[0].checked], ['1', 'Yes', cbs[0].checked]], set: v => { if (cbs[0].checked !== (v === '1')) cbs[0].click(); } }; }
  if (radios.length > 1 && new Set(radios.map(r => r.name)).size === 1 && !sels.length) { const host = radios[0].closest('.seg, .clist') || radios[0].parentElement.parentElement;
    return { kind: 'choice', own: host.classList.contains('clist') ? 'clist' : 'seg', host, opts: () => radios.map(r => { const l = r.closest('label') || r; return [r.value, ((l.querySelector && l.querySelector('b')) || l).textContent.trim().replace(/\s+/g, ' '), r.checked]; }) /* (a card's title, not all its words) */, set: v => { const r = radios.find(x => x.value === v); if (r && !r.checked) r.click(); } }; }
  if (sels.length === 1 && !radios.length && !cbs.length) { const sl = sels[0]; return { kind: 'choice', own: 'select', host: sl, opts: () => [...sl.options].map(o => [o.value, o.textContent.trim(), o.selected]), set: v => { if (sl.value !== v) { sl.value = v; sl.dispatchEvent(new Event('change', { bubbles: true })); } } }; }
  return null; }
function setCtl(el, t) { const c = ctlOf(el); if (el.__alt && (!c || !t || t === c.own)) { el.__alt.remove(); el.__alt = null; } if (!c) return;
  c.host.classList.toggle('ed-swapped', !!t && t !== c.own); if (!t || t === c.own) return;
  const o = c.opts(), sig = t + '|' + o.map(x => x.join(':')).join('|'); if (el.__alt && el.__alt.__sig === sig) return; // (drawn again only when its options or value changed)
  const alt = t === 'select' ? document.createElement('select') : document.createElement('div'); alt.className = 'ed-alt ' + (t === 'select' ? 'who' : t === 'clist' ? 'clist' : 'seg');
  alt.innerHTML = t === 'select' ? o.map(([v, n, on]) => `<option value="${esc(v)}"${on ? ' selected' : ''}>${esc(n)}</option>`).join('') : o.map(([v, n, on]) => `<button type="button" data-v="${esc(v)}" class="${on ? 'on' : ''}">${t === 'clist' ? `<b>${esc(n)}</b>` : esc(n)}</button>`).join('');
  alt.__set = c.set; alt.__sig = sig; if (el.__alt) el.__alt.replaceWith(alt); else c.host.after(alt); el.__alt = alt; }
addEventListener('click', e => { const b = e.target.closest && e.target.closest('.ed-alt button'); if (!b || editing()) return; e.preventDefault(); b.closest('.ed-alt').__set(b.dataset.v); layout(); }, true);
addEventListener('change', e => { if (e.target.matches && e.target.matches('select.ed-alt')) { e.target.__set(e.target.value); layout(); } }, true);

/* every change is kept (in this browser) and can be undone: Ctrl+Z, Ctrl+Shift+Z, as in any editor */
const snap = () => JSON.stringify(D); let last = snap(), undos = [], redos = [];
const save = () => { const now = snap(); if (now !== last) { undos.push(last); if (undos.length > 200) undos.shift(); redos = []; last = now; }
  try { localStorage.setItem(KEY, now); } catch (e) { /* expected: storage off; the design lives in Export */ } };
function restore(txt) { for (const k of Object.keys(D)) delete D[k]; Object.assign(D, JSON.parse(txt)); last = txt; try { localStorage.setItem(KEY, txt); } catch (e) { /* expected: storage off */ } sel = null; applyOptions(); layout(); }
const undo = () => { if (!undos.length) return; redos.push(last); restore(undos.pop()); }, redo = () => { if (!redos.length) return; undos.push(last); restore(redos.pop()); };

/* ---------- options: sets to flip between ---------- */
const AREAS = [
  { id: 'colors', name: 'Look', options: [['a', 'Current'], ['b', 'Brass'], ['c', 'Jungle'], ['d', 'Water']] },
  // a game feature, not a look: the page's own setting (UI.reshuffle, hand.js), which only this sets until one is chosen
  { id: 'reshuffle', name: 'Reshuffle', options: [['a', 'Current'], ['b', 'Cards fly over'], ['c', 'Fly over, riffle']], set: v => { ED.UI.reshuffle = { a: 'instant', b: 'gather', c: 'riffle' }[v]; } },
];
/* each look tuned: a few rows, each changing one part (the CSS below), each look remembering its own; its first choice is the
   look's own (owner, 2026-10-05: options to play with, to decide which to go with) */
const LOOKS = { b: { acc: ['Polished gold', 'Aged bronze', 'Copper'], hd: 'serif', orn: 'frame', cor: 'brass', pri: 'metal', bg: 'tint' },
  c: { acc: ['Lime', 'Emerald', 'Orchid'], hd: 'italic', orn: 'tex', cor: 'leaf', pri: 'solid', bg: 'tint' },
  d: { acc: ['Signal cyan', 'Deep teal', 'Coral'], hd: 'caps', orn: 'frame', cor: 'sharp', pri: 'flat', bg: 'tint' } };
const TUNE = [{ id: 'acc', name: 'Accent' }, { id: 'hd', name: 'Headings', options: [['serif', 'Serif'], ['italic', 'Italic serif'], ['caps', 'Capitals']] },
  { id: 'orn', name: 'Ornament', options: [['plain', 'Plain'], ['tex', 'Textured'], ['frame', 'Framed']] },
  { id: 'cor', name: 'Corners', options: [['soft', 'Soft'], ['round', 'Round'], ['sharp', 'Sharp']] },
  { id: 'pri', name: 'Main button', options: [['metal', 'Metal'], ['solid', 'Solid'], ['flat', 'Flat'], ['outline', 'Outlined']] },
  { id: 'bg', name: 'Board backdrop', options: [['tint', 'Tinted'], ['plain', 'Neutral']] }];
const tuneOpts = (look, t) => t.id === 'acc' ? LOOKS[look].acc.map((n, i) => [String(i + 1), n]) : [['own', "Look's own"], ...t.options.filter(([v]) => v !== LOOKS[look][t.id])];
const tuned = (look, t) => { const v = D.options[look + '.' + t.id] || (t.id === 'acc' ? '1' : 'own'); return v === 'own' ? LOOKS[look][t.id] : v; };
function applyOptions() { const h = document.documentElement.dataset, look = D.options.colors || 'a';
  for (const a of AREAS) { const v = D.options[a.id] || 'a'; if (a.set) a.set(v); else h['ed' + a.id] = v; }
  if (LOOKS[look]) { h.edlook = look; for (const t of TUNE) h['ed' + t.id] = tuned(look, t); } else { delete h.edlook; for (const t of TUNE) delete h['ed' + t.id]; }
  ED.render(); }

/* ---------- the flowchart (owner, 2026-10-05) ----------
   The player is always in one state (nowhere, in a game, in a room, or one added here). A box is a menu as it is in one state, or
   in any state: the start menu nowhere and the same menu in a game are one menu that looks different, so each box is laid out
   on its own. A transition is what takes the player from a menu to another box: its words (a button or something that happens:
   the same thing here), the states of its menu it applies to (one, several, or any), where it goes (a menu in a state, or in the
   same state) and a note. The chart draws it from each of its states' boxes. The default flowchart is a proposal (owner: "design
   a flowchart that you think makes sense"), not the page as it is: a menu it names that the page hasn't got is a blank screen to
   lay out, on which its transitions are buttons */
/* the states: the page's three (renamable here) and any added here (a state only the design has: laid out from the flowchart) */
const STATE0 = [['none', 'Nowhere'], ['game', 'In a game'], ['room', 'In a room']];
const STATES = { [Symbol.iterator]: function* () { const nm = D.stateNames || {}; for (const [v, n] of STATE0) yield [v, nm[v] || n]; for (const v of D.moreStates || []) yield [v, nm[v] || v]; } };
const stLabel = st => st === '*' ? 'Any state' : ([...STATES].find(([v]) => v === st) || [st, st])[1]; // (*: any state; a transition to it keeps the state)
const NOLAY = ['board', 'viewer', 'site', '*']; // (no menu: the game, a replay, the way in, any menu (a rule for every menu: '*'))
const NAMES = { setup: 'New game', online: 'Online', replays: 'Replays', room: 'Game lobby', board: 'Board', viewer: 'Replay viewer', main: 'Main menu', results: 'Results', settings: 'Settings', rules: 'Rules', leaderboard: 'Leaderboard', profile: 'Profile', site: 'Way in', title: 'Title', '*': 'Any menu' };
const nameOf = m => (D.names && D.names[m]) || NAMES[m] || m; // (a menu renamed here: D.names)
/* what a transition changes, read from its ends (never stored, so it can't disagree with them): the menu, the state, or both */
function changes(a) { const [tm, ts] = a.to.split('@'), menu = a.from !== tm, state = ts !== '*' && a.states.some(s => s !== ts);
  return menu && state ? 'menu + state' : state ? 'state' : menu ? 'menu' : 'nothing'; }
/* the default: one way in (owner, 2026-10-05: opening the site, reloading, or leaving and coming back always lands on the same
   menu, which looks different in each state), so the main menu has a box in every state and is where the menu opens in each */
const SEED = { extra: ['main', 'results', 'settings', 'rules', 'leaderboard', 'profile'], first: { none: 'main', game: 'main', room: 'main' },
  nodes: [['site@*', -160, 230], ['main@none', 250, 60], ['main@game', 250, 230], ['main@room', 250, 400],
    ['online@none', 540, 110], ['replays@none', 820, 0], ['viewer@none', 1100, 0],
    ['board@game', 540, 230], ['results@none', 820, 230], ['room@room', 540, 400], ['*@game', 820, 115]],
  arrows: [['site', '*', 'main@*', 'Open the site, or come back', 'Reloading keeps the player exactly where they were: this is a new visit, or a return after leaving'],
    // (a game on this device is a room nobody else joins: the same lobby, the same choices (owner, 2026-10-05); one state at a time,
    // so a new game or room is only reached from nowhere: a game or a room is left first)
    ['main', 'none', 'room@room', 'Play on this device', 'A room only this device is in: the same lobby as online'], ['main', 'none', 'online@none', 'Play online', 'Signed in first: otherwise it says to sign in', { signed: true }], ['main', 'none', 'replays@none', 'Replays'],
    ['online', 'none', 'main@none', 'Back'], ['online', 'none', 'room@room', 'Quick match'], ['online', 'none', 'room@room', 'Create a room'], ['online', 'none', 'room@room', 'Join with a code'],
    ['online', 'none', 'room@room', 'Join an open room'],
    // (Online is for finding and playing games online; the leaderboard and profiles are the Main menu's, owner 2026-10-05)
    ['main', '*', 'leaderboard@*', 'Leaderboard'], ['main', '*', 'profile@*', 'Profile', null, { signed: true }], ['leaderboard', '*', 'main@*', 'Back'],
    ['leaderboard', '*', 'profile@*', 'A player', 'Their profile'], ['profile', '*', 'main@*', 'Back'],
    // (no "resume" nor "rejoin": a game not finished is a game the player is still in, reached by Back to game, owner 2026-10-05)
    ['main', '*', 'rules@*', 'Rules'], ['rules', '*', 'main@*', 'Back'],
    ['results', 'none', 'room@room', 'Play again', 'The same players and course, in a new lobby'],
    ['replays', 'none', 'main@none', 'Back'], ['replays', 'none', 'viewer@none', 'Open a game'], ['viewer', 'none', 'replays@none', 'Close'],
    ['main', 'game', 'board@game', 'Back to game'], ['main', 'game', 'results@none', 'End game · Resign'], ['board', 'game', 'main@game', 'Menu'], ['board', 'game', 'results@none', 'The race is won'],
    ['results', 'none', 'main@none', 'Done'], ['results', 'none', 'viewer@none', 'Watch the replay'],
    ['main', 'room', 'room@room', 'Back to the room'], ['main', 'room', 'main@none', 'Leave the room'], ['room', 'room', 'main@room', 'Menu'], ['room', 'room', 'board@game', 'Start game', null, { host: true }], ['room', 'room', 'main@none', 'Leave'],
    ['main', '*', 'settings@*', 'Settings'], ['settings', '*', 'main@*', 'Back'],
    ['*', 'game', 'board@game', 'Click beside the menu', 'A rule for every menu, only in a game: a click outside the menu goes back to the game']] };
// a box for each place a transition starts or ends (each made below the others: drag it where it belongs)
const boxFor = k => { if (!D.nodes.some(n => n.k === k)) D.nodes.push({ k, x: 0, y: Math.max(0, ...D.nodes.map(n => n.y)) + 100 }); };
// a menu's own buttons, which change something on it and lead nowhere (owner, 2026-10-05: "buttons that aren't transitions ... like
// settings"): its words, the states it is in, a note
/* conditions: facts besides the state (one at a time) that a transition or button can require true or false, so it can depend on
   "this, this and not this" (owner, 2026-10-05): renamable, more added here */
SEED.flags = [['signed', 'Signed in'], ['online', 'An online room'], ['host', 'Hosting the room']];
const flagName = id => (D.flags.find(f => f.id === id) || { name: id }).name;
const whenText = x => Object.entries(x.when || {}).map(([id, on]) => (on ? '' : 'not ') + flagName(id).toLowerCase()).join(', '); // ("hosting the room, not signed in")
SEED.buttons = [['settings', 'Sound on / off'], ['settings', 'Remind me before ending a turn if I can still buy'], ['settings', 'Animation speed'], ['settings', 'Full screen'],
  ['main', 'Sign in with Google · Sign out', 'The one place to sign in'],
  ['room', 'Players: 2 · 3 · 4'], ['room', 'Seats: a person or an AI, a name, a colour'], ['room', 'Course'], ['room', 'Game ends: when all but one arrive · at the first arrival'],
  ['room', 'Hide each hand until its player taps Reveal', 'For passing one device around'], ['room', 'Rated · Unrated', null, { online: true }], ['room', 'Turn clock: 60 s · 90 s · 2 min · 3 min', null, { online: true }],
  ['room', 'Public · Private', null, { online: true }], ['room', 'Copy the room link', null, { online: true }], ['profile', 'Display name'], ['profile', 'Save'], ['replays', 'Your games · Recent games'],
  ['viewer', 'Play · Pause'], ['viewer', 'Back a move · Forward a move'], ['viewer', 'Speed'], ['viewer', "Fawcett's recommended turn"]];
function seed() {
  if (!D.nodes) { D.nodes = SEED.nodes.map(([k, x, y]) => ({ k, x, y })); D.buttons = SEED.buttons.map(([menu, label, note, when], i) => ({ id: 'sb' + i, menu, states: ['*'], label, ...(note ? { note } : {}), ...(when ? { when } : {}) }));
    D.arrows = [...SEED.arrows.map(([from, st, to, label, note, when], i) => ({ id: 's' + i, from, states: [st], to, label, ...(note ? { note } : {}), ...(when ? { when } : {}) })), ...(D.arrows || [])];
    for (const x of SEED.extra) if (!D.extra.includes(x)) D.extra.push(x);
    for (const [st, m] of Object.entries(SEED.first)) if (!D.first[st]) D.first[st] = m; }
  if (!D.buttons) D.buttons = [];
  if (!D.flags) D.flags = SEED.flags.map(([id, name]) => ({ id, name }));
  for (const a of D.arrows) { if (a.from.includes('@')) { const [m, st] = a.from.split('@'); a.from = m; a.states = [st]; } delete a.kind; delete a.el; } // (a transition from the flowchart before: one state, a kind)
  for (const a of D.arrows) { for (const st of a.states) boxFor(a.from + '@' + st); if (!a.to.endsWith('@*') || !D.nodes.some(n => n.k.startsWith(a.to.split('@')[0] + '@'))) boxFor(a.to); } }
// where a transition from a state lands: its box, or for "the state stays the same", the menu's box in that state when it has one
const landing = (a, st) => { const [tm, ts] = a.to.split('@'); return ts === '*' && st !== '*' && D.nodes.some(n => n.k === tm + '@' + st) ? tm + '@' + st : ts === '*' && st === '*' ? (D.nodes.some(n => n.k === a.to) ? a.to : null) : a.to; };
seed();
const stateNow = () => ED.online() && ED.NET.room ? 'room' : ED.S && !ED.S.over && !ED.G.replay && !ED.UI.preview ? 'game' : 'none'; // (the start screen's board is a preview: nowhere)
// the state whose menus are on show: the player's (the flowchart is a drawing: it never changes the page's menus; owner, 2026-10-05)
const viewState = stateNow;
const sections = () => [...form.querySelectorAll(':scope > section[data-screen]')];
// a menu's box in the state on show: its own box there, else its box for any state (a menu that is the same in every state)
const keyFor = sc => { const k = sc + '@' + viewState(); return D.nodes.some(n => n.k === k) || !D.nodes.some(n => n.k === sc + '@*') ? k : sc + '@*'; };
const conf = sc => { const k = sc.includes('@') ? sc : keyFor(sc); return D.screens[k] || (D.screens[k] = { blocks: {} }); };

/* ---------- blocks: what is directly in a screen, named once by where it first stood; a row of buttons is its buttons ---------- */
const name = el => el.dataset.edk || (el.dataset.edk = el.id ? '#' + el.id : (el.parentElement.matches('section') ? el.parentElement.dataset.screen : name(el.parentElement)) + '>' + [...el.parentElement.children].indexOf(el));
for (const s of sections()) for (const el of s.querySelectorAll('*')) name(el); // (named before anything moves)
const byName = k => form.querySelector(`[data-edk="${CSS.escape(k)}"]`);
const buttonRow = el => el.children.length > 0 && [...el.children].every(c => c.matches('button, a.btn')); // (one button alone in its row too)
const items = s => { const out = []; for (const el of s.children) { if (el.classList.contains('ed-grid')) continue;
    if (el.matches('fieldset.lock')) { out.push(...items(el)); continue; } // (a game's lock around fields: its fields are the blocks)
    if (el.classList.contains('ed-bar')) { for (const c of el.children) out.push([name(c), c]); continue; } // (the top and bottom bars' blocks)
    if (buttonRow(el)) { el.classList.add('ed-row'); for (const c of el.children) out.push([name(c), c]); } else out.push([name(el), el]); } return out; };

/* ---------- which screen is on show ---------- */
/* a reload keeps the editor where it was (owner, 2026-10-05: reloading changes nothing; coming back is a new visit): the screen, the
   state it was shown in, the tab and Edit mode, kept for this tab only (sessionStorage: a reload keeps it, a new visit hasn't it) */
const AT = 'eldorado-design-at';
let back = (() => { try { return JSON.parse(sessionStorage.getItem(AT)); } catch (e) { return null; } })(); // (expected: storage off, or nothing kept)
let sel = null, foldOpen = false, wasOpen = false, tab = 'layout';
const shown = () => { const m = $('#menu'); return m && m.open ? form.querySelector(':scope > section[data-screen]:not([hidden])') : null; };
/* the menu opened after a reload: on the screen it was on, by the page's own tab (the editor never shows a screen of its own) */
const MODE = { setup: 'local', online: 'online', replays: 'replays', settings: 'settings' };
function show() { const m = $('#menu'), open = !!(m && m.open);
  if (open && !wasOpen && back) { tab = back.tab || tab; editOn = !!back.edit; const l = MODE[back.sc] && $(`#hub label[data-v="${MODE[back.sc]}"]`); back = null; if (l && !l.querySelector('input').checked) l.click(); }
  wasOpen = open; }
let note = '';

/* ---------- laying the screen on show out on the grid ---------- */
let editOn = false; const editing = () => editOn; // (Edit mode: off until the owner turns it on)
function layout() {
  ED.expectMenu(); // (the menu laid out again by the editor: a change it declares, for the page's shift check)
  show();
  const s = shown(); for (const x of sections()) if (x !== s) unlay(x);
  if (!s) { panel(); placeGlass(); return; }
  const c = conf(s.dataset.screen); s.classList.add('ed-laid'); s.classList.toggle('ed-on', editing());
  Object.assign(s.style, { display: 'grid', gridTemplateColumns: `repeat(${COLS},minmax(0,1fr))`, gridAutoRows: 'minmax(40px,auto)', gap: '10px', position: 'relative' });
  let row = 1; const its = items(s);
  for (const [k, el] of its) { const b = c.blocks[k] || (c.blocks[k] = { c: 1, r: row, w: COLS }); row = Math.max(row, b.r + 1);
    if (b.bar === true) b.bar = 'bottom'; // (an earlier design: one bar, at the bottom)
    el.style.gridColumn = `${b.c} / span ${b.w}`; el.style.gridRow = String(b.r + 1); el.classList.add('ed-item'); el.classList.toggle('ed-inbar', !!b.bar); // (row 1: the top bar's)
    const off = b.del || ((b.hide || (b.fold && !foldOpen)) && !editing()); el.style.display = off ? 'none' : '';
    if (b.listk) { const l = byName(b.listk); if (l) { if (b.list) l.dataset.edList = b.list; else delete l.dataset.edList; } }
    setKind(el, b.kind); setCtl(el, b.ctype);
    el.classList.toggle('ed-hidden', !!b.hide); el.classList.toggle('ed-folded', !!b.fold); el.classList.toggle('ed-sel', editing() && k === sel); }
  // text changed here (a leaf's words; a button made here keeps its words as its label)
  for (const [k, t] of Object.entries(c.text || {})) { const el = byName(k); if (el && !el.isContentEditable && !el.children.length && el.textContent !== t) el.textContent = t; }
  // the top and bottom bars: the blocks put in each, in their order, staying at the screen's edge while the rest scrolls under
  // (each block back where it was when taken out)
  for (const side of ['top', 'bottom']) { let bar = s.querySelector(`:scope > .ed-bar-${side}`); const inBar = its.filter(([k]) => c.blocks[k].bar === side);
    if (inBar.length && !bar) { bar = document.createElement('div'); bar.className = `ed-bar ed-bar-${side}`; if (side === 'top') s.prepend(bar); else s.appendChild(bar); }
    for (const [k, el] of its) { const b = c.blocks[k];
      if (b.bar === side && el.parentElement !== bar) { if (!el.parentElement.classList.contains('ed-bar')) el.__home = [el.parentElement, el.nextSibling]; bar.appendChild(el); }
      else if (b.bar !== side && bar && el.parentElement === bar && !b.bar) { const [p, n] = el.__home || [s, null]; p.insertBefore(el, n && n.parentElement === p ? n : null); } }
    if (bar) { for (const [k, el] of inBar) { el.style.order = c.blocks[k].c; el.style.gridColumn = el.style.gridRow = ''; } if (!inBar.length) bar.remove(); else if (side === 'bottom') bar.style.gridRow = String(row + 2); } } // (the row after the last block's)
  // a screen with blocks behind "More options" has its button, a block like the others
  const fk = s.dataset.screen + '>more'; let more = byName(fk); const anyFold = its.some(([k]) => c.blocks[k].fold);
  if (anyFold && !more) { more = document.createElement('button'); more.type = 'button'; more.className = 'btn ed-more'; more.dataset.edk = fk; s.appendChild(more); return layout(); }
  if (!anyFold && more) { more.remove(); delete c.blocks[fk]; }
  if (more) more.textContent = foldOpen ? 'Fewer options' : 'More options';
  let g = s.querySelector(':scope > .ed-grid'); if (editing()) { if (!g) { g = document.createElement('div'); g.className = 'ed-grid'; s.appendChild(g); }
    g.style.gridTemplateRows = getComputedStyle(s).gridTemplateRows; const n = COLS * Math.max(row, 2); if (g.children.length !== n) g.innerHTML = '<i></i>'.repeat(n); } else if (g) g.remove();
  panel(); placeGlass();
}
function unlay(s) { if (!s.classList.contains('ed-laid')) return; s.classList.remove('ed-laid', 'ed-on'); for (const p of ['display', 'gridTemplateColumns', 'gridAutoRows', 'gap', 'position']) s.style[p] = '';
  s.querySelectorAll('.ed-item').forEach(el => { setKind(el, null); setCtl(el, null); el.style.gridColumn = el.style.gridRow = ''; if (el.classList.contains('ed-hidden') || el.classList.contains('ed-folded')) el.style.display = ''; el.classList.remove('ed-item', 'ed-hidden', 'ed-folded', 'ed-sel'); });
  for (const bar of s.querySelectorAll(':scope > .ed-bar')) { for (const el of [...bar.children]) { const [p, n] = el.__home || [s, null]; el.style.order = ''; p.insertBefore(el, n && n.parentElement === p ? n : null); } bar.remove(); }
  s.querySelectorAll('[data-ed-list]').forEach(el => { delete el.dataset.edList; });
  s.querySelectorAll('.ed-row').forEach(el => el.classList.remove('ed-row')); s.querySelectorAll('.ed-inbar').forEach(el => el.classList.remove('ed-inbar')); const g = s.querySelector(':scope > .ed-grid'); if (g) g.remove(); }
addEventListener('click', e => { if (!editing() && e.target.closest('.ed-more')) { e.preventDefault(); e.stopPropagation(); foldOpen = !foldOpen; layout(); } }, true);

/* ---------- moving blocks and setting their width (the menu isn't used meanwhile) ---------- */
function cellAt(s, x, y) { const r = s.getBoundingClientRect(), cs = getComputedStyle(s), pl = parseFloat(cs.paddingLeft), pt = parseFloat(cs.paddingTop);
  const cw = (r.width - pl - parseFloat(cs.paddingRight) - (COLS - 1) * 10) / COLS, col = Math.floor((x - r.left - pl) / (cw + 10)) + 1;
  let yy = r.top + pt, row = 1; for (const h of cs.gridTemplateRows.split(' ').map(parseFloat)) { if (y < yy + h + 5) break; yy += h + 10; row++; }
  return [Math.max(1, Math.min(COLS, col)), Math.max(1, row - 1)]; } // (grid row 1: the top bar's)
// the list a block holds that scrolls on its own, if any (Replays' recent games): measured only for the block chosen
const listIn = el => [el, ...el.querySelectorAll('*')].find(x => /(auto|scroll)/.test(getComputedStyle(x).overflowY)); // (empty or not: a list box)
const nearestW = w => WIDTHS.map(([v]) => v).reduce((a, v) => Math.abs(v - w) < Math.abs(a - w) ? v : a);
const fit = b => { b.c = Math.max(1, Math.min(COLS - b.w + 1, b.c)); b.r = Math.max(1, b.r); };
let drag = null; // (a block being moved or stretched)
/* in Edit mode a sheet lies over the menu and takes every press: the editor finds the block under it (a press chooses and
   drags it; near its right edge, its width) and nothing of the menu's own can react (2026-10-05: a press meant to choose Start
   started the game, the page's own listeners running before the editor's). Out of it the sheet is gone and the page works as
   ever (owner: one switch, Edit / Stop editing, always in sight). The sheet passes the wheel on: the screen still scrolls */
const glass = document.createElement('div'); glass.id = 'edGlass'; glass.hidden = true; document.body.appendChild(glass);
const under = (x, y) => document.elementsFromPoint(x, y).find(el => el !== glass && !glass.contains(el));
// (over the screen being edited only, as much of it as the menu shows: its tabs stay usable, to go to another screen)
function placeGlass() { const s = shown(); glass.hidden = !(editing() && s && !typing); if (glass.hidden) return; const r = s.getBoundingClientRect(), f = form.getBoundingClientRect();
  const top = Math.max(r.top, f.top), bottom = Math.min(r.bottom, f.bottom); Object.assign(glass.style, { left: f.left + 'px', top: top + 'px', width: f.width + 'px', height: Math.max(0, bottom - top) + 'px' }); }
addEventListener('resize', placeGlass); form.addEventListener('scroll', placeGlass, { passive: true });
glass.addEventListener('wheel', e => { form.scrollTop += e.deltaY; e.preventDefault(); }, { passive: false });
const edge = (el, x) => x > el.getBoundingClientRect().right - 12;
glass.addEventListener('pointermove', e => { if (drag) return; const s = shown(), t = under(e.clientX, e.clientY), el = t && t.closest('.ed-item');
  glass.style.cursor = el && s && s.contains(el) ? (edge(el, e.clientX) ? 'ew-resize' : 'move') : ''; });
glass.addEventListener('pointerdown', e => { const s = shown(), t = under(e.clientX, e.clientY); if (!s || !t || !s.contains(t)) { sel = null; return layout(); }
  const hit = items(s).find(([, el]) => el.contains(t)); if (!hit) { sel = null; return layout(); } e.preventDefault(); const [k, el] = hit; sel = k;
  const b = conf(s.dataset.screen).blocks[k], [cc, rr] = cellAt(s, e.clientX, e.clientY); drag = { k, width: edge(el, e.clientX), dc: cc - b.c, dr: rr - b.r }; glass.setPointerCapture(e.pointerId); layout(); });
addEventListener('pointermove', e => { if (!drag) return; const s = shown(); if (!s) { drag = null; return; } const b = conf(s.dataset.screen).blocks[drag.k], [cc, rr] = cellAt(s, e.clientX, e.clientY);
  if (drag.width) b.w = nearestW(cc - b.c + 1); else { b.c = cc - drag.dc; b.r = rr - drag.dr; } fit(b); layout(); }, true);
addEventListener('pointerup', () => { if (drag) { drag = null; save(); layout(); } }, true);
// words: a double-click on any text (a heading, a label, a line, a button) makes it typeable, the sheet set aside meanwhile;
// Enter, Escape or a click elsewhere keeps it
let typing = false;
glass.addEventListener('dblclick', e => { const s = shown(), t = under(e.clientX, e.clientY); if (!s || !t || !s.contains(t) || t.children.length || !t.textContent.trim()) return;
  e.preventDefault(); typing = true; placeGlass(); t.contentEditable = 'plaintext-only'; t.focus(); getSelection().selectAllChildren(t);
  const done = () => { t.removeEventListener('blur', done); t.removeAttribute('contenteditable'); typing = false; const c = conf(s.dataset.screen), w = t.textContent.trim().slice(0, 120);
    (c.text || (c.text = {}))[name(t)] = w; save(); layout(); };
  t.addEventListener('blur', done); t.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === 'Escape') { ev.preventDefault(); t.blur(); } ev.stopPropagation(); }); });
// the keys every editor has: arrows move the chosen block a cell, Delete hides it, Escape lets go, Ctrl+Z / Ctrl+Shift+Z
// (only while laying out: the game's own Ctrl+Z stays the game's)
addEventListener('keydown', e => { if (!editing() || e.target.isContentEditable || (e.target.closest && e.target.closest('input, textarea, select'))) return; const s = shown(); if (!s) return;
  const k = e.key.toLowerCase(); if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'y')) { e.preventDefault(); e.stopPropagation(); if (e.shiftKey || k === 'y') redo(); else undo(); return; }
  if (e.key === 'Escape' && sel) { sel = null; layout(); e.preventDefault(); e.stopPropagation(); return; }
  const b = sel && conf(s.dataset.screen).blocks[sel]; if (!b) return;
  const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (d) { b.c += d[0]; b.r += d[1]; fit(b); } else if (e.key === 'Delete' || e.key === 'Backspace') { b.del = true; sel = null; } else return;
  e.preventDefault(); e.stopPropagation(); save(); layout(); }, true);

/* ---------- the panel ---------- */
const box = document.createElement('div'); box.id = 'edPanel'; document.body.appendChild(box);
let at = { x: null, y: 12 }, mini = false; // (mini: only its title bar, out of the game's way)
const esc = t => String(t).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const row = (label, inner) => `<div class="ed-r"><b>${label}</b><span>${inner}</span></div>`;
const btn = (act, label, on, v = '', extra = '') => `<button data-act="${act}" data-v="${esc(v)}" class="${on ? 'on' : ''}" ${extra}>${label}</button>`;
function layoutBody() {
  const s = shown(); if (!s) return `<p>Open the menu to lay out its screens.</p>${btn('openmenu', 'Open the menu')}`;
  const sc = s.dataset.screen, b = sel && conf(sc).blocks[sel];
  return `<p><b>${esc(nameOf(sc))}</b> · ${stLabel(viewState()).toLowerCase()}</p>`
    + (b ? (b.bar ? `<p class="ed-hint">In the ${b.bar} bar: drag it left or right (or use the arrows) to order the bar.</p>` : row('Width', WIDTHS.map(([v, n]) => btn('w', n, b.w === v, v)).join('')))
      + row('Place', btn('bar', 'On the screen', !b.bar, '') + btn('bar', 'Top bar', b.bar === 'top', 'top') + btn('bar', 'Bottom bar', b.bar === 'bottom', 'bottom'))
      + ((el => el && el.matches('button') ? row('Button', KINDS.map(([v, n]) => btn('kind', n, (b.kind || el.__kind[0]) === v, v)).join('')) : '')(byName(sel)))
      + ((el => { const c = ctlOf(el); return c ? row(c.kind === 'yesno' ? 'Setting' : 'Choice', CTYPES[c.kind].map(([v, n]) => btn('ctype', n, (b.ctype || c.own) === v, v)).join('')) : ''; })(byName(sel)))
      + row('', btn('hide', 'Hidden', b.hide) + btn('fold', 'In More options', b.fold) + btn('del', 'Delete'))
      + ((l => l ? row('List', [['', 'Scrolls'], ['all', 'Shows all'], ['3', 'First 3'], ['5', 'First 5'], ['10', 'First 10']].map(([v, n]) => btn('list', n, (b.list || '') === v, v)).join('')) : '')(byName(sel) && listIn(byName(sel))))
      : (editing() ? '<p class="ed-hint">Drag a block to move it; drag its right edge to make it a third, half or the whole width. Click a block to choose it. Double-click any text to change it. A chosen button can be made Main, Plain or Link. Arrows move the chosen block, Delete deletes it, Ctrl+Z undoes. Stop editing to use the menu.</p>' : '<p class="ed-hint">Press Edit (top of this panel) to lay this screen out; until then the menu works as usual.</p>'))
    + ((n => n ? `<p>${btn('undel', `Bring back deleted blocks (${n})`)}</p>` : '')(Object.values(conf(sc).blocks).filter(x => x.del).length))
    + `<hr>${btn('reset', 'This screen back to the page\'s own')}`;
}
/* the chart (owner, 2026-10-05): one box at a time in the middle, the boxes leading to it on its left and those it leads to on its
   right, each arrow with its transitions' words; under them every box, in an order that never changes whatever is clicked (the
   ones joined to the middle one marked). A click on a box centres it; a click on the centred one starts a transition from it, and
   the next click on a box ends it there (anywhere else, it is dropped) */
const NW = 156, NH = 42, COLX = [0, 400, 800], TRAY = 6;
let fsel = null, connect = null, focus = null, focusT = null, copyText = null; // (fsel: { node } or { arrow }: shown in the directions; connect: a transition being drawn from the middle box; focus: the middle box)
const opened = new Set(), openT = new Set(); // (the directions' tree, folded until opened (owner, 2026-10-05): menus and groups opened, transitions opened)
const only = () => { opened.clear(); openT.clear(); }; // (a click in the chart folds the directions to what it chose, owner 2026-10-05: else they only ever grow)
const reveal = a => { opened.add('m:' + a.from); opened.add('g:' + a.from + ':' + [...a.states].sort().join(',')); }; // (a transition shown: its menu and group open)
// (a rule for every menu is in the directions only: on the chart it would be lines from everywhere, owner 2026-10-05)
const segs = () => { const out = []; for (const a of D.arrows) if (a.from !== '*') for (const st of a.states) { const f = a.from + '@' + st, [tm, ts] = a.to.split('@');
    // (from any state to "the state stays the same": to each box of that menu, there being no box for any state)
    const ts2 = st === '*' && ts === '*' && !D.nodes.some(n => n.k === a.to) ? D.nodes.filter(n => n.k.split('@')[0] === tm).map(n => n.k) : [landing(a, st)];
    for (const t of ts2) if (t && f !== t) out.push([a, f, t]); } return out; };
// the tray: every menu once, in the order the directions list them, never by what is clicked (owner, 2026-10-05: "you just need to
// have the menus, and they start in any state")
const trayMenus = () => menusOf().filter(m => m !== '*');
const centre = () => { if (!focus || !trayMenus().includes(focus.split('@')[0])) focus = ((D.first.none || trayMenus()[0]) + '@*'); return focus; };
// the transitions joining a box to the centre: for a menu in any state, those of every box of it
const atCentre = (k, f) => { const m = k.split('@')[0], [fm, fs] = f.split('@'); return fs === '*' ? m === fm : k === f; };
function flowSvg() {
  const f = centre(), [fm, fs] = f.split('@'), all = segs(), ins = new Map(), outs = new Map(); // (neighbour box → the transitions between it and the centre)
  // (a menu in one state: every transition that applies there, those for any state included, each other end as it is in that state:
  // "you're able to go to settings in-game" (owner, 2026-10-05); a menu in any state: all of its transitions)
  // (out: those starting in this state; in: every one arriving here, from whatever state it starts in)
  const pairs = fs === '*' ? all.map(([a, fk, tk]) => [a, fk, tk]) : D.arrows.filter(a => a.from !== '*').flatMap(a => { const [tm, ts] = a.to.split('@');
    return (a.states.includes('*') ? [fs] : a.states).map(st => [a, a.from + '@' + st, ts === '*' ? tm + '@' + st : a.to]).filter(([, fk, tk]) => fk === f || tk === f); });
  for (const [a, fk, tk] of pairs) { const fi = atCentre(fk, f), ti = atCentre(tk, f); if (ti && !fi) { if (!ins.has(fk)) ins.set(fk, []); ins.get(fk).push(a); } if (fi && !ti) { if (!outs.has(tk)) outs.set(tk, []); outs.get(tk).push(a); } }
  const ms = trayMenus(), rank = k => ms.indexOf(k.split('@')[0]) * 10 + ['*', ...[...STATES].map(([v]) => v)].indexOf(k.split('@')[1]), byOrder = m => [...m.keys()].sort((p, q) => rank(p) - rank(q)), inK = byOrder(ins), outK = byOrder(outs);
  const own = D.buttons.filter(b => b.menu === fm && (fs === '*' || b.states.includes(fs) || b.states.includes('*'))); // (the centre's own buttons, listed under it)
  const colH = n => n * 70 - 28, H1 = Math.max(colH(inK.length), colH(outK.length), NH + 40 + 2 * (own.length * 16 + 20)), fy = H1 / 2 - NH / 2 - 14;
  const box = (k, x, y, cls) => { const [m, st] = k.split('@'), first = st !== '*' && D.first[st] === m;
    return `<g class="ed-node ${st === '*' ? 'any' : st}${cls}${NOLAY.includes(m) ? ' nolay' : ''}" data-node="${esc(k)}" transform="translate(${x},${y})"><rect width="${NW}" height="${NH}" rx="8"/>`
      + `<text x="10" y="18" class="m">${first ? '★ ' : ''}${esc(nameOf(m))}</text><text x="10" y="33" class="s">${esc(stLabel(st).toLowerCase())}</text></g>`; };
  let g = '';
  const side = (keys, map, x, inward) => keys.forEach((k, i) => { const y = H1 / 2 - colH(keys.length) / 2 + i * 70, as = [...new Set(map.get(k))]; // (a transition to several boxes of the centre's menu: once)
    const x1 = inward ? x + NW : COLX[1] + NW, x2 = inward ? COLX[1] : x, y1 = inward ? y + NH / 2 : fy + NH / 2, y2 = inward ? fy + NH / 2 : y + NH / 2, lx = inward ? x1 + 10 : x2 - 14, ly = y1 + (y2 - y1) * (lx - x1) / (x2 - x1); // (its words beside the outer box, where the lines are apart, running toward the centre)
    const st = as.some(a => changes(a).includes('state')), on = as.some(a => fsel && fsel.arrow === a.id);
    g += `<line class="ed-ln${st ? ' st' : ''}${on ? ' on' : ''}" x1="${x1}" y1="${y1}" x2="${x2 - 3}" y2="${y2}" marker-end="url(#edHead${on ? 'On' : ''})"/>`;
    as.forEach((a, j) => { g += `<text class="ed-ar${st ? ' st' : ''}${fsel && fsel.arrow === a.id ? ' on' : ''}" data-arrow="${a.id}" x="${lx}" y="${ly - 5 - (as.length - 1 - j) * 15}" style="text-anchor:${inward ? 'start' : 'end'}">${esc(a.label || '…')}${whenText(a) ? ` · ${esc(whenText(a))}` : ''}${a.note ? ' ✎' : ''}</text>`; });
    g += box(k, x, y, ''); });
  side(inK, ins, COLX[0], true); side(outK, outs, COLX[2], false);
  g += box(f, COLX[1], fy, ' focus' + (connect ? ' linking' : ''));
  own.forEach((b, i) => { g += `<text class="ed-own" data-button="${b.id}" x="${COLX[1]}" y="${fy + NH + 46 + i * 16}">▢ ${esc(b.label || '…')}${whenText(b) ? ` · ${esc(whenText(b))}` : ''}</text>`; }); // (its own buttons, which lead nowhere)
  // the centre's state: any, or one (the tabs under it)
  [['*', 'any'], ...[...STATES].map(([v, n]) => [v, n.toLowerCase()])].reduce((x, [v, n]) => { const w = n.length * 6.6 + 14; g += `<g class="ed-st${v === fs ? ' on' : ''}" data-centre="${esc(fm + '@' + v)}" transform="translate(${x},${fy + NH + 8})"><rect width="${w}" height="18" rx="9"/><text x="${w / 2}" y="13">${esc(n)}</text></g>`; return x + w + 4; }, COLX[1] - 40);
  if (!inK.length) g += `<text class="ed-none" x="${COLX[0] + NW / 2}" y="${fy + NH / 2 + 4}">nothing leads here</text>`;
  if (!outK.length) g += `<text class="ed-none" x="${COLX[2] + NW / 2}" y="${fy + NH / 2 + 4}">leads nowhere yet</text>`;
  // every menu, always in the same places: a click centres it (the centre's, and those joined to it, marked)
  const ty = H1 + 70, step = (COLX[2] + NW) / TRAY, near = new Set([...inK, ...outK].map(k => k.split('@')[0])); g += `<line class="ed-sep" x1="0" y1="${ty - 30}" x2="${COLX[2] + NW}" y2="${ty - 30}"/>`;
  ms.forEach((m, i) => { g += box(m + '@*', (i % TRAY) * step, ty + Math.floor(i / TRAY) * 56, m === fm ? ' tfocus' : near.has(m) ? ' tnear' : ' tray'); });
  const H = ty + Math.ceil(ms.length / TRAY) * 56;
  return `<svg class="ed-fc${connect ? ' connect' : ''}" viewBox="-10 -40 ${COLX[2] + NW + 20} ${H + 50}" preserveAspectRatio="xMidYMin meet"><defs>`
    + ['', 'On'].map(k => `<marker id="edHead${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="hd${k}"/></marker>`).join('')
    + `</defs><text class="ed-cap" x="${COLX[0]}" y="-18">Leads here</text><text class="ed-cap" x="${COLX[1]}" y="-18">${connect ? 'Click where it goes' : 'Click it to draw a transition'}</text><text class="ed-cap" x="${COLX[2]}" y="-18">Leads to</text>${g}</svg>`;
}
/* the flow as text, for the owner to paste to me: each menu, its boxes, its transitions grouped by the states they apply to, notes */
function flowText() {
  const st = s => s.map(stLabel).join(', ').toLowerCase(), to = a => { const [m, s] = a.to.split('@'); return `${nameOf(m)}${s === '*' ? ' (same state)' : ` (${stLabel(s).toLowerCase()})`}`; };
  const out = ['El Dorado: menu flow (from the design editor)', 'States: ' + [...STATES].map(([, n]) => n).join(', '),
    'The menu opens on: ' + [...STATES].map(([v, n]) => `${n} → ${D.first[v] ? nameOf(D.first[v]) : '(not set)'}`).join('; '), ''];
  for (const m of menusOf()) { const boxes = D.nodes.filter(n => n.k.split('@')[0] === m).map(n => n.k.split('@')[1]);
    out.push(`${nameOf(m)}${NOLAY.includes(m) ? ' (not a menu)' : ''}: in ${st(boxes)}`); if (D.mnotes && D.mnotes[m]) out.push(`  note: ${D.mnotes[m]}`);
    for (const b of D.buttons.filter(x => x.menu === m)) { out.push(`  button (stays on this menu), when ${st(b.states)}${whenText(b) ? ', ' + whenText(b) : ''}: "${b.label || '…'}"`); if (b.note) out.push(`    note: ${b.note}`); }
    for (const a of D.arrows.filter(x => x.from === m)) { out.push(`  when ${st(a.states)}${whenText(a) ? ', ' + whenText(a) : ''}: "${a.label || '…'}" → ${to(a)} [${changes(a)}]`); if (a.note) out.push(`    note: ${a.note}`); }
    out.push(''); }
  return out.join('\n');
}
const menusOf = () => { const ms = []; for (const n of [...D.nodes].sort((p, q) => p.y - q.y || p.x - q.x)) { const m = n.k.split('@')[0]; if (!ms.includes(m)) ms.push(m); } return ms; };
let scrollDir = false;
const stOpts = (cur, withAny, anyName) => [...(withAny ? [['*', anyName]] : []), ...STATES].map(([v, n]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(n)}</option>`).join('');
const tw = (k, open) => `<button class="ed-tw" data-act="fl-fold" data-v="${esc(k)}" title="${open ? 'Fold' : 'Open'}">${open ? '▾' : '▸'}</button>`;
function flowBody() {
  const menus = [...new Set([...sections().map(s => s.dataset.screen), ...NOLAY, ...D.extra])], mOpts = (cur, any) => menus.filter(m => any || m !== '*').map(m => `<option value="${esc(m)}"${m === cur ? ' selected' : ''}>${esc(nameOf(m))}</option>`).join('');
  const others = m => menusOf().filter(x => x !== m).map(x => `<option value="${esc(x)}">${esc(nameOf(x))}</option>`).join('');
  const chips = a => [['*', 'Any state'], ...STATES].map(([v, n]) => btn('fl-tst', esc(n), a.states.includes(v), v, `data-id="${a.id}"`)).join('');
  const fchips = (x, act) => D.flags.map(f => { const on = (x.when || {})[f.id]; return btn(act, on === undefined ? esc(f.name) : on ? '✓ ' + esc(f.name) : '✗ not ' + esc(f.name), on !== undefined, f.id, `data-id="${x.id}" title="Click: required, required not, either"`); }).join('');
  const bchips = b => [['*', 'Any state'], ...STATES].map(([v, n]) => btn('fl-bst', esc(n), b.states.includes(v), v, `data-id="${b.id}"`)).join('');
  const brow = b => { const open = openT.has(b.id);
    return `<div class="ed-dr" data-dbutton="${b.id}">${tw('t:' + b.id, open)}<input data-act="fl-bword" data-id="${b.id}" value="${esc(b.label)}" maxlength="48" placeholder="The button's words">${btn('fl-rmb', '×', false, b.id, 'title="Remove this button"')}`
      + (open ? `<div class="ed-tx"><div class="ed-dh"><span>When in:</span>${bchips(b)}</div><div class="ed-dh"><span>And:</span>${fchips(b, 'fl-bflag')}</div><textarea data-act="fl-bnote" data-id="${b.id}" rows="2" placeholder="A note">${esc(b.note || '')}</textarea></div>` : '') + `</div>`; };
  const trow = a => { const [tm, ts] = a.to.split('@'), on = fsel && fsel.arrow === a.id, open = openT.has(a.id);
    return `<div class="ed-dr${on ? ' on' : ''}" data-darrow="${a.id}">${tw('t:' + a.id, open)}<input data-act="fl-tword" data-id="${a.id}" value="${esc(a.label)}" maxlength="48" placeholder="What takes the player there">`
      + `<span>→</span><select data-act="fl-tto-m" data-id="${a.id}">${mOpts(tm)}</select><select data-act="fl-tto-s" data-id="${a.id}">${stOpts(ts, true, 'state stays the same')}</select>`
      + `<span class="ed-tag ${changes(a).includes('state') ? 'st' : ''}">${changes(a)}</span>${btn('fl-rmt', '×', false, a.id, 'title="Remove this transition"')}`
      + (open ? `<div class="ed-tx"><div class="ed-dh"><span>When in:</span>${chips(a)}</div><div class="ed-dh"><span>And:</span>${fchips(a, 'fl-tflag')}</div><textarea data-act="fl-tnote" data-id="${a.id}" rows="2" placeholder="A note">${esc(a.note || '')}</textarea><div class="ed-dh"><select data-act="fl-copyt" data-id="${a.id}"><option value="">Copy to…</option>${others(a.from)}</select></div></div>` : '') + `</div>`; };
  const dirs = menusOf().map(m => { const open = opened.has('m:' + m), lay = !NOLAY.includes(m), boxes = D.nodes.filter(n => n.k.split('@')[0] === m).map(n => n.k.split('@')[1]);
    const free = [['*', 'Any state'], ...STATES].filter(([v]) => !boxes.includes(v)), ts = D.arrows.filter(a => a.from === m), groups = new Map();
    for (const a of ts) { const g = [...a.states].sort().join(','); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(a); }
    const body = open ? `<div class="ed-mb"><div class="ed-dh ed-in">${boxes.map(st => { const k = m + '@' + st, on = fsel && fsel.node === k;
        return `<span class="ed-box${on ? ' on' : ''}" data-dir="${esc(k)}">${esc(stLabel(st))}${lay && st !== '*' ? btn('fl-first', D.first[st] === m ? '★' : '☆', D.first[st] === m, k, `title="The menu opens here ${stLabel(st).toLowerCase()}"`) : ''}${boxes.length > 1 ? btn('fl-split', '⑂', false, k, 'title="Split off: this state becomes a menu of its own"') : ''}${btn('fl-rmbox', '×', false, k, 'title="Not in this state"')}</span>`; }).join('')}`
      + `${free.length ? `<select data-act="fl-addst" data-m="${esc(m)}"><option value="">+ in a state…</option>${free.map(([v, n]) => `<option value="${esc(v)}">${esc(n)}</option>`).join('')}</select>` : ''}</div>`
      + `<textarea data-act="fl-mnote" data-m="${esc(m)}" rows="1" placeholder="A note about this menu">${esc((D.mnotes || {})[m] || '')}</textarea>`
      + [...groups].map(([g, as]) => { const gk = 'g:' + m + ':' + g, gopen = opened.has(gk);
          return `<div class="ed-grp">${tw(gk, gopen)}<b>When ${esc(g.split(',').map(stLabel).join(' or ').toLowerCase())}</b>${gopen ? as.map(trow).join('') : ` <span class="ed-hint">${as.length}</span>`}</div>`; }).join('')
      + (() => { const bs = D.buttons.filter(b => b.menu === m), bk = 'b:' + m, bopen = opened.has(bk); return bs.length ? `<div class="ed-grp">${tw(bk, bopen)}<b>Its own buttons</b>${bopen ? bs.map(brow).join('') : ` <span class="ed-hint">${bs.length}</span>`}</div>` : ''; })()
      + `<div class="ed-dh">${btn('fl-addt', '+ Transition', false, m)}${btn('fl-addb', '+ Button', false, m, 'title="A button that stays on this menu (a setting, a toggle)"')}<select data-act="fl-copyall" data-m="${esc(m)}"><option value="">Copy all to…</option>${others(m)}</select>`
      + `<select data-act="fl-merge" data-m="${esc(m)}"><option value="">Merge into…</option>${others(m)}</select>${btn('fl-rmmenu', 'Remove menu', false, m)}</div></div>` : '';
    return `<div class="ed-dir" data-menu="${esc(m)}"><div class="ed-dh ed-mh">${tw('m:' + m, open)}<input class="ed-mname" data-act="fl-mname" data-m="${esc(m)}" value="${esc(nameOf(m))}" maxlength="32" title="The menu's name"><span class="ed-hint">${ts.length} out</span></div>${body}</div>`; }).join('');
  const add = `<div class="ed-dh ed-add"><span>+ Menu:</span><select id="flMenu">${mOpts('', true)}<option value="">New menu…</option></select><select id="flState">${stOpts('none', true, 'Any state')}</select>${btn('fl-add', 'Add')}</div>`
    + `<div class="ed-states"><b>States</b>${[...STATES].map(([v, n]) => `<div class="ed-dh"><input data-act="fl-sname" data-s="${esc(v)}" value="${esc(n)}" maxlength="32">${(D.moreStates || []).includes(v) ? btn('fl-rmstate', 'Remove', false, v) : '<span class="ed-hint">the page\'s</span>'}</div>`).join('')}<div class="ed-dh">${btn('fl-addstate', '+ State')}</div></div>`
    + `<div class="ed-states"><b>Conditions</b> <span class="ed-hint">facts besides the state, for a transition or button to require (or require not)</span>${D.flags.map(f => `<div class="ed-dh"><input data-act="fl-fname" data-f="${esc(f.id)}" value="${esc(f.name)}" maxlength="40">${btn('fl-rmflag', 'Remove', false, f.id)}</div>`).join('')}<div class="ed-dh">${btn('fl-addflag', '+ Condition')}</div></div>`;
  // (two panes: the chart, never scrolled, and the directions, which alone scroll: owner, 2026-10-05)
  const tools = `<div class="ed-ftools">${connect ? `<span class="ed-link">Drawing a transition from ${esc(nameOf(focus.split('@')[0]))}: click the box it goes to (anywhere else drops it)</span>` : ''}`
    + `${btn('fl-copy', 'Copy flow', false, '', 'title="The flow as text, to paste to Claude"')}${btn('fl-reset', 'Default flowchart')}</div>`;
  return `<div class="ed-chart">${tools}<div class="ed-flowwrap">${flowSvg()}</div>${note ? `<p class="ed-hint">${esc(note)}</p>` : ''}${copyText ? `<textarea class="ed-copy" readonly>${esc(copyText)}</textarea>` : ''}</div><div class="ed-dirs">${dirs}${add}</div>`;
}
/* the flowchart's operations on menus: a box removed (its state no longer the menu's), two menus merged into one, one state of a
   menu split off as a menu of its own, transitions copied to another menu */
function removeBox(k) { const [m, st] = k.split('@'); D.nodes = D.nodes.filter(n => n.k !== k); delete D.screens[k]; if (D.first[st] === m) delete D.first[st];
  for (const a of D.arrows.filter(x => x.from === m && x.states.includes(st))) a.states = a.states.filter(s => s !== st);
  D.arrows = D.arrows.filter(a => a.states.length && a.to !== k);
  if (D.extra.includes(m) && !D.nodes.some(n => n.k.split('@')[0] === m)) D.extra = D.extra.filter(x => x !== m); } // (a menu made here, in no box any more: gone)
function mergeMenu(from, into) { // (everything of one menu becomes the other's: its boxes, its transitions, its layouts where the other has none)
  for (const n of D.nodes.filter(x => x.k.split('@')[0] === from)) { const st = n.k.split('@')[1], k = into + '@' + st;
    if (!D.screens[k] && D.screens[n.k]) D.screens[k] = D.screens[n.k]; delete D.screens[n.k];
    if (D.nodes.some(x => x.k === k)) D.nodes = D.nodes.filter(x => x !== n); else n.k = k; }
  for (const a of D.arrows) { if (a.from === from) a.from = into; const [tm, ts] = a.to.split('@'); if (tm === from) a.to = into + '@' + ts; }
  for (const b of D.buttons) if (b.menu === from) b.menu = into;
  D.arrows = D.arrows.filter(a => !(a.from === into && a.to === into + '@*' && !a.label)); // (an empty loop the merge made)
  for (const [st, f] of Object.entries(D.first)) if (f === from) D.first[st] = into;
  D.extra = D.extra.filter(x => x !== from); if (D.mnotes && D.mnotes[from]) { D.mnotes[into] = [D.mnotes[into], D.mnotes[from]].filter(Boolean).join(' / '); delete D.mnotes[from]; } }
function splitMenu(m, st, name) { // (one state of a menu becomes a menu of its own: a blank screen named here, its box, the transitions that apply in that state)
  let nm = name.toLowerCase().replace(/[^\w-]/g, '').slice(0, 24) || 'menu'; while (D.nodes.some(n => n.k.split('@')[0] === nm) || sections().some(s => s.dataset.screen === nm)) nm += '2';
  D.extra.push(nm); (D.names || (D.names = {}))[nm] = name; const k = m + '@' + st, nk = nm + '@' + st, n = D.nodes.find(x => x.k === k);
  if (n) n.k = nk; else boxFor(nk); if (D.screens[k]) { D.screens[nk] = D.screens[k]; delete D.screens[k]; } if (D.first[st] === m) D.first[st] = nm;
  for (const a of [...D.arrows]) { if (a.from === m && a.states.includes(st)) { if (a.states.length === 1) a.from = nm; else { a.states = a.states.filter(s => s !== st); D.arrows.push({ ...a, id: 'a' + Date.now().toString(36) + D.arrows.length, from: nm, states: [st] }); } }
    if (a.to === k) a.to = nk; }
  for (const b of [...D.buttons]) if (b.menu === m && (b.states.includes(st) || b.states.includes('*'))) D.buttons.push({ ...b, id: 'b' + Date.now().toString(36) + D.buttons.length, menu: nm, states: [st] }); // (its own buttons: on the new menu too)
  return nm; }
function copyTo(a, m) { const c = { ...a, id: 'a' + Date.now().toString(36) + D.arrows.length, from: m, states: [...a.states] }; D.arrows.push(c); for (const st of c.states) boxFor(m + '@' + st); return c; }
function panel() {
  const body = mini ? '' : tab === 'layout' ? layoutBody() : tab === 'flow' ? flowBody()
    : tab === 'options' ? AREAS.map(a => row(a.name, a.options.map(([id, n]) => btn('opt', n, (D.options[a.id] || 'a') === id, id, `data-area="${a.id}"`)).join(''))
        + (a.id === 'colors' && LOOKS[D.options.colors] ? `<div class="ed-tune">${TUNE.map(t => { const k = D.options.colors + '.' + t.id, cur = D.options[k] || (t.id === 'acc' ? '1' : 'own');
          return row(t.name, tuneOpts(D.options.colors, t).map(([v, n]) => btn('opt', n, cur === v, v, `data-area="${k}"`)).join('')); }).join('')}${row('', btn('opt-reset', 'Reset this look', false, 'look'))}</div>` : '')).join('')
      + `<hr>${btn('opt-reset', "Back to the page's own styles", false, 'all')}`
    : `<p>Your design is kept in this browser as you go. To send it to me, download it and attach the file.</p>${row('', btn('download', 'Download design') + btn('import', 'Load a design file…'))}${row('', btn('clear', 'Start over'))}`;
  const html = `<div class="ed-head"><b>Design</b><button data-act="editmode" class="ed-edit${editOn ? ' on' : ''}" title="${editOn ? 'Stop editing: the menu works again' : 'Edit the menu on show: clicks move and choose its blocks'}">${editOn ? '■ Stop editing' : '✎ Edit'}</button><span>${mini ? '' : ['layout', 'flow', 'options', 'export'].map(t => `<button data-tab="${t}" class="${tab === t ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}`
    + `${btn('undo', '↶', false, '', `title="Undo (Ctrl+Z)" ${undos.length ? '' : 'disabled'}`)}${btn('redo', '↷', false, '', `title="Redo (Ctrl+Shift+Z)" ${redos.length ? '' : 'disabled'}`)}${btn('mini', mini ? '▾' : '▴', false, '', `title="${mini ? 'Open' : 'Shrink it out of the way'}"`)}</span></div>${mini ? '' : `<div class="ed-body">${body}</div>`}`;
  if (box.__h !== html) { const d0 = box.querySelector('.ed-dirs'), top = d0 ? d0.scrollTop : 0; box.__h = html; box.innerHTML = html; const d1 = box.querySelector('.ed-dirs'); if (d1) d1.scrollTop = top; } // (a redraw keeps the directions where they were scrolled)
  if (scrollDir && fsel) { scrollDir = false; const d = box.querySelector('.ed-dirs'), m = fsel.node && fsel.node.split('@')[0], r = box.querySelector(fsel.arrow ? `[data-darrow="${fsel.arrow}"]` : `[data-menu="${CSS.escape(m)}"]`);
    if (d && r) d.scrollTop = r.offsetTop - 8; } // (the directions scroll to the transition or the menu; the chart stays)
  if (focusT) { const f = box.querySelector(`input[data-id="${focusT}"]`); focusT = null; if (f) f.focus(); } // (a transition just drawn: its words to type)
  if (copyText) { const c = box.querySelector('textarea.ed-copy'); if (c && document.activeElement !== c) { c.focus(); c.select(); } }
  { const s = shown(); try { sessionStorage.setItem(AT, JSON.stringify({ sc: s ? s.dataset.screen : null, tab, edit: editOn })); } catch (e) { /* expected: storage off */ } }
  box.classList.toggle('wide', tab === 'flow' && !mini); box.classList.toggle('flowtab', tab === 'flow' && !mini); box.classList.toggle('editing', editOn);
  box.style.left = at.x === null ? '' : at.x + 'px'; box.style.right = at.x === null ? '12px' : ''; box.style.top = at.y + 'px';
}
function act(t, a, v) {
  const s = shown(), sc = s && s.dataset.screen, b = sc && sel && conf(sc).blocks[sel];
  if (a === 'editmode') { editOn = !editOn; sel = null; if (editOn) { tab = 'layout'; mini = false; } }
  else if (a === 'mini') mini = !mini; else if (a === 'undo') return undo(); else if (a === 'redo') return redo();
  else if (a === 'opt') D.options[t.dataset.area] = v;
  else if (a === 'opt-reset') { const look = D.options.colors; for (const k of Object.keys(D.options)) if (v === 'all' ? k !== 'reshuffle' : k.startsWith(look + '.')) delete D.options[k]; } // (the look's rows to its own; or every look's, and the page's own look)
  else if (a === 'openmenu') { const m = $('#menuBtn'); if (m) m.click(); }
  else if (b && a === 'w') { b.w = +v; fit(b); }
  else if (b && a === 'ctype') { const c = ctlOf(byName(sel)); b.ctype = c && c.own === v ? undefined : v; }
  else if (b && a === 'kind') { const el = byName(sel); b.kind = el && el.__kind[0] === v ? undefined : v; }
  else if (b && a === 'del') { b.del = true; sel = null; }
  else if (a === 'undel') { for (const x of Object.values(conf(sc).blocks)) delete x.del; }
  else if (b && a === 'list') { const l = listIn(byName(sel)); if (l) { b.listk = name(l); b.list = v || undefined; } } else if (b && (a === 'hide' || a === 'fold')) b[a] = !b[a] || undefined; else if (b && a === 'bar') b.bar = v || undefined;
  else if (a === 'reset') { delete D.screens[sc]; sel = null; unlay(s); }
  else if (a === 'fl-fold') { const k = v.startsWith('t:') ? v.slice(2) : v, set = v.startsWith('t:') ? openT : opened; if (set.has(k)) set.delete(k); else set.add(k); return panel(); }
  else if (a === 'fl-copy') { const txt = flowText(); copyText = null;
    navigator.clipboard.writeText(txt).then(() => { note = 'The flow is copied: paste it to Claude.'; panel(); }, err => { copyText = txt; note = `Copying wasn't allowed here (${err.name}): select the text below and copy it.`; panel(); }); return; }
  else if (a === 'fl-first') { const [m, st] = v.split('@'); D.first[st] = D.first[st] === m ? undefined : m; }
  else if (a === 'fl-rmbox') { removeBox(v); fsel = null; }
  else if (a === 'fl-addst') { if (!v) return; const k = t.dataset.m + '@' + v; boxFor(k); fsel = { node: k }; }
  else if (a === 'fl-addt') { const m = v, st = (D.nodes.find(n => n.k.split('@')[0] === m) || { k: m + '@*' }).k.split('@')[1], id = 'a' + Date.now().toString(36);
    D.arrows.push({ id, from: m, states: [st], to: m + '@*', label: '' }); openT.add(id); reveal(D.arrows[D.arrows.length - 1]); fsel = { arrow: id }; scrollDir = true; focusT = id; }
  else if (a === 'fl-mname') { (D.names || (D.names = {}))[t.dataset.m] = v.trim().slice(0, 32) || nameOf(t.dataset.m); }
  else if (a === 'fl-mnote') { (D.mnotes || (D.mnotes = {}))[t.dataset.m] = v.trim(); }
  else if (a === 'fl-sname') { (D.stateNames || (D.stateNames = {}))[t.dataset.s] = v.trim().slice(0, 32) || stLabel(t.dataset.s); }
  else if (a === 'fl-addstate') { const n = (prompt('A name for the new state (for example: watching a replay)') || '').trim().slice(0, 32); if (!n) return;
    const id = 'st' + Date.now().toString(36); (D.moreStates || (D.moreStates = [])).push(id); (D.stateNames || (D.stateNames = {}))[id] = n; }
  else if (a === 'fl-rmstate') { if (D.nodes.some(x => x.k.endsWith('@' + v)) && !confirm(`Remove the state "${stLabel(v)}" and its boxes?`)) return;
    for (const x of D.nodes.filter(x => x.k.endsWith('@' + v))) removeBox(x.k); D.moreStates = D.moreStates.filter(x => x !== v); delete D.first[v]; fsel = null; }
  else if (a === 'fl-rmmenu') { if (!confirm(`Remove the menu "${nameOf(v)}", its boxes and its transitions?`)) return;
    for (const x of D.nodes.filter(x => x.k.split('@')[0] === v)) removeBox(x.k); D.arrows = D.arrows.filter(x => x.from !== v); D.buttons = D.buttons.filter(x => x.menu !== v); fsel = null; }
  else if (a === 'fl-fname') { const f = D.flags.find(x => x.id === t.dataset.f); if (f && v.trim()) f.name = v.trim().slice(0, 40); }
  else if (a === 'fl-addflag') { const n = (prompt('A fact a transition can depend on (for example: has friends online)') || '').trim().slice(0, 40); if (!n) return; D.flags.push({ id: 'f' + Date.now().toString(36), name: n }); }
  else if (a === 'fl-rmflag') { D.flags = D.flags.filter(f => f.id !== v); for (const x of [...D.arrows, ...D.buttons]) if (x.when) { delete x.when[v]; if (!Object.keys(x.when).length) delete x.when; } }
  else if (a === 'fl-addb') { const id = 'b' + Date.now().toString(36); D.buttons.push({ id, menu: v, states: ['*'], label: '' }); opened.add('m:' + v); opened.add('b:' + v); openT.add(id); focusT = id; }
  else if (a === 'fl-rmb') { D.buttons = D.buttons.filter(x => x.id !== v); }
  else if (a.startsWith('fl-b')) { const bt = D.buttons.find(x => x.id === t.dataset.id); if (!bt) return;
    if (a === 'fl-bword') bt.label = v.trim().slice(0, 48); else if (a === 'fl-bnote') { if (v.trim()) bt.note = v.trim(); else delete bt.note; }
    else if (a === 'fl-bflag') { const x = bt; { const w = x.when || (x.when = {}); if (w[v] === undefined) w[v] = true; else if (w[v]) w[v] = false; else delete w[v]; if (!Object.keys(w).length) delete x.when; } }
    else if (a === 'fl-bst') { const st = new Set(bt.states); if (v === '*') bt.states = ['*']; else { st.delete('*'); if (st.has(v)) st.delete(v); else st.add(v); if (st.size) bt.states = [...st]; } } }
  else if (a.startsWith('fl-t')) { const ar = D.arrows.find(x => x.id === t.dataset.id); if (!ar) return; fsel = { arrow: ar.id };
    if (a === 'fl-tword') ar.label = v.trim().slice(0, 48);
    else if (a === 'fl-tnote') { if (v.trim()) ar.note = v.trim(); else delete ar.note; }
    else if (a === 'fl-tflag') { const x = ar; { const w = x.when || (x.when = {}); if (w[v] === undefined) w[v] = true; else if (w[v]) w[v] = false; else delete w[v]; if (!Object.keys(w).length) delete x.when; } }
    else if (a === 'fl-tst') { const s = new Set(ar.states); if (v === '*') ar.states = ['*']; else { s.delete('*'); if (s.has(v)) s.delete(v); else s.add(v); if (s.size) ar.states = [...s]; } // (always at least one)
      for (const st of ar.states) boxFor(ar.from + '@' + st); reveal(ar); } // (its group changed: shown in its new one)
    else if (a === 'fl-tto-m' || a === 'fl-tto-s') { const [tm, ts] = ar.to.split('@'), m = a === 'fl-tto-m' ? v : tm, st = a === 'fl-tto-s' ? v : ts; ar.to = m + '@' + st;
      if (st !== '*' || !D.nodes.some(n => n.k.startsWith(m + '@'))) boxFor(ar.to); } } // (a box it now goes to that wasn't there: made)
  else if (a === 'fl-add') { let m = $('#flMenu').value; const st = $('#flState').value;
    if (!m) { m = (prompt('A name for the new menu (for example: settings)') || '').trim().toLowerCase().replace(/[^\w-]/g, '').slice(0, 24); if (!m) return; if (!D.extra.includes(m) && !sections().some(x => x.dataset.screen === m) && !NOLAY.includes(m)) D.extra.push(m); }
    boxFor(m + '@' + st); fsel = { node: m + '@' + st }; opened.add('m:' + m); scrollDir = true; }
  else if (a === 'fl-reset') { if (!confirm('Back to the default flowchart? Your boxes and transitions go; layouts stay.')) return; D.nodes = null; D.arrows = null; D.first = {}; fsel = null; focus = null; seed(); }
  else if (a === 'fl-merge') { if (!v || v === t.dataset.m) return; mergeMenu(t.dataset.m, v); fsel = null; opened.add('m:' + v); }
  else if (a === 'fl-split') { const [m, st] = v.split('@'), n = (prompt(`A name for the menu "${nameOf(m)}" becomes ${stLabel(st).toLowerCase()}`, `${nameOf(m)} (${stLabel(st).toLowerCase()})`) || '').trim().slice(0, 32); if (!n) return;
    const nm = splitMenu(m, st, n); fsel = { node: nm + '@' + st }; scrollDir = true; }
  else if (a === 'fl-copyall') { if (!v) return; for (const x of D.arrows.filter(y => y.from === t.dataset.m)) reveal(copyTo(x, v)); for (const b of D.buttons.filter(y => y.menu === t.dataset.m)) D.buttons.push({ ...b, id: 'b' + Date.now().toString(36) + D.buttons.length, menu: v, states: [...b.states] }); opened.add('m:' + v); }
  else if (a === 'fl-copyt') { if (!v) return; const x = D.arrows.find(y => y.id === t.dataset.id); if (x) reveal(copyTo(x, v)); }
  else if (a === 'download') { const u = URL.createObjectURL(new Blob([JSON.stringify(D, null, 1)], { type: 'application/json' })), l = document.createElement('a');
    l.href = u; l.download = `eldorado-design-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000); return; }
  else if (a === 'import') { const f = document.createElement('input'); f.type = 'file'; f.accept = '.json,application/json';
    f.onchange = () => f.files[0] && f.files[0].text().then(txt => { const n = JSON.parse(txt); if (!n || n.v !== 4) throw new Error('not a design from this editor');
      localStorage.setItem(KEY, JSON.stringify(n)); location.reload(); }).catch(err => alert('That file isn\'t a design: ' + err.message)); f.click(); return; }
  else if (a === 'clear') { if (!confirm('Start over: forget this design?')) return; localStorage.removeItem(KEY); location.reload(); return; }
  save(); applyOptions(); layout();
}
box.addEventListener('click', e => { const t = e.target.closest('button'); if (!t || t.disabled) return; if (t.dataset.tab) { tab = t.dataset.tab; mini = false; sel = null; layout(); return; } act(t, t.dataset.act, t.dataset.v); });
box.addEventListener('change', e => { const t = e.target; if (t.matches('select[data-act], input[data-act], textarea[data-act]')) act(t, t.dataset.act, t.value); });
// words and notes kept as they are typed, without drawing the panel again (which would take the field from under the typing): a
// click elsewhere in the panel draws it again before the field's change is told, and the words were lost (2026-10-05)
box.addEventListener('input', e => { const t = e.target, v = t.value, a = t.dataset.act, ar = t.dataset.id && D.arrows.find(x => x.id === t.dataset.id);
  const bt = t.dataset.id && D.buttons.find(x => x.id === t.dataset.id);
  if (a === 'fl-bword' && bt) bt.label = v.trim().slice(0, 48); else if (a === 'fl-bnote' && bt) { if (v.trim()) bt.note = v.trim(); else delete bt.note; }
  else if (a === 'fl-tword' && ar) ar.label = v.trim().slice(0, 48); else if (a === 'fl-tnote' && ar) { if (v.trim()) ar.note = v.trim(); else delete ar.note; }
  else if (a === 'fl-mnote') (D.mnotes || (D.mnotes = {}))[t.dataset.m] = v.trim(); else if (a === 'fl-mname' && v.trim()) (D.names || (D.names = {}))[t.dataset.m] = v.trim().slice(0, 32);
  else if (a === 'fl-sname' && v.trim()) (D.stateNames || (D.stateNames = {}))[t.dataset.s] = v.trim().slice(0, 32); else return;
  save(); });
box.addEventListener('pointerdown', e => { if (!e.target.closest('.ed-head') || e.target.closest('button')) return; const r = box.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
  const mv = ev => { at = { x: Math.max(0, ev.clientX - ox), y: Math.max(0, ev.clientY - oy) }; panel(); }, up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); });
// a row of the directions, or a box's state in them, chosen by a click on it (not on its fields): the chart shows it
box.addEventListener('click', e => { if (e.target.closest('button, select, input, textarea')) return; const r = e.target.closest('[data-darrow], [data-dir]'); if (!r) return;
  fsel = r.dataset.darrow ? { arrow: r.dataset.darrow } : { node: r.dataset.dir }; if (r.dataset.dir && r.dataset.dir.split('@')[0] !== '*') focus = r.dataset.dir; panel(); }); // (a box chosen in the directions: centred)
// the chart: a click on a box centres it; on the centred box, starts a transition from it, which the next click on a box ends there
// (and a click anywhere else drops); on a transition's words, shows it in the directions
box.addEventListener('pointerdown', e => { const svg = e.target.closest && e.target.closest('.ed-fc'); if (tab !== 'flow' || !svg) return; e.preventDefault();
  const g = e.target.closest('.ed-node'), ar = e.target.closest('[data-arrow]'), key = g && g.dataset.node, tabk = e.target.closest('[data-centre]');
  if (tabk && !connect) { focus = tabk.dataset.centre; return panel(); } // (the centre's state)
  if (connect) { connect = null; if (key && key !== focus) { const [m, st] = focus.split('@'), id = 'a' + Date.now().toString(36); D.arrows.push({ id, from: m, states: [st], to: key, label: '' }); for (const k of [m + '@' + st, key]) if (!k.endsWith('@*')) boxFor(k); // (a menu in the tray: the state stays the same)
      only(); openT.add(id); reveal(D.arrows[D.arrows.length - 1]); fsel = { arrow: id }; scrollDir = true; focusT = id; save(); } return panel(); }
  if (key) { if (key === focus) connect = { from: key }; else { focus = key; fsel = { node: key }; only(); opened.add('m:' + key.split('@')[0]); scrollDir = true; } return panel(); }
  if (ar) { const x = D.arrows.find(y => y.id === ar.dataset.arrow); fsel = { arrow: x.id }; only(); reveal(x); openT.add(x.id); scrollDir = true; return panel(); } });
addEventListener('keydown', e => { if (tab === 'flow' && connect && e.key === 'Escape') { connect = null; panel(); } });
addEventListener('pointerdown', e => { if (connect && !(e.target.closest && e.target.closest('.ed-fc'))) { connect = null; panel(); } }, true); // (anywhere outside the chart too: the chart's own clicks are decided above)
// the menu's own screens change by its own clicks: the layout follows whichever is on show
new MutationObserver(() => { if (!drag) layout(); }).observe($('#menu'), { attributes: true, subtree: true, attributeFilter: ['hidden', 'open'] });

/* ---------- styles: the editor's own, and the option sets' ---------- */
const css = document.createElement('style'); css.textContent = `
#edGlass{position:fixed;z-index:1990;background:transparent;touch-action:none}#edGlass[hidden]{display:none}
#edPanel{position:fixed;z-index:2000;width:300px;max-height:86vh;overflow:auto;contain:paint;background:#101915f2;color:#eae3cf;border:1px solid #5b4a26;border-radius:12px;font:13px/1.35 Figtree,system-ui,sans-serif;box-shadow:0 10px 30px #0009}
#edPanel.wide{width:min(1180px,96vw)}
#edPanel .ed-head{display:flex;justify-content:space-between;align-items:center;gap:6px;padding:7px 9px;cursor:move;border-bottom:1px solid #3a3020;position:sticky;top:0;background:#101915;z-index:1}
#edPanel .ed-body{padding:8px 10px}#edPanel p{margin:6px 0}#edPanel hr{border:0;border-top:1px solid #3a3020;margin:8px 0}#edPanel .ed-hint{color:#b8b09a}
#edPanel button,#edPanel select{font:inherit;color:inherit;background:#22302a;border:1px solid #4a5a50;border-radius:7px;padding:2px 7px;margin:2px;cursor:pointer}
#edPanel button.on{background:#e9b24a;color:#2a1c05;border-color:#e9b24a}#edPanel button:disabled{opacity:.35;cursor:default}
#edPanel .ed-r{display:flex;justify-content:space-between;align-items:center;gap:6px;margin:4px 0}#edPanel .ed-r span{display:flex;flex-wrap:wrap;justify-content:flex-end}
#edPanel.flowtab{left:12px!important;right:12px!important;top:12px!important;bottom:12px;width:auto;height:auto;max-height:none;overflow:hidden;display:flex;flex-direction:column}
#edPanel.flowtab .ed-body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 470px;gap:12px}
#edPanel .ed-chart{display:flex;flex-direction:column;min-height:0;gap:4px}#edPanel .ed-chart p{margin:2px 0}#edPanel .ed-ftools{display:flex;flex-wrap:wrap;align-items:center}
#edPanel .ed-flowwrap{flex:1;min-height:0;background:#0b120f;border-radius:10px;overflow:hidden}
#edPanel .ed-fc{display:block;width:100%;height:100%;font:12px system-ui,sans-serif;user-select:none}#edPanel .ed-fc.connect .ed-node{cursor:crosshair}
#edPanel .ed-node.focus rect{stroke:#e9b24a;stroke-width:3}#edPanel .ed-node.focus.linking rect{stroke-dasharray:6 4}#edPanel .ed-node.tray{opacity:.55}#edPanel .ed-node.tnear rect{stroke:#8fc0a0}#edPanel .ed-node.tfocus rect{stroke:#e9b24a}
#edPanel .ed-ln{stroke:#8aa196;stroke-width:1.6}#edPanel .ed-ln.st{stroke:#6fb3dd}#edPanel .ed-ln.on{stroke:#e9b24a;stroke-width:2.2}#edPanel .ed-sep{stroke:#2a3a32}
#edPanel .ed-cap{fill:#98aa9f;font-size:12px;letter-spacing:.06em;text-transform:uppercase}#edPanel .ed-own{fill:#d6cfae;font-size:12px}#edPanel .ed-none{fill:#62756a;font-size:12px;text-anchor:middle;font-style:italic}
#edPanel .ed-st{cursor:pointer}#edPanel .ed-st rect{fill:#16211c;stroke:#3a4a42}#edPanel .ed-st text{fill:#b8c4bd;font-size:11px;text-anchor:middle}#edPanel .ed-st.on rect{fill:#3a2f16;stroke:#e9b24a}#edPanel .ed-st.on text{fill:#f3d48a}
#edPanel .ed-node{cursor:pointer}#edPanel .ed-node rect{fill:#16211c;stroke:#4a5a50;stroke-width:1.5}#edPanel .ed-node.game rect{fill:#13261b;stroke:#3f7a55}#edPanel .ed-node.room rect{fill:#141f2c;stroke:#46688c}#edPanel .ed-node.any rect{fill:#1d1c27;stroke:#7a74a8}
#edPanel .ed-node.nolay rect{stroke-dasharray:4 3}#edPanel .ed-node.on rect{stroke:#e9b24a;stroke-width:2.5}
#edPanel .ed-node .m{fill:#ecf1ec;font-weight:700;font-size:15px}#edPanel .ed-node .s{fill:#98aa9f;font-size:12px}
#edPanel .ed-ar line{stroke:#8aa196;stroke-width:1.6;fill:none}#edPanel .ed-ar line.hit{stroke:transparent;stroke-width:12;cursor:pointer}
#edPanel .ed-ar.st line:not(.hit){stroke:#6fb3dd}#edPanel text.ed-ar.st{fill:#bfe0f5}#edPanel .ed-ar.on line:not(.hit){stroke:#e9b24a;stroke-width:2.2}#edPanel .hd{fill:#8aa196}#edPanel .hdOn{fill:#e9b24a}
#edPanel text.ed-ar{fill:#dfe8e2;font-size:12.5px;text-anchor:middle;paint-order:stroke;stroke:#0b120f;stroke-width:4px;stroke-linejoin:round;cursor:pointer}#edPanel text.ed-ar.on{fill:#f3d48a}
#edPanel .ed-dirs{overflow:auto;min-height:0;position:relative;border-left:1px solid #2a3a32;padding-left:8px}
#edPanel .ed-dir{padding:6px 2px;border-bottom:1px solid #1e2a24}#edPanel .ed-mb{margin-left:22px}
#edPanel .ed-dh{display:flex;align-items:center;gap:4px;flex-wrap:wrap}#edPanel .ed-tw{background:none;border:0;padding:0 3px;min-width:18px;color:#b8c4bd}
#edPanel .ed-box{display:inline-flex;align-items:center;gap:1px;padding:0 0 0 6px;border:1px solid #3a4a42;border-radius:7px;font-size:12px}#edPanel .ed-box.on{border-color:#e9b24a;background:rgba(233,178,74,.1)}
#edPanel .ed-grp{margin:6px 0 0}#edPanel .ed-grp>b{font-size:12px;color:#b8c4bd;font-weight:600}
#edPanel .ed-dr{display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin:3px 0 0 14px;font-size:12px;padding:2px 3px;border-radius:5px}#edPanel .ed-dr.on{background:rgba(233,178,74,.14)}
#edPanel .ed-tx{flex-basis:100%;margin:2px 0 4px 22px}#edPanel .ed-tx .on{background:#3a5a46;border-color:#8fc0a0}
#edPanel .ed-dirs select,#edPanel .ed-dirs input,#edPanel .ed-dirs textarea{background:#0b120f;color:#ecf1ec;border:1px solid #3a4a42;border-radius:5px;font:inherit;font-size:12px;padding:2px 4px}
#edPanel .ed-dirs input{width:170px}#edPanel .ed-dirs input.ed-mname{width:150px;font-weight:700;font-size:13px}#edPanel .ed-dirs textarea{width:calc(100% - 12px);resize:vertical;margin-top:3px}
#edPanel .ed-tag{font-size:11px;padding:1px 6px;border-radius:8px;background:#22302a;color:#b8c4bd}#edPanel .ed-tag.st{background:#173247;color:#bfe0f5}
#edPanel .ed-add{margin-top:10px}#edPanel .ed-states{margin-top:10px;padding-top:8px;border-top:1px solid #2a3a32}
#edPanel textarea.ed-copy{width:100%;height:160px;background:#0b120f;color:#ecf1ec;border:1px solid #3a4a42;font:12px ui-monospace,monospace}
#mform .ed-swapped{display:none!important}#mform .ed-alt.seg{margin-top:2px}
#edPanel .ed-tune{margin:2px 0 10px 12px;padding-left:10px;border-left:2px solid #3a4a42}
section.ed-on .ed-item{outline:1px dashed #e9b24a88;outline-offset:2px;cursor:move;position:relative}section.ed-on .ed-item:hover{outline:1px solid #e9b24a}
#edPanel .ed-edit{font-weight:700;padding:3px 10px}#edPanel .ed-edit.on{background:#d9534f;border-color:#d9534f;color:#fff}#edPanel.editing .ed-head{background:#3a2a0c}
section.ed-on .ed-sel{outline:2px solid #e9b24a!important}section.ed-on .ed-hidden{opacity:.25}section.ed-on .ed-folded{opacity:.6;outline-style:dotted!important}
.ed-grid{position:absolute;inset:0;display:grid;grid-template-columns:repeat(${COLS},minmax(0,1fr));gap:10px;pointer-events:none;z-index:-1}.ed-grid i{border:1px dashed #ffffff1c;border-radius:4px}
.ed-laid .ed-row{display:contents!important}
[data-ed-list]{max-height:none!important;overflow:visible!important}
[data-ed-list="3"]>:nth-child(n+4),[data-ed-list="5"]>:nth-child(n+6),[data-ed-list="10"]>:nth-child(n+11){display:none!important}
section.ed-on [contenteditable]{outline:2px solid #7ec4f5!important;cursor:text;background:rgba(126,196,245,.08)}
.ed-bar{position:sticky;grid-column:1 / -1;z-index:30;isolation:isolate;display:flex;gap:10px;justify-content:flex-end;align-items:center;flex-wrap:wrap;padding:12px 20px;background:#0e1612}
.ed-bar-bottom{bottom:-20px;margin:0 -20px -20px;border-top:1px solid rgba(233,178,74,.35);box-shadow:0 -8px 18px rgba(0,0,0,.35)}
.ed-bar-top{top:-20px;grid-row:1;margin:-20px -20px 0;border-bottom:1px solid rgba(233,178,74,.35);box-shadow:0 8px 18px rgba(0,0,0,.35);justify-content:flex-start}
section.ed-on .ed-bar{outline:1px dashed #e9b24a;outline-offset:-3px}
/* ---------- the looks (owner, 2026-10-05): b brass (the D2-A expedition kit, 681ed0a), c jungle (a field notebook), d water (a river
   chart). Each look is its tokens (colours, its texture, its rule line) and its defaults for the tuning rows (editor.js LOOKS);
   the rows (accent, headings, ornament, corners, main button, board backdrop) each change one part, whatever the look */
html[data-edcolors=b]{--k-text:#f1e6cf;--k-muted:#b3a58c;--k-faint:#7c6f58;--k-panA:#2a2016;--k-panB:#15100b;--k-frame:#b98d4b;--k-line:rgba(199,154,82,.35);--k-acc:#efcd8a;
  --k-btnA:#34281a;--k-btnB:#221a11;--k-btnH:#403120;--k-priA:#f6d88f;--k-priM:#dcac55;--k-priB:#b98434;--k-priInk:#2a1b06;--k-priEdge:#7a5620;--k-field:#120e09;--k-row:#16110b;
  --k-sel:rgba(199,154,82,.16);--k-vpA:#1b2a1e;--k-vpB:#101a14;--k-vpC:#0a0f0b;--k-rule:1px solid;--k-tex:radial-gradient(120% 80% at 50% 0%,rgba(255,220,160,.07),transparent 60%)}
html[data-edcolors=b][data-edacc="2"]{--k-frame:#a8763e;--k-line:rgba(168,118,62,.38);--k-acc:#e0ae72;--k-priA:#e9b47a;--k-priM:#c4874a;--k-priB:#8d5a26;--k-priEdge:#5e3a16;--k-sel:rgba(168,118,62,.16)}
html[data-edcolors=b][data-edacc="3"]{--k-frame:#c07a50;--k-line:rgba(192,122,80,.38);--k-acc:#f2b48c;--k-priA:#f5c2a0;--k-priM:#d98a5c;--k-priB:#a85a34;--k-priInk:#2a1006;--k-priEdge:#6e3418;--k-sel:rgba(192,122,80,.16)}
html[data-edcolors=c]{--k-text:#eef0df;--k-muted:#a9bba0;--k-faint:#6f8468;--k-panA:#16291d;--k-panB:#0f1d15;--k-frame:rgba(170,205,140,.45);--k-line:rgba(170,205,140,.3);--k-acc:#d6e8a0;
  --k-btnA:#1d3626;--k-btnB:#1a3122;--k-btnH:#244430;--k-priA:#d5eb90;--k-priM:#b4d76a;--k-priB:#8cbf4a;--k-priInk:#13240b;--k-priEdge:#5f8f2c;--k-field:#0d1a12;--k-row:rgba(10,22,14,.7);
  --k-sel:rgba(169,207,98,.1);--k-vpA:#173322;--k-vpB:#0e1f15;--k-vpC:#08120c;--k-rule:1px dashed;
  --k-tex:repeating-linear-gradient(115deg,rgba(220,255,200,.018) 0 2px,transparent 2px 11px),radial-gradient(140% 90% at 0% 0%,rgba(150,190,90,.11),transparent 55%)}
html[data-edcolors=c][data-edacc="2"]{--k-acc:#9fe8c2;--k-priA:#8fe6b8;--k-priM:#5fd39a;--k-priB:#2e9e66;--k-priInk:#05200f;--k-priEdge:#1d6b44;--k-sel:rgba(95,211,154,.1)}
html[data-edcolors=c][data-edacc="3"]{--k-acc:#f0b8f0;--k-priA:#f2c2f2;--k-priM:#dc96dd;--k-priB:#b768c0;--k-priInk:#2a0d2e;--k-priEdge:#7e3e86;--k-sel:rgba(220,150,221,.1)}
html[data-edcolors=d]{--k-text:#e6eef6;--k-muted:#93aac0;--k-faint:#5e7690;--k-panA:#0f1f33;--k-panB:#0a1626;--k-frame:rgba(150,200,240,.45);--k-line:rgba(127,196,232,.3);--k-acc:#7fc4e8;
  --k-btnA:rgba(16,30,50,.35);--k-btnB:rgba(16,30,50,.35);--k-btnH:rgba(127,196,232,.1);--k-priA:#62dcea;--k-priM:#3fd0e0;--k-priB:#2fb8c8;--k-priInk:#04202a;--k-priEdge:#3fd0e0;--k-field:#081321;
  --k-row:rgba(8,18,32,.8);--k-sel:rgba(63,208,224,.08);--k-vpA:#13263b;--k-vpB:#0b1828;--k-vpC:#060d17;--k-rule:3px double;
  --k-tex:repeating-radial-gradient(circle at 88% 12%,transparent 0 26px,rgba(140,190,235,.05) 26px 27px)}
html[data-edcolors=d][data-edacc="2"]{--k-acc:#6fd6c8;--k-priA:#59c9bb;--k-priM:#2fa39a;--k-priB:#23857d;--k-priInk:#02201d;--k-priEdge:#2fa39a;--k-sel:rgba(47,163,154,.1)}
html[data-edcolors=d][data-edacc="3"]{--k-acc:#ffb39c;--k-priA:#ffa58a;--k-priM:#ff8a6b;--k-priB:#e86f50;--k-priInk:#2a0c04;--k-priEdge:#ff8a6b;--k-sel:rgba(255,138,107,.1)}
/* corners: buttons, panels, small parts (rows, fields, segments) */
html[data-edcor=brass]{--k-rb:9px;--k-rp:14px;--k-rs:8px}html[data-edcor=leaf]{--k-rb:16px 4px 16px 4px;--k-rp:28px 28px 28px 8px;--k-rs:14px 4px 14px 4px}
html[data-edcor=soft]{--k-rb:12px;--k-rp:18px;--k-rs:10px}html[data-edcor=round]{--k-rb:999px;--k-rp:24px;--k-rs:14px}html[data-edcor=sharp]{--k-rb:3px;--k-rp:4px;--k-rs:2px}
/* the parts every look styles, from its tokens */
html[data-edlook]{--surf:var(--k-panA);--surf2:color-mix(in srgb,var(--k-acc) 12%,var(--k-panA));
  --line:var(--k-line);--line2:var(--k-line);--muted:var(--k-muted);--faint:var(--k-faint)}
html[data-edlook] #menu{background:rgba(4,6,8,.74)}
html[data-edlook] .mframe{background:var(--k-panB);border:1px solid var(--k-frame);border-radius:var(--k-rp);box-shadow:0 30px 80px rgba(0,0,0,.6)}
html[data-edlook] .modal{background:var(--k-tex),linear-gradient(180deg,var(--k-panA),var(--k-panB)) var(--k-panB);color:var(--k-text)}
html[data-edlook] .surf{border-radius:var(--k-rs);box-shadow:inset 0 1px 0 rgba(255,255,255,.06)} /* (its edge stays solid, no shadow outside: page's .surf) */
html[data-edlook] #actBtns .btn{background-color:var(--k-panB)}
html[data-edlook] .modal h2,html[data-edlook] .brand{color:var(--k-acc)}
html[data-edlook] .field>label{color:var(--k-acc);display:flex;align-items:center;gap:10px;margin-bottom:10px}
html[data-edlook] .field>label::after{content:"";flex:1;border-bottom:var(--k-rule) var(--k-line)}html[data-edlook] .field>label.chk::after{display:none}
html[data-edlook] .btn{background:linear-gradient(180deg,var(--k-btnA),var(--k-btnB));border:1px solid var(--k-line);border-radius:var(--k-rb);color:var(--k-text);box-shadow:0 2px 0 rgba(0,0,0,.45)}
html[data-edlook] .btn:hover{background:var(--k-btnH);border-color:var(--k-acc)}
html[data-edlook] .seg{background:var(--k-field);border-color:var(--k-line);border-radius:var(--k-rs)}html[data-edlook] .seg label{border-radius:var(--k-rs)}
html[data-edlook] .seg button.on,html[data-edlook] .seg label:has(input:checked){background:var(--k-sel);color:var(--k-acc);box-shadow:inset 0 0 0 1px var(--k-acc)}
html[data-edlook] .clist button,html[data-edlook] .clist label,html[data-edlook] .rlist button,html[data-edlook] .rrow,html[data-edlook] .seatrow,html[data-edlook] .pst{background:var(--k-row);border-color:var(--k-line);border-radius:var(--k-rs)}
html[data-edlook] .clist button.on,html[data-edlook] .clist label:has(input:checked){border-color:var(--k-acc);background:var(--k-sel)}
html[data-edlook] .prow input,html[data-edlook] select.who{background-color:var(--k-field);border-color:var(--k-line);border-radius:var(--k-rs)}
html[data-edlook] select.who option,html[data-edlook] select.who optgroup{background:var(--k-panB)}
html[data-edlook] .ingame{border-color:var(--k-acc);background:var(--k-sel)}html[data-edlook] .aitag{color:var(--k-acc);border-color:var(--k-line)}
html[data-edlook] .sws label:has(input:checked){border-color:var(--k-acc)}html[data-edlook] .modal.menu{scrollbar-color:var(--k-line) transparent}
html[data-edlook] .tbtn,html[data-edlook] .pchip,html[data-edlook] .zoomctl button,html[data-edlook] .pile .lbl,html[data-edlook] #rdock button{border-radius:var(--k-rb)}
html[data-edlook] .tbtn.on{border-color:var(--k-acc);color:var(--k-acc)}html[data-edlook] .zoomctl button{color:var(--k-acc)}
html[data-edlook] #prompt,html[data-edlook] #banner{border-radius:var(--k-rp);color:var(--k-text)}html[data-edlook] #prompt b{color:var(--k-acc)}
html[data-edlook] #hist{background:linear-gradient(180deg,var(--k-panA),var(--k-panB));border-radius:var(--k-rp)}html[data-edlook] .ht+.ht{border-top:1px dashed var(--k-line)}
html[data-edlook] .fend .fpill{border-color:var(--k-line);background:var(--k-sel);color:var(--k-text)}
html[data-edlook] #rdock .rspd{border-color:var(--k-line)}html[data-edlook] .sclose{border-color:var(--k-line);background:var(--k-panB)}html[data-edlook] .bs-x{background:var(--k-panB)}
/* ornament: plain (flat panels), textured (the look's grain), framed (the grain and an inner frame) */
html[data-edlook][data-edorn=plain] .modal{background:linear-gradient(180deg,var(--k-panA),var(--k-panB)) var(--k-panB)}
html[data-edlook][data-edorn=frame] .mframe{box-shadow:inset 0 0 0 5px var(--k-panB),inset 0 0 0 6px var(--k-line),0 30px 80px rgba(0,0,0,.65)}
html[data-edlook][data-edorn=frame] .surf{box-shadow:inset 0 0 0 3px var(--k-panB),inset 0 0 0 4px var(--k-line)}
/* the main button: metal (polished, lit from above), solid, flat (a ring around it), outlined */
html[data-edlook] .btn.pri,html[data-edlook] #rdock .rgrp button.pri{color:var(--k-priInk);border-color:var(--k-priEdge)}
html[data-edlook][data-edpri=metal] .btn.pri,html[data-edlook][data-edpri=metal] #rdock .rgrp button.pri{background:linear-gradient(180deg,var(--k-priA),var(--k-priM) 45%,var(--k-priB));box-shadow:inset 0 1px 0 rgba(255,255,255,.55),inset 0 -2px 0 rgba(0,0,0,.22),0 2px 0 rgba(0,0,0,.55),0 6px 14px rgba(0,0,0,.4)}
html[data-edlook][data-edpri=solid] .btn.pri,html[data-edlook][data-edpri=solid] #rdock .rgrp button.pri{background:linear-gradient(180deg,var(--k-priA),var(--k-priB));box-shadow:0 2px 0 rgba(0,0,0,.5),0 8px 18px rgba(0,0,0,.3)}
html[data-edlook][data-edpri=flat] .btn.pri,html[data-edlook][data-edpri=flat] #rdock .rgrp button.pri{background:var(--k-priM);border-color:var(--k-priM);box-shadow:0 0 0 3px var(--k-panB),0 0 0 4px var(--k-priM)}
html[data-edlook][data-edpri=outline] .btn.pri,html[data-edlook][data-edpri=outline] #rdock .rgrp button.pri{background:var(--k-sel);border:1.5px solid var(--k-priM);color:var(--k-priA);box-shadow:none}
html[data-edlook] .btn.pri:hover{box-shadow:inset 0 0 0 99px rgba(255,255,255,.08)} /* (brighter, never by a filter: text under a filter is grey-smoothed) */
/* headings: serif, italic serif, spaced capitals */
html[data-edlook]:is([data-edhd=serif],[data-edhd=italic]) :is(.modal h2,.field>label,#hub label,.brand,#roundLbl,.hwho,#playLbl,#banner .s,.aitag,.clist .dtag){font-family:var(--display,'Young Serif',serif);font-weight:400;text-transform:none;letter-spacing:0}
html[data-edlook][data-edhd=italic] :is(.modal h2,.field>label,#hub label,.brand,#roundLbl,.hwho,#playLbl,#banner .s,.aitag,.clist .dtag){font-style:italic}
html[data-edlook]:is([data-edhd=serif],[data-edhd=italic]) :is(.field>label,#hub label){font-size:17px}html[data-edlook]:is([data-edhd=serif],[data-edhd=italic]) #roundLbl{font-size:14px}
html[data-edlook][data-edhd=caps] :is(.modal h2,.field>label,#hub label,.brand,#roundLbl,#playLbl,#banner .s,.aitag,.clist .dtag){font-family:var(--ui,system-ui,sans-serif);font-style:normal;text-transform:uppercase;letter-spacing:.18em;font-weight:700}
html[data-edlook][data-edhd=caps] .modal h2{font-size:20px;font-weight:800}html[data-edlook][data-edhd=caps] :is(.field>label,#hub label){font-size:11.5px}
html[data-edlook][data-edhd=caps] .brand{font-size:15px;font-weight:800;letter-spacing:.16em}html[data-edlook][data-edhd=caps] .hwho{text-transform:uppercase;letter-spacing:.1em;font-size:12px}
/* the board's backdrop: the look's tint behind the board, or the page's own */
html[data-edlook][data-edbg=tint] #vp{background:radial-gradient(ellipse 85% 75% at 45% 40%,var(--k-vpA) 0%,var(--k-vpB) 55%,var(--k-vpC) 100%)}
`;
document.head.appendChild(css);
applyOptions(); layout();
