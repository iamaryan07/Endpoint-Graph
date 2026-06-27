# Spec 06 — URL Matcher

## Goal
Implement a single function `match_url_to_endpoint` in `backend/analysis/url_matcher.py` that maps a raw extracted URL path (e.g. `/users/123`) to a known parameterized path template (e.g. `/users/{id}`), returning the matching template or `None`.

## Depends on
- Spec 05 (tree-sitter extractor) — the URL paths this function consumes are produced by the call-site extractor in spec 05.

## Context
When tree-sitter scans a service for HTTP call sites, it extracts raw URLs like `http://user-service/users/123`. The URL path segment (`/users/123`) must be matched back to a known endpoint path stored in the database (`/users/{id}`) so a `consumer_edge` can be created. This module performs that mapping using regex: each `{param}` placeholder in a known path is converted to `[^/]+` to match any non-slash string segment.

This is a pure utility module — no FastAPI, no asyncpg, no I/O. It takes strings in, returns a string or `None`.

**Input contract:** `url_path` must be a bare path segment (e.g. `/users/123`), not a full URL (e.g. `http://user-service/users/123`). The caller (spec 07 — POST /analyze) is responsible for stripping the scheme and host before calling this function.

## Files to create
- `backend/analysis/url_matcher.py` — contains the `match_url_to_endpoint` function
- `backend/tests/test_url_matcher.py` — unit tests for the matcher

## Files to edit
None. This spec only adds new files.

## Implementation details

### backend/analysis/url_matcher.py

```python
import re

def match_url_to_endpoint(url_path: str, known_paths: list[str]) -> str | None:
```

**Behavior:**

1. Strip leading and trailing slashes from `url_path` before matching.
2. For each path in `known_paths`:
   - Strip leading and trailing slashes from the path template.
   - Replace every `{param}` placeholder (any text between `{` and `}`) with the regex fragment `[^/]+`. Use `re.sub(r'\{[^}]+\}', r'[^/]+', ...)`.
   - Use `re.fullmatch(pattern, stripped_url_path)` to check for an exact match.
   - If it matches, return the original (unstripped) path from `known_paths`.
3. If no path matches, return `None`.

**Important:** Return the original path string from `known_paths` exactly as provided — do not strip or alter it before returning.

**Examples:**
```
match_url_to_endpoint("/users/123", ["/users/{id}"])         → "/users/{id}"
match_url_to_endpoint("/orders/abc-456", ["/orders/{id}"])   → "/orders/{id}"
match_url_to_endpoint("/users/profile", ["/users/{id}"])     → "/users/{id}"  (literal words match [^/]+ just like IDs do)
match_url_to_endpoint("/users/123/orders", ["/users/{id}"]) → None  (extra segment)
match_url_to_endpoint("/payments/charge", ["/payments/charge", "/payments/{id}"]) → "/payments/charge"  (literal first wins; if order were reversed, "/payments/{id}" would match first)
match_url_to_endpoint("users/123", ["/users/{id}"])          → "/users/{id}"  (no leading slash — still works after strip)
match_url_to_endpoint("", ["/users/{id}"])                   → None
match_url_to_endpoint("/users/123", [])                      → None
```

**Edge cases:**
- `url_path` with no leading slash (e.g. `users/123`) — strip handles it.
- Multi-segment parameterized paths (e.g. `/orders/{order_id}/items/{item_id}`).
- Literal path segments DO match `{param}` placeholders (e.g. `/payments/charge` WILL match `/payments/{id}` because "charge" satisfies `[^/]+`). To prefer a literal path, callers must put it before the parameterized path in `known_paths`.
- Multiple matching patterns — return the first match (list order is caller's responsibility).
- Empty `url_path` string — return `None`.
- Empty `known_paths` list — return `None`.

## Test cases

File: `backend/tests/test_url_matcher.py`

- `test_simple_id_match` — `/users/123` matches `/users/{id}`, returns `/users/{id}`
- `test_slug_match` — `/orders/abc-456` matches `/orders/{id}`, returns `/orders/{id}`
- `test_literal_segment_matches_param` — `/users/profile` against `["/users/{id}"]` returns `/users/{id}` because "profile" satisfies `[^/]+`
- `test_extra_segment_no_match` — `/users/123/orders` does not match `/users/{id}`, returns `None`
- `test_multi_segment_params` — `/orders/42/items/7` matches `/orders/{order_id}/items/{item_id}`, returns `/orders/{order_id}/items/{item_id}`
- `test_literal_path_preferred_over_param` — `/payments/charge` matches `/payments/charge` but not `/payments/{id}`; when both are in the list (literal first), returns `/payments/charge`
- `test_no_leading_slash` — `users/123` (no leading slash) matches `/users/{id}`, returns `/users/{id}`
- `test_empty_path` — empty string returns `None`
- `test_empty_known_paths` — valid path with empty list returns `None`
- `test_no_match_returns_none` — `/unknown/route` returns `None` when given a list that does not match
- `test_uuid_segment` — `/users/550e8400-e29b-41d4-a716-446655440000` matches `/users/{id}`, returns `/users/{id}`

## Done when

- [ ] `backend/analysis/url_matcher.py` exists with `match_url_to_endpoint` having the exact signature `(url_path: str, known_paths: list[str]) -> str | None`
- [ ] All 11 test cases listed above are implemented and pass (note: `test_literal_segment_matches_param` expects `/users/{id}`, not `None`)
- [ ] No imports beyond the Python standard library (`re` only)
- [ ] No FastAPI, asyncpg, pydantic, or I/O in this module — pure function only
- [ ] No hardcoded credentials anywhere
- [ ] Follows conventions from CLAUDE.md (Python 3.11+, no ORM, no TypeScript)
