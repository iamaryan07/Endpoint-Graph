# Command: /test-feature

## What this command does

Orchestrates the full testing pipeline for a spec that has just been
implemented. Calls test-writer then test-runner in sequence and gives
you a final pass/fail verdict.

You run: `/test-feature <path-to-spec>`
Example: `/test-feature .claude/specs/03-repo-cloner.md`

---

## Pre-flight checks — run before anything else

### Check 1 — Spec path is provided

If the user did not provide a spec path:
- Stop
- Tell the user: "Provide the spec path. Usage: `/test-feature .claude/specs/NN-specname.md`"
- Do not proceed

### Check 2 — Spec file exists

Check that the file at the provided path actually exists.

If it does not:
- Stop
- Tell the user: "Spec file not found at `{path}`. Check the filename and try again."
- List what is currently in `.claude/specs/` so the user can pick the right one
- Do not proceed

### Check 3 — Spec has been implemented

Read the spec's "Files to create" section.
Check that every file listed actually exists on disk.

If any file is missing:
- Stop
- Tell the user: "This spec has not been implemented yet. The following files are missing: {list}. Run `/implement-spec` first."
- Do not proceed

If all files exist: continue to Step 1.

---

## Steps — in this exact order

### Step 1 — Read CLAUDE.md

Read `.claude/CLAUDE.md` fully.

Extract:
- Project folder structure
- Tech stack (pytest for backend, Jest for frontend)
- Coding conventions — to understand what kind of tests are appropriate

### Step 2 — Read the spec file

Read the spec at the provided path fully.

Determine:
- What was built (backend, frontend, or both)
- The "Test cases" section — what tests should exist
- The "Files to create" section — which files were implemented
- The "Done when" checklist — what must be true for this spec to be complete

### Step 3 — Announce the plan

Tell the user what is about to happen:

```
Running test pipeline for: NN-specname

Step 1 of 2 — test-writer: writing tests
Step 2 of 2 — test-runner: running tests

Scope:
  Backend tests: yes / no
  Frontend tests: yes / no
```

### Step 4 — Call test-writer agent

Hand off to `.claude/agents/test-writer.md` with:
- The spec file path
- The list of implemented files (from spec's "Files to create")

Wait for test-writer to complete and return its summary:
- Which test files were written
- How many tests per file
- Which mocks were used

If test-writer fails or cannot write tests:
- Stop
- Report what went wrong
- Do not call test-runner

### Step 5 — Call test-runner agent

Hand off to `.claude/agents/test-runner.md` with:
- The spec file path
- The summary from test-writer (test files written, test counts)

Wait for test-runner to complete and return its full report:
- Passed / failed counts
- Failure details with categories and causes
- Final verdict

### Step 6 — Evaluate the "Done when" checklist

Read the spec's "Done when" checklist.
Cross-reference it with the test-runner results.

Mark each item:
- ✓ if satisfied
- ✗ if not satisfied (with reason)

Items to check beyond tests:
- Every file in "Files to create" exists on disk
- Every file in "Files to edit" was modified
- No TypeScript files exist where JS was required
- No hardcoded credentials in any created file
- CLAUDE.md conventions are followed (asyncpg pool, ssr:false, lib/api.js, etc.)

### Step 7 — Write the final report

Output one consolidated report combining everything:

```
═══════════════════════════════════════════
  Test Pipeline: NN-specname
═══════════════════════════════════════════

── test-writer ─────────────────────────────
  Backend:   backend/tests/test_NN_specname.py — N tests written
  Frontend:  frontend/__tests__/Name.test.jsx — N tests written
  Total:     N tests written

── test-runner ─────────────────────────────
  Backend (pytest):   N passed, N failed, N errors
  Frontend (jest):    N passed, N failed

── failures ────────────────────────────────

  1. test_name_here
     Category: A — Implementation bug
     Fix in:   backend/path/to/file.py
     Detail:   [what failed and why]

  2. test_name_here
     Category: B — Test bug
     Fix in:   backend/tests/test_file.py
     Detail:   [what failed and why]

── done-when checklist ─────────────────────
  ✓ backend/analysis/cloner.py exists
  ✓ clone_repo() has correct signature
  ✓ delete_repo() has correct signature
  ✓ All 5 test cases from spec written
  ✗ No hardcoded credentials — DATABASE_URL found hardcoded in cloner.py
  ✓ Uses asyncpg pool not new connection
  ✓ No TypeScript files created

═══════════════════════════════════════════
  RESULT: FAILING — 2 test failures, 1 checklist item failing
═══════════════════════════════════════════

What to fix:
  1. backend/analysis/cloner.py:34 — check subprocess returncode and raise RuntimeError
  2. backend/tests/test_cloner.py:67 — mock not applied correctly, see Category B detail
  3. backend/analysis/cloner.py — remove hardcoded DATABASE_URL, use os.getenv()

Run /test-feature .claude/specs/NN-specname.md again after fixing.
```

If everything passes:

```
═══════════════════════════════════════════
  Test Pipeline: NN-specname
═══════════════════════════════════════════

── test-writer ─────────────────────────────
  Backend:   backend/tests/test_NN_specname.py — N tests written
  Frontend:  frontend/__tests__/Name.test.jsx — N tests written
  Total:     N tests written

── test-runner ─────────────────────────────
  Backend (pytest):   N passed, 0 failed, 0 errors
  Frontend (jest):    N passed, 0 failed

── done-when checklist ─────────────────────
  ✓ [every item checked]

═══════════════════════════════════════════
  RESULT: ALL PASSING ✓
═══════════════════════════════════════════

Spec 03 is done. Safe to commit.

Suggested commit message:
  feat: implement repo cloner with GitHub token auth (spec 03)

Next spec: .claude/specs/04-openapi-parser.md
```

---

## Re-run behaviour

When the user runs `/test-feature` again on the same spec after fixing:

- Do NOT re-run test-writer — tests already exist
- Jump directly to test-runner
- Tell the user: "Tests already written. Running test-runner only."

Detect this by checking if the test file already exists before calling test-writer.

---

## What this command must NOT do

- Do not skip pre-flight checks
- Do not call test-runner if test-writer failed
- Do not mark the spec as done if any test is failing
- Do not mark the spec as done if any checklist item is failing
- Do not fix any code — only report what needs fixing
- Do not run tests for other specs — only the spec provided
- Do not re-run test-writer if test files already exist