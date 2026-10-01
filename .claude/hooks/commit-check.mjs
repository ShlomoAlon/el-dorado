// The commit check (CLAUDE.md "Fixing bugs"): every commit says whether it fixes a bug and, if so, what kind of fix it is.
// The message must have:
//   Fix: none                      not a bug fix (a feature, docs, tooling)
//   Fix: ROOT | PARTIAL | HACK     a bug fix, with two more lines:
//   Decision: <the design decision that made the bug possible, and what the fix changes about it>
//   Ratchet: <the assertion (or test) that fails if the bug comes back, or "none" and why>
// A HACK also needs "Owner OK: <when the owner agreed>".
// One check, two triggers:
//   - Claude Code hook (PreToolUse on Bash, .claude/settings.json): reads the tool call on stdin; exit 2 blocks the command
//   - git commit-msg hook (.githooks/commit-msg, installed by node build.mjs): called with the message file; exit 1 refuses
//     (works in a session started before the Claude Code hook existed, and for any commit made in this clone)
import fs from 'node:fs';
function problems(msg) {
  const kind = (msg.match(/^\s*Fix: (ROOT|PARTIAL|HACK|none)\b/m) || [])[1], bad = [];
  if (!kind) bad.push('a line "Fix: ROOT", "Fix: PARTIAL", "Fix: HACK" or "Fix: none" (not a bug fix)');
  else if (kind !== 'none') {
    if (!/^\s*Decision: \S.{15,}/m.test(msg)) bad.push('a line "Decision: <the design decision behind the bug, and what the fix changes about it>"');
    if (!/^\s*Ratchet: \S.{3,}/m.test(msg)) bad.push('a line "Ratchet: <the assertion that fails if it comes back, or none and why>"');
    if (kind === 'HACK' && !/^\s*Owner OK: \S/m.test(msg)) bad.push('a line "Owner OK: <when the owner agreed to this hack>"');
  }
  return bad;
}
const refuse = (bad, code) => { console.error('commit refused (CLAUDE.md "Fixing bugs"): the message needs\n  - ' + bad.join('\n  - ')); process.exit(code); };
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
