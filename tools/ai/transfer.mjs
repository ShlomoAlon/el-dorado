// Start a network for a new course from a network trained on another course (transfer learning, no training from scratch).
//   node tools/ai/transfer.mjs <from.json> <course-id> <out.json>
// The network's input = a course-independent summary (BOT_NF values: route distances, terrain ahead, cards, blockades, …)
// followed by course-specific slots (every space × 4 players, every tile connection × 8). The summary weights and all hidden
// layers are copied; the course-specific input weights start at zero, so the new network plays exactly like the old one
// through its summary features at first and then learns the new board's specifics.
import { E } from '../../src/engine.gen.js';
import { readFileSync, writeFileSync } from 'node:fs';
const [, , from, courseId, out] = process.argv;
const src = JSON.parse(readFileSync(from, 'utf8')), H1 = src.b1.length;
const course = E.courseById(courseId); if (!course || course.id !== courseId) throw new Error('unknown course ' + courseId);
E.newGame({ course, seed: 1, fullRace: true, players: [0, 1, 2].map(i => ({ name: 'P' + i, color: '#fff' })) });
const nf = E.botNetNF(), K = E.BOT_NF, w1T = new Array(nf * H1).fill(0);
for (let k = 0; k < K; k++) for (let j = 0; j < H1; j++) w1T[k * H1 + j] = src.w1T[k * H1 + j];
const net = { ...src, course: courseId, nf, w1T, from: (src.from ? src.from + ' → ' : '') + `${from.split('/').pop()} (${src.course})`, unsettled: src.unsettled };
writeFileSync(out, JSON.stringify(net));
console.log(`${from} (${src.course}, nf ${src.nf}) → ${out} (${courseId}, nf ${nf}): ${K} summary inputs and all hidden layers copied, ${nf - K} course-specific inputs start at zero`);
