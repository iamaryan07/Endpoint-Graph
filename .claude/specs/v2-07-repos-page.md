# Spec v2-07 — Frontend /repos Page

## Goal
Implement the `/repos` page as a protected route that lists the user's GitHub repos with Track, Re-analyze, and Untrack actions.

## Depends on
- v2-06 (GET /repos backend route must exist and return the correct shape)
- v2-02 (backend JWT auth + RLS — frontend must send both auth headers)
- v2-09 (DELETE /services/{id} — Untrack calls this; v2-09 spec does not exist yet, so the Untrack button will return a 404 until that spec is implemented; this spec can be implemented and merged first)

## Context
This is the primary landing page after login. It replaces any previous "enter a repo URL" input pattern. The user sees all their GitHub repos in one list and clicks Track to analyze a repo, Re-analyze to pick up code changes, or Untrack to remove it. The page reads `repo.tracked` and `repo.service_id` from the `/repos` response to decide which buttons to show. All data calls go through `lib/api.js` — never inline `fetch()` in the component.

## Files to create
- `frontend/app/repos/page.js` — protected page: wrapped in AuthGuard, fetches repo list on mount, renders RepoList
- `frontend/components/RepoList.jsx` — repo browser: one row per repo with badge, timestamp, action buttons

## Files to edit
- `frontend/lib/api.js` — add `getAuthHeaders()` helper, update all existing functions to send both headers, add `fetchUserRepos()`, add `deleteService(serviceId)`

---

## Implementation details

### frontend/lib/api.js

**Replace `getGitHubToken()` with `getAuthHeaders()`:**

```js
async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.provider_token || !session?.access_token)
    throw new Error('Session expired — please log in again')
  return {
    'X-GitHub-Token': session.provider_token,
    'Authorization': `Bearer ${session.access_token}`,
  }
}
```

Remove the old `getGitHubToken()` function entirely. Update every existing function (`triggerAnalysis`, `fetchGraph`, `fetchServices`, `fetchImpactAnalysis`) to call `getAuthHeaders()` instead of `getGitHubToken()`, and spread the returned object into each `headers` block.

**`triggerAnalysis` updated signature (no change to name or args):**
```js
export async function triggerAnalysis(repoUrl) {
  const headers = await getAuthHeaders()
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ repo_url: repoUrl }),
  })
  if (!res.ok) throw new Error(await extractError(res))
  return res.json()
}
```

