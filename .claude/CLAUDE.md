# CLAUDE.md — EndpointGraph

Read this entire file before every response. It defines the project, every decision made, the exact stack, schema, API contract, auth flow, coding conventions, and the spec-driven workflow. Do not suggest alternatives to decisions already made. Do not implement v2 features unless explicitly asked.

---

## What this project is

**EndpointGraph** is an internal API consumer dependency graph and breaking-change impact analyzer.

It answers one question: **"If I change this API endpoint, what breaks?"**

A user logs in with GitHub, pastes a GitHub repo URL (public or private), EndpointGraph clones it, runs static analysis, builds a dependency graph, and shows an interactive visualization where clicking any endpoint reveals every service that calls it.

---

## Problem being solved

Companies break internal APIs because nobody tracks who calls what. Manual consumer lists are error-prone and rarely maintained. This project discovers consumer relationships automatically — no manual tracking, no opt-in required from consumers.

---

## .claude folder — how this project is built

All Claude context, specs, commands, and agents live in `.claude/`. Never build everything at once. The workflow is:

```
1. Pick a spec from .claude/specs/
2. Ask Claude to implement it
3. Run the test command from .claude/commands/
4. Fix failures
5. Move to the next spec
```

```
.claude/
├── CLAUDE.md          ← this file — read every time
├── specs/             ← one file per feature, implement in order
├── commands/          ← slash commands for testing, linting, running
└── agents/            ← agents for test running, spec validation
```

### Spec files (implement in this order)

```
specs/
├── 01-db-schema.md          ← create tables in Supabase
├── 02-github-auth.md        ← Supabase Auth + GitHub OAuth
├── 03-repo-cloner.md        ← git clone with GitHub token
├── 04-openapi-parser.md     ← PyYAML OpenAPI spec parser
├── 05-treesitter-extractor.md ← tree-sitter call-site + route decorator extraction
├── 06-url-matcher.md        ← match extracted URLs to known endpoint paths
├── 07-analyze-route.md      ← POST /analyze — orchestrates 03 through 06
├── 08-api-routes.md         ← remaining FastAPI routes (GET /graph, /impact-analysis, etc.)
├── 09-frontend-graph.md     ← React Flow graph visualization
├── 10-impact-panel.md       ← side panel on node click
└── 11-search.md             ← search bar to filter endpoints
```

### Command files

```
commands/
├── test-backend.md     ← runs pytest on backend
├── test-frontend.md    ← runs jest on frontend
├── lint.md             ← runs ruff (Python) + eslint (JS)
└── dev.md              ← starts FastAPI + Next.js locally without Docker
```

### Agent files

```
agents/
├── test-runner.md      ← runs tests and reports failures with context
└── spec-checker.md     ← validates implementation matches the spec
```

---

## Tech stack

| Layer | Tool | Version | Purpose |
|---|---|---|---|
| Frontend framework | Next.js | 16.2 (App Router) | Pages, routing, UI |
| Frontend language | JavaScript | ES2022 | No TypeScript — all .js and .jsx files |
| Styling | Tailwind CSS | v4.3 | Utility-first CSS, CSS-first config |
| Graph visualization | React Flow | @xyflow/react latest | Interactive dependency graph |
| Auth (frontend) | Supabase JS client | v2 | GitHub OAuth only — not for DB queries |
| Backend framework | FastAPI | latest | REST API + analysis engine |
| Backend language | Python | 3.11+ | All backend code |
| Static analysis | tree-sitter + tree-sitter-languages | latest | Parse Python code |
| Spec parsing | PyYAML | latest | Parse openapi.yaml files |
| Repo cloning | subprocess (stdlib) | — | git clone with GitHub token |
| DB driver | asyncpg | latest | Async PostgreSQL driver |
| Database | Supabase | PostgreSQL 15 | Hosted DB + Auth provider |
| Testing (backend) | pytest + pytest-asyncio | latest | Backend unit + integration tests |
| Testing (frontend) | Jest | latest | Frontend component tests |
| Linting (Python) | ruff | latest | Fast Python linter |
| Linting (JS) | eslint | latest | JS linter |

### Not in the stack — do not suggest

- No TypeScript anywhere
- No Docker or docker-compose
- No SQLAlchemy or any ORM — raw asyncpg queries only
- No Neo4j or graph database
- No Redis, Celery, or background jobs
- No GraphQL
- No NextAuth — Supabase Auth handles GitHub OAuth
- No separate Express or other Node backend — FastAPI is the only backend

