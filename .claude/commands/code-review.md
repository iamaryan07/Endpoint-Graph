# Command: /code-review

## What this command does

Runs a full code review on a spec that has been implemented and tested.
Calls quality-reviewer and security-reviewer in parallel, combines their
reports, and gives a single final verdict.

You run: `/code-review <path-to-spec>`
Example: `/code-review .claude/specs/03-repo-cloner.md`

This command sits after /test-feature in the workflow.
Do not run /code-review if /test-feature has not passed.

---

## Pre-flight checks — run before anything else

### Check 1 — Spec path is provided

If the user did not provide a spec path:
- Stop
- Tell the user: "Provide the spec path. Usage: `/code-review .claude/specs/NN-specname.md`"
- Do not proceed

### Check 2 — Spec file exists

Check that the file at the provided path actually exists.

If it does not:
- Stop
- Tell the user: "Spec file not found at `{path}`. Check the filename and try again."
- List what is currently in `.claude/specs/`
- Do not proceed

### Check 3 — Implementation exists

Read the spec's "Files to create" section.
Check that every file listed actually exists on disk.

If any file is missing:
- Stop
- Tell the user: "Implementation is incomplete. Missing files: {list}. Run `/implement-spec` first."
- Do not proceed

### Check 4 — Tests have passed

Check that the test file for this spec exists.

Look for:
- `backend/tests/test_NN_specname.py` (if spec touches backend)
- `frontend/__tests__/*.test.jsx` referenced in the spec (if spec touches frontend)

If test files do not exist:
- Stop
- Tell the user: "No test files found for this spec. Run `/test-feature {path}` first and make sure all tests pass before reviewing."
- Do not proceed

If test files exist, continue. (This command trusts that /test-feature
was run and passed. It does not re-run the tests.)

---

## Steps — in this exact order

### Step 1 — Read CLAUDE.md

Read `.claude/CLAUDE.md` fully.

This is the baseline for both reviewers. Both agents will read it
themselves, but this command also needs it to:
- Determine which files belong to backend vs frontend
- Know the API contract to validate against
- Know the DB schema to validate against
- Know the auth flow to check for bypasses
- Know the v1 scope to catch scope creep

### Step 2 — Read the spec

Read `.claude/specs/NN-specname.md` fully.

Extract:
- Files created and edited
- Function signatures
- API shapes
- What is backend, what is frontend, what is both
- The "Done when" checklist

### Step 3 — Announce what is about to happen

Tell the user:

```
Running code review for: NN-specname

Launching in parallel:
  → quality-reviewer   (spec compliance, conventions, code quality)
  → security-reviewer  (credentials, injection, auth, data exposure)
```

### Step 4 — Run both agents in parallel

Launch both agents at the same time. Do not wait for one to finish
before starting the other.

Pass to each agent:
- The spec file path
- The list of all files created/edited (from spec "Files to create" and "Files to edit")

#### quality-reviewer
Read `.claude/agents/quality-reviewer.md` and execute it fully.
Capture its complete report.

#### security-reviewer
Read `.claude/agents/security-reviewer.md` and execute it fully.
Capture its complete report.

Wait for both to finish before proceeding to Step 5.

### Step 5 — Combine the findings

Collect all findings from both reports.

Build a combined critical list — all 🔴 CRITICAL findings from both agents:
- Quality criticals (wrong signature, wrong table name, v2 feature, etc.)
- Security criticals (injection, credential leak, no auth check, etc.)

Count totals:
- Quality: N critical, N warning, N suggestion
- Security: N critical, N warning, N note
- Combined criticals: N total

### Step 6 — Evaluate the "Done when" checklist

Read the spec's "Done when" checklist one more time.

Cross-reference with both review reports.
Mark each item ✓ or ✗.

A checklist item fails if either reviewer flagged a critical related to it.

### Step 7 — Write the combined report

Output one consolidated report:

