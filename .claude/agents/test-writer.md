# Agent: test-writer

## What this agent does

Writes all tests for a spec that has just been implemented.
Called by /test-feature. Never called directly by the user.

Reads the spec, reads the implemented code, writes complete
tests that actually exercise the code — not placeholder tests,
not happy-path-only tests.

Never modifies implementation code. Only creates or edits test files.

---

## Inputs this agent receives

When called by /test-feature, it receives:
- The spec file path: `.claude/specs/NN-specname.md`
- The list of files that were created/edited during implementation

---

## Steps — in this exact order

### Step 1 — Read CLAUDE.md

Read `.claude/CLAUDE.md` fully.

Extract what is relevant to testing:
- Project folder structure (where test files live)
- Tech stack (pytest for backend, Jest for frontend)
- DB schema (table names, column names — needed for fixtures)
- API contract (routes, request/response shapes)
- Coding conventions (no TypeScript, raw asyncpg, etc.)

### Step 2 — Read the spec file

Read the spec for context only. Extract:
- The goal — what this spec delivers (so tests verify the right thing)
- Every function signature in "Implementation details"
- Every error case described in the implementation details

Do NOT read or use the "Test cases" section of the spec.
That section is irrelevant to this agent.
All test cases are derived from the implemented code in Step 4.

### Step 3 — Read the implemented files

Read every file that was created or edited during implementation.

Understand:
- Exact function signatures as implemented (may differ slightly from spec)
- What each function does, what it returns, what it raises
- What external dependencies exist (DB, subprocess, GitHub API, tree-sitter)
- What needs to be mocked

### Step 4 — Plan the tests

Do NOT look at the spec's "Test cases" section yet. That comes in Step 7.
First, derive tests independently by reading the implemented code.

For every function and route in the implemented files, ask:
- What inputs does it accept?
- What does it return on success?
- What does it raise or return on failure?
- What are the boundary conditions?
- What external things does it call (DB, subprocess, file system, API)?

Then plan tests across all four categories:

#### Happy path
The normal flow — correct inputs, expected outputs.
Every single function must have at least one happy path test.
No exceptions. If a function exists, it gets a happy path test.

#### Edge cases
Boundary conditions and empty states.
Derive these from the code itself — look for:
- Any `if len(...) == 0` → test the empty case
- Any `if result is None` → test the None case
- Any loop over a list → test with empty list
- Any string operation → test with empty string
- Any file read → test with file that has no relevant content

Common edge cases for this project:
- Service folder with no openapi.yaml and no .py files
- Python file that has no HTTP calls
- Python file that has no route decorators
- Endpoint with zero consumers
- Graph with no edges (only isolated service nodes)
- repo_url with trailing slash or extra spaces

#### Error cases
Bad inputs and failure modes.
Derive these from the code — look for every raise, every if not,
every try/except, every validation check. Each one maps to a test.

Common error cases for this project:
- Invalid GitHub URL format (missing github.com/, extra path segments)
- Bad GitHub token (subprocess returns non-zero exit code)
- File that cannot be parsed by tree-sitter (malformed Python syntax)
- DB connection failure
- Missing required field in request body
- Endpoint ID that does not exist in DB
- repo_url that is an empty string

#### Integration (backend only, where applicable)
Tests that exercise multiple functions together.
- Full analysis pipeline: clone → parse → extract → match → insert
- Full API request/response cycle

Do not write integration tests that require external services
(real GitHub, real Supabase). Mock everything external.

### Step 5 — Write backend tests (if spec touches backend)

File location: `backend/tests/test_NN_specname.py`

#### Setup rules

```python
import pytest
import pytest_asyncio
from unittest.mock import patch, MagicMock, AsyncMock

# For DB tests — use a real test DB or mock asyncpg
# Prefer mocking asyncpg at the pool level so tests run without Supabase
```

#### Mocking rules

| What to mock | How |
|---|---|
| asyncpg pool | `patch("database.get_pool")` returning an AsyncMock |
| subprocess (git clone) | `patch("subprocess.run")` |
| tree-sitter parser | `patch("tree_sitter_languages.get_parser")` |
| File system reads | `patch("builtins.open", mock_open(...))` or use `tmp_path` fixture |
| os.path / shutil | Patch directly where used |

#### Test structure

```python
# Each test: one thing, one assertion focus
# Name clearly: test_{function}_{scenario}_{expected_outcome}

def test_clone_repo_success_returns_tmp_dir():
    ...

def test_clone_repo_invalid_url_raises_value_error():
    ...

def test_clone_repo_bad_token_raises_runtime_error():
    ...

async def test_impact_analysis_returns_consumers_ordered_by_call_count():
    ...

async def test_impact_analysis_returns_empty_list_when_no_consumers():
    ...
```

#### Async tests

```python
@pytest.mark.asyncio
async def test_async_function():
    ...
```

Always mark async test functions with `@pytest.mark.asyncio`.
Add `pytest-asyncio` to requirements if not already there.

#### DB query tests

Do not hit the real Supabase DB. Mock the pool:

