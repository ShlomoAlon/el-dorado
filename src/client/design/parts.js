/* The building blocks of the menus, as the design editor knows them (owner, 2026-10-05: "every time you create a building
   block, you have to improve the editor so that it understands it"). test/design.cjs fails when the menus hold an element
   that is none of these, nor a container below, nor inside one of them: a new block is added here first. */
const PARTS = [
  ['button.btn', 'Button', 'button'], ['button.linkbtn', 'Link', 'button'],
  ['.seg', 'Switch', null], ['.clist', 'Cards', null], ['select', 'Dropdown', null], ['.sws', 'Colours', null], ['.chk', 'Checkbox', null],
  ['.box', 'Box', 'box'], ['#acct', 'Account line', null], ['.list', 'List', null], ['.field', 'Field', null],
  ['h2', 'Title', 'text'], ['p.sub', 'Lead', 'text'], ['.field>label:not(.chk)', 'Label', 'text'], ['p.note, .aiNote', 'Note', 'text'],
  ['input:not([type=radio]):not([type=checkbox])', 'Text box', null], ['.mtop, .mrow, .opts, .prow, .ig-b', 'Row', null],
];
export const PART = PARTS.map(p => p[0]).join(', ');
export const UNIT = '.seg, .clist, .sws, select, .chk'; // (taken whole by a click; a double-click reaches their options)
export const OPTION = '.seg>label, .clist>*, .sws>label';
export const partSpec = el => PARTS.find(([s]) => el.matches(s)) || (el.matches(OPTION) ? [OPTION, 'Option', null] : null);
// the types a part can take within its family: classes only (the theme's own), or another element for text
export const TYPES = {
  button: [['main', 'Main', ['btn', 'pri']], ['plain', 'Plain', ['btn']], ['link', 'Link', ['linkbtn']]],
  box: [['plain', 'Plain', []], ['gold', 'Gold', ['gold']], ['dashed', 'Dashed', ['dashed']]],
  text: [['title', 'Title', 'h2'], ['lead', 'Lead', 'p.sub'], ['note', 'Note', 'p.note']],
};
export const WIDTHS = [['', 'Auto'], ['d-w4', '¼'], ['d-w2', '½'], ['d-w1', 'Full']];
export const ALLOWED = new Set(['btn', 'pri', 'big', 'linkbtn', 'gold', 'dashed', 'd-w4', 'd-w2', 'd-w1']); // (the classes an edit may set)
// where a part may go: a list takes boxes; a row takes controls and text; a stack takes anything but options
export const STACK = 'section[data-screen], .field, .tab, #oPlay, #oIn, #oOut, #oOff, #lbList, #pf';
const ROW = '.mtop, .mrow, .opts, .prow, .ig-b, .box:not(.down)';
export const LIST = '.list';
export const CHOICE = '.seg, .clist, .sws'; // (controls whose options can be added, moved, or taken to another of their kind)
export const CONTAINER = [STACK, ROW, LIST, CHOICE].join(', ');
const kindOf = e => ['seg', 'clist', 'sws'].find(k => e.classList.contains(k));
export function accepts(c, el, from = el.parentElement) {
  if (el.matches(OPTION) || (from && from.matches(CHOICE))) return c.matches(CHOICE) && kindOf(c) === kindOf(from); // (an option goes only into its own kind of control)
  if (c.matches(CHOICE)) return false;
  if (c === el || el.contains(c)) return false;
  if (c.matches(LIST)) return el.matches('.box');
  if (c.matches(ROW)) return el.matches('button, .seg, select, .chk, input, p.note, .aiNote');
  if (c.matches('.field')) return !el.matches('.field');
  return c.matches(STACK);
}

// the parts that can be added (the panel's Add row): each as the theme makes it, with words to replace
export const BLOCKS = [
  ['Button', '<button type="button" class="btn">New button</button>'], ['Main button', '<button type="button" class="btn pri">New button</button>'],
  ['Link', '<button type="button" class="linkbtn">New link</button>'], ['Title', '<h2>New title</h2>'], ['Lead', '<p class="sub">New lead</p>'],
  ['Note', '<p class="note">New note</p>'], ['Box', '<div class="box">New box</div>'], ['Field', '<div class="field"><label>New field</label></div>'],
];