---

## Architecture

```
Browser
  ↓
Next.js 16 — App Router, JavaScript, Tailwind v4
  ├── Supabase JS client (auth ONLY — login, logout, get session + GitHub token)
  └── fetch() to FastAPI (all data — graph, impact analysis, trigger analysis)
        ↓
FastAPI — Python, asyncpg
  ├── Reads X-GitHub-Token header from frontend requests
  ├── Clones private/public repos using the GitHub token
  ├── Runs tree-sitter + PyYAML analysis on cloned code
  └── asyncpg
        ↓
Supabase — PostgreSQL 15
  ├── auth.users (managed by Supabase Auth — do not touch directly)
  ├── public.services
  ├── public.endpoints
  └── public.consumer_edges
```

**Two rules that must never be broken:**
1. Next.js uses the Supabase JS client for auth only. All graph/analysis data goes through FastAPI.
2. FastAPI never imports Supabase JS client. It connects to PostgreSQL directly via asyncpg using `DATABASE_URL`.

---

## Deployment

| Service | Platform | What runs there |
|---|---|---|
| Frontend | Vercel | Next.js 16 |
| Backend | Railway or Render | FastAPI (uvicorn) |
| Database + Auth | Supabase | PostgreSQL + GitHub OAuth |

No Docker. No containers. Direct deployments.

---

## Project structure

```
endpointgraph/
├── .claude/
│   ├── CLAUDE.md              ← this file
│   ├── specs/                 ← feature specs
│   ├── commands/              ← test/lint/dev commands
│   └── agents/                ← test runner, spec checker
│
├── backend/
│   ├── .venv/                 ← virtual environment. Never committed. In .gitignore.
│   ├── main.py                ← FastAPI app, lifespan, router registration
│   ├── database.py            ← asyncpg pool (create once, reuse)
│   ├── models.py              ← Pydantic request/response models
│   ├── auth.py                ← GitHub token extraction from request header
│   ├── routers/
│   │   ├── services.py        ← GET /services
│   │   ├── endpoints.py       ← GET /endpoints, GET /endpoints/{id}/impact-analysis
│   │   ├── graph.py           ← GET /graph
│   │   └── analyze.py         ← POST /analyze
│   ├── analysis/
│   │   ├── cloner.py          ← git clone repo using GitHub token into tmp dir
│   │   ├── spec_parser.py     ← PyYAML: openapi.yaml → endpoints list
│   │   ├── code_parser.py     ← tree-sitter: route decorators + HTTP call sites
│   │   └── url_matcher.py     ← match /users/123 → /users/{id}
│   ├── tests/
│   │   ├── test_spec_parser.py
│   │   ├── test_code_parser.py
│   │   ├── test_url_matcher.py
│   │   └── test_routes.py
│   ├── requirements.txt       ← all packages pinned with ==. Updated after every pip install.
│   └── .env                   ← DATABASE_URL only. Never committed.
│
├── frontend/
│   ├── app/
│   │   ├── layout.js
│   │   ├── page.js            ← redirect to /graph if logged in, else /login
│   │   ├── login/
│   │   │   └── page.js        ← GitHub OAuth login button
│   │   └── graph/
│   │       └── page.js        ← main graph page (protected route)
│   ├── components/
│   │   ├── DependencyGraph.jsx   ← React Flow (dynamic import, ssr:false)
│   │   ├── ImpactPanel.jsx       ← side panel: consumers on node click
│   │   ├── SearchBar.jsx         ← filter nodes by endpoint path
│   │   ├── RepoInput.jsx         ← input for GitHub repo URL + analyze button
│   │   └── AuthGuard.jsx         ← redirect to /login if no session
│   ├── lib/
│   │   ├── supabase.js           ← createClient — used for auth ONLY
│   │   └── api.js                ← all fetch() calls to FastAPI
│   ├── globals.css               ← @import "tailwindcss" + @theme block
│   ├── package.json
│   └── .env.local                ← NEXT_PUBLIC vars. Never committed.
│
└── sample-services/              ← fake microservices for demo
    ├── order-service/
    │   ├── main.py
    │   └── openapi.yaml
    ├── payment-service/
    │   ├── main.py
    │   └── openapi.yaml
    └── user-service/
        ├── main.py
        └── openapi.yaml
```

