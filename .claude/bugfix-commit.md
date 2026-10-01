# Commit message questions (CLAUDE.md "Fixing bugs", step 8)

The commit check (`.claude/hooks/commit-check.mjs`, both a Claude Code hook and git's commit-msg hook) reads the
questions from this file: a commit message must contain each question line below **word for word**, each followed by
an answer line starting `A:`. One bug per commit.

## A bug fix (`Fix: ROOT`, `Fix: PARTIAL` or `Fix: HACK`)
Q1 (the bug): What did the owner see, or what was found, in one sentence?
Q2 (one bug): Is this the only bug this commit fixes? Does every change in the diff serve this one fix? If anything else is in it (another bug, a refactor, a rename), split it into its own commit first.
Q3 (step 2): Which assertion should have fired? Quote its message exactly, in double quotes. Is it new or did it exist?
Q4 (step 2): Which integration test reached the bug's state and failed on the shipped code? Quote the failing line.
Q5 (step 3): How did it ship: not reached, excused, not counted, or not running there? Why?
Q6 (step 3): What design decision about coverage let it ship, why is that a mistake in itself, and what are its siblings (other states and assertions it leaves unreached)?
Q7 (step 4): How was the gap closed along the coverage axis (not just for this bug), and did that test fail on the shipped code?
Q8 (step 5): The chain: symptom → mechanism → root cause → design decision.
Q9 (step 5): Why was that decision a mistake in itself (the principle it breaks, true even without this bug), and what are its siblings?
Q10 (step 5, tripwire): Is this the second change to the same element or function for the same goal? If yes, what was rethought?
Q11 (ROOT/PARTIAL/HACK): Why this kind and not the one above it? For PARTIAL: what remains and why. For HACK: when did the owner agree?
Q12 (step 6): Which assertion does the root cause suggest? Quote its message in double quotes and name the test that fires it on the code before the fix, or say why the assertion in Q3 already states it.
Q13 (step 7): Full suite exit code; what was checked at the owner's setup; what could not be verified?

## Not a bug fix (`Fix: none`)
Q0 (not a fix): Why is this not a bug fix?

## Rules the check applies to the answers
- Q2's answer starts with "Yes" (otherwise split the commit).
- Q3 and Q12 quote assertion messages in double quotes, and each quoted message must appear in the code (`src/`).
- An answer of "none" to Q3, Q4, Q7 or Q12 is allowed only when an assertion or test is truly impossible, acknowledged in
  full: `A: none — WARNING WARNING WARNING: <why nothing can check this>`.
- For HACK, Q11's answer says when the owner agreed ("Owner OK: …").
- Titles starting "WIP" never reach `main` (git's pre-push hook, `.githooks/pre-push`).
