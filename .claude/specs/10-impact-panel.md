# Spec 10 — Impact Panel Side Panel

## Goal
Build `ImpactPanel.jsx` that slides in when an endpoint node is clicked in the graph, displaying each consumer service's call count, relative last-seen time, and source badge — and wire the click handler end-to-end from `DependencyGraph` through the graph page.

## Depends on
- Spec 09 (frontend graph page, DependencyGraph, lib/api.js must exist)
- Spec 08 (GET /endpoints/{id}/impact-analysis and GET /graph routes must exist)

## Context
The current graph renders service nodes only. Clicking a node does `console.log`. This spec adds endpoint nodes to the graph so users can click `GET /users/{id}` as a node and see which services call it. It requires a small backend change to include endpoint nodes in the `GET /graph` response, plus the new `ImpactPanel.jsx` frontend component and wiring in `graph/page.js`.

## Files to create
- `frontend/components/ImpactPanel.jsx` — side panel that fetches and displays impact analysis on mount; shown when an endpoint node is clicked

## Files to edit
- `backend/routers/graph.py` — add endpoint nodes to the response and retarget edges from `provider_service_id` to `endpoint-{id}` node IDs
- `backend/tests/test_routes.py` — update two existing graph tests that will break and add one new graph test
- `frontend/app/graph/page.js` — add `selectedEndpoint` state, implement `handleNodeClick`, style endpoint nodes differently, update edge label, render `ImpactPanel`
- `frontend/lib/api.js` — add `if (!res.ok) throw new Error(await res.text())` to `fetchImpactAnalysis` (currently missing, unlike the other functions)

## Implementation details

### backend/routers/graph.py

The current implementation returns service nodes and edges where `target = provider_service_id`. After this change, edges target endpoint nodes instead, and endpoint nodes are included in the nodes list.

Three queries, run in one `async with pool.acquire()` block:

**Query 1 — service nodes (unchanged):**
```sql
SELECT id, name FROM services ORDER BY id
```

**Query 2 — endpoint nodes (only endpoints that appear in consumer_edges):**
```sql
SELECT DISTINCT e.id, e.method, e.path
FROM endpoints e
JOIN consumer_edges ce ON ce.endpoint_id = e.id
ORDER BY e.id
```

**Query 3 — consumer edges (caller-service → endpoint):**
```sql
SELECT ce.caller_service_id, ce.endpoint_id,
       e.path AS endpoint_path, e.method AS endpoint_method,
       ce.call_count, ce.last_seen_at
FROM consumer_edges ce
JOIN endpoints e ON e.id = ce.endpoint_id
```

Build response:
```python
service_nodes = [GraphNode(id=str(r["id"]), name=r["name"]) for r in service_rows]
endpoint_nodes = [
    GraphNode(id=f"endpoint-{r['id']}", name=f"{r['method']} {r['path']}")
    for r in endpoint_rows
]
nodes = service_nodes + endpoint_nodes

edges = [
    GraphEdge(
        source=str(r["caller_service_id"]),
        target=f"endpoint-{r['endpoint_id']}",
        endpoint_path=r["endpoint_path"],
        endpoint_method=r["endpoint_method"],
        call_count=r["call_count"],
        last_seen_at=r["last_seen_at"],
    )
    for r in edge_rows
]
return GraphOut(nodes=nodes, edges=edges)
```

No model changes needed — `GraphNode(id, name)` works for both node types. The `id` naming convention (`endpoint-{db_id}`) is how the frontend distinguishes endpoint nodes from service nodes.

### Edge label decision

After retargeting, each React Flow edge goes from a service node to an endpoint node that is already labeled `"METHOD /path"`. Showing that same text on the edge label too is redundant. Change the `rfEdges` label to show the call count instead:

```js
const rfEdges = graphData.edges.map((edge) => ({
  id: `${edge.source}-${edge.target}-${edge.endpoint_method}-${edge.endpoint_path}`,
  source: edge.source,
  target: edge.target,
  label: `×${edge.call_count}`,
}))
```

This is the only change to the `rfEdges` transformation — the `id`, `source`, and `target` fields are unchanged (they pick up `edge.target = "endpoint-{id}"` automatically from the new API response).

