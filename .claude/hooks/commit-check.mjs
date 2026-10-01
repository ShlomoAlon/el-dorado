// The commit check (CLAUDE.md "Fixing bugs"): every commit says whether it fixes a bug and, if so, what kind of fix it is.
// The message must have:
//   Fix: none                      not a bug fix (a feature, docs, tooling)
//   Fix: ROOT | PARTIAL | HACK     a bug fix, with three more lines (CLAUDE.md "Fixing bugs", step 8):
//   Decision: <the design decision that made the bug possible, why it was a mistake, what the fix changes about it>
//   Ratchet: <the assertions that fail if it comes back>
//   Coverage: <the integration test that now trips them, and that it failed before the fix>
// Either may be "none" only when an assertion or test is truly impossible (extreme cases), acknowledged in full:
//   Coverage: none — WARNING WARNING WARNING: <why nothing can check this>
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
    for (const [name, what] of [['Ratchet', 'the assertion that fails if it comes back'], ['Coverage', 'the integration test that now trips the assertion, and that it failed before the fix']]) {
      const v = (msg.match(new RegExp('^\\s*' + name + ': (.*)$', 'm')) || [])[1];
      if (!v || v.trim().length < 4) bad.push(`a line "${name}: <${what}>"`);
      else if (/^none\b/i.test(v.trim()) && !/WARNING WARNING WARNING:\s*\S.{20,}/.test(v))
        bad.push(`"${name}: none" only when nothing can check it, acknowledged: "${name}: none — WARNING WARNING WARNING: <why nothing can check this>"`);
    }
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
