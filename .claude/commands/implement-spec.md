# Command: /implement-spec

## What this command does

Implements a spec file from `.claude/specs/`. Writes production-ready code
that exactly matches what the spec describes.

Never modifies the spec file. Never skips the pre-flight checks.

---

## Pre-flight checks — run these before touching any code

### Check 1 — Must be on main branch

Run: `git branch --show-current`

If the output is NOT `main`:
- Stop immediately
- Tell the user: "You are on branch `{branch-name}`. Switch to `main` before implementing. Run: `git checkout main`"
- Do not proceed

If the output IS `main`: continue to Check 2.

### Check 2 — No uncommitted changes

Run: `git status --porcelain`

If the output is NOT empty (any staged, unstaged, or untracked files exist):
- Stop immediately
- Show the user the list of changed files
- Tell the user: "You have uncommitted changes. Commit or stash them before implementing. Run `git status` to review."
- Do not proceed

If the output IS empty (clean working tree): continue to Step 1.

---

## Steps Claude must follow — in this exact order

### Step 1 — Read CLAUDE.md

Read `.claude/CLAUDE.md` fully.

Internalize everything:
- Full tech stack and versions (Next.js 16, Tailwind v4, FastAPI, Supabase, asyncpg)
- Project folder structure (where files live)
- DB schema (exact table and column names)
- API contract (exact routes, request/response shapes)
- Auth flow (GitHub token via X-GitHub-Token header)
- Key decisions (no TypeScript, no Docker, no ORM, no Supabase JS client for DB, ssr:false on React Flow)
- Coding conventions
- What is in v1 and what is not

### Step 2 — Read the spec file

The user will name the spec. Read `.claude/specs/NN-specname.md` fully.

From the spec, extract:
- Goal — what this delivers
- Depends on — which specs must already be done
- Files to create — every new file and what it does
- Files to edit — every existing file and what changes
- Implementation details — exact signatures, SQL, API shapes, component props
- Test cases — every test that must be written
- Done when — the completion checklist

### Step 3 — Check dependencies

The spec lists which previous specs it depends on under "Depends on".

For each dependency, verify the required files from that spec actually exist.

If a dependency is missing:
- Stop
- Tell the user: "Spec NN depends on spec MM (`MM-specname.md`) which has not been implemented yet. Implement that first."
- Do not proceed

If all dependencies are satisfied: continue to Step 4.

### Step 4 — Read any referenced specs

If the spec says "see spec NN" or references another spec for context, read that
spec file too before writing any code.

### Step 5 — Implement

Write all code described in the spec. Follow these rules strictly:

#### General rules
- Implement exactly what the spec says — no more, no less
- If the spec says a function has a specific signature, use that exact signature
- If the spec includes SQL, use that exact SQL
- Do not add features not in the spec
- Do not add v2 features even if they seem like a natural addition

#### Python environment rules (from CLAUDE.md)
- Always run Python commands inside `backend/.venv`
- Before running any `pip install`, activate the venv first
- After installing any new package, run `pip freeze > requirements.txt` immediately
- All packages in `requirements.txt` must use `==` pinned versions
- Never install packages globally

#### Python rules (from CLAUDE.md)
- Python 3.11+
- All route handlers are `async def`
- DB calls use the asyncpg pool from `database.py` — never open a new connection per request
- Use Pydantic models for all request bodies and responses
- Use `python-dotenv` to load env vars — never hardcode
- `yaml.safe_load()` always — never `yaml.load()`
- Raw asyncpg queries — no SQLAlchemy, no ORM
- Type hints on every function signature

#### JavaScript rules (from CLAUDE.md)
- All files are `.js` or `.jsx` — no `.ts` or `.tsx` anywhere
- All API calls go through `lib/api.js` — no inline fetch in components or pages
- Supabase JS client is used for auth only — never for DB queries
- React Flow must use dynamic import with `ssr: false`
- Tailwind v4: no `tailwind.config.js`, all config in `globals.css` via `@theme {}`

#### Test rules
- Write every test case listed in the spec's "Test cases" section
- Backend tests go in `backend/tests/`
- Frontend tests go in `frontend/__tests__/` or alongside the component
- Tests must actually run and pass — do not write placeholder tests

### Step 6 — Self-check against "Done when"

Read the "Done when" checklist from the spec.