### frontend/app/graph/page.js

Add one new import at the top:
```js
import ImpactPanel from '@/components/ImpactPanel'
```

Add one new state variable alongside the existing ones:
```js
const [selectedEndpoint, setSelectedEndpoint] = useState(null)
// shape when set: { id: number, label: string }
```

Update the `rfNodes` transformation inside `handleAnalysisComplete` to style endpoint nodes:
```js
const rfNodes = graphData.nodes.map((node) => {
  const isEndpoint = node.id.startsWith('endpoint-')
  return {
    id: node.id,
    data: { label: node.name },
    position: { x: 0, y: 0 },
    ...(isEndpoint
      ? { style: { background: '#e0f2fe', borderColor: '#0284c7', borderWidth: 2 } }
      : {}),
  }
})
```

Replace the placeholder `onNodeClick` with a real handler:
```js
function handleNodeClick(event, node) {
  if (!node.id.startsWith('endpoint-')) return
  const endpointId = parseInt(node.id.replace('endpoint-', ''), 10)
  setSelectedEndpoint({ id: endpointId, label: node.data.label })
}
```

Update the DependencyGraph usage:
```jsx
<DependencyGraph
  nodes={nodes}
  edges={edges}
  onNodeClick={handleNodeClick}
/>
```

Add ImpactPanel to the render — it overlays the graph via `position: fixed` so no layout restructuring is needed:
```jsx
{selectedEndpoint && (
  <ImpactPanel
    endpointId={selectedEndpoint.id}
    endpointLabel={selectedEndpoint.label}
    onClose={() => setSelectedEndpoint(null)}
  />
)}
```

Place the ImpactPanel JSX as a sibling of the DependencyGraph block, inside the `<AuthGuard>` wrapper.

### frontend/components/ImpactPanel.jsx

```jsx
'use client'
import { useState, useEffect } from 'react'
import { fetchImpactAnalysis } from '@/lib/api'
```

Props: `{ endpointId, endpointLabel, onClose }`

State:
- `consumers` (array, starts `[]`)
- `loading` (boolean, starts `true`)
- `error` (string|null, starts `null`)

On mount and whenever `endpointId` changes, fetch consumers:
```js
useEffect(() => {
  setLoading(true)
  setError(null)
  setConsumers([])
  fetchImpactAnalysis(endpointId)
    .then(setConsumers)
    .catch((err) => setError(err.message))
    .finally(() => setLoading(false))
}, [endpointId])
```

Two helpers defined inside the file (not exported):

```js
function timeAgo(dateString) {
  const seconds = Math.floor((new Date() - new Date(dateString)) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function SourceBadge({ source }) {
  const cls = source === 'logs'
    ? 'bg-green-100 text-green-700'
    : 'bg-gray-100 text-gray-700'
  return <span className={`text-xs px-2 py-0.5 rounded ${cls}`}>{source}</span>
}
```

Full JSX structure:
```jsx
<div className="fixed right-0 top-0 h-full w-80 bg-white shadow-lg border-l border-gray-200 flex flex-col z-10">
  <div className="flex items-center justify-between p-4 border-b border-gray-200">
    <div>
      <p className="text-xs text-gray-500 uppercase tracking-wide">Impact Analysis</p>
      <h2 className="font-mono text-sm font-semibold text-gray-900">{endpointLabel}</h2>
    </div>
    <button
      onClick={onClose}
      className="text-gray-400 hover:text-gray-600 text-lg leading-none"
      aria-label="Close"
    >
      ✕
    </button>
  </div>

  <div className="flex-1 overflow-y-auto p-4">
    {loading && <p className="text-sm text-gray-500">Loading…</p>}
    {error && <p className="text-sm text-red-500">{error}</p>}
    {!loading && !error && consumers.length === 0 && (
      <p className="text-sm text-gray-500">No consumers found.</p>
    )}
    {!loading && !error && consumers.length > 0 && (
      <ul className="space-y-3">
        {consumers.map((c, i) => (
          <li key={i} className="border border-gray-100 rounded p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-900">{c.service_name}</span>
              <SourceBadge source={c.source} />
            </div>
            <div className="text-xs text-gray-500">
              {c.call_count.toLocaleString()} calls · {timeAgo(c.last_seen_at)}
            </div>
          </li>
        ))}
      </ul>
    )}
  </div>
</div>
```

