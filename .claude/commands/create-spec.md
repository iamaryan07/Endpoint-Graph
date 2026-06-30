# Command: /create-spec

## What this command does

Takes a description from the user and creates a fully detailed spec file in `.claude/specs/`.

Never implements code. Only writes the spec.

---

## Steps Claude must follow — in this exact order

### Step 1 — Read CLAUDE.md

Read `.claude/CLAUDE.md` fully before doing anything else.

Internalize:
- The full tech stack and versions
- The project folder structure
- The DB schema and every column
- The API contract
- The key decisions that must not be changed
- What is in v1 and what is not
- The coding conventions (JavaScript not TypeScript, no Docker, raw asyncpg, etc.)

### Step 2 — Read the user's description

Understand what feature the user is describing. Map it to the right part of the project:
- Is this backend (FastAPI, analysis, DB)?
- Is this frontend (Next.js, React Flow, UI)?
- Is this both?
- Does it depend on a previous spec being done first?

### Step 3 — Determine the spec number and name

List all files currently in `.claude/specs/`. Specs follow two naming conventions:
- V1 specs: `NN-short-name.md` (e.g. `01-db-schema.md`, `09-frontend-graph.md`)
- V2 specs: `v2-NN-short-name.md` (e.g. `v2-01-db-migration.md`, `v2-06-repos-route.md`)

For v2 specs, find the highest existing `v2-NN` number and use the next one.
Use the `v2-NN` prefix for any spec that is part of the v2 feature set (see CLAUDE.md V2 scope).

Name the file:
- V2: `v2-NN-short-name.md` where `NN` is two digits (e.g. `v2-07`, `v2-08`)
- `short-name` = 2-4 words, kebab-case
- Examples: `v2-07-repos-page.md`, `v2-08-scoped-graph.md`, `v2-11-endpoint-nodes.md`

### Step 4 — Write the spec file

Write to `.claude/specs/NN-short-name.md` using the exact format below.

The spec must be detailed enough that Claude can implement it in a later session with no ambiguity and no need to ask questions. Include exact function signatures, exact SQL, exact API shapes, exact component props, exact file paths.

---

## Spec file format

```markdown
# Spec NN — Feature Name

## Goal
One sentence. What this spec delivers when fully implemented.

## Depends on
List spec numbers that must be complete before this one.
Write "none" if this is the first spec or has no dependencies.

## Context
Which part of the project this touches. Why it matters. How it fits
into the overall flow (refer back to CLAUDE.md architecture if needed).

## Files to create
List every new file with its path and one line about what it does.
- `backend/analysis/cloner.py` — clones a GitHub repo into a temp dir using a token

## Files to edit
List every existing file that needs changes and what changes.
- `backend/main.py` — register the new router

## Implementation details

This section must be specific enough to implement without asking questions.

Include:
- Exact function signatures with parameter names and types
- Exact SQL queries (copy from CLAUDE.md if applicable)
- Exact Pydantic model fields
- Exact API request/response shapes
- Exact React component props
- Any edge cases to handle
- Any error states to handle

Example level of detail:

### backend/analysis/cloner.py

Two functions:

`clone_repo(repo_url: str, github_token: str) -> str`
- Strips https:// from the URL if present
- Validates it starts with github.com/
- Builds auth URL: `https://{token}@{repo_url}`
- Runs: `git clone --depth 1 {auth_url} {tmp_dir}`
- tmp_dir = `/tmp/{uuid4()}`
- Raises RuntimeError with stderr if clone fails
- Returns the tmp_dir path

`delete_repo(tmp_dir: str) -> None`
- Calls shutil.rmtree(tmp_dir, ignore_errors=True)
- Always safe to call even if dir doesn't exist

## Test cases

List every test that must be written for this spec.
Be specific — name the test and say what it checks.

- `test_clone_public_repo` — clones a known public repo, checks tmp dir exists and has files
- `test_clone_invalid_url` — passes "notgithub.com/x/y", expects ValueError
- `test_clone_bad_token` — passes a bad token, expects RuntimeError with clone failure message
- `test_delete_repo_cleans_up` — clones then deletes, checks dir no longer exists
- `test_delete_repo_safe_if_missing` — calls delete_repo on nonexistent path, no error raised

## Done when

Every item must be true before this spec is considered complete.

- [ ] All files listed in "Files to create" exist
- [ ] All files listed in "Files to edit" have been updated
- [ ] Every function in "Implementation details" is implemented with the exact signature
- [ ] Every test case listed passes
- [ ] No TypeScript — all files are .js or .jsx (frontend specs only)
- [ ] No hardcoded credentials anywhere
- [ ] Follows conventions from CLAUDE.md (raw asyncpg, no ORM, ssr:false on React Flow, etc.)
```

---

## What Claude must NOT do

- Do not write any implementation code — only the spec file
- Do not skip Step 1 (reading CLAUDE.md) even if it feels redundant
- Do not suggest features that are marked as v3 in CLAUDE.md (field-level analysis, log ingestion, gRPC, PR bot, etc.)
- Do not use TypeScript, Docker, SQLAlchemy, or any tool not in the stack
- Do not create a spec for something that conflicts with a key decision in CLAUDE.md
- Do not number the spec incorrectly — always check existing specs first; use `v2-NN` prefix for v2 specs
- Do not write vague implementation details — every function must have a signature

---

## Example

User runs: `/create-spec clone a github repo using the user's github token`

Claude:
1. Reads CLAUDE.md — sees that repo cloning uses `subprocess`, GitHub token comes from `X-GitHub-Token` header, Python 3.11+, no external git libraries
2. Reads the description — this is the repo cloner feature
3. Checks `.claude/specs/` — sees `01-db-schema.md` and `02-github-auth.md` exist
4. Names the file `03-repo-cloner.md`
5. Writes the full spec to `.claude/specs/03-repo-cloner.md`
6. Tells the user: "Created `.claude/specs/03-repo-cloner.md`. Depends on spec 02 (GitHub auth must be done first so the token exists). Review it and tell me to implement when ready."