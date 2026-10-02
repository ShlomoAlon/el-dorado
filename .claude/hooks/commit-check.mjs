// The commit check (CLAUDE.md "Fixing bugs", step 8): a commit message answers the questions in .claude/bugfix-commit.md,
// each question word for word with its answer under it ("A: …"), one bug per commit. The questions are read from that
// file (one source); the rules for the answers are below and listed there too.
// One check, two triggers:
//   - Claude Code hook (PreToolUse on Bash, .claude/settings.json): reads the tool call on stdin; exit 2 blocks the command
//   - git commit-msg hook (.githooks/commit-msg, installed by node build.mjs): called with the message file; exit 1 refuses
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TPL = fs.readFileSync(path.join(ROOT, '.claude/bugfix-commit.md'), 'utf8');
const isQ = l => /^Q\d+ \(/.test(l.trim());
const questions = title => TPL.split(/^## /m).find(s => s.startsWith(title)).split('\n').filter(isQ);
const FIX_QS = questions('A bug fix'), NONE_QS = questions('Not a bug fix');
// every source file's text: a quoted assertion message must be found in it
function sources() { const out = []; const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name);
  if (f.isDirectory()) walk(p); else if (/\.(m?js|html)$/.test(f.name) && f.name !== 'engine.gen.js') out.push(fs.readFileSync(p, 'utf8')); } }; walk(path.join(ROOT, 'src')); return out.join('\n'); }
function problems(msg) {
  const kind = (msg.match(/^\s*Fix: (ROOT|PARTIAL|HACK|none)\b/m) || [])[1];
  if (!kind) return ['a line "Fix: ROOT", "Fix: PARTIAL" or "Fix: HACK" (a bug fix), or "Fix: none" (not a bug fix)'];
  const lines = msg.split('\n'), bad = [], ans = {};
  for (const q of kind === 'none' ? NONE_QS : FIX_QS) {
    const at = lines.flatMap((l, i) => l.trim() === q ? [i] : []), id = q.split(' ')[0];
    if (at.length !== 1) { bad.push(at.length ? `${id} once only (one bug per commit)` : `the question word for word (.claude/bugfix-commit.md):\n      ${q}`); continue; }
    const a = []; for (let i = at[0] + 1; i < lines.length && !isQ(lines[i]); i++) a.push(lines[i]);
    const text = a.join('\n').trim(); ans[id] = text.replace(/^A:\s*/, '');
    if (!/^A:\s*\S/.test(text) || ans[id].length < 3) bad.push(`an answer under ${id}, starting "A:"`);
  }
  if (kind === 'none' || bad.length) return bad;
  if (!/^yes\b/i.test(ans.Q2)) bad.push('Q2 answered "Yes": otherwise split the commit (one bug per commit)');
  for (const k of ['Q3', 'Q4', 'Q7', 'Q12']) if (/^none\b/i.test(ans[k]) && !/WARNING WARNING WARNING:\s*\S.{20,}/.test(ans[k]))
    bad.push(`${k}: "none" only when nothing can check it, acknowledged: "A: none — WARNING WARNING WARNING: <why nothing can check this>"`);
  const src = sources();
  for (const k of ['Q3', 'Q12']) { if (/^none\b/i.test(ans[k])) continue;
    const quoted = [...ans[k].matchAll(/"([^"]{8,})"/g)].map(m => m[1]);
    if (!quoted.length && !(k === 'Q12' && /\bQ3\b/.test(ans[k]))) bad.push(`${k}: quote the assertion's message in double quotes`);
    for (const m of quoted) if (!src.includes(m)) bad.push(`${k}: no assertion in src/ says "${m}"`); }
  if (kind === 'HACK' && !/Owner OK:\s*\S/.test(ans.Q11)) bad.push('Q11 for a HACK: "Owner OK: <when the owner agreed>"');
  if (kind !== 'ROOT' && !/^yes\b.{40,}/is.test(ans.Q14)) bad.push(`Q14 for a ${kind}: "Yes", and why no root fix exists (not certain? do the root fix instead)`);
  return bad;
}
const refuse = (bad, code) => { console.error('commit refused (CLAUDE.md "Fixing bugs", .claude/bugfix-commit.md): the message needs\n  - ' + bad.join('\n  - ')); process.exit(code); };
if (process.argv[2]) { // git: the message file (comment lines are not part of the message)
  const msg = fs.readFileSync(process.argv[2], 'utf8').split('\n').filter(l => !l.startsWith('#')).join('\n');
  if (/^(Merge|fixup!|squash!) /.test(msg)) process.exit(0);
  const bad = problems(msg); if (bad.length) refuse(bad, 1);
} else { // Claude Code: the Bash command about to run
  const input = JSON.parse(fs.readFileSync(0, 'utf8')), cmd = (input.tool_input && input.tool_input.command) || '';
  if (!/(^|[\n;&|(]\s*)git\s+(-\S+\s+)*commit\b/.test(cmd) || /\s--no-edit\b/.test(cmd)) process.exit(0); // (--no-edit: a merge's own message)
  // the message is in the command (-m "...", or a heredoc for -F -), or in a file named by -F / --file
  let msg = cmd;
  for (const m of cmd.matchAll(/(?:-F\s*|--file[=\s])(['"]?)([^\s'"]+)\1/g)) if (m[2] !== '-') msg += '\n' + fs.readFileSync(m[2], 'utf8');
  const bad = problems(msg); if (bad.length) refuse(bad, 2);
}
