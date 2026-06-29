# Spec v2-02 — Backend Auth (ES256 JWT + RLS Context)

## Goal
Add JWT verification and RLS context injection to the FastAPI backend so every DB-touching route verifies the caller's identity and enforces per-user row isolation at the database layer.

## Depends on
- Spec v2-01 (DB migration must be complete — `user_id` column must exist on `services` and RLS policies must be active before this is meaningful)

## Context
This spec wires together two independent security layers that must both fire on every authenticated request:

1. **Application layer** — FastAPI dependency `get_current_user_id()` reads the `Authorization: Bearer` header, verifies the Supabase ES256 JWT via the JWKS endpoint, and returns the Supabase user UUID (`sub` claim). This UUID is then passed into every INSERT/SELECT as an explicit filter parameter.

2. **DB layer** — `set_rls_context(conn, user_id)` is called at the start of every asyncpg transaction. It runs two `set_config` SQL calls that make `auth.uid()` return the correct UUID inside that transaction, so Supabase RLS policies fire and reject any row that doesn't belong to this user — even if the application-layer WHERE clause is accidentally omitted.

CLAUDE.md specifies using `PyJWKClient` (from `PyJWT`) with the `SUPABASE_JWKS_URL` env var — not a raw public key file. `PyJWKClient` fetches the JWKS endpoint once, caches the key set, and uses the `kid` in each JWT header to select the right key. Key rotation is handled automatically.

`get_github_token()` already exists and must remain unchanged.

## Files to create
None — all changes are to existing files.

## Files to edit

- `backend/auth.py` — add `get_current_user_id()` and `set_rls_context()`; keep `get_github_token()` unchanged
- `backend/routers/analyze.py` — depend on both `get_github_token` and `get_current_user_id`; call `set_rls_context` before first DB query
- `backend/routers/services.py` — same as above
- `backend/routers/endpoints.py` — same as above
- `backend/routers/graph.py` — same as above
- `backend/requirements.txt` — ensure `PyJWT[crypto]` and `cryptography` are present (needed for ES256)

## Implementation details

### backend/auth.py

The file already has `get_github_token()`. Add the two new items below it. Do not touch `get_github_token()`.

#### Module-level setup

```python
import os, json
import jwt                          # PyJWT
from jwt import PyJWKClient
from fastapi import Header, HTTPException

_jwks_client = PyJWKClient(os.getenv("SUPABASE_JWKS_URL"))
```

`_jwks_client` is a module-level singleton. It fetches the JWKS URL lazily on first use and caches the key set. It must NOT be recreated per request.

#### `get_current_user_id`

```python
async def get_current_user_id(authorization: str = Header()) -> str:
```

Steps:
1. If `authorization` is missing or doesn't start with `"Bearer "`, raise `HTTPException(status_code=401, detail="Missing Bearer token")`.
2. Strip the `"Bearer "` prefix to get the raw token string.
3. Call `_jwks_client.get_signing_key_from_jwt(token)` — this selects the right key using the `kid` header in the JWT.
4. Call `jwt.decode(token, signing_key.key, algorithms=["ES256"], audience="authenticated")`.
5. If `jwt.ExpiredSignatureError` is raised, raise `HTTPException(status_code=401, detail="Token expired")`.
6. If any other `jwt.InvalidTokenError` is raised, raise `HTTPException(status_code=401, detail=f"Invalid token: {e}")`.
7. Return `payload["sub"]` — the Supabase user UUID string.

The `audience="authenticated"` parameter is required. Supabase JWTs set `aud: "authenticated"` and PyJWT rejects the token if the audience doesn't match.

#### `set_rls_context`

```python
async def set_rls_context(conn, user_id: str) -> None:
```

Steps:
1. Build a JSON string: `claims = json.dumps({"sub": user_id, "role": "authenticated"})`.
2. Execute: `await conn.execute("SELECT set_config('request.jwt.claims', $1, true)", claims)`.
3. Execute: `await conn.execute("SELECT set_config('role', 'authenticated', true)")`.

