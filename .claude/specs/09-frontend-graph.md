# Spec 09 — Frontend Graph Page

## Goal
Build the main `/graph` page that fetches the dependency graph from FastAPI, renders it with React Flow, accepts a GitHub repo URL to trigger analysis, and is protected by AuthGuard.

## Depends on
- Spec 01 (DB schema)
- Spec 02 (GitHub auth — session and provider_token must exist)
- Spec 07 (POST /analyze route)
- Spec 08 (GET /graph route)

## Context
This is the core user-facing page of EndpointGraph. After a user logs in with GitHub, they land here. They paste a GitHub repo URL and click "Analyze" — the frontend calls `POST /analyze` with their GitHub token. Once analysis completes, the page fetches `GET /graph` and renders an interactive React Flow visualization of all service nodes and their dependency edges. This spec implements the page itself, the graph component, and the repo input component.

## Files to create

- `frontend/components/DependencyGraph.jsx` — React Flow graph with nodes and edges; calls `onNodeClick` when a node is selected
- `frontend/components/RepoInput.jsx` — text input for GitHub repo URL + "Analyze" button; calls `triggerAnalysis` from `api.js`
- `frontend/components/AuthGuard.jsx` — checks Supabase session on mount; redirects to `/login` if no session; renders children if authenticated

## Files to edit

- `frontend/app/graph/page.js` — main graph page: uses AuthGuard, RepoInput, and DependencyGraph; manages graph state. Replace the entire file — it currently only contains a redirect stub.
- `frontend/lib/api.js` — ensure `triggerAnalysis` and `fetchGraph` are implemented (add them if missing; do not remove any existing functions)
- `frontend/package.json` — verify `@xyflow/react` is listed as a dependency; add it and run `npm install` if missing

## Implementation details

### frontend/components/AuthGuard.jsx

```jsx
'use client'
```

Props: `{ children }`

On mount, call `supabase.auth.getSession()`. If `session` is null, call `router.push('/login')` from `next/navigation`. While loading (before session check completes), render nothing or a loading state. Once session is confirmed, render `children`.

State:
- `loading` (boolean, starts `true`) — set to `false` after session check
- `session` (object|null) — result of getSession

Render logic:
- `if (loading) return null`
- `if (!session) return null` (redirect already fired)
- `return children`

Imports needed: `useEffect`, `useState` from `react`; `useRouter` from `next/navigation`; `supabase` from `@/lib/supabase`.

### frontend/components/RepoInput.jsx

```jsx
'use client'
```

Props: `{ onAnalysisComplete }` — called with no arguments when analysis finishes successfully

State:
- `repoUrl` (string, starts `''`) — controlled input value
- `loading` (boolean, starts `false`) — true while analysis is in progress
- `error` (string|null, starts `null`) — set if triggerAnalysis throws or returns a non-ok response

Behavior:
- Renders a `<div>` containing:
  - `<input type="text">` bound to `repoUrl`, placeholder `"github.com/owner/repo"`
  - `<button>` labeled `"Analyze"`, disabled when `loading` is true
- On button click:
  1. Set `loading = true`, `error = null`
  2. Call `triggerAnalysis(repoUrl)` from `@/lib/api`
  3. If it resolves, call `onAnalysisComplete()`
  4. If it throws, set `error` to the error message string
  5. Set `loading = false` in a finally block
- If `error` is set, render it as a `<p>` below the input

Imports needed: `useState` from `react`; `triggerAnalysis` from `@/lib/api`.

### frontend/components/DependencyGraph.jsx

```jsx
'use client'
```

Props: `{ nodes, edges, onNodeClick }`

- `nodes` — array of `{ id: string, data: { label: string }, position: { x: number, y: number } }`
- `edges` — array of `{ id: string, source: string, target: string, label: string }`
- `onNodeClick` — called with `(event, node)` when a node is clicked

Renders:
```jsx
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
```

Imports needed: `ReactFlow`, `Background`, `Controls`, `MiniMap` from `@xyflow/react`; `@xyflow/react/dist/style.css`.

This component must NOT use dynamic import itself — the dynamic import with `ssr: false` is done in `page.js`.

### frontend/app/graph/page.js

This is a server component by default but must be `'use client'` because it manages state and calls the Supabase client.

```jsx
'use client'
```

State:
- `nodes` (array, starts `[]`) — React Flow node objects
- `edges` (array, starts `[]`) — React Flow edge objects
- `graphLoading` (boolean, starts `false`) — true while `fetchGraph` is running; render a `<p>Loading graph…</p>` in place of the graph while true
- `graphError` (string|null, starts `null`) — set if `fetchGraph` throws; render as a `<p>` below `RepoInput`

On `onAnalysisComplete` (called by RepoInput after a successful analyze):
1. Set `graphLoading = true`, `graphError = null`
2. In a try/catch/finally:
   - try: call `fetchGraph()` from `@/lib/api`
   - Transform the response into React Flow format:
     - Each node in `graphData.nodes` → `{ id: node.id, data: { label: node.name }, position: { x: 0, y: 0 } }`
     - Each edge in `graphData.edges` → `{ id: \`${edge.source}-${edge.target}-${edge.endpoint_method}-${edge.endpoint_path}\`, source: edge.source, target: edge.target, label: \`${edge.endpoint_method} ${edge.endpoint_path}\` }`
   - Set `nodes` and `edges` state
   - catch: set `graphError` to the error message string
   - finally: set `graphLoading = false`

