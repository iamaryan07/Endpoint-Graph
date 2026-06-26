# Spec 02 — GitHub OAuth via Supabase Auth

## Goal
Add GitHub OAuth login to the frontend: login page, auth callback route, Supabase client, AuthGuard component, root layout, and all FastAPI fetch functions stubbed in `api.js`. Unauthenticated users are redirected to `/login`.

## Depends on
Spec 01 — the FastAPI backend and Supabase project must exist before this spec can be tested end-to-end.

## Context
This is a frontend-only spec. The backend already provides `GET /health`. All other FastAPI routes are not implemented yet — `api.js` must stub them so they can be filled in by later specs. The auth flow uses Supabase Auth's GitHub OAuth provider. After login, `session.provider_token` holds the GitHub OAuth token. Every subsequent FastAPI call will attach this token as `X-GitHub-Token`.

The full flow:
1. Unauthenticated user hits any route → redirected to `/login`
2. User clicks "Login with GitHub" → Supabase redirects to GitHub consent screen with `repo` scope
3. GitHub redirects back to `/auth/callback?code=...`
4. Next.js route handler exchanges the code for a session
5. User is redirected to `/graph`
6. `lib/api.js` reads `session.provider_token` and attaches it to every FastAPI request

## Files to create

- `frontend/lib/supabase.js` — creates and exports the Supabase JS client (auth only)
- `frontend/lib/api.js` — all fetch functions to FastAPI, each reads the GitHub token from the session
- `frontend/app/layout.js` — root layout: HTML shell, imports `globals.css`
- `frontend/app/page.js` — root page: redirects to `/graph` if session exists, else to `/login`
- `frontend/app/login/page.js` — login page with "Login with GitHub" button
- `frontend/app/auth/callback/page.js` — client component that exchanges OAuth code for session in the browser
- `frontend/app/graph/page.js` — stub page so the `/graph` redirect after login doesn't 404 (full implementation in spec 09)
- `frontend/components/AuthGuard.jsx` — client component that redirects to `/login` if no session

## Files to edit

- `frontend/app/globals.css` — ensure `@import "tailwindcss"` is present (create if missing)
- `frontend/package.json` — add `@supabase/supabase-js` if not already a dependency

## Implementation details

---

### frontend/lib/supabase.js

Export one named constant `supabase` created with `createClient`.

```js
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)
```

No other logic. This file is never imported for DB queries — auth only.

---

### frontend/lib/api.js

Helper at the top:

```js
async function getGitHubToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.provider_token
}
```

Export four async functions. Each must call `getGitHubToken()` and attach the result as the `X-GitHub-Token` header. All `fetch` calls use `process.env.NEXT_PUBLIC_API_URL` as the base URL.

**`triggerAnalysis(repoUrl)`**
- `POST /analyze`
- Body: `{ repo_url: repoUrl }`
- Headers: `Content-Type: application/json`, `X-GitHub-Token: token`
- Returns: parsed JSON response `{ status, services, endpoints, edges }`

**`fetchGraph()`**
- `GET /graph`
- Headers: `X-GitHub-Token: token`
- Returns: parsed JSON response `{ nodes, edges }`

**`fetchServices()`**
- `GET /services`
- Headers: `X-GitHub-Token: token`
- Returns: parsed JSON array of services

**`fetchImpactAnalysis(endpointId)`**
- `GET /endpoints/{endpointId}/impact-analysis`
- Headers: `X-GitHub-Token: token`
- Returns: parsed JSON array of consumers

All four functions are stubs — they make the correct HTTP call and return the parsed JSON. No error handling beyond what `fetch` provides naturally. Later specs will wire these into components.

---

### frontend/app/layout.js

Server component (no `'use client'`). Exports default `RootLayout`.

```js
import './globals.css'   // resolves to frontend/app/globals.css

export const metadata = {
  title: 'EndpointGraph',
  description: 'API consumer dependency graph',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

---

### frontend/app/page.js

`'use client'` directive required (uses Supabase session check).

On mount, call `supabase.auth.getSession()`:
- If `session` exists → `router.replace('/graph')`
- If no session → `router.replace('/login')`

While the check is in progress, render nothing (return `null`) to avoid a flash.

Use `useEffect` + `useRouter` from `next/navigation`.

---

### frontend/app/login/page.js

`'use client'` directive required.

Renders a centered page with:
- App name "EndpointGraph" as an `<h1>`
- A short tagline: "Discover who calls your APIs before you break them."
- A single button: "Login with GitHub"

Button `onClick` calls:

```js
await supabase.auth.signInWithOAuth({
  provider: 'github',
  options: {
    scopes: 'repo',
    redirectTo: `${window.location.origin}/auth/callback`
  }
})
```

No loading state needed. No error handling needed. Just the button.

Use Tailwind classes for layout: full-screen centered column, dark background, white text.

---

### frontend/app/auth/callback/page.js

`'use client'` directive required. This must be a **client component page**, NOT a route handler (`route.js`).

Reason: Supabase JS v2 defaults to PKCE flow for `signInWithOAuth`. PKCE stores a code verifier in browser `localStorage` before the GitHub redirect. `exchangeCodeForSession` must read that verifier from `localStorage` — which only exists in the browser. A Next.js route handler runs server-side and has no `localStorage`, causing the exchange to silently fail and leaving the user permanently unauthenticated.

```jsx
'use client'
import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const code = searchParams.get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(() => {
        router.replace('/graph')
      })
    } else {
      router.replace('/graph')
    }
  }, [router, searchParams])

  return null
}
```

If `code` is missing, still redirect to `/graph` (Supabase will handle the missing session on the next page load).

---

### frontend/app/graph/page.js

Minimal stub so the redirect after login does not 404. Full implementation is in spec 09.

```js
export default function GraphPage() {
  return <div>Graph coming in spec 09.</div>
}
```

---

### frontend/components/AuthGuard.jsx

`'use client'` directive required.

Props: `{ children }`

On mount, call `supabase.auth.getSession()`:
- If no session → `router.replace('/login')`
- If session exists → render `children`

While the check is in progress, return `null`.

```jsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthGuard({ children }) {
  const router = useRouter()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/login')
      else setChecked(true)
    })
  }, [router])

  if (!checked) return null
  return children
}
```

---

### frontend/app/globals.css

Lives at `frontend/app/globals.css` — this is what `import './globals.css'` in `app/layout.js` resolves to.

Must contain exactly:

```css
@import "tailwindcss";
```

No `@tailwind base/components/utilities` — Tailwind v4 uses `@import`. No `tailwind.config.js`.

---

## Environment variables required

These must be set in `frontend/.env.local` (never committed):

```
NEXT_PUBLIC_SUPABASE_URL=https://[ref].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[anon-key]
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Supabase dashboard setup (required before testing)

