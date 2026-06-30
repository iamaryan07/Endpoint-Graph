# Command: /review-spec

## What this command does

Reviews a spec file before implementation. Catches problems early —
ambiguities, missing details, wrong assumptions, conflicts with CLAUDE.md,
dependency issues — so that when /implement-spec runs, it has everything
it needs and produces correct code on the first attempt.

Never writes implementation code. Never modifies the spec directly
unless the user explicitly says "fix it".

---

## Steps Claude must follow — in this exact order

### Step 1 — Read CLAUDE.md

Read `.claude/CLAUDE.md` fully before looking at the spec.

This is the source of truth for:
- Tech stack and versions
- Folder structure
- DB schema
- API contract
- Auth flow
- Key decisions
- Coding conventions
- v1 scope (what is in and what is not)

### Step 2 — Read the spec file

Read `.claude/specs/NN-specname.md` fully.

The user will name which spec to review.
If they do not name one, read the most recently created file in `.claude/specs/`.

### Step 3 — Check for conflicts with CLAUDE.md

Go through every detail in the spec and check it against CLAUDE.md.

Flag anything that contradicts a decision already made:

| What to check | What would be wrong |
|---|---|
| File extensions | `.ts` or `.tsx` files — must be `.js` or `.jsx` |
| DB access from frontend | Spec tells Next.js to query Supabase directly |
| ORM usage | Spec imports SQLAlchemy or any ORM |
| Docker references | Spec mentions Docker or docker-compose |
| v3 features | Spec implements field-level analysis, log ingestion, gRPC, PR bot, background jobs |
| Auth method | Spec uses NextAuth instead of Supabase Auth |
| React Flow SSR | Spec mounts React Flow without `ssr: false` |
| API calls in components | Spec puts fetch() inside a component instead of `lib/api.js` |
| yaml.load | Spec uses `yaml.load()` instead of `yaml.safe_load()` |
| New asyncpg connection per request | Spec opens a connection instead of using the pool |
| Hardcoded credentials | Any hardcoded URL, token, password, or key |
| TypeScript syntax | Type annotations, interfaces, `as Type` casts in JS files |

### Step 4 — Check dependencies

Read the "Depends on" section of the spec.

For each listed dependency:
- Does that spec file exist in `.claude/specs/`?
- Are the dependencies in the right order? (e.g. auth before cloner, cloner before analyze)
- Is anything missing from the dependency list that should be there?

Flag:
- Missing deps that should be listed
- Deps listed that don't exist yet as spec files
- Circular or impossible ordering

### Step 5 — Check implementation details for completeness

The implementation details section must be specific enough that Claude can
implement with zero ambiguity. Flag anything vague:

**For backend specs, check:**
- Every function has a name, parameters with types, and return type
- Every SQL query is written out (not described in words)
- Every Pydantic model has all its fields listed
- Every error case is described (what to raise, what to return)
- File paths are exact (not "somewhere in the analysis folder")
- It's clear which router file the route goes into
- Every DB-touching route lists both `Depends(get_github_token)` AND `Depends(get_current_user_id)`
- Every DB transaction calls `set_rls_context(conn, user_id)` first
- Any INSERT into `services`, `endpoints`, or `consumer_edges` includes `ON CONFLICT ... DO UPDATE`

**For frontend specs, check:**
- Every component has its props listed
- It's clear which page or layout the component is used in
- API calls reference the function name from `lib/api.js`
- Any React Flow usage specifies `ssr: false` dynamic import
- Tailwind classes are used — no inline styles unless unavoidable

**For both:**
- Edge cases are covered (empty results, network errors, bad input)
- It's clear what happens on error (error message shown? redirect? throw?)

### Step 6 — Check test cases for completeness

Every test case in the spec must be specific enough to actually write.

Flag any test case that is:
- Too vague: "test that it works" — works how? what input? what expected output?
- Missing an important path: happy path exists but error cases are not tested
- Untestable as written: depends on external services without mocking guidance
- Missing entirely: an obvious failure mode with no test

