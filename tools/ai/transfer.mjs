// Start a network for other courses from a trained one (transfer learning, no training from scratch).
//   node tools/ai/transfer.mjs <from.json> <course-id> <out.json>            one-course network for another course
//   node tools/ai/transfer.mjs <from.json> multi:<id>,<id>,… <out.json>      one network for several courses (engine_bot.js: net.courses)
// The network's input = a course-independent summary (BOT_NF values: route distances, terrain ahead, cards, blockades, …)
// [+ BOT_FLAGS rule switches for multi-course networks] + course-specific slots (every space × 4 players, every tile connection × 8).
// The summary weights and all hidden layers are copied; the source course's own board block is copied too (so on that course the
// new network plays exactly like the old one); every other block and the rule switches start at zero.
import { E } from '../../src/engine.gen.js';
import { readFileSync, writeFileSync } from 'node:fs';
const [, , from, target, out] = process.argv;
const src = JSON.parse(readFileSync(from, 'utf8')), H1 = src.b1.length, K = E.BOT_NF, srcBlock = src.nf - K;
const multi = target.startsWith('multi:'), courses = multi ? target.slice(6).split(',') : [target];
for (const id of courses) { const c = E.courseById(id); if (!c || c.id !== id) throw new Error('unknown course ' + id); }
const blockOf = id => { E.newGame({ course: E.courseById(id), seed: 1, fullRace: true, players: [0, 1, 2].map(i => ({ name: 'P' + i, color: '#fff' })) }); E.setNet(null); return E.botNetNF() - K; };
const sizes = courses.map(blockOf), FL = multi ? E.BOT_FLAGS : 0, nf = K + FL + sizes.reduce((a, x) => a + x, 0);
const w1T = new Array(nf * H1).fill(0), copyRows = (dst, srcRow, n) => { for (let r = 0; r < n; r++) for (let j = 0; j < H1; j++) w1T[(dst + r) * H1 + j] = src.w1T[(srcRow + r) * H1 + j]; };
copyRows(0, 0, K); let o = K + FL, copied = false;
if (src.courses) { // extending a multi-course network: keep its rule switches and every board block it already has
  if (!multi) throw new Error('a multi-course source can only be extended (multi:…)');
  copyRows(K, K, E.BOT_FLAGS); const srcOff = {}; let so = K + E.BOT_FLAGS; src.courses.forEach(id => { srcOff[id] = so; so += blockOf(id); });
  courses.forEach((id, i) => { if (srcOff[id] != null) { copyRows(o, srcOff[id], sizes[i]); copied = true; } o += sizes[i]; });
} else courses.forEach((id, i) => { if (id === src.course) { if (sizes[i] !== srcBlock) throw new Error('block size mismatch for ' + id); copyRows(o, K, sizes[i]); copied = true; } o += sizes[i]; });
const net = { ...src, nf, w1T, from: `${from.split('/').pop()} (${src.course})` };
if (multi) { net.courses = courses; net.course = 'multi'; } else net.course = courses[0];
writeFileSync(out, JSON.stringify(net));
console.log(`${from} (${src.course}, nf ${src.nf}) → ${out} (${multi ? 'courses ' + courses.join(', ') : courses[0]}, nf ${nf}): summary + hidden layers copied${copied ? `, ${src.course} board block copied` : ''}; ${nf - K - (copied ? srcBlock : 0)} inputs start at zero`);