The following must be configured in the Supabase dashboard before the OAuth flow will work:

1. **Enable GitHub OAuth provider**
   - Go to Authentication → Providers → GitHub
   - Toggle it on
   - Enter your GitHub OAuth App's Client ID and Client Secret
   - Copy the "Callback URL (for OAuth)" shown by Supabase (looks like `https://[ref].supabase.co/auth/v1/callback`) — this goes into your GitHub OAuth App settings

2. **Create a GitHub OAuth App** (if not already done)
   - Go to GitHub → Settings → Developer Settings → OAuth Apps → New OAuth App
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: the Supabase callback URL from step 1

3. **Add redirect URL to Supabase allowed list**
   - Go to Authentication → URL Configuration
   - Add `http://localhost:3000/auth/callback` to the "Redirect URLs" list
   - This is where Supabase will redirect after successful GitHub auth

---

## Test cases

Create two test files:
- `frontend/__tests__/AuthGuard.test.jsx` — AuthGuard component tests
- `frontend/__tests__/api.test.js` — api.js function tests

For all api.js tests: mock `global.fetch` to return a resolved promise with a fake JSON body, and mock `supabase.auth.getSession` to return `{ data: { session: { provider_token: 'test-token' } } }`. Do not mock the unexported `getGitHubToken` helper directly — mock `supabase.auth.getSession` instead (which is what `getGitHubToken` calls internally).

**`frontend/__tests__/AuthGuard.test.jsx`**

- `test_authguard_redirects_unauthenticated` — mock `supabase.auth.getSession()` to return `{ data: { session: null } }`, render `<AuthGuard><div>protected</div></AuthGuard>`, assert `router.replace` was called with `/login` and children are not rendered
- `test_authguard_renders_children_when_authenticated` — mock `supabase.auth.getSession()` to return `{ data: { session: { provider_token: 'tok' } } }`, render `<AuthGuard><div>protected</div></AuthGuard>`, assert children are rendered and `router.replace` was not called

**`frontend/__tests__/api.test.js`**

- `test_trigger_analysis_sends_correct_request` — mock `global.fetch` and `supabase.auth.getSession`, call `triggerAnalysis('github.com/user/repo')`, assert fetch was called with method `POST`, URL ending in `/analyze`, header `X-GitHub-Token: test-token`, and body `{ repo_url: 'github.com/user/repo' }`
- `test_fetch_graph_sends_correct_request` — mock fetch and `supabase.auth.getSession`, call `fetchGraph()`, assert fetch was called with URL ending in `/graph` and header `X-GitHub-Token: test-token`
- `test_fetch_services_sends_correct_request` — mock fetch and `supabase.auth.getSession`, call `fetchServices()`, assert fetch was called with URL ending in `/services` and header `X-GitHub-Token: test-token`
- `test_fetch_impact_analysis_sends_correct_request` — mock fetch and `supabase.auth.getSession`, call `fetchImpactAnalysis(42)`, assert fetch URL ends in `/endpoints/42/impact-analysis` and `X-GitHub-Token` header is present

---

## Done when

- [ ] All files listed in "Files to create" exist
- [ ] All files listed in "Files to edit" have been updated
- [ ] `supabase.js` exports a single `supabase` client created with `createClient`
- [ ] `api.js` exports `triggerAnalysis`, `fetchGraph`, `fetchServices`, `fetchImpactAnalysis` — each attaches `X-GitHub-Token`
- [ ] Login page renders with "Login with GitHub" button that calls `signInWithOAuth` with `scopes: 'repo'`
- [ ] `app/auth/callback/page.js` is a `'use client'` component (NOT a route handler) that calls `exchangeCodeForSession` inside `useEffect` and redirects to `/graph`
- [ ] `app/graph/page.js` stub exists so the post-login redirect does not 404
- [ ] `AuthGuard` redirects to `/login` when no session, renders children when session exists
- [ ] Root page redirects based on session state
- [ ] Root layout imports `'./globals.css'` which resolves to `frontend/app/globals.css`
- [ ] `frontend/app/globals.css` uses `@import "tailwindcss"` — no `tailwind.config.js`, no `@tailwind` directives
- [ ] No TypeScript — all files are `.js` or `.jsx`
- [ ] No hardcoded Supabase URLs or keys — only `process.env.NEXT_PUBLIC_*` vars
- [ ] `frontend/__tests__/AuthGuard.test.jsx` and `frontend/__tests__/api.test.js` exist and all 6 test cases pass
- [ ] `@supabase/supabase-js` is in `frontend/package.json`
- [ ] Supabase dashboard: GitHub OAuth provider enabled, `http://localhost:3000/auth/callback` added to Redirect URLs