### frontend/lib/api.js

`fetchImpactAnalysis` currently does not throw on a non-ok response. Fix it to match the pattern of `triggerAnalysis` and `fetchGraph`:

```js
export async function fetchImpactAnalysis(endpointId) {
  const token = await getGitHubToken()
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/endpoints/${endpointId}/impact-analysis`,
    { headers: { 'X-GitHub-Token': token } }
  )
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
```

## Test cases

### Backend — `backend/tests/test_routes.py`

The two existing graph tests will break after the `graph.py` change because they mock `conn.fetch` with only 2 `side_effect` values (the route now makes 3 `conn.fetch` calls), use a column `"provider_service_id"` that the new query doesn't select, and assert `target == "2"` (the old format). Update them and add one new test.

**Update `test_get_graph_returns_nodes_and_edges`** — replace the existing mock and assertions entirely:
```python
async def test_get_graph_returns_nodes_and_edges():
    service_rows = [
        _Row({"id": 1, "name": "order-service"}),
        _Row({"id": 2, "name": "user-service"}),
    ]
    endpoint_rows = [
        _Row({"id": 5, "method": "GET", "path": "/users/{id}"}),
    ]
    edge_rows = [
        _Row({
            "caller_service_id": 1,
            "endpoint_id": 5,
            "endpoint_path": "/users/{id}",
            "endpoint_method": "GET",
            "call_count": 10,
            "last_seen_at": datetime(2024, 1, 1, tzinfo=timezone.utc),
        }),
    ]
    conn = AsyncMock()
    conn.fetch = AsyncMock(side_effect=[service_rows, endpoint_rows, edge_rows])
    pool = _make_pool(conn)

    with patch("routers.graph.get_pool", new_callable=AsyncMock) as mock_gp:
        mock_gp.return_value = pool
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/graph", headers=HEADERS)

    assert resp.status_code == 200
    data = resp.json()
    # 2 service nodes + 1 endpoint node
    assert len(data["nodes"]) == 3
    assert {"id": "1", "name": "order-service"} in data["nodes"]
    assert {"id": "endpoint-5", "name": "GET /users/{id}"} in data["nodes"]
    assert len(data["edges"]) == 1
    assert data["edges"][0]["source"] == "1"
    assert data["edges"][0]["target"] == "endpoint-5"
```

**Update `test_get_graph_empty_db`** — change `side_effect=[[], []]` to `side_effect=[[], [], []]` (three queries now):
```python
async def test_get_graph_empty_db():
    conn = AsyncMock()
    conn.fetch = AsyncMock(side_effect=[[], [], []])
    pool = _make_pool(conn)
    # rest of the test is unchanged
```

**Add `test_get_graph_includes_endpoint_nodes`** — new test verifying the endpoint node id format and that edges target endpoint nodes:
```python
async def test_get_graph_includes_endpoint_nodes():
    service_rows = [_Row({"id": 3, "name": "payment-service"})]
    endpoint_rows = [_Row({"id": 7, "method": "POST", "path": "/payments/charge"})]
    edge_rows = [
        _Row({
            "caller_service_id": 3,
            "endpoint_id": 7,
            "endpoint_path": "/payments/charge",
            "endpoint_method": "POST",
            "call_count": 4,
            "last_seen_at": datetime(2024, 6, 1, tzinfo=timezone.utc),
        }),
    ]
    conn = AsyncMock()
    conn.fetch = AsyncMock(side_effect=[service_rows, endpoint_rows, edge_rows])
    pool = _make_pool(conn)

    with patch("routers.graph.get_pool", new_callable=AsyncMock) as mock_gp:
        mock_gp.return_value = pool
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/graph", headers=HEADERS)

    data = resp.json()
    node_ids = [n["id"] for n in data["nodes"]]
    assert "endpoint-7" in node_ids
    endpoint_node = next(n for n in data["nodes"] if n["id"] == "endpoint-7")
    assert endpoint_node["name"] == "POST /payments/charge"
    assert data["edges"][0]["target"] == "endpoint-7"
    assert data["edges"][0]["source"] == "3"