---

## Database schema

All tables are in the `public` schema in Supabase. The `auth.users` table is managed by Supabase Auth — never create or alter it.

### Table: `services`

```sql
CREATE TABLE public.services (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  language    VARCHAR(50),
  repo_url    VARCHAR(255),
  created_at  TIMESTAMP DEFAULT NOW()
);
```

### Table: `endpoints`

```sql
CREATE TABLE public.endpoints (
  id           SERIAL PRIMARY KEY,
  service_id   INT NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  method       VARCHAR(10) NOT NULL,    -- GET | POST | PUT | DELETE
  path         VARCHAR(255) NOT NULL,   -- /users/{id}
  spec_source  VARCHAR(50),            -- openapi | decorator | live_spec
  created_at   TIMESTAMP DEFAULT NOW()
);
```

### Table: `consumer_edges`

```sql
CREATE TABLE public.consumer_edges (
  id                 SERIAL PRIMARY KEY,
  caller_service_id  INT NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  endpoint_id        INT NOT NULL REFERENCES public.endpoints(id) ON DELETE CASCADE,
  last_seen_at       TIMESTAMP DEFAULT NOW(),
  call_count         INT DEFAULT 0,
  source             VARCHAR(20) NOT NULL,  -- static | logs
  created_at         TIMESTAMP DEFAULT NOW(),
  UNIQUE(caller_service_id, endpoint_id)
);
```

### Why each column exists

| Column | Why |
|---|---|
| `consumer_edges.last_seen_at` | Dependency seen 8 months ago vs 2 minutes ago = very different risk |
| `consumer_edges.call_count` | 1 call/day vs 10,000/min = very different blast radius |
| `consumer_edges.source` | `static` = found in code (possible false positives). `logs` = confirmed live traffic (v2 only) |
| `endpoints.spec_source` | Tracks how the endpoint was discovered — affects confidence shown in UI |

---

## Auth flow — GitHub OAuth via Supabase

### Full flow step by step

```
1. User visits the app → /login page
2. Clicks "Login with GitHub"
3. Supabase Auth redirects to GitHub OAuth consent screen
4. User approves → GitHub redirects back to /auth/callback
5. Supabase exchanges code for tokens, stores session
6. session.provider_token = GitHub personal access token
7. Frontend stores session in memory (Supabase handles this)
8. User is redirected to /graph
9. When user triggers analysis:
   - Frontend reads session.provider_token
   - Sends it to FastAPI as X-GitHub-Token header
   - FastAPI uses it to git clone the repo (public or private)
```

### Frontend auth setup

```javascript
// lib/supabase.js — auth client ONLY, never used for DB queries
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)
```

```javascript
// app/login/page.js
'use client'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const login = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        scopes: 'repo',   // 'repo' scope = access to private repos
        redirectTo: `${window.location.origin}/auth/callback`
      }
    })
  }

  return <button onClick={login}>Login with GitHub</button>
}
```

```javascript
// app/auth/callback/route.js — Next.js route handler
import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  await supabase.auth.exchangeCodeForSession(code)
  return NextResponse.redirect(new URL('/graph', request.url))
}
```

```javascript
// lib/api.js — get GitHub token and attach to every FastAPI request
import { supabase } from './supabase'

async function getGitHubToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.provider_token  // this is the GitHub OAuth token
}

export async function triggerAnalysis(repoUrl) {
  const token = await getGitHubToken()
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-GitHub-Token': token
    },
    body: JSON.stringify({ repo_url: repoUrl })
  })
  return res.json()
}

export async function fetchGraph() {
  const token = await getGitHubToken()
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/graph`, {
    headers: { 'X-GitHub-Token': token }
  })
  return res.json()
}

