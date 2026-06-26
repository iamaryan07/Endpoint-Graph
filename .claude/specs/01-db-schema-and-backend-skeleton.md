# Spec 01 — DB Schema + FastAPI Skeleton

## Goal
Create the three Supabase PostgreSQL tables (`services`, `endpoints`, `consumer_edges`), set up the FastAPI project skeleton with all core files, and verify the backend is alive via `GET /health` returning `{"status": "ok"}`.

## Depends on
None — this is the first spec.

## Context
This spec establishes the two foundational layers everything else builds on:

1. **Database** — the three tables defined in CLAUDE.md must exist in Supabase before any analysis or graph routes can write or read data.
2. **Backend skeleton** — `main.py`, `database.py`, `models.py`, `auth.py`, and `requirements.txt` must exist before any feature routers (analyze, graph, services, endpoints) can be implemented in later specs.

The FastAPI app lives in `backend/`. It connects to Supabase PostgreSQL via asyncpg using `DATABASE_URL`. There is no ORM. No Docker. No TypeScript anywhere.

## Files to create

- `backend/main.py` — FastAPI app entry point: lifespan, router registration, CORS, health route
- `backend/database.py` — asyncpg connection pool (singleton, created once on startup)
- `backend/models.py` — all Pydantic request/response models for the entire API
- `backend/auth.py` — `get_github_token` dependency that extracts `X-GitHub-Token` header
- `backend/routers/__init__.py` — empty file, makes routers a package
- `backend/requirements.txt` — all packages pinned to exact versions
- `backend/.env.example` — template showing required env vars (no real values)
- `backend/.gitignore` — ignores `.venv/`, `.env`, `__pycache__/`, `*.pyc`, tmp dirs
- `backend/pytest.ini` — sets `asyncio_mode = auto` for pytest-asyncio 0.23.x
- `backend/tests/__init__.py` — empty file, makes tests a package
- `backend/tests/conftest.py` — patches the asyncpg pool so tests run without a live DB
- `backend/tests/test_health.py` — test cases for `/health` and `get_github_token`

## Files to edit
None — all files are new.

## Implementation details

### backend/database.py

Single async pool, created once and reused.

```python
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

_pool = None

async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            os.getenv("DATABASE_URL"),
            min_size=2,
            max_size=10
        )
    return _pool
```

No `close_pool` needed for v1 — the process lifetime matches the pool lifetime.

---

### backend/auth.py

FastAPI dependency that extracts the GitHub token from the request header. Every protected route will use `Depends(get_github_token)`.

```python
from fastapi import Header, HTTPException

async def get_github_token(x_github_token: str = Header(alias="X-GitHub-Token")):
    if not x_github_token:
        raise HTTPException(status_code=401, detail="GitHub token required")
    return x_github_token
```

If the header is missing entirely, FastAPI raises 422 automatically before this function is called. The explicit check handles an empty string value.

---

### backend/models.py

All Pydantic models for the full API surface. Define them all here now so later specs can import without creating circular dependencies.

```python
from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class AnalyzeRequest(BaseModel):
    repo_url: str

class AnalyzeResponse(BaseModel):
    status: str
    services: int
    endpoints: int
    edges: int

class ServiceOut(BaseModel):
    id: int
    name: str
    language: Optional[str]
    repo_url: Optional[str]

class EndpointOut(BaseModel):
    id: int
    service_id: int
    method: str
    path: str
    spec_source: Optional[str]

class ConsumerOut(BaseModel):
    service_name: str
    call_count: int
    last_seen_at: datetime
    source: str

class GraphNode(BaseModel):
    id: str
    name: str

class GraphEdge(BaseModel):
    source: str
    target: str
    endpoint_path: str
    endpoint_method: str
    call_count: int
    last_seen_at: datetime

class GraphOut(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]

class HealthResponse(BaseModel):
    status: str
```

---

### backend/main.py

FastAPI app with:
- Lifespan that warms the asyncpg pool on startup
- CORS middleware allowing all origins (frontend is on a different port/domain)
- `GET /health` route that returns `{"status": "ok"}` — no DB call, no auth required
- Placeholder comments for router registration (filled in by later specs)

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import get_pool
from models import HealthResponse

@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    yield

