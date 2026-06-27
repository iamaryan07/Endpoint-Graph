import ast
from tree_sitter_languages import get_language, get_parser

PY_LANGUAGE = get_language("python")
parser = get_parser("python")

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

HTTP_CALL_QUERY = PY_LANGUAGE.query("""
(call
  function: (attribute
    object: (identifier) @lib
    attribute: (identifier) @method)
  arguments: (argument_list
    (string) @url))
""")


def _is_fstring(node) -> bool:
    raw = node.text.decode("utf-8")
    return raw.startswith(("f'", 'f"', "F'", 'F"'))


def _node_string_value(node) -> str | None:
    raw = node.text.decode("utf-8")
    try:
        return ast.literal_eval(raw)
    except Exception:
        return None


def extract_route_decorators(file_path: str) -> list[dict]:
    try:
        source = open(file_path, "rb").read()
        tree = parser.parse(source)
        results = []
        for _, match in DECORATOR_QUERY.matches(tree.root_node):
            method_node = match.get("method")
            path_node = match.get("path")
            if method_node is None or path_node is None:
                continue
            method_text = method_node.text.decode("utf-8").upper()
            if method_text not in {"GET", "POST", "PUT", "DELETE"}:
                continue
            if _is_fstring(path_node):
                continue
            path_value = _node_string_value(path_node)
            if path_value is None:
                continue
            results.append({"method": method_text, "path": path_value})
        return results
    except Exception:
        return []


def extract_http_calls(file_path: str) -> list[dict]:
    try:
        source = open(file_path, "rb").read()
        tree = parser.parse(source)
        results = []
        for _, match in HTTP_CALL_QUERY.matches(tree.root_node):
            lib_node = match.get("lib")
            method_node = match.get("method")
            url_node = match.get("url")
            if lib_node is None or method_node is None or url_node is None:
                continue
            lib_text = lib_node.text.decode("utf-8")
            if lib_text not in {"requests", "httpx"}:
                continue
            method_text = method_node.text.decode("utf-8")
            if method_text not in {"get", "post", "put", "delete"}:
                continue
            if _is_fstring(url_node):
                continue
            url_value = _node_string_value(url_node)
            if url_value is None:
                continue
            results.append({"url": url_value})
        return results
    except Exception:
        return []
