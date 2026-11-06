"""Local tools the model can call. Everything runs on this machine.

- calculator : safe arithmetic (a small AST evaluator — no arbitrary code)
- python     : run a Python snippet in an isolated subprocess (local, self-trusted)
- now        : current local date & time
"""
import ast
import datetime
import json
import operator
import subprocess
import sys

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "calculator",
            "description": "Evaluate a math expression. Supports + - * / // % ** and parentheses, e.g. (2+3)*4.**2",
            "parameters": {
                "type": "object",
                "properties": {"expression": {"type": "string", "description": "The math expression to evaluate"}},
                "required": ["expression"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "python",
            "description": ("Run a Python 3 snippet and return its printed output (or the error). "
                            "Use it for anything beyond simple arithmetic: lists, math, text, dates, small algorithms."),
            "parameters": {
                "type": "object",
                "properties": {"code": {"type": "string", "description": "The Python code to run"}},
                "required": ["code"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "now",
            "description": "Get the current date and time in the local timezone.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
]


_BIN_OPS = {
    ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
    ast.Div: operator.truediv, ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod, ast.Pow: operator.pow,
}
_UNARY_OPS = {ast.USub: operator.neg, ast.UAdd: operator.pos}


def safe_eval(expression: str):
    """Evaluate a numeric expression without exec/eval. Only numbers and +-*/%**//% are allowed."""
    node = ast.parse(str(expression).strip(), mode="eval")

    def ev(n: ast.AST):
        if isinstance(n, ast.Expression):
            return ev(n.body)
        if isinstance(n, ast.Constant) and isinstance(n.value, (int, float)):
            return n.value
        if hasattr(ast, "Num") and isinstance(n, ast.Num):  # very old Pythons
            return n.n
        if isinstance(n, ast.BinOp) and type(n.op) in _BIN_OPS:
            return _BIN_OPS[type(n.op)](ev(n.left), ev(n.right))
        if isinstance(n, ast.UnaryOp) and type(n.op) in _UNARY_OPS:
            return _UNARY_OPS[type(n.op)](ev(n.operand))
        raise ValueError("Unsupported expression (only numbers and + - * / // % ** allowed)")

    return ev(node)


def run_python(code: str, timeout: int = 20) -> str:
    """Run code in an isolated subprocess (no cwd / env / user site-packages)."""
    try:
        p = subprocess.run([sys.executable, "-I", "-c", code],
                           capture_output=True, text=True, timeout=timeout, cwd=None)
    except subprocess.TimeoutExpired:
        return "(timed out after %ds)" % timeout
    out = (p.stdout or "").strip()
    err = (p.stderr or "").strip()
    if p.returncode != 0:
        return "error (exit %d):\n%s" % (p.returncode, err or out)
    return out or "(ran with no output — add print() to see results)"


def _now() -> str:
    return datetime.datetime.now().strftime("%A, %B %d, %Y  %H:%M:%S").strip()


_PRIMARY_FIELD = {"calculator": "expression", "python": "code"}


def _parse_args(args, name: str):
    if isinstance(args, dict):
        return args
    if isinstance(args, str):
        try:
            v = json.loads(args)
            if isinstance(v, dict):
                return v
        except (ValueError, TypeError):
            pass
        field = _PRIMARY_FIELD.get(name)
        if field:
            return {field: args}
    return {}


def execute(name: str, args) -> str:
    """Run a tool by name; always returns a string the model can read back."""
    a = _parse_args(args, name)
    try:
        if name == "calculator":
            return str(safe_eval(a.get("expression", "")))
        if name == "python":
            return run_python(a.get("code", ""))
        if name == "now":
            return _now()
        return "unknown tool: %s" % name
    except Exception as e:  # noqa: BLE001 - reported back to the model, never crashes the stream
        return "error: %s: %s" % (type(e).__name__, e)