app = FastAPI(title="EndpointGraph API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers registered here as specs are implemented:
# from routers import services, endpoints, graph, analyze
# app.include_router(services.router)
# app.include_router(endpoints.router)
# app.include_router(graph.router)
# app.include_router(analyze.router)

@app.get("/health", response_model=HealthResponse)
async def health():
    return {"status": "ok"}
```

---

### backend/pytest.ini

Required for `pytest-asyncio` 0.23.x — without this, async tests may fail to collect or raise event loop errors.

```ini
[pytest]
asyncio_mode = auto
```

---

### backend/requirements.txt

Pin every package to an exact version. Do not use `>=` or `~=`.

```
asyncpg==0.29.0
fastapi==0.111.0
httpx==0.27.0
pydantic==2.7.1
pytest==8.2.0
pytest-asyncio==0.23.6
python-dotenv==1.0.1
pyyaml==6.0.1
ruff==0.4.4
tree-sitter==0.22.3
tree-sitter-languages==1.10.2
uvicorn==0.29.0
```

Include all packages the full v1 backend will need, not just the ones used in this spec. This avoids having to re-freeze requirements in every later spec.

---

### backend/.env.example

```
DATABASE_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
```

No real credentials. This file IS committed. The real `backend/.env` is NOT committed.

---

### backend/.gitignore

```
.venv/
.env
__pycache__/
*.pyc
*.pyo
.pytest_cache/
/tmp/
```

---

### Supabase SQL — three tables

Run this SQL in the Supabase SQL Editor (Dashboard → SQL Editor → New query). Execute each `CREATE TABLE` statement separately or all at once. The `auth.users` table is managed by Supabase — do not touch it.

```sql
CREATE TABLE public.services (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  language    VARCHAR(50),
  repo_url    VARCHAR(255),
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE public.endpoints (
  id           SERIAL PRIMARY KEY,
  service_id   INT NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  method       VARCHAR(10) NOT NULL,
  path         VARCHAR(255) NOT NULL,
  spec_source  VARCHAR(50),
  created_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE public.consumer_edges (
  id                 SERIAL PRIMARY KEY,
  caller_service_id  INT NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  endpoint_id        INT NOT NULL REFERENCES public.endpoints(id) ON DELETE CASCADE,
  last_seen_at       TIMESTAMP DEFAULT NOW(),
  call_count         INT DEFAULT 0,
  source             VARCHAR(20) NOT NULL,
  created_at         TIMESTAMP DEFAULT NOW(),
  UNIQUE(caller_service_id, endpoint_id)
);
```

After running, verify in the Supabase Table Editor that all three tables appear under the `public` schema.

---

### Virtual environment setup (one-time, before implementing)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
```

---

### Running the server

```bash
cd backend
.venv\Scripts\activate
uvicorn main:app --reload --port 8000
```

Then verify: `GET http://localhost:8000/health` → `{"status": "ok"}`

## Test cases

Tests live in `backend/tests/`. Files: `backend/tests/__init__.py` (empty), `backend/tests/conftest.py`, and `backend/tests/test_health.py`.

### backend/tests/conftest.py

The lifespan in `main.py` calls `get_pool()` on startup. `httpx.AsyncClient` with `ASGITransport` triggers the full ASGI lifespan, which means `asyncpg.create_pool()` runs — and fails if there is no `.env` or no live Supabase connection. Patch `database._pool` before tests run so no real DB connection is made.

```python
import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock

@pytest.fixture(autouse=True)
def mock_db_pool(monkeypatch):
    import database
    mock_pool = MagicMock()
    monkeypatch.setattr(database, "_pool", mock_pool)
```

This sets `_pool` to a non-None mock before each test, so `get_pool()` returns it immediately without calling `asyncpg.create_pool()`.

### backend/tests/test_health.py

Four test cases. `asyncio_mode = auto` in `pytest.ini` means no `@pytest.mark.asyncio` decorator needed — all async functions in test files are automatically treated as tests.

The **health tests** use the main `app` from `main.py`:

```python
from httpx import AsyncClient, ASGITransport
from main import app

async def test_health_returns_ok():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

async def test_health_no_auth_required():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")  # no X-GitHub-Token header
    assert response.status_code == 200
```

The **auth dependency tests** must NOT add routes to the global `app` — that would persist across test runs. Instead, create a local `test_app` inside the test file:

```python
from fastapi import FastAPI, Depends
from auth import get_github_token

test_app = FastAPI()

@test_app.get("/protected")
async def protected_route(token: str = Depends(get_github_token)):
    return {"token": token}

async def test_get_github_token_missing_header():
    async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as client:
        response = await client.get("/protected")  # no header
    assert response.status_code == 422  # FastAPI raises 422 for missing required header

async def test_get_github_token_empty_string():
    async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as client:
        response = await client.get("/protected", headers={"X-GitHub-Token": ""})
    assert response.status_code == 401
    assert response.json()["detail"] == "GitHub token required"
```

`test_app` has no lifespan, so `conftest.py`'s pool mock is not needed for auth tests — but the `autouse=True` fixture applies to them harmlessly.

**Test cases summary:**
- `test_health_returns_ok` — `GET /health` → 200, body `{"status": "ok"}`
- `test_health_no_auth_required` — `GET /health` with no token header → 200
- `test_get_github_token_missing_header` — `GET /protected` with no header → 422
- `test_get_github_token_empty_string` — `GET /protected` with empty header → 401

## Done when

- [ ] All three tables exist in Supabase (`services`, `endpoints`, `consumer_edges`) — verified in Table Editor
- [ ] `backend/main.py` exists with lifespan, CORS (no `allow_credentials`), and `GET /health`
- [ ] `backend/database.py` exists with `get_pool()`
- [ ] `backend/models.py` exists with all models listed above
- [ ] `backend/auth.py` exists with `get_github_token` dependency
- [ ] `backend/routers/__init__.py` exists (empty)
- [ ] `backend/requirements.txt` exists with all packages pinned to exact versions
- [ ] `backend/.env.example` exists (committed, no real credentials)
- [ ] `backend/.gitignore` exists
- [ ] `backend/pytest.ini` exists with `asyncio_mode = auto`
- [ ] `backend/tests/__init__.py` exists (empty)
- [ ] `backend/tests/conftest.py` exists with `mock_db_pool` autouse fixture
- [ ] `backend/tests/test_health.py` exists with all four test cases
- [ ] `GET http://localhost:8000/health` returns `{"status": "ok"}` with status 200
- [ ] All four test cases pass (`python -m pytest tests/ -v`)
- [ ] No `.env` file is committed
- [ ] No `.venv/` directory is committed
- [ ] No TypeScript files anywhere
- [ ] No hardcoded credentials anywhere
