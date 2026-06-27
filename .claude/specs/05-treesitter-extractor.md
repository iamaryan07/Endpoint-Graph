# Spec 05 — Tree-sitter Code Parser

## Goal
Implement `backend/analysis/code_parser.py` with two functions: one that extracts route decorator definitions from Python source files, and one that extracts HTTP call-site URLs from Python source files, both using tree-sitter.

## Depends on
- Spec 01 (DB schema) — not a runtime dependency, but endpoints and consumer_edges tables that this feeds into must exist
- Spec 03 (repo cloner) — this parser runs on files inside the cloned repo directory

## Context
This is the static analysis engine at the heart of EndpointGraph. It does two things:

1. **Endpoint discovery (route decorators):** Scans a Python file for FastAPI/Flask-style route decorators like `@app.get("/users/{id}")`. Each decorator becomes a row in `endpoints` with `spec_source = 'decorator'`. This is the fallback when no `openapi.yaml` exists (spec 04 handles the primary path).

2. **Consumer discovery (HTTP call sites):** Scans a Python file for outbound HTTP calls using `requests` or `httpx`. Each call site yields a raw URL string that gets passed to `url_matcher` (spec 06) to resolve against known endpoint paths, eventually producing a row in `consumer_edges`.

Both functions receive a file path and return a list of plain dicts. They never touch the database — the orchestrator in `analyze.py` (spec 07) does the DB writes.

## Files to create
- `backend/analysis/code_parser.py` — two public functions for tree-sitter-based Python AST extraction
- `backend/tests/test_code_parser.py` — 21 pytest tests for both functions

## Files to edit
- `backend/requirements.txt` — add `tree-sitter` and `tree-sitter-languages` with pinned versions if not already present
- `backend/analysis/__init__.py` — assumed to exist from spec 03; if missing, create it as an empty file so the package is importable

## Implementation details

### backend/analysis/code_parser.py

#### Imports and setup

```python
import ast
from tree_sitter_languages import get_language, get_parser

PY_LANGUAGE = get_language("python")
parser = get_parser("python")
```

Use `tree_sitter_languages` (not bare `tree_sitter`) to get the Python grammar — it bundles pre-compiled grammars and avoids needing to compile from source.

Both `PY_LANGUAGE` and `parser` are module-level singletons. Both are used: `parser` to parse source bytes into a tree, `PY_LANGUAGE` to compile tree-sitter query patterns.

---

#### Traversal approach — tree-sitter query API

Both functions use the **tree-sitter query API**, not manual cursor traversal. This means:

1. Define a query string using tree-sitter S-expression syntax
2. Compile it once with `PY_LANGUAGE.query(query_string)`
3. Call `query.matches(tree.root_node)` to get all pattern matches, each with its captures grouped
4. Iterate matches and extract capture nodes by name

Use `matches()`, NOT `captures()`. At tree-sitter 0.22.3, `captures()` returns a flat `list[tuple[Node, str]]` — dict access like `captures["method"]` would `TypeError` at runtime. `matches()` returns `list[tuple[int, dict[str, list[Node]]]]` (one entry per matched pattern occurrence, captures grouped by name), which is stable across versions and avoids index-pairing fragility.

This is the idiomatic approach and is why `PY_LANGUAGE` is imported.

---

#### Extracting string values from tree-sitter nodes

Both functions need to extract the Python string value from a `string` AST node (stripping quotes, handling `'...'` vs `"..."` vs `"""..."""`).

**Use `ast.literal_eval` for this — do not manually slice quotes:**

```python
def _node_string_value(node) -> str | None:
    raw = node.text.decode("utf-8")
    try:
        return ast.literal_eval(raw)
    except Exception:
        return None
```

This correctly handles all quote styles (`'`, `"`, `'''`, `"""`) and returns `None` on anything that isn't a plain string literal.

**Detecting f-strings before calling `_node_string_value`:**

In tree-sitter-python, f-strings are parsed as `string` nodes — the same node type as regular strings. The difference is visible in the raw text: f-strings start with `f"`, `f'`, `F"`, or `F'`.

Check for f-strings before attempting to evaluate:

```python
def _is_fstring(node) -> bool:
    raw = node.text.decode("utf-8")
    return raw.startswith(("f'", 'f"', "F'", 'F"'))
```

If `_is_fstring(node)` is True, skip the node — `ast.literal_eval` would raise on it anyway, but checking first makes the intent explicit.

---

#### Function 1: `extract_route_decorators`

**Signature:**
```python
def extract_route_decorators(file_path: str) -> list[dict]:
```

