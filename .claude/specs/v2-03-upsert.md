# Spec v2-03 — Upsert on Re-analysis

## Goal
Update `POST /analyze` so every DB write uses upsert semantics — running the same repo twice must produce the same rows, never duplicates.

## Depends on
- `v2-01-db-migration.md` — `services.user_id`, `services.repo_id`, and all three UNIQUE constraints must exist before upserts can use them.
- `v2-02-backend-auth.md` — `get_current_user_id` dependency must be wired so `user_id` (Supabase UUID from JWT `sub`) is available inside the route handler.

## Context
Currently `POST /analyze` uses plain `INSERT` statements. If a user clicks "Re-analyze" on the same repo, the analysis writes duplicate `services`, `endpoints`, and `consumer_edges` rows — the DB has no constraint to prevent it.

V2 adds `UNIQUE (user_id, repo_id, name)` to `services`, `UNIQUE (service_id, method, path)` to `endpoints`, and `UNIQUE (caller_service_id, endpoint_id)` to `consumer_edges`. This spec updates the insert logic to take advantage of those constraints so re-analysis is fully idempotent.

Every service insert must also supply:
- `user_id` — taken from the `sub` claim of the verified Supabase JWT (never from GitHub API).
- `repo_id` — derived from the `repo_url` parameter as `owner/name` (e.g. `iamaryan07/sample-services`).

## Files to create
None.

## Files to edit
- `backend/routers/analyze.py` — replace INSERT statements with upsert versions; derive `repo_id` from `repo_url`; pass `user_id` into every service insert.
- `backend/tests/test_routes.py` — add tests that verify idempotency of the analyze route.

## Implementation details

### Deriving `repo_id` from `repo_url`

`repo_id` is the `owner/name` portion of the GitHub URL.

```python
def repo_id_from_url(repo_url: str) -> str:
    """Return 'owner/name' from any of:
      https://github.com/owner/name
      https://github.com/owner/name.git
      github.com/owner/name
    Raises ValueError if the URL cannot be parsed.
    """
    url = repo_url.strip().rstrip('/')
    url = re.sub(r'^https?://', '', url)        # strip scheme
    url = url.removeprefix('github.com/')       # strip host
    url = url.removesuffix('.git')              # strip .git
    parts = url.split('/')
    if len(parts) < 2 or not parts[0] or not parts[1]:
        raise ValueError(f"Cannot derive repo_id from URL: {repo_url!r}")
    return f"{parts[0]}/{parts[1]}"
```

Place this helper in `backend/routers/analyze.py` (or move to a shared util if another router needs it — for this spec, keeping it in `analyze.py` is fine).

---

### Upsert: services

Replace any `INSERT INTO services` in the analyze route with:

```sql
INSERT INTO services (name, language, repo_url, user_id, repo_id, last_analyzed_at)
VALUES ($1, $2, $3, $4, $5, NOW())
ON CONFLICT (user_id, repo_id, name)
DO UPDATE SET
    last_analyzed_at = NOW(),
    language = EXCLUDED.language
RETURNING id;
```

Parameters: `(name, language, repo_url, user_id, repo_id)`

- `user_id` — the Supabase UUID string from `get_current_user_id` (already available as a route dependency).
- `repo_id` — result of `repo_id_from_url(request.repo_url)`.
- On conflict the row is updated; the `RETURNING id` clause always returns the existing row's id — callers must use this id for subsequent endpoint inserts.

---

### Upsert: endpoints

Replace any `INSERT INTO endpoints` with:

```sql
INSERT INTO endpoints (service_id, method, path, spec_source)
VALUES ($1, $2, $3, $4)
ON CONFLICT (service_id, method, path)
DO NOTHING
RETURNING id;
```

Parameters: `(service_id, method, path, spec_source)`

`DO NOTHING` is intentional — the endpoint definition does not change on re-analysis. However, `RETURNING id` now returns `NULL` when the conflict path is taken (PostgreSQL omits the row). Handle this:

```python
row = await conn.fetchrow(upsert_endpoint_sql, service_id, method, path, spec_source)
if row is None:
    # row already existed; fetch the existing id
    row = await conn.fetchrow(
        "SELECT id FROM endpoints WHERE service_id=$1 AND method=$2 AND path=$3",
        service_id, method, path,
    )
endpoint_id = row["id"]
```

---

### Upsert: consumer_edges

Replace any `INSERT INTO consumer_edges` with:

```sql
INSERT INTO consumer_edges (caller_service_id, endpoint_id, last_seen_at, call_count, source)
VALUES ($1, $2, NOW(), 1, $3)
ON CONFLICT (caller_service_id, endpoint_id)
DO UPDATE SET
    last_seen_at = NOW(),
    source = EXCLUDED.source
RETURNING id;
```

Parameters: `(caller_service_id, endpoint_id, source)`

`call_count` is intentionally not incremented on upsert — that is a v3 concern (live log counting). For static analysis, every re-analysis simply refreshes `last_seen_at`.

---