Renders:
```jsx
<AuthGuard>
  <div>
    <RepoInput onAnalysisComplete={handleAnalysisComplete} />
    {graphError && <p>{graphError}</p>}
    {graphLoading && <p>Loading graph…</p>}
    {!graphLoading && nodes.length > 0 && (
      <DependencyGraph
        nodes={nodes}
        edges={edges}
        onNodeClick={(event, node) => console.log('clicked', node)}
      />
    )}
  </div>
</AuthGuard>
```

DependencyGraph must be imported with dynamic import, ssr disabled:
```js
import dynamic from 'next/dynamic'

const DependencyGraph = dynamic(
  () => import('@/components/DependencyGraph'),
  { ssr: false }
)
```

AuthGuard and RepoInput are regular imports (they are client components but do not use browser APIs on render, only in effects/handlers).

### frontend/lib/api.js

Ensure these two functions are present and correct:

`triggerAnalysis(repoUrl: string) -> Promise<object>`
- Gets GitHub token from Supabase session: `supabase.auth.getSession()` → `session.provider_token`
- Makes `POST ${NEXT_PUBLIC_API_URL}/analyze` with:
  - Header `Content-Type: application/json`
  - Header `X-GitHub-Token: <token>`
  - Body: `JSON.stringify({ repo_url: repoUrl })`
- Returns `res.json()`
- Throws if `res.ok` is false: `throw new Error(await res.text())`

`fetchGraph() -> Promise<object>`
- Gets GitHub token from Supabase session
- Makes `GET ${NEXT_PUBLIC_API_URL}/graph` with header `X-GitHub-Token: <token>`
- Returns `res.json()`
- Throws if `res.ok` is false: `throw new Error(await res.text())`

Helper (shared, defined once at top of file):
```js
async function getGitHubToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.provider_token
}
```

## Test cases

Frontend tests live in `frontend/` and use Jest. Create test files alongside or in a `__tests__` folder.

- `test_authguard_redirects_when_no_session` — mock `supabase.auth.getSession` to return `{ data: { session: null } }`, render AuthGuard, assert `router.push` was called with `'/login'`
- `test_authguard_renders_children_when_session_exists` — mock session to return a valid session object, render AuthGuard with a child element, assert the child is visible
- `test_repoinput_calls_triggerAnalysis_on_button_click` — mock `triggerAnalysis` to resolve, click the Analyze button, assert `triggerAnalysis` was called with the input value
- `test_repoinput_calls_onAnalysisComplete_after_success` — mock `triggerAnalysis` to resolve, pass a jest.fn() as `onAnalysisComplete`, click Analyze, assert `onAnalysisComplete` was called exactly once
- `test_repoinput_shows_error_on_failure` — mock `triggerAnalysis` to reject with `new Error('clone failed')`, click Analyze, assert error text `'clone failed'` is rendered and `onAnalysisComplete` was NOT called
- `test_repoinput_disables_button_while_loading` — mock `triggerAnalysis` to return a never-resolving promise, click Analyze, assert button has `disabled` attribute
- `test_dependency_graph_renders_nodes` — render DependencyGraph with a nodes array containing one node, assert the node label appears (mock ReactFlow or use a minimal render)
- `test_graph_page_transforms_fetchGraph_response` — mock `fetchGraph` to return `{ nodes: [{ id: "1", name: "order-service" }], edges: [{ source: "1", target: "2", endpoint_method: "GET", endpoint_path: "/users/{id}", call_count: 5, last_seen_at: "..." }] }`, call `handleAnalysisComplete`, assert rendered nodes contain a node with `data.label = "order-service"` and rendered edges have ID `"1-2-GET-/users/{id}"`
- `test_graph_page_shows_error_when_fetchGraph_fails` — mock `fetchGraph` to throw `new Error('graph fetch failed')`, call `handleAnalysisComplete`, assert error text `'graph fetch failed'` is rendered and `graphLoading` returns to false

## Done when

- [ ] `frontend/components/AuthGuard.jsx` exists and redirects unauthenticated users to `/login`
- [ ] `frontend/components/RepoInput.jsx` exists with controlled input, Analyze button, loading state, and error display
- [ ] `frontend/components/DependencyGraph.jsx` exists and renders ReactFlow with Background, Controls, MiniMap
- [ ] `frontend/package.json` lists `@xyflow/react` as a dependency
- [ ] `frontend/app/graph/page.js` wraps everything in AuthGuard, uses dynamic import for DependencyGraph with `ssr: false`, fetches graph after analysis, transforms response into React Flow node/edge format
- [ ] `frontend/app/graph/page.js` handles `fetchGraph` errors with a `graphError` state rendered as a `<p>` and `graphLoading` state rendered while the fetch is in progress
- [ ] Edge IDs in the transformed graph use the format `${source}-${target}-${method}-${path}` (no collisions when multiple endpoints exist between the same two services)
- [ ] `frontend/lib/api.js` contains `triggerAnalysis` and `fetchGraph` with proper error throwing
- [ ] No TypeScript — all files are `.js` or `.jsx`
- [ ] No inline `fetch()` in components — all API calls go through `lib/api.js`
- [ ] React Flow imported with `ssr: false` dynamic import only in `page.js`, not in the component itself
- [ ] No hardcoded credentials or URLs — all env vars via `process.env.NEXT_PUBLIC_*`
- [ ] All test cases listed above pass