Go through every item and verify it is true:
- Every file listed in "Files to create" exists
- Every file listed in "Files to edit" has been updated
- Every function has the exact signature from the spec
- Every test case from the spec has been written
- No TypeScript files created (frontend specs)
- No hardcoded credentials
- Conventions from CLAUDE.md are followed

If any item is not satisfied, fix it before finishing.

### Step 7 — Report to the user

When implementation is complete, tell the user:

1. Every file created (with path)
2. Every file edited (with path and what changed)
3. How many tests were written
4. The "Done when" checklist with every item checked off
5. Reading order — the order in which the user should read the changed
   files to understand what was built, with one line per file explaining
   what to look for when reading it
6. What to run next: "Run `/test-feature` to verify."

#### Reading order rules

The reading order must be logical — foundational files first, then files
that build on them, then tests last. Think of it as "if someone sat down
to understand this implementation from scratch, what would they open first?"

General ordering principles:
- Data shapes before logic (models/types before functions that use them)
- Low-level utilities before high-level callers (url_matcher before spec_parser before analyze route)
- Core logic before the route that exposes it
- The route before the test that calls it
- Tests always last — they make most sense after you understand what they are testing

Format it as a numbered list with a short "what to look for" note per file:

```
Reading order:

1. backend/models.py
   → see the AnalyzeRequest and AnalyzeResponse shapes this spec builds around

2. backend/analysis/cloner.py
   → core logic: how clone_repo() validates the URL and calls subprocess

3. backend/routers/analyze.py
   → how the route wires the token from the header into clone_repo()

4. backend/main.py
   → the one-line router registration added here

5. backend/tests/test_cloner.py
   → read after the implementation to see what each test is verifying
```

---

## What Claude must NOT do

- Do not start if pre-flight checks fail
- Do not read the spec before reading CLAUDE.md
- Do not implement anything not described in the spec
- Do not create `.ts` or `.tsx` files
- Do not use Docker, SQLAlchemy, TypeScript, or any tool not in the stack
- Do not add features the spec does not mention, even obvious ones
- Do not write placeholder or skipped tests — every listed test must pass
- Do not hardcode DATABASE_URL, tokens, or any credentials
- Do not use `yaml.load()` — always `yaml.safe_load()`
- Do not open a new asyncpg connection per request — always use the pool
- Do not put fetch() calls inside components — always use `lib/api.js`
- Do not forget `ssr: false` on any component that uses React Flow
- Do not implement v2 features (field-level analysis, log ingestion, gRPC, multi-language)

---

## Example

User runs: `/implement-spec 03-repo-cloner`

Claude runs pre-flight:
```
$ git branch --show-current
main  ✓

$ git status --porcelain
        ✓  (empty — clean working tree)
```

Claude reads `.claude/CLAUDE.md` → reads `.claude/specs/03-repo-cloner.md`

Checks dependencies: spec says "Depends on: 02-github-auth" → checks
`backend/auth.py` exists → it does → proceed.

Implements:
- Creates `backend/analysis/cloner.py` with `clone_repo()` and `delete_repo()`
- Edits `backend/main.py` to import cloner
- Creates `backend/tests/test_cloner.py` with all 5 listed test cases

Self-checks "Done when" list — all items pass.

Reports:
```
Implemented spec 03 — Repo Cloner

Created:
  backend/analysis/cloner.py
  backend/tests/test_cloner.py

Edited:
  backend/main.py — imported cloner module

Tests written: 5
  ✓ test_clone_public_repo
  ✓ test_clone_invalid_url
  ✓ test_clone_bad_token
  ✓ test_delete_repo_cleans_up
  ✓ test_delete_repo_safe_if_missing

Done when checklist:
  ✓ backend/analysis/cloner.py exists
  ✓ clone_repo() has exact signature from spec
  ✓ delete_repo() has exact signature from spec
  ✓ All 5 test cases written
  ✓ No hardcoded credentials
  ✓ Follows CLAUDE.md conventions

Reading order:

1. backend/analysis/cloner.py
   → start here: see how clone_repo() validates the URL format,
     builds the authenticated git URL, calls subprocess, and raises
     on failure. then see delete_repo() which is always called in finally.

2. backend/main.py
   → one change only: the cloner import added at the top. confirms
     where the module sits in the app.

3. backend/tests/test_cloner.py
   → read last: each test maps directly to a behaviour in cloner.py.
     seeing the tests after the implementation shows what edge cases
     were deliberately handled.

Run /test-feature .claude/specs/03-repo-cloner.md to verify.
```