The `true` third argument to `set_config` means **transaction-local**: the setting only persists for the duration of the current explicit transaction and is rolled back when the transaction ends. This is critical for connection pool safety — without `true`, user A's RLS context could persist on a reused connection for user B.

**`set_rls_context` only works inside an explicit `conn.transaction()` block.** If called outside a transaction (i.e., in autocommit mode), each `set_config` call is its own single-statement transaction and the settings are immediately discarded — subsequent queries will see no RLS context and `auth.uid()` will return null. Every `pool.acquire()` block across all routers MUST use `conn.transaction()`, and `set_rls_context` must be the first call inside that block.

### backend/routers/analyze.py

Import `get_current_user_id` and `set_rls_context` from `auth`.

Add `user_id: str = Depends(get_current_user_id)` to the `analyze` route signature alongside the existing `token: str = Depends(get_github_token)`.

The current `analyze` route has **three separate `pool.acquire()` blocks**:
1. Writes services + endpoints per service folder
2. Reads all endpoints to build `known_endpoints`
3. Writes consumer edges

Each block must be wrapped in its own `conn.transaction()` with `set_rls_context` as the first call:

```python
# Block 1
async with pool.acquire() as conn:
    async with conn.transaction():
        await set_rls_context(conn, user_id)
        # ... write services and endpoints

# Block 2
async with pool.acquire() as conn:
    async with conn.transaction():
        await set_rls_context(conn, user_id)
        rows = await conn.fetch("SELECT id, method, path, service_id FROM endpoints")

# Block 3
async with pool.acquire() as conn:
    async with conn.transaction():
        await set_rls_context(conn, user_id)
        # ... write consumer edges
```

Do not consolidate the three blocks into one — keep the existing structure, just add the transaction wrapper and `set_rls_context` to each.

### backend/routers/services.py

Same pattern:

```python
from auth import get_github_token, get_current_user_id, set_rls_context

@router.get("/services")
async def list_services(
    token: str = Depends(get_github_token),
    user_id: str = Depends(get_current_user_id),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await set_rls_context(conn, user_id)
            rows = await conn.fetch("SELECT ...")
    ...

@router.delete("/services/{service_id}")
async def delete_service(
    service_id: int,
    token: str = Depends(get_github_token),
    user_id: str = Depends(get_current_user_id),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await set_rls_context(conn, user_id)
            await conn.execute("DELETE FROM services WHERE id = $1", service_id)
    ...
```