export async function fetchImpactAnalysis(endpointId) {
  const token = await getGitHubToken()
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/endpoints/${endpointId}/impact-analysis`,
    { headers: { 'X-GitHub-Token': token } }
  )
  return res.json()
}
```

### Backend token extraction

```python
# auth.py
from fastapi import Header, HTTPException

async def get_github_token(x_github_token: str = Header(alias="X-GitHub-Token")):
    if not x_github_token:
        raise HTTPException(status_code=401, detail="GitHub token required")
    return x_github_token
```

```python
# routers/analyze.py
from fastapi import APIRouter, Depends
from auth import get_github_token
from analysis.cloner import clone_repo

router = APIRouter()

@router.post("/analyze")
async def analyze(request: AnalyzeRequest, token: str = Depends(get_github_token)):
    tmp_dir = clone_repo(request.repo_url, token)
    # run analysis on tmp_dir...
```

---

## Repo cloning

```python
# analysis/cloner.py
import subprocess
import tempfile
import uuid
import shutil
import re
import os

def clone_repo(repo_url: str, github_token: str) -> str:
    """
    Clone a GitHub repo (public or private) using the GitHub token.
    Returns path to temp directory. Caller must delete it after analysis.
    """
    # Normalize URL — accept both formats:
    # github.com/user/repo
    # https://github.com/user/repo
    repo_url = repo_url.strip()
    repo_url = re.sub(r'^https?://', '', repo_url)
    if not repo_url.startswith('github.com/'):
        raise ValueError(f"Invalid GitHub URL: {repo_url}")

    auth_url = f"https://{github_token}@{repo_url}"
    tmp_dir = os.path.join(tempfile.gettempdir(), str(uuid.uuid4()))

    result = subprocess.run(
        ["git", "clone", "--depth", "1", auth_url, tmp_dir],
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        raise RuntimeError(f"Clone failed: {result.stderr}")

    return tmp_dir

def delete_repo(tmp_dir: str):
    """Always call this after analysis to clean up."""
    shutil.rmtree(tmp_dir, ignore_errors=True)
```

**Important:** `--depth 1` clones only the latest commit. Faster, less storage. Always delete the temp dir after analysis — use try/finally.

---

## Static analysis

### tree-sitter — two jobs

**Job 1 — Find what a service EXPOSES (route decorators → endpoints table)**

```python
# Finds: @app.get("/users/{id}") → method=GET, path=/users/{id}
# Finds: @app.post("/orders") → method=POST, path=/orders
# Works for FastAPI and Flask decorators
```

**Job 2 — Find what a service CALLS (HTTP client calls → consumer_edges)**

```python
# Finds: requests.get("http://user-service/users/123")
# Finds: requests.post("http://payment-service/payments/charge")
# Extracts the URL string, then url_matcher maps it to a known path
```

### Endpoint discovery priority

When analyzing a service folder, check in this order:

1. `openapi.yaml` or `openapi.json` exists → parse with PyYAML (most reliable)
2. No spec file → scan `.py` files with tree-sitter for route decorators

### URL matching

```python
# analysis/url_matcher.py
import re

def match_url_to_endpoint(url_path: str, known_paths: list[str]) -> str | None:
    """
    Match /users/123 to /users/{id}
    Match /orders/abc-456 to /orders/{id}
    """
    url_path = url_path.strip('/')
    for path in known_paths:
        # Convert {id}, {user_id}, {any_param} → regex that matches any non-slash string
        pattern = re.sub(r'\{[^}]+\}', r'[^/]+', path.strip('/'))
        if re.fullmatch(pattern, url_path):
            return path
    return None
```

---

## FastAPI API contract

Base URL local: `http://localhost:8000`
All routes require `X-GitHub-Token` header.

| Method | Route | Request body | Returns |
|---|---|---|---|
| POST | `/analyze` | `{repo_url: string}` | `{status: "ok", services: int, endpoints: int, edges: int}` |
| GET | `/graph` | — | `{nodes: [...], edges: [...]}` |
| GET | `/services` | — | `[{id, name, language, repo_url}]` |
| GET | `/endpoints` | `?service_id=1` (optional) | `[{id, service_id, method, path, spec_source}]` |
| GET | `/endpoints/{id}/impact-analysis` | — | `[{service_name, call_count, last_seen_at, source}]` |

### Pydantic models

```python
# models.py
from pydantic import BaseModel
from datetime import datetime

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
    language: str | None
    repo_url: str | None

class EndpointOut(BaseModel):
    id: int
    service_id: int
    method: str
    path: str
    spec_source: str | None

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
```

---

## Core SQL queries

```sql
-- Impact analysis: who calls endpoint X
SELECT s.name AS service_name, ce.call_count, ce.last_seen_at, ce.source
FROM consumer_edges ce
JOIN services s ON s.id = ce.caller_service_id
WHERE ce.endpoint_id = $1
ORDER BY ce.call_count DESC;

-- Full graph: all nodes and edges for React Flow
SELECT
  s.id, s.name,
  ce.caller_service_id, ce.endpoint_id,
  e.path, e.method,
  ce.call_count, ce.last_seen_at
FROM consumer_edges ce
JOIN services s ON s.id = ce.caller_service_id
JOIN endpoints e ON e.id = ce.endpoint_id;

-- Upsert edge (on re-analysis, update existing edge)
INSERT INTO consumer_edges (caller_service_id, endpoint_id, last_seen_at, call_count, source)
VALUES ($1, $2, NOW(), 1, $3)
ON CONFLICT (caller_service_id, endpoint_id)
DO UPDATE SET last_seen_at = NOW(), source = EXCLUDED.source;
```

---

## asyncpg pool setup

```python
# database.py
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()
_pool = None

async def get_pool():
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(os.getenv("DATABASE_URL"), min_size=2, max_size=10)
    return _pool

# main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from database import get_pool

@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()  # warm on startup
    yield

app = FastAPI(lifespan=lifespan)
```

---

## Frontend conventions (JavaScript)

### No TypeScript — all files are .js or .jsx

- Pages: `.js` (in `app/` directory)
- Components: `.jsx` (React components)
- Utilities: `.js`
- No `tsconfig.json`, no type annotations, no `.ts` or `.tsx` files
- Use JSDoc `/** @param {string} url */` for documentation where helpful but not required

### Tailwind v4 setup

```css
/* globals.css — entire Tailwind config */
@import "tailwindcss";

@theme {
  /* add custom tokens here only if needed */
}
```

No `tailwind.config.js`. No `content` array. No `@tailwind` directives.

### React Flow in Next.js 16

```jsx
// components/DependencyGraph.jsx
'use client'
import { ReactFlow, Background, Controls, MiniMap } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

export default function DependencyGraph({ nodes, edges, onNodeClick }) {
  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodeClick={onNodeClick}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  )
}
```

```jsx
// app/graph/page.js — dynamic import REQUIRED
import dynamic from 'next/dynamic'

const DependencyGraph = dynamic(
  () => import('@/components/DependencyGraph'),
  { ssr: false }   // React Flow uses window/document — no SSR
)
```

### All API calls live in lib/api.js

No inline `fetch()` inside components or pages. Every call to FastAPI goes through `lib/api.js`. Components call functions from `api.js`, not raw fetch.

---

## Environment variables

### backend/.env (never commit)
```
DATABASE_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres
```

### frontend/.env.local (never commit)
```
NEXT_PUBLIC_SUPABASE_URL=https://[ref].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[anon-key]
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Vercel environment variables (production frontend)
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_API_URL=https://your-fastapi-app.railway.app
```

### Railway environment variables (production backend)
```
DATABASE_URL
```

---

## Python virtual environment

All Python work happens inside `.venv`. No exceptions.
Never use system Python, never install packages globally.

### Rules

- The venv lives at `backend/.venv` — always inside the backend folder, never at the project root
- Always activate before running any Python command: `pip`, `pytest`, `uvicorn`, `ruff`, `python`
- `.venv` is in `.gitignore` — never commit it
- Every package installed must be added to `requirements.txt` with a pinned version

### Creating the venv (first time only)

```bash
cd backend
python3 -m venv .venv
```

### Activating (every terminal session)

```bash
# macOS / Linux
source backend/.venv/bin/activate

# Windows
backend\.venv\Scripts\activate
```

Prompt will show `(.venv)` when active. If it does not show, the venv is not active — do not run any commands.

### Installing packages

```bash
# Always activate first, then install
source backend/.venv/bin/activate
pip install <package>
```

After installing any new package, immediately update `requirements.txt`:

```bash
pip freeze > requirements.txt
```

Or manually add the pinned version:
```
fastapi==0.111.0
```

Never leave `requirements.txt` with unpinned versions like `fastapi` — always `fastapi==0.111.0`.

### requirements.txt rules

- Every package is pinned to an exact version (`==`)
- No version ranges (`>=`, `~=`) — they cause silent breakage on fresh installs
- Keep it sorted alphabetically for readability
- Update it immediately after every `pip install` — not at the end of the session
- When a spec requires a new package, the spec's "Files to edit" must include `requirements.txt`

### Example requirements.txt

```
asyncpg==0.29.0
fastapi==0.111.0
httpx==0.27.0
psycopg2-binary==2.9.9
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

### Commands — always with .venv active

```bash
# Run backend
uvicorn main:app --reload --port 8000

# Run tests
python -m pytest tests/ -v

# Lint
ruff check .

# Install a new package and pin it
pip install somepackage
pip freeze > requirements.txt
```

---

## Running locally (no Docker)

```bash
# Terminal 1 — backend
cd backend
python3 -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Terminal 2 — frontend
cd frontend
npm install
npm run dev                     # runs on localhost:3000
```

---

## Key decisions — do not re-litigate

### GitHub OAuth in v1
GitHub OAuth is v1, not v2. The reason: without it, the project only works for public repos and the user flow is weak (paste a URL with no auth context). With OAuth, users get private repo access and the flow is: login → paste URL → see graph. This is the product. Complexity is manageable using Supabase Auth which handles GitHub OAuth with minimal code.

### PostgreSQL over Neo4j
The core query is 1 hop: "who calls endpoint X" = one JOIN on `consumer_edges`. PostgreSQL handles this trivially. No need for a graph database at this scale.

### Endpoint-level only (v1)
EndpointGraph v1 tracks that Service A calls `GET /users/{id}`. It does NOT track which response fields Service A reads. Field-level impact analysis is v2.

### Static analysis only (v1)
Only tree-sitter + OpenAPI parsing. No log ingestion (Envoy/NGINX). The `source` column will only ever be `'static'` in v1.

### Python only (tree-sitter, v1)
tree-sitter analysis only runs on Python files. Multi-language support is v2.

### No ORM
Raw asyncpg queries. No SQLAlchemy. Queries are simple enough that an ORM adds no value and hides what's happening.

### JavaScript not TypeScript
The project is straightforward enough that TypeScript would add friction without meaningful benefit. All files are `.js` or `.jsx`.

### No Docker
Deploying to Vercel (frontend) + Railway (backend) + Supabase (DB). Docker is not needed. Local dev uses two terminal tabs.

---

## v1 scope

### In v1
- [x] GitHub OAuth login via Supabase Auth (with `repo` scope for private repos)
- [x] User pastes GitHub repo URL → FastAPI clones it
- [x] OpenAPI YAML parsing → endpoint discovery
- [x] tree-sitter Python route decorator parsing → endpoint discovery fallback
- [x] tree-sitter Python HTTP call-site extraction → consumer_edges
- [x] URL-to-path matching
- [x] GET /graph, GET /endpoints/{id}/impact-analysis, GET /services, GET /endpoints, POST /analyze
- [x] React Flow graph visualization
- [x] Click endpoint → highlight consumers + side panel
- [x] Search bar to filter by endpoint path
- [x] Sample microservices repo (3 services) for demo
- [x] Deploy: Vercel + Railway + Supabase

### Not in v1 — do not implement
- [ ] Field-level impact analysis
- [ ] Log ingestion (Envoy, NGINX, Istio)
- [ ] gRPC .proto parsing
- [ ] Multi-language support
- [ ] GitHub PR comment bot
- [ ] Per-user data isolation (all analyses go into the same DB for now)
- [ ] Deprecation-header tracking
- [ ] Background job processing

---

## Sample services (demo graph)

Three fake Python services that produce a meaningful graph when analyzed:

| Service | Exposes | Calls |
|---|---|---|
| `order-service` | `POST /orders/create`, `GET /orders/{id}` | `GET /users/{id}`, `POST /payments/charge` |
| `payment-service` | `POST /payments/charge`, `GET /payments/{id}` | `GET /users/{id}` |
| `user-service` | `GET /users/{id}`, `GET /users/profile` | nothing |

Demo flow: point the app at the sample-services repo → `GET /users/{id}` shows 2 consumers (order + payment) → this is the high-risk endpoint to demo impact analysis on.

---

## What "done" looks like for v1

1. User visits the deployed app → sees login page
2. Clicks "Login with GitHub" → authenticates → redirected to /graph
3. Pastes `github.com/yourname/sample-services` → clicks "Analyze"
4. Graph renders showing 3 service nodes with edges between them
5. User clicks `GET /users/{id}` node
6. Side panel shows: "2 consumers — Order Service (12,400 calls), Payment Service (8,900 calls)"
7. Relevant nodes highlight in the graph
8. README has a demo GIF of this exact flow
9. README has a "Technical decisions" section (Neo4j vs SQL, tree-sitter vs regex, v1 vs v2)