```

### Frontend — `frontend/__tests__/ImpactPanel.test.js` and `frontend/__tests__/GraphPage.test.js`

- `test_impact_panel_shows_loading_state` — mock `fetchImpactAnalysis` to return a never-resolving promise; render `ImpactPanel`; assert the text "Loading…" is present
- `test_impact_panel_shows_consumer_list` — mock `fetchImpactAnalysis` to resolve with `[{ service_name: "order-service", call_count: 42, last_seen_at: new Date().toISOString(), source: "static" }]`; render `ImpactPanel`; assert "order-service" and "42 calls" appear in the document
- `test_impact_panel_shows_empty_state` — mock `fetchImpactAnalysis` to resolve with `[]`; render `ImpactPanel`; assert "No consumers found." is present
- `test_impact_panel_shows_error_state` — mock `fetchImpactAnalysis` to reject with `new Error("network error")`; render `ImpactPanel`; assert "network error" is visible
- `test_impact_panel_calls_onClose_on_button_click` — render `ImpactPanel`; find the close button; click it; assert the `onClose` mock was called exactly once
- `test_impact_panel_refetches_when_endpointId_changes` — render `ImpactPanel` with `endpointId={1}`; rerender with `endpointId={2}`; assert `fetchImpactAnalysis` was called twice, first with `1` then with `2`
- `test_static_source_badge_is_gray` — render `ImpactPanel` with a consumer whose `source` is `"static"`; assert the badge element has a class containing `"bg-gray-100"`
- `test_logs_source_badge_is_green` — render `ImpactPanel` with a consumer whose `source` is `"logs"`; assert the badge element has a class containing `"bg-green-100"`
- `test_fetch_impact_analysis_throws_on_non_ok_response` — mock global `fetch` to return `{ ok: false, text: async () => "Not Found" }`; call `fetchImpactAnalysis(99)`; assert it rejects with `Error("Not Found")`
- `test_handleNodeClick_ignores_service_nodes` — simulate calling `handleNodeClick` with `node.id = "1"` (service node); assert `setSelectedEndpoint` was not called
- `test_handleNodeClick_sets_state_for_endpoint_nodes` — simulate calling `handleNodeClick` with `node.id = "endpoint-5"` and `node.data.label = "GET /users/{id}"`; assert `selectedEndpoint` is set to `{ id: 5, label: "GET /users/{id}" }`

## Done when

- [ ] `frontend/components/ImpactPanel.jsx` exists and is a client component
- [ ] Clicking an endpoint node (ID starts with `"endpoint-"`) opens `ImpactPanel` with correct `endpointId` and `endpointLabel`
- [ ] Clicking a service node does nothing (no panel opens)
- [ ] `ImpactPanel` shows "Loading…" while `fetchImpactAnalysis` is in flight
- [ ] `ImpactPanel` shows consumer list with service name, formatted call count, relative time, source badge
- [ ] `ImpactPanel` shows "No consumers found." when consumers array is empty
- [ ] `ImpactPanel` shows error message text if `fetchImpactAnalysis` rejects
- [ ] Close button (✕) calls `onClose` and hides the panel
- [ ] Endpoint nodes render with blue background (`#e0f2fe`) and blue border (`#0284c7`); service nodes are unchanged
- [ ] `GET /graph` response nodes list includes endpoint nodes with `id = "endpoint-{db_id}"` and `name = "METHOD /path"`
- [ ] `GET /graph` edges use `target = "endpoint-{db_id}"` (not provider service ID)
- [ ] React Flow edge labels show call count (`×N`) instead of method+path
- [ ] `fetchImpactAnalysis` in `lib/api.js` throws `new Error(await res.text())` when `res.ok` is false
- [ ] `test_get_graph_returns_nodes_and_edges` updated with 3-element `side_effect`, new column names, and updated assertions
- [ ] `test_get_graph_empty_db` updated with `side_effect=[[], [], []]`
- [ ] `test_get_graph_includes_endpoint_nodes` added and passes
- [ ] No TypeScript — all files are `.js` or `.jsx`
- [ ] No inline `fetch()` in components — all API calls through `lib/api.js`
- [ ] All test cases listed above pass