If the DELETE finds no row (RLS hides it or it doesn't exist), return `{"status": "deleted"}` — same as if the row existed. Do not leak information about whether the row existed.

### backend/routers/endpoints.py

Same pattern. Both `GET /endpoints` and `GET /endpoints/{id}/impact-analysis` must depend on both `get_github_token` and `get_current_user_id` and call `set_rls_context` as the first call inside `conn.transaction()`.

### backend/routers/graph.py

Same pattern. `GET /graph` must depend on both and call `set_rls_context` as the first call inside `conn.transaction()`.

**Pattern that applies to every router (required, not optional):**

```python
async with pool.acquire() as conn:
    async with conn.transaction():          # REQUIRED — set_rls_context only works inside a transaction
        await set_rls_context(conn, user_id)  # MUST be first
        # ... all DB queries for this block
```

Any `pool.acquire()` block that does not have an explicit `conn.transaction()` wrapper will silently bypass RLS even if `set_rls_context` is called.

### Note on future router: `backend/routers/repos.py` (v2-06)

`GET /repos` (spec v2-06) will also be a DB-touching route. When that router is built, it must follow the same pattern: depend on both `get_github_token` and `get_current_user_id`, and call `set_rls_context` as the first call inside `conn.transaction()`.

### backend/requirements.txt

Ensure these two lines are present (exact versions from `pip freeze` after install):

```
PyJWT[crypto]==...
cryptography==...
```

`PyJWT[crypto]` installs PyJWT with the cryptography extra, which is required for ES256 support. If `cryptography` is already pinned from a previous install, do not duplicate it — update the version only if needed.

### backend/.env (not committed — document only)

Must contain:

```
SUPABASE_JWKS_URL=https://[ref].supabase.co/auth/v1/.well-known/jwks.json
```

This env var must be loaded via `python-dotenv` (`load_dotenv()` in `database.py` or `main.py`). If it is missing at startup, `_jwks_client` instantiation will receive `None` — this will not immediately raise but will fail on first token verification. No startup check is required for this spec.

## Test cases

All tests live in `backend/tests/test_auth.py` (create if it doesn't exist).

- `test_get_current_user_id_missing_header` — call `get_current_user_id` with no `authorization` value (empty string or missing); expect `HTTPException` with `status_code=401` and detail containing `"Missing Bearer token"`

- `test_get_current_user_id_no_bearer_prefix` — pass `authorization="notabearer token123"`; expect `HTTPException` with `status_code=401` and detail containing `"Missing Bearer token"`

- `test_get_current_user_id_expired_token` — generate a temporary ES256 key pair (`cryptography` library); create a JWT signed with the private key that has `exp` set 60 seconds in the past and `aud="authenticated"`; mock `_jwks_client.get_signing_key_from_jwt` to return an object whose `.key` attribute is the corresponding public key; call the function; expect `HTTPException` with `status_code=401` and detail `"Token expired"`. Must use ES256 — not RS256, which would be rejected by the `algorithms=["ES256"]` check before expiry is evaluated.

- `test_get_current_user_id_invalid_signature` — pass a well-formed JWT with a bad signature; mock `_jwks_client`; expect `HTTPException` with `status_code=401` and detail starting with `"Invalid token:"`

- `test_get_current_user_id_valid_token` — construct a valid ES256 JWT with `sub="test-uuid-1234"` and `aud="authenticated"`; mock `_jwks_client.get_signing_key_from_jwt` to return the correct key; expect return value `"test-uuid-1234"`

- `test_set_rls_context_executes_correct_sql` — create a mock asyncpg connection that records all `execute` calls; call `set_rls_context(conn, "user-uuid-abc")`; assert that `execute` was called twice: once with `set_config('request.jwt.claims', ...)` where the JSON contains `"sub": "user-uuid-abc"`, and once with `set_config('role', 'authenticated', true)`

For router-level tests in `backend/tests/test_routes.py` (existing file), add:

- `test_services_route_rejects_missing_github_token` — call `GET /services` with a valid `Authorization: Bearer <jwt>` header but no `X-GitHub-Token` header; expect `422` (FastAPI rejects the missing required header before the dependency runs)

- `test_services_route_rejects_missing_jwt` — call `GET /services` with a valid `X-GitHub-Token` header but no `Authorization` header; expect `422`

- `test_services_route_rejects_invalid_jwt` — call `GET /services` with both headers present but `Authorization: Bearer invalid` (bad JWT string); expect `401`

Use `pytest` and `pytest-asyncio`. Mock `PyJWKClient` at the module level in auth tests using `unittest.mock.patch`.

## Done when

- [ ] `backend/auth.py` exports `get_current_user_id`, `set_rls_context`, and `get_github_token`
- [ ] `_jwks_client` is a module-level singleton using `SUPABASE_JWKS_URL`
- [ ] `get_current_user_id` returns the `sub` claim on valid ES256 JWT with `aud="authenticated"`
- [ ] `get_current_user_id` raises `401` with `"Token expired"` on expired tokens
- [ ] `get_current_user_id` raises `401` with `"Invalid token: ..."` on bad signature or malformed JWT
- [ ] `set_rls_context` calls both `set_config` SQL commands in the correct order
- [ ] All four routers (`analyze`, `services`, `endpoints`, `graph`) depend on both `get_github_token` and `get_current_user_id`
- [ ] All four routers call `set_rls_context(conn, user_id)` as the first SQL in every DB transaction
- [ ] `PyJWT[crypto]` and `cryptography` are in `requirements.txt` with pinned versions
- [ ] All test cases listed above pass
- [ ] No TypeScript, no Docker, no SQLAlchemy, no ORM
- [ ] No hardcoded credentials, keys, or UUIDs in committed files