```
╔═══════════════════════════════════════════╗
║  Code Review: NN-specname                 ║
╚═══════════════════════════════════════════╝

Reviewed by: quality-reviewer + security-reviewer (parallel)

━━━ Quality Review ━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 Critical:    N
🟡 Warnings:    N
🔵 Suggestions: N

[Full quality-reviewer report here — all sections, all findings]

━━━ Security Review ━━━━━━━━━━━━━━━━━━━━━━━━

🔴 Critical:    N
🟡 Warnings:    N
🔵 Notes:       N

[Full security-reviewer report here — all sections, all findings]

━━━ Combined Summary ━━━━━━━━━━━━━━━━━━━━━━━

Total critical findings: N (Q: N quality + S: N security)
Total warnings:          N
Total suggestions/notes: N

Done-when checklist:
  ✓ backend/analysis/cloner.py exists
  ✓ clone_repo() has correct signature
  ✗ No hardcoded credentials — DATABASE_URL hardcoded (security finding #3)
  ✗ try/finally around clone — missing (security finding #2)
  ✓ All test cases written
  ✓ No TypeScript files
  ✓ Uses asyncpg pool

━━━ Fixes required ━━━━━━━━━━━━━━━━━━━━━━━━━

All critical findings must be fixed before this spec is done.
Fix in this order (security first, then quality):

  1. [S] backend/analysis/cloner.py:31
     Command injection — remove shell=True
     → subprocess.run(["git", "clone", auth_url, tmp_dir])

  2. [S] backend/routers/analyze.py:45
     Wrap analysis in try/finally to guarantee delete_repo() runs

  3. [S] backend/analysis/cloner.py:8
     Hardcoded DATABASE_URL — use os.getenv("DATABASE_URL")

  4. [Q] backend/analysis/cloner.py:12
     Wrong function signature — rename params to match spec exactly

  5. [Q] backend/routers/analyze.py:28
     asyncpg.connect() per request — use pool from database.py

╔═══════════════════════════════════════════╗
║  RESULT: NEEDS FIXES                      ║
║  5 critical findings (3 security,         ║
║  2 quality) must be resolved.             ║
╚═══════════════════════════════════════════╝

After fixing, run /code-review again to confirm.
```

If both reviewers find zero critical findings:

```
╔═══════════════════════════════════════════╗
║  Code Review: NN-specname                 ║
╚═══════════════════════════════════════════╝

Reviewed by: quality-reviewer + security-reviewer (parallel)

━━━ Quality Review ━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 Critical:    0
🟡 Warnings:    N
🔵 Suggestions: N

[Full quality-reviewer report]

━━━ Security Review ━━━━━━━━━━━━━━━━━━━━━━━━

🔴 Critical:    0
🟡 Warnings:    N
🔵 Notes:       N

[Full security-reviewer report]

━━━ Combined Summary ━━━━━━━━━━━━━━━━━━━━━━━

Total critical findings: 0
Total warnings:          N
Total suggestions/notes: N

Done-when checklist:
  ✓ [every item]

━━━ Remaining warnings ━━━━━━━━━━━━━━━━━━━━━

[List all warnings and suggestions from both reviewers]
These are not blocking. Address them when time allows.

╔═══════════════════════════════════════════╗
║  RESULT: APPROVED ✓                       ║
║  No critical findings.                    ║
║  Safe to commit.                          ║
╚═══════════════════════════════════════════╝

Suggested commit message:
  feat: implement repo cloner with GitHub token auth (spec 03)

Next spec: .claude/specs/04-openapi-parser.md
```

---

## Re-run behaviour

When the user fixes critical findings and runs `/code-review` again
on the same spec:

- Re-run both agents fully — do not cache previous results
- A finding that was previously critical may now be fixed
- New findings may surface if the fix introduced something new
- Every re-run is a full fresh review

Tell the user at the start of a re-run:
```
Re-running code review for: NN-specname
(Previous run found N critical findings)
```

---

## Full workflow position

This command sits here in the overall workflow:

```
/create-spec       → write the spec
/review-spec       → catch spec problems early
/implement-spec    → write the code
/test-feature      → write and run tests  ← must pass before /code-review
/code-review       → quality + security review in parallel  ← you are here
commit             → only after /code-review passes
```

Do not approve a spec for commit if /code-review has not passed.
Do not skip /test-feature before running /code-review.

---

## What this command must NOT do

- Do not skip pre-flight checks
- Do not run if tests have not been written
- Do not fix any code — both agents are read-only, this command is read-only
- Do not run the agents sequentially — they must run in parallel
- Do not approve if either agent finds a critical finding
- Do not omit either agent's full report from the output
- Do not suggest committing if any critical finding exists
- Do not re-use results from a previous run — always re-run both agents fresh