### Route signature (no new parameters)

The route signature must not change. `user_id` is already injected by `get_current_user_id`:

```python
@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    request: AnalyzeRequest,
    token: str = Depends(get_github_token),
    user_id: str = Depends(get_current_user_id),
):
    try:
        repo_id = repo_id_from_url(request.repo_url)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid repo URL")

    tmp_dir = None
    try:
        tmp_dir = clone_repo(request.repo_url, token)
        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                await set_rls_context(conn, user_id)
                # ... upsert services, endpoints, edges using repo_id and user_id
    finally:
        if tmp_dir:
            delete_repo(tmp_dir)
```

`tmp_dir` is initialized to `None` before `clone_repo` so that if `clone_repo` raises, the `finally` block does not reference an unbound variable. `delete_repo` is only called when `tmp_dir` is not `None` — i.e. only when cloning actually started.

---

### Response

`AnalyzeResponse` is unchanged:

```python
class AnalyzeResponse(BaseModel):
    status: str       # always "ok"
    services: int     # number of services upserted
    endpoints: int    # number of endpoints upserted
    edges: int        # number of edges upserted
```

Counts reflect how many rows were processed (not how many were new vs updated).

---

### Error cases

| Condition | Behaviour |
|---|---|
| `repo_url` cannot be parsed into `owner/name` | `repo_id_from_url` raises `ValueError`; route catches it and raises `HTTPException(status_code=422, detail="Invalid repo URL")` |
| Clone fails (bad token, private repo, network) | `clone_repo` raises `RuntimeError`; let it propagate as 500; `tmp_dir` may be `None` so finally guard prevents NameError |
| DB upsert fails (e.g. RLS rejection) | Let asyncpg exception propagate; FastAPI returns 500; finally guard still calls `delete_repo` since `tmp_dir` was set |

---

## Test cases

Add these to `backend/tests/test_routes.py`. Use the existing test fixtures and mock patterns already established for that file (mock DB pool + mock clone/analysis).

- `test_analyze_upsert_service_idempotent` — calls the analyze route twice with the same `repo_url`; asserts that only one row exists in `services` with the correct `(user_id, repo_id, name)` after the second call (mock the DB and assert the upsert SQL is used, not plain INSERT).
- `test_analyze_upsert_endpoint_idempotent` — same repo analyzed twice; asserts `endpoints` has no duplicates for the same `(service_id, method, path)`.
- `test_analyze_upsert_edge_idempotent` — same repo analyzed twice; asserts `consumer_edges` has no duplicates for the same `(caller_service_id, endpoint_id)`, and `last_seen_at` is refreshed.
- `test_analyze_sets_user_id_and_repo_id` — asserts that the service upsert is called with the `user_id` extracted from the JWT and the `repo_id` derived from the URL.
- `test_repo_id_from_url_https` — `repo_id_from_url("https://github.com/owner/name")` returns `"owner/name"`.
- `test_repo_id_from_url_git_suffix` — `repo_id_from_url("https://github.com/owner/name.git")` returns `"owner/name"`.
- `test_repo_id_from_url_no_scheme` — `repo_id_from_url("github.com/owner/name")` returns `"owner/name"`.
- `test_repo_id_from_url_invalid` — `repo_id_from_url("notgithub.com/x/y")` raises `ValueError`.
- `test_analyze_invalid_repo_url` — POSTs `{"repo_url": "notgithub.com/x/y"}` to `POST /analyze` with valid auth headers; asserts HTTP 422 response with `detail="Invalid repo URL"`. Confirms the ValueError-to-HTTPException conversion in the route.
- `test_analyze_cleanup_on_db_failure` — mocks `clone_repo` to return a fake path and mocks the DB pool to raise an exception on `acquire()`; asserts `delete_repo` was still called with that path. Confirms the `finally` guard works when DB writes fail.

## Done when

- [ ] `repo_id_from_url` helper is implemented in `backend/routers/analyze.py`
- [ ] Service insert uses `ON CONFLICT (user_id, repo_id, name) DO UPDATE SET last_analyzed_at, language`
- [ ] Endpoint insert uses `ON CONFLICT (service_id, method, path) DO NOTHING`; missing `RETURNING` id is handled by a follow-up `SELECT`
- [ ] Consumer edge insert uses `ON CONFLICT (caller_service_id, endpoint_id) DO UPDATE SET last_seen_at, source`
- [ ] Every service insert passes `user_id` (from JWT `sub`) and `repo_id` (derived from URL)
- [ ] `tmp_dir` is initialized to `None` before `clone_repo`; `delete_repo` is called in a `finally` block only when `tmp_dir` is not `None`
- [ ] `repo_id_from_url` `ValueError` is caught in the route and re-raised as `HTTPException(status_code=422)`
- [ ] Analyzing the same repo twice produces no duplicate rows in any table
- [ ] All ten test cases listed above pass
- [ ] No TypeScript, no Docker, no ORM, no SQLAlchemy
- [ ] No hardcoded credentials anywhere