**Returns:** list of dicts, each with keys:
- `method` — uppercase HTTP verb string: `"GET"`, `"POST"`, `"PUT"`, `"DELETE"`
- `path` — the path string exactly as written in the decorator, e.g. `"/users/{id}"`

**How it works:**

1. Read the file bytes: `source = open(file_path, "rb").read()`
2. Parse: `tree = parser.parse(source)`
3. Compile this query:

```python
DECORATOR_QUERY = PY_LANGUAGE.query("""
(decorated_definition
  (decorator
    (call
      function: (attribute
        object: (identifier)
        attribute: (identifier) @method)
      arguments: (argument_list
        (string) @path))))
""")
```

4. Run: `matches = DECORATOR_QUERY.matches(tree.root_node)`
5. Iterate: `for _, match in matches:` — each `match` is a `dict[str, list[Node]]` containing the captures for one pattern occurrence.
6. For each match:
   - `method_nodes = match.get("method", [])` — skip if empty
   - `path_nodes = match.get("path", [])` — skip if empty
   - `method_node = method_nodes[0]`
   - `path_node = path_nodes[0]`
   - `method_text = method_node.text.decode("utf-8").upper()`
   - Filter: only keep if `method_text` is one of `GET`, `POST`, `PUT`, `DELETE`
   - Check `_is_fstring(path_node)` → skip if True
   - `path_value = _node_string_value(path_node)` → skip if None
   - Append `{"method": method_text, "path": path_value}`
7. Return the results list (empty list if nothing matched).

**Wrap the entire function body in try/except Exception: return []**

**Note on `matches()` structure:** Each iteration yields `(pattern_index, match_dict)` where `match_dict` groups all captures from a single pattern occurrence. `method_nodes[0]` and `path_nodes[0]` are guaranteed to come from the same decorator — no index-pairing across separate lists needed.

**Example input → output:**

```python
# file.py
@app.get("/users/{id}")
def get_user(id: int): ...

@router.post("/orders")
def create_order(): ...

@app.delete("/items/{item_id}")
def delete_item(item_id: int): ...
```

```python
[
    {"method": "GET",    "path": "/users/{id}"},
    {"method": "POST",   "path": "/orders"},
    {"method": "DELETE", "path": "/items/{item_id}"},
]
```

---

#### Function 2: `extract_http_calls`

**Signature:**
```python
def extract_http_calls(file_path: str) -> list[dict]:
```

**Returns:** list of dicts, each with keys:
- `url` — the raw URL string found as the first argument to the HTTP call, e.g. `"http://user-service/users/123"`

**Matched methods:** `get`, `post`, `put`, `delete` only. Do NOT match `patch` or `request` — the `consumer_edges` table's `method` column only stores `GET | POST | PUT | DELETE` (per DB schema in CLAUDE.md), and `requests.request()` takes the URL as its second argument, not first.

**How it works:**

1. Read the file bytes and parse with tree-sitter (same as above).
2. Compile this query:

```python
HTTP_CALL_QUERY = PY_LANGUAGE.query("""
(call
  function: (attribute
    object: (identifier) @lib
    attribute: (identifier) @method)
  arguments: (argument_list
    (string) @url))
""")
```

3. Run: `matches = HTTP_CALL_QUERY.matches(tree.root_node)`
4. Iterate: `for _, match in matches:` — each `match` is a `dict[str, list[Node]]` for one call site.
5. For each match:
   - `lib_nodes = match.get("lib", [])` — skip if empty
   - `method_nodes = match.get("method", [])` — skip if empty
   - `url_nodes = match.get("url", [])` — skip if empty
   - `lib_text = lib_nodes[0].text.decode("utf-8")`
   - Filter: only keep if `lib_text` is `"requests"` or `"httpx"`
   - `method_text = method_nodes[0].text.decode("utf-8")`
   - Filter: only keep if `method_text` is one of `get`, `post`, `put`, `delete`
   - `url_node = url_nodes[0]` — take only the first; if argument_list has multiple string children, only the first is the URL
   - Check `_is_fstring(url_node)` → skip if True
   - `url_value = _node_string_value(url_node)` → skip if None
   - Append `{"url": url_value}`
6. Return the results list (empty list if nothing matched).

**Wrap the entire function body in try/except Exception: return []**

**Example input → output:**

```python
# file.py
import requests
import httpx

def sync_user(user_id):
    resp = requests.get(f"http://user-service/users/{user_id}")  # f-string, skip

def charge():
    resp = requests.post("http://payment-service/payments/charge")
    data = httpx.get("http://user-service/users/profile")
```

```python
[
    {"url": "http://payment-service/payments/charge"},
    {"url": "http://user-service/users/profile"},
]
```

(The f-string call is skipped because `_is_fstring` returns True for it.)