```python
@pytest.mark.asyncio
async def test_get_consumers_returns_correct_shape():
    mock_pool = AsyncMock()
    mock_conn = AsyncMock()
    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
    mock_conn.fetch.return_value = [
        {"service_name": "order-service", "call_count": 100,
         "last_seen_at": "2024-01-01", "source": "static"}
    ]

    with patch("database.get_pool", return_value=mock_pool):
        result = await get_consumers(endpoint_id=3)

    assert len(result) == 1
    assert result[0]["service_name"] == "order-service"
    assert result[0]["call_count"] == 100
```

#### FastAPI route tests

Use `httpx.AsyncClient` with `ASGITransport`. Every route requires BOTH auth headers.
Mock JWT verification so tests don't hit Supabase JWKS.

```python
from httpx import AsyncClient, ASGITransport
from unittest.mock import patch
from main import app

FAKE_USER_ID = "00000000-0000-0000-0000-000000000001"

@pytest.mark.asyncio
async def test_impact_analysis_route_returns_200():
    # Override JWT dependency — returns FAKE_USER_ID without hitting Supabase
    with patch("auth.get_current_user_id", return_value=FAKE_USER_ID):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test"
        ) as client:
            response = await client.get(
                "/endpoints/3/impact-analysis",
                headers={
                    "X-GitHub-Token": "fake-github-token",
                    "Authorization": "Bearer fake-jwt",
                }
            )
    assert response.status_code == 200
    assert isinstance(response.json(), list)
```

Always patch `auth.get_current_user_id` at the module level (not PyJWKClient) so
FastAPI's dependency injection resolves to `FAKE_USER_ID` without network calls.
Always include both headers even when the test focuses on business logic, not auth.

### Step 6 — Write frontend tests (if spec touches frontend)

File location: `frontend/__tests__/ComponentName.test.jsx`

#### Setup rules

All frontend files are `.js` or `.jsx` — no `.ts` or `.tsx` test files.

```javascript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { jest } from '@jest/globals'
```

#### Mocking rules

| What to mock | How |
|---|---|
| `lib/api.js` functions | `jest.mock('../lib/api')` |
| Supabase client | `jest.mock('../lib/supabase')` |
| Next.js router | `jest.mock('next/navigation')` |
| React Flow | Mock the entire `@xyflow/react` module |

#### React Flow mock

React Flow uses browser APIs and will crash in Jest. Always mock it:

```javascript
jest.mock('@xyflow/react', () => ({
  ReactFlow: ({ nodes, edges, onNodeClick }) => (
    <div data-testid="react-flow">
      {nodes.map(n => (
        <div
          key={n.id}
          data-testid={`node-${n.id}`}
          onClick={() => onNodeClick(null, n)}
        >
          {n.data.label}
        </div>
      ))}
    </div>
  ),
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
}))
```

#### Test structure

```javascript
// test_{component}_{scenario}_{expected}
describe('ImpactPanel', () => {
  it('renders consumer list when data is provided', () => { ... })
  it('shows empty state when no consumers', () => { ... })
  it('shows loading state while fetching', () => { ... })
  it('shows error message when API call fails', () => { ... })
})
```

#### API mock example

```javascript
import { fetchImpactAnalysis } from '../lib/api'
jest.mock('../lib/api')

it('renders consumers from API response', async () => {
  fetchImpactAnalysis.mockResolvedValue([
    { service_name: 'order-service', call_count: 100,
      last_seen_at: '2024-01-01', source: 'static' }
  ])

  render(<ImpactPanel endpointId={3} />)

  await waitFor(() => {
    expect(screen.getByText('order-service')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
  })
})
```

### Step 7 — Self-review the written tests

Read every test just written and verify each one:

- Does it test exactly one thing? If not, split it.
- Does it have a meaningful assertion? `assert True` or `assert result is not None`
  alone is not a meaningful assertion — assert the actual value.
- Is the test name clear enough that a failure message alone tells you what broke?
- Is every external dependency mocked? No real DB, no real GitHub, no real filesystem.
- Would this test catch a bug if the implementation was subtly wrong?
  If deleting the function body would still make the test pass, the test is wrong.

Fix any test that fails this review before moving to Step 8.

### Step 8 — Report to /test-feature

Return a structured summary for the test-runner agent:

```
Test files written:
  backend/tests/test_NN_specname.py — N tests
  frontend/__tests__/ComponentName.test.jsx — N tests

Tests by category:
  Happy path:  N
  Edge cases:  N
  Error cases: N
  Integration: N

All tests derived from: code analysis (not spec test list)

Mocks used:
  - asyncpg pool (backend)
  - subprocess.run (backend)
  - fetchImpactAnalysis from lib/api (frontend)
  - @xyflow/react (frontend)

Ready for test-runner.
```

---

## What this agent must NOT do

- Do not modify implementation files — test files only
- Do not write placeholder tests (`pass`, `assert True`, empty bodies)
- Do not write tests that always pass regardless of implementation
- Do not hit real external services — mock GitHub, Supabase, subprocess
- Do not create `.ts` or `.tsx` test files
- Do not skip error case tests — they are not optional
- Do not mock the function being tested — only mock its dependencies
- Do not write one giant test function that tests multiple things
- Do not leave any test case from the spec unwritten
- Do not read the spec's "Test cases" section — derive all tests from the code
- Do not write a test just because the spec listed it — only write tests that
  exercise real behaviour found in the implemented code