**Add `fetchUserRepos()`:**
```js
export async function fetchUserRepos() {
  const headers = await getAuthHeaders()
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/repos`, { headers })
  if (!res.ok) throw new Error(await extractError(res))
  return res.json()
}
```

**Add `deleteService(serviceId)`:**
```js
export async function deleteService(serviceId) {
  const headers = await getAuthHeaders()
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/services/${serviceId}`, {
    method: 'DELETE',
    headers,
  })
  if (!res.ok) throw new Error(await extractError(res))
  return res.json()
}
```

`extractError` stays unchanged.

---

### frontend/app/repos/page.js

A `'use client'` Next.js page. Uses `useEffect` and `useState` from `'react'`.

**Auth guard:** Wrap the entire page content in the existing `<AuthGuard>` component (`@/components/AuthGuard`). Do NOT implement a custom session check in this file — `AuthGuard` already handles the session check, loading spinner, and redirect to `/login`. The page's own `loading` state covers only the `fetchUserRepos()` data fetch.

**Imports:**
```js
'use client'
import { useEffect, useState } from 'react'
import AuthGuard from '@/components/AuthGuard'
import RepoList from '@/components/RepoList'
import { fetchUserRepos } from '@/lib/api'
```

**States:**
- `loading` — `useState(true)` — starts `true` to prevent flash of empty list before fetch completes
- `repos` — `useState([])` — populated by `fetchUserRepos()`
- `error` — `useState(null)` — top-level error string if the fetch fails

**Data fetch useEffect — full body:**
```js
useEffect(() => {
  async function load() {
    try {
      const data = await fetchUserRepos()
      setRepos(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }
  load()
}, [])
```

**Render structure:**
```jsx
<AuthGuard>
  <main className="min-h-screen bg-black text-white p-8">
    <h1 className="text-2xl font-bold mb-6">Your Repositories</h1>
    {loading && (
      <div className="flex justify-center mt-16">
        <div className="w-8 h-8 rounded-full border-t-2 border-white animate-spin" />
      </div>
    )}
    {error && (
      <p className="text-red-400 text-sm mb-4">{error}</p>
    )}
    {!loading && <RepoList repos={repos} onUpdate={setRepos} />}
  </main>
</AuthGuard>
```

---

### frontend/components/RepoList.jsx

A `'use client'` component.

**Imports:**
```js
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { triggerAnalysis, fetchUserRepos, deleteService } from '@/lib/api'
```

**Props:**
```js
// repos: array of repo objects from GET /repos
// onUpdate: (newRepos: array) => void — replaces the repos state in the parent
function RepoList({ repos, onUpdate }) { ... }
```

**Expected shape of each repo object** (from GET /repos — see CLAUDE.md `RepoOut`):
```js
{
  name: string,
  full_name: string,        // e.g. "iamaryan07/sample-services"
  private: boolean,
  updated_at: string,       // ISO string from GitHub
  tracked: boolean,
  last_analyzed_at: string | null,  // ISO string or null
  service_id: number | null,        // null when tracked=false
}
```

**Per-row state:** Use two `useState` objects keyed by `repo.full_name`:
```js
const [rowLoading, setRowLoading] = useState({})   // { [full_name]: 'track'|'reanalyze'|'untrack'|null }
const [rowError, setRowError]     = useState({})   // { [full_name]: string | null }
```

Helper functions defined inside the component:
```js
const setLoading  = (fullName, action) => setRowLoading(prev => ({ ...prev, [fullName]: action }))
const clearLoading = (fullName)        => setRowLoading(prev => ({ ...prev, [fullName]: null }))
const setError    = (fullName, msg)    => setRowError(prev => ({ ...prev, [fullName]: msg || null }))
```

**Track action:**
```js
async function handleTrack(repo) {
  setLoading(repo.full_name, 'track')
  setError(repo.full_name, null)
  try {
    await triggerAnalysis(`https://github.com/${repo.full_name}`)
    router.push(`/graph?repo=${repo.full_name}`)
  } catch (err) {
    setError(repo.full_name, err.message)
    clearLoading(repo.full_name)
  }
  // do NOT clearLoading on success — page is navigating away
}
```

**Re-analyze action:**
```js
async function handleReanalyze(repo) {
  setLoading(repo.full_name, 'reanalyze')
  setError(repo.full_name, null)
  try {
    await triggerAnalysis(`https://github.com/${repo.full_name}`)
    const updated = await fetchUserRepos()
    onUpdate(updated)
  } catch (err) {
    setError(repo.full_name, err.message)
  } finally {
    clearLoading(repo.full_name)
  }
}
```

**Untrack action:**
```js
async function handleUntrack(repo) {
  setLoading(repo.full_name, 'untrack')
  setError(repo.full_name, null)
  try {
    await deleteService(repo.service_id)
    onUpdate(repos.filter(r => r.full_name !== repo.full_name))
  } catch (err) {
    setError(repo.full_name, err.message)
    clearLoading(repo.full_name)
  }
  // do NOT clearLoading on success — row is removed from list
}
```

**Empty state:** If `repos.length === 0`, render:
```jsx
<p className="text-gray-400 text-sm">No repositories found.</p>
```

**Row render:** Use a `<ul>` with one `<li>` per repo. Each `<li>` contains:
1. **Repo name** — `repo.name` in bold. `repo.full_name` shown smaller below in muted text.
2. **Badge** — `repo.private ? 'Private' : 'Public'`. Inline pill: Private = amber (`bg-amber-900 text-amber-300`), Public = green (`bg-green-900 text-green-300`).
3. **Last analyzed** — `repo.last_analyzed_at ? new Date(repo.last_analyzed_at).toLocaleString() : 'Never'`
4. **Action buttons** — right-aligned:
   - `repo.tracked === false`: one "Track" button
   - `repo.tracked === true`: "Re-analyze" button + "Untrack" button
5. **Per-row loading** — while `rowLoading[repo.full_name]` is set, all buttons in that row are `disabled`. The active button shows a loading label (e.g. "Tracking…", "Analyzing…", "Untracking…") instead of its normal label.
6. **Per-row error** — if `rowError[repo.full_name]` is set, render `<p className="text-red-400 text-xs mt-1">{rowError[repo.full_name]}</p>` below the row's button area.

---

## Test cases

Frontend tests use Jest. Tests for `RepoList` go in `frontend/__tests__/RepoList.test.jsx`. Tests for the page go in `frontend/__tests__/ReposPage.test.jsx` (create `__tests__/` dir if it doesn't exist).

### RepoList.test.jsx

Each test renders `RepoList` with mock `repos` and `onUpdate` prop. Mock `@/lib/api` functions at the module level.

- `renders repo name and full_name` — renders one repo, checks `repo.name` and `repo.full_name` appear in the DOM
- `shows Private badge for private repos` — `private: true`, checks badge text is "Private"
- `shows Public badge for public repos` — `private: false`, checks badge text is "Public"
- `shows Never when last_analyzed_at is null` — checks "Never" text appears in the row
- `shows formatted date when last_analyzed_at is set` — passes an ISO string, checks a non-"Never" date string appears
- `shows Track button when tracked=false` — checks "Track" button present; "Re-analyze" and "Untrack" absent
- `shows Re-analyze and Untrack buttons when tracked=true` — checks both present; "Track" absent
- `shows empty state when repos is empty` — renders `<RepoList repos={[]} onUpdate={jest.fn()} />`, checks "No repositories found." appears
- `calls triggerAnalysis and router.push on Track click` — mocks `triggerAnalysis` to resolve, clicks Track, checks `triggerAnalysis` called with `'https://github.com/owner/repo'` and `router.push` called with `/graph?repo=owner/repo`
- `calls triggerAnalysis and fetchUserRepos on Re-analyze click` — mocks both to resolve, clicks Re-analyze, checks both called; checks `onUpdate` called with the returned list
- `calls deleteService and onUpdate on Untrack click` — mocks `deleteService` to resolve, clicks Untrack, checks `onUpdate` called with the repo removed from the array
- `shows row error when Track fails` — mocks `triggerAnalysis` to reject with `new Error('clone failed')`, clicks Track, checks "clone failed" appears in the row
- `disables buttons while row is loading` — clicks Track (don't await), immediately checks that Track button has `disabled` attribute

### ReposPage.test.jsx

Mock `@/lib/api`, `@/components/AuthGuard` (render children directly), and `@/components/RepoList`.

- `shows loading spinner on mount` — mock `fetchUserRepos` to return a never-resolving promise, checks spinner is in the DOM
- `renders RepoList after successful fetch` — mock `fetchUserRepos` to resolve with a list, checks `RepoList` is rendered (or checks a repo name appears)
- `shows top-level error if fetchUserRepos rejects` — mock `fetchUserRepos` to reject with `new Error('network error')`, checks "network error" appears in the DOM

---

## Done when

- [ ] `frontend/lib/api.js` exports `fetchUserRepos` and `deleteService`
- [ ] `frontend/lib/api.js` uses `getAuthHeaders()` (both headers) in all functions — no function sends only `X-GitHub-Token`
- [ ] `getAuthHeaders()` guards both `provider_token` and `access_token` and throws if either is missing
- [ ] `frontend/app/repos/page.js` exists and is wrapped in `<AuthGuard>` — no inline session check
- [ ] `frontend/app/repos/page.js` `loading` state starts as `true` (no flash of empty list)
- [ ] `frontend/app/repos/page.js` data fetch useEffect uses try/catch/finally — `setLoading(false)` runs in `finally`
- [ ] `frontend/app/repos/page.js` shows a data-fetch loading spinner (distinct from AuthGuard's session spinner)
- [ ] `frontend/app/repos/page.js` shows a top-level error with `className="text-red-400 text-sm mb-4"` if `fetchUserRepos` throws
- [ ] `frontend/components/RepoList.jsx` exists and renders a `<ul>` with one `<li>` per repo
- [ ] Empty repos list renders `<p className="text-gray-400 text-sm">No repositories found.</p>`
- [ ] Track button calls `triggerAnalysis('https://github.com/' + repo.full_name)` then navigates to `/graph?repo={full_name}`
- [ ] Re-analyze button calls `triggerAnalysis(...)` then calls `fetchUserRepos()` and passes result to `onUpdate`
- [ ] Untrack button calls `deleteService(repo.service_id)` then calls `onUpdate(repos.filter(...))`
- [ ] Private badge uses amber classes; Public badge uses green classes
- [ ] `last_analyzed_at` renders as `toLocaleString()` or "Never"
- [ ] Per-row loading disables all buttons and changes active button label to loading text
- [ ] Per-row error renders `<p className="text-red-400 text-xs mt-1">` below the row
- [ ] No TypeScript — all files are `.js` or `.jsx`
- [ ] No inline `fetch()` in any component or page — all calls go through `lib/api.js`
- [ ] No hardcoded credentials or API URLs (use `process.env.NEXT_PUBLIC_API_URL`)
- [ ] All Jest tests in `RepoList.test.jsx` and `ReposPage.test.jsx` pass