---

### Compiling queries at module level

Define `DECORATOR_QUERY` and `HTTP_CALL_QUERY` as module-level constants (compiled once on import, not inside each function call):

```python
DECORATOR_QUERY = PY_LANGUAGE.query("""...""")
HTTP_CALL_QUERY = PY_LANGUAGE.query("""...""")
```

---

### backend/requirements.txt

Add these lines if not already present (check current file first):
```
tree-sitter==0.22.3
tree-sitter-languages==1.10.2
```

Exact versions must match what `pip install tree-sitter==0.22.3 tree-sitter-languages==1.10.2` resolves to. Run `pip freeze` to confirm and pin any transitive dependencies that get added.

---

## Test cases

All tests go in `backend/tests/test_code_parser.py`.

Use `tmp_path` (pytest fixture) to write temp `.py` files for each test — no network, no external files.

### Route decorator tests

- **`test_extract_get_decorator`** — file has `@app.get("/users/{id}")`, expects `[{"method": "GET", "path": "/users/{id}"}]`
- **`test_extract_post_decorator`** — file has `@app.post("/orders")`, expects `[{"method": "POST", "path": "/orders"}]`
- **`test_extract_put_decorator`** — file has `@app.put("/items/{id}")`, expects `[{"method": "PUT", "path": "/items/{id}"}]`
- **`test_extract_delete_decorator`** — file has `@app.delete("/users/{id}")`, expects `[{"method": "DELETE", "path": "/users/{id}"}]`
- **`test_extract_router_prefix`** — uses `@router.get("/payments/{id}")` (not `app`), still extracted
- **`test_extract_multiple_decorators`** — file has 3 decorated routes, all 3 are returned
- **`test_extract_no_decorators`** — file has only plain functions, returns `[]`
- **`test_extract_non_string_path`** — decorator is `@app.get(PATH_VAR)` (variable, not string literal), skipped → returns `[]`
- **`test_extract_empty_file`** — empty file, returns `[]`

### HTTP call site tests

- **`test_extract_requests_get`** — `requests.get("http://user-service/users/1")`, returns `[{"url": "http://user-service/users/1"}]`
- **`test_extract_requests_post`** — `requests.post("http://payment-service/charge")`, returns `[{"url": "http://payment-service/charge"}]`
- **`test_extract_httpx_get`** — `httpx.get("http://user-service/users/profile")`, returns `[{"url": "http://user-service/users/profile"}]`
- **`test_extract_httpx_post`** — `httpx.post("http://order-service/orders")`, returns `[{"url": "http://order-service/orders"}]`
- **`test_extract_requests_delete`** — `requests.delete("http://user-service/users/1")`, returns `[{"url": "http://user-service/users/1"}]`
- **`test_extract_httpx_put`** — `httpx.put("http://order-service/orders/42")`, returns `[{"url": "http://order-service/orders/42"}]`
- **`test_extract_multiple_calls`** — file has both a `requests.get` and an `httpx.post`, both are returned
- **`test_extract_fstring_url_skipped`** — call is `requests.get(f"http://svc/{id}")`, skipped → returns `[]`
- **`test_extract_variable_url_skipped`** — call is `requests.get(url_var)`, skipped → returns `[]`
- **`test_extract_no_http_calls`** — file has no requests/httpx calls, returns `[]`

### Error handling tests (both functions)

- **`test_extract_file_not_found`** — call both functions with a path that does not exist, both return `[]` without raising
- **`test_extract_invalid_python`** — write a file containing `def broken(:` (invalid syntax), both functions return `[]` without raising

## Done when

- [ ] `backend/analysis/code_parser.py` exists
- [ ] `backend/tests/test_code_parser.py` exists
- [ ] `extract_route_decorators(file_path: str) -> list[dict]` is implemented with exact signature
- [ ] `extract_http_calls(file_path: str) -> list[dict]` is implemented with exact signature
- [ ] `_node_string_value` and `_is_fstring` helpers are implemented as described
- [ ] `DECORATOR_QUERY` and `HTTP_CALL_QUERY` are compiled at module level
- [ ] `tree-sitter` and `tree-sitter-languages` are in `backend/requirements.txt` with pinned versions
- [ ] All 21 test cases listed above pass
- [ ] Neither function raises an exception on malformed input, missing file, or invalid Python — returns `[]` instead
- [ ] `patch` and `request` are NOT matched in `extract_http_calls` — only `get`, `post`, `put`, `delete`
- [ ] No hardcoded credentials or absolute paths
- [ ] No TypeScript — this is a backend-only spec, all files are `.py`
- [ ] No ORM, no DB access — these are pure analysis functions
