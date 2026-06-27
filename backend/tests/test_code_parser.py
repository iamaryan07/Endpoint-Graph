import pytest
from analysis.code_parser import extract_route_decorators, extract_http_calls


# ── extract_route_decorators ───────────────────────────────────────────────────

def test_extract_get_decorator(tmp_path):
    f = tmp_path / "routes.py"
    f.write_text('@app.get("/users/{id}")\ndef get_user(id: int): ...\n')
    assert extract_route_decorators(str(f)) == [{"method": "GET", "path": "/users/{id}"}]


def test_extract_post_decorator(tmp_path):
    f = tmp_path / "routes.py"
    f.write_text('@app.post("/orders")\ndef create_order(): ...\n')
    assert extract_route_decorators(str(f)) == [{"method": "POST", "path": "/orders"}]


def test_extract_put_decorator(tmp_path):
    f = tmp_path / "routes.py"
    f.write_text('@app.put("/items/{id}")\ndef update_item(id: int): ...\n')
    assert extract_route_decorators(str(f)) == [{"method": "PUT", "path": "/items/{id}"}]


def test_extract_delete_decorator(tmp_path):
    f = tmp_path / "routes.py"
    f.write_text('@app.delete("/users/{id}")\ndef delete_user(id: int): ...\n')
    assert extract_route_decorators(str(f)) == [{"method": "DELETE", "path": "/users/{id}"}]


def test_extract_router_prefix(tmp_path):
    f = tmp_path / "routes.py"
    f.write_text('@router.get("/payments/{id}")\ndef get_payment(id: int): ...\n')
    assert extract_route_decorators(str(f)) == [{"method": "GET", "path": "/payments/{id}"}]


def test_extract_multiple_decorators(tmp_path):
    f = tmp_path / "routes.py"
    f.write_text(
        '@app.get("/users/{id}")\ndef get_user(id: int): ...\n\n'
        '@router.post("/orders")\ndef create_order(): ...\n\n'
        '@app.delete("/items/{item_id}")\ndef delete_item(item_id: int): ...\n'
    )
    result = extract_route_decorators(str(f))
    assert len(result) == 3
    assert {"method": "GET", "path": "/users/{id}"} in result
    assert {"method": "POST", "path": "/orders"} in result
    assert {"method": "DELETE", "path": "/items/{item_id}"} in result


def test_extract_no_decorators(tmp_path):
    f = tmp_path / "routes.py"
    f.write_text("def plain_function():\n    return 42\n")
    assert extract_route_decorators(str(f)) == []


def test_extract_non_string_path(tmp_path):
    f = tmp_path / "routes.py"
    f.write_text('PATH_VAR = "/users/{id}"\n\n@app.get(PATH_VAR)\ndef get_user(): ...\n')
    assert extract_route_decorators(str(f)) == []


def test_extract_empty_file(tmp_path):
    f = tmp_path / "routes.py"
    f.write_text("")
    assert extract_route_decorators(str(f)) == []


# ── extract_http_calls ─────────────────────────────────────────────────────────

def test_extract_requests_get(tmp_path):
    f = tmp_path / "client.py"
    f.write_text('import requests\nresp = requests.get("http://user-service/users/1")\n')
    assert extract_http_calls(str(f)) == [{"url": "http://user-service/users/1"}]


def test_extract_requests_post(tmp_path):
    f = tmp_path / "client.py"
    f.write_text('import requests\nresp = requests.post("http://payment-service/charge")\n')
    assert extract_http_calls(str(f)) == [{"url": "http://payment-service/charge"}]


def test_extract_httpx_get(tmp_path):
    f = tmp_path / "client.py"
    f.write_text('import httpx\ndata = httpx.get("http://user-service/users/profile")\n')
    assert extract_http_calls(str(f)) == [{"url": "http://user-service/users/profile"}]


def test_extract_httpx_post(tmp_path):
    f = tmp_path / "client.py"
    f.write_text('import httpx\ndata = httpx.post("http://order-service/orders")\n')
    assert extract_http_calls(str(f)) == [{"url": "http://order-service/orders"}]


def test_extract_requests_delete(tmp_path):
    f = tmp_path / "client.py"
    f.write_text('import requests\nresp = requests.delete("http://user-service/users/1")\n')
    assert extract_http_calls(str(f)) == [{"url": "http://user-service/users/1"}]


def test_extract_httpx_put(tmp_path):
    f = tmp_path / "client.py"
    f.write_text('import httpx\ndata = httpx.put("http://order-service/orders/42")\n')
    assert extract_http_calls(str(f)) == [{"url": "http://order-service/orders/42"}]


def test_extract_multiple_calls(tmp_path):
    f = tmp_path / "client.py"
    f.write_text(
        'import requests\nimport httpx\n'
        'resp = requests.get("http://user-service/users/1")\n'
        'data = httpx.post("http://order-service/orders")\n'
    )
    result = extract_http_calls(str(f))
    assert len(result) == 2
    assert {"url": "http://user-service/users/1"} in result
    assert {"url": "http://order-service/orders"} in result


def test_extract_fstring_url_skipped(tmp_path):
    f = tmp_path / "client.py"
    f.write_text('import requests\nuser_id = 1\nresp = requests.get(f"http://svc/users/{user_id}")\n')
    assert extract_http_calls(str(f)) == []


def test_extract_variable_url_skipped(tmp_path):
    f = tmp_path / "client.py"
    f.write_text('import requests\nurl_var = "http://svc/users/1"\nresp = requests.get(url_var)\n')
    assert extract_http_calls(str(f)) == []


def test_extract_no_http_calls(tmp_path):
    f = tmp_path / "client.py"
    f.write_text("def compute(x):\n    return x * 2\n")
    assert extract_http_calls(str(f)) == []


# ── error handling ─────────────────────────────────────────────────────────────

def test_extract_file_not_found():
    assert extract_route_decorators("/nonexistent/path/file.py") == []
    assert extract_http_calls("/nonexistent/path/file.py") == []


def test_extract_invalid_python(tmp_path):
    f = tmp_path / "broken.py"
    f.write_text("def broken(:\n    pass\n")
    assert extract_route_decorators(str(f)) == []
    assert extract_http_calls(str(f)) == []