For backend: check that unhappy paths are tested (bad token, missing file,
DB error, invalid URL format).

For frontend: check that the component renders correctly, handles loading
state, and handles empty/error responses from the API.

### Step 7 — Check the "Done when" checklist

The checklist is what /test uses to verify completion. It must be:
- Specific (not "the feature works")
- Checkable by looking at files and running tests
- Complete — every file, every function, every test case should appear

Flag any checklist item that is too vague to verify.
Flag any file or function from the spec that is missing from the checklist.

### Step 8 — Write the review report

Output a structured report with four sections:

---

**Report format:**

```
## Review: NN-specname.md

### ✓ Looks good
List everything that is correctly specified and ready to implement.

### ✗ Conflicts with CLAUDE.md
List every conflict found in Step 3.
For each: what the spec says → what it should say instead.

### ⚠ Ambiguities (will block implementation)
List everything vague enough to cause Claude to make a wrong assumption.
For each: what is unclear → what needs to be specified.

### △ Missing (should be added)
List anything that is absent but should be there.
For each: what is missing → suggested addition.

### Verdict
READY — no issues found, safe to run /implement-spec
  or
NEEDS CHANGES — X issues found. Fix the spec before implementing.
```

---

If the verdict is NEEDS CHANGES:
- List every issue clearly
- Do not auto-fix the spec
- Wait for the user to say "fix it" before making any edits

If the user says "fix it" after seeing the report:
- Apply every fix from the report to the spec file
- Show a diff of what changed (before → after for each fix)
- Re-run the review from Step 3 to confirm all issues are resolved
- Output: "All issues resolved. Safe to run /implement-spec."

---

## What Claude must NOT do

- Do not implement any code
- Do not modify the spec unless the user explicitly says "fix it"
- Do not skip reading CLAUDE.md first
- Do not approve a spec that conflicts with CLAUDE.md decisions
- Do not approve a spec with vague function signatures
- Do not approve a spec with missing test cases for obvious error paths
- Do not approve a spec that references v3 features (field-level analysis, log ingestion, gRPC, PR bot, background jobs, teams/sharing)
- Do not add new features to the spec during a fix — only fix the issues found

---

## Example

User runs: `/review-spec 05-treesitter-extractor`

Claude reads CLAUDE.md → reads `05-treesitter-extractor.md`

```
## Review: 05-treesitter-extractor.md

### ✓ Looks good
- Correctly imports tree-sitter-languages, not tree-sitter-python separately
- Uses get_parser("python") — correct
- File lives at backend/analysis/code_parser.py — matches CLAUDE.md structure
- Depends on 04-openapi-parser — correct ordering
- Happy path test cases are well specified

### ✗ Conflicts with CLAUDE.md
- Spec says "save results to a new DB connection" → must use the asyncpg pool
  from database.py, not open a new connection

### ⚠ Ambiguities (will block implementation)
- extract_http_calls() return type not specified. Returns a list of what?
  Strings (just the URL)? Dicts with {url, line_number, caller_file}?
  Implementation cannot proceed without knowing this.
- "scan all python files" — does this mean recursively? What about
  files in __pycache__, .venv, node_modules? Needs explicit guidance.

### △ Missing (should be added)
- No test case for when tree-sitter fails to parse a file (syntax error
  in the Python file being analyzed). Should it skip and continue, or raise?
- No test case for when the source file has no HTTP calls at all —
  should return an empty list, not raise.
- extract_route_decorators() is referenced in the analyze route spec (07)
  but is not listed as a function in this spec's implementation details.

### Verdict
NEEDS CHANGES — 4 issues found. Fix the spec before implementing.
```

User says: "fix it"

Claude applies all fixes to `05-treesitter-extractor.md`, shows what changed,
re-runs the review, outputs: "All issues resolved. Safe to run /implement-spec."