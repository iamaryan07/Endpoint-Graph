# Spec 03 — Repo Cloner

## Goal
Implement `clone_repo` and `delete_repo` in `backend/analysis/cloner.py` so the analysis pipeline can clone any public or private GitHub repo using a token and clean up the temp directory after analysis.

## Depends on
- Spec 01 (backend skeleton must exist — `backend/` directory, venv, `requirements.txt`)

Spec 02 is a system-level prerequisite for end-to-end flow (the token must come from somewhere), but it is **not a code dependency for this module**. `clone_repo` accepts `github_token` as a plain string parameter and has no imports from `auth.py` or any OAuth module. Spec 03 can be fully implemented and all tests can pass immediately after spec 01.

## Context
This is the first step of the analysis pipeline. When a user submits a repo URL via `POST /analyze`, the backend needs to clone the repo locally before running any static analysis (OpenAPI parsing, tree-sitter). `clone_repo` fetches the repo into a unique temp directory; `delete_repo` cleans it up. This file is called by `routers/analyze.py` (spec 07) inside a try/finally block. Neither function writes to the database — they only manage filesystem state.

## Files to create
- `backend/analysis/__init__.py` — empty init to make `analysis` a Python package
- `backend/analysis/cloner.py` — implements `clone_repo` and `delete_repo`
- `backend/tests/test_cloner.py` — unit and integration tests for both functions

## Files to edit
- `backend/requirements.txt` — no new packages needed (only stdlib: `subprocess`, `tempfile`, `uuid`, `shutil`, `re`, `os`), but verify these are not accidentally listed

## Implementation details

### backend/analysis/cloner.py

#### Imports
```python
import subprocess
import tempfile
import uuid
import shutil
import re
import os
```

No third-party imports. All stdlib.

---

#### `clone_repo(repo_url: str, github_token: str) -> str`

Steps (in exact order):

1. Strip leading/trailing whitespace from `repo_url`.
2. Remove the scheme: `repo_url = re.sub(r'^https?://', '', repo_url)`
3. Validate: if `repo_url` does not start with `'github.com/'`, raise `ValueError(f"Invalid GitHub URL: {repo_url}")`.
4. Build the authenticated URL: `auth_url = f"https://{github_token}@{repo_url}"`
5. Build the temp dir path: `tmp_dir = os.path.join(tempfile.gettempdir(), str(uuid.uuid4()))`
6. Run the clone:
   ```python
   result = subprocess.run(
       ["git", "clone", "--depth", "1", auth_url, tmp_dir],
       capture_output=True,
       text=True
   )
   ```
7. If `result.returncode != 0`, raise `RuntimeError(f"Clone failed: {result.stderr}")`.
8. Return `tmp_dir`.

Do NOT catch exceptions from `subprocess.run` itself — let them propagate (e.g. if `git` is not installed).

---

#### `delete_repo(tmp_dir: str) -> None`

```python
def delete_repo(tmp_dir: str) -> None:
    shutil.rmtree(tmp_dir, ignore_errors=True)
```

Always safe to call. `ignore_errors=True` means no exception if the dir doesn't exist or can't be removed. No return value.

---

### backend/analysis/__init__.py

Empty file. Just marks the directory as a Python package.

---

### Usage pattern (for reference — implemented in spec 07)

Callers must always use try/finally:

```python
tmp_dir = clone_repo(repo_url, token)
try:
    # run analysis on tmp_dir
finally:
    delete_repo(tmp_dir)
```

`clone_repo` does NOT call `delete_repo` internally — cleanup is the caller's responsibility.

## Test cases

File: `backend/tests/test_cloner.py`

All tests run with the `.venv` active. Tests that hit the network are marked with a comment `# integration` so they can be skipped in CI if needed.

- `test_clone_repo_strips_https` — passes `"https://github.com/user/repo"` with token `"fake-token"`; mocks `subprocess.run`; asserts `mock_run.call_args[0][0][3] == "https://fake-token@github.com/user/repo"` (no doubled scheme)
- `test_clone_repo_strips_http` — same as above but input is `"http://github.com/user/repo"`; asserts the same expected auth URL `"https://fake-token@github.com/user/repo"`
- `test_clone_repo_strips_whitespace` — passes `"  https://github.com/user/repo  "` with whitespace; mocks `subprocess.run` returning `MagicMock(returncode=0)`; asserts no exception is raised
- `test_clone_invalid_url_no_github` — passes `"gitlab.com/user/repo"`, expects `ValueError` with message containing `"Invalid GitHub URL"`
- `test_clone_invalid_url_empty` — passes `""`, expects `ValueError`
- `test_clone_failure_raises_runtime_error` — mocks `subprocess.run` returning `MagicMock(returncode=128, stderr="fatal: repo not found")`; expects `RuntimeError` with message containing `"Clone failed"`
- `test_clone_success_returns_tmp_dir` — mocks `subprocess.run` with `mock_run.return_value = MagicMock(returncode=0)`; asserts the returned path is a non-empty string starting with `tempfile.gettempdir()`
- `test_delete_repo_removes_directory` — creates a real directory under `tempfile.gettempdir()`, calls `delete_repo`, asserts the directory no longer exists
- `test_delete_repo_safe_on_nonexistent_path` — calls `delete_repo(os.path.join(tempfile.gettempdir(), "nonexistent-cloner-test-path"))`; asserts no exception is raised

For mocking `subprocess.run`, use `unittest.mock.patch("analysis.cloner.subprocess.run")`. All mock return values must be `MagicMock(returncode=N, stderr="...")` — do not rely on a bare `MagicMock()` having integer attributes by default.

## Done when

- [ ] `backend/analysis/__init__.py` exists (can be empty)
- [ ] `backend/analysis/cloner.py` exists with exactly two functions: `clone_repo` and `delete_repo`
- [ ] `clone_repo` strips both `https://` and `http://` schemes
- [ ] `clone_repo` raises `ValueError` for any URL that doesn't start with `github.com/` after stripping
- [ ] `clone_repo` builds auth URL as `https://{token}@{repo_url}`
- [ ] `clone_repo` runs `git clone --depth 1` via `subprocess.run` with `capture_output=True, text=True`
- [ ] `clone_repo` raises `RuntimeError` containing clone stderr if `returncode != 0`
- [ ] `clone_repo` returns the `tmp_dir` path as a string
- [ ] `delete_repo` uses `shutil.rmtree(tmp_dir, ignore_errors=True)` and returns `None`
- [ ] `backend/tests/test_cloner.py` exists with all 9 test cases listed above
- [ ] All 9 tests pass when run with `python -m pytest tests/test_cloner.py -v` inside the activated venv
- [ ] No hardcoded tokens or credentials anywhere in the implementation or tests
- [ ] No third-party packages added to `requirements.txt` (stdlib only)
