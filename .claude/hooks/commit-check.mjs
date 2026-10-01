// Claude Code hook (PreToolUse, Bash; .claude/settings.json): every `git commit` Claude runs says whether it fixes a bug
// and, if so, what kind of fix it is (CLAUDE.md "Fixing bugs"). The message must have:
//   Fix: none                      not a bug fix (a feature, docs, tooling)
//   Fix: ROOT | PARTIAL | HACK     a bug fix, with two more lines:
//   Decision: <the design decision that made the bug possible, and what the fix changes about it>
//   Ratchet: <the assertion (or test) that fails if the bug comes back, or "none" and why>
// A HACK also needs "Owner OK: <when the owner agreed>". Exit 2 blocks the command and tells Claude why.
import fs from 'node:fs';
const input = JSON.parse(fs.readFileSync(0, 'utf8')), cmd = (input.tool_input && input.tool_input.command) || '';
if (!/(^|[\n;&|(]\s*)git\s+(-\S+\s+)*commit\b/.test(cmd) || /\s--no-edit\b/.test(cmd)) process.exit(0); // (--no-edit: a merge's own message)
// the message is in the command (-m "...", or a heredoc for -F -), or in a file named by -F / --file
let msg = cmd;
for (const m of cmd.matchAll(/(?:-F\s*|--file[=\s])(['"]?)([^\s'"]+)\1/g)) if (m[2] !== '-') msg += '\n' + fs.readFileSync(m[2], 'utf8');
const kind = (msg.match(/^\s*Fix: (ROOT|PARTIAL|HACK|none)\b/m) || [])[1], bad = [];
if (!kind) bad.push('a line "Fix: ROOT", "Fix: PARTIAL", "Fix: HACK" or "Fix: none" (not a bug fix)');
else if (kind !== 'none') {
  if (!/^\s*Decision: \S.{15,}/m.test(msg)) bad.push('a line "Decision: <the design decision behind the bug, and what the fix changes about it>"');
  if (!/^\s*Ratchet: \S.{3,}/m.test(msg)) bad.push('a line "Ratchet: <the assertion that fails if it comes back, or none and why>"');
  if (kind === 'HACK' && !/^\s*Owner OK: \S/m.test(msg)) bad.push('a line "Owner OK: <when the owner agreed to this hack>"');
}
if (bad.length) { console.error('commit blocked (CLAUDE.md "Fixing bugs"): the message needs\n  - ' + bad.join('\n  - ')); process.exit(2); }
