"""View layer: render a whole conversation as a downloadable Markdown or HTML file."""
import html
import json
from typing import Any, Dict, List


_ROLE_LABEL = {"user": "You", "assistant": "Asthra", "system": "System"}


def _fmt_args(args: Any) -> str:
    if args is None:
        return ""
    if isinstance(args, dict):
        try:
            return json.dumps(args, ensure_ascii=False)
        except (TypeError, ValueError):
            return str(args)
    return str(args)


def render_md(conv: Dict[str, Any], messages: List[Dict[str, Any]]) -> str:
    """Plain-Markdown export — one `## You` / `## Asthra` section per turn."""
    lines = [f"# {conv.get('title') or 'Conversation'}", ""]
    if conv.get("model"):
        lines += [f"> Model: {conv['model']}", ""]
    for m in messages:
        role = _ROLE_LABEL.get(m.get("role"), (m.get("role") or "message").title())
        lines.append(f"## {role}")
        if m.get("thinking"):
            thought = m["thinking"].replace("\n", "\n> ")
            lines += ["", "*Thought:*", "", f"> {thought}", ""]
        tools = m.get("tools") or []
        if tools:
            lines.append("*Tools used:*")
            for t in tools:
                res = (t.get("result") or "").replace("\n", " ")
                lines.append(f"  - **{t.get('name')}**({_fmt_args(t.get('args'))}) → {res}")
            lines.append("")
        content = (m.get("content") or "").strip()
        if content:
            lines += [content, ""]
        else:
            lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def render_html(conv: Dict[str, Any], messages: List[Dict[str, Any]]) -> str:
    """Standalone, dependency-free HTML document (safe to open anywhere)."""
    e = html.escape
    title = e(conv.get("title") or "Conversation")
    model = conv.get("model")
    parts = [
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>",
        f"<meta name='viewport' content='width=device-width, initial-scale=1'>",
        f"<title>{title}</title>",
        "<style>",
        "body{font:15px/1.65 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;",
        "max-width:720px;margin:44px auto;padding:0 20px;color:#1f1e1d;background:#fff}",
        "h1{font-size:23px;margin:0 0 4px}",
        ".meta{color:#8a857c;font-size:13px;margin-bottom:28px}",
        ".msg{margin-bottom:22px}",
        ".role{font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.05em;",
        "color:#d97757;margin-bottom:5px}",
        ".thinking{color:#6e6a62;font-style:italic;background:#faf9f5;border-left:3px solid #ecebe4;",
        "padding:8px 12px;border-radius:6px;margin-bottom:8px;white-space:pre-wrap}",
        ".tools{margin:8px 0;font-size:13px}",
        ".tool{margin:5px 0}",
        ".tool code{background:#f4f3ef;padding:1px 5px;border-radius:4px;font-size:12.5px}",
        "pre.tool-res{background:#f4f3ef;padding:8px 10px;border-radius:6px;overflow:auto;",
        "font-size:12.5px;white-space:pre-wrap;word-break:break-word;margin:4px 0}",
        ".content{white-space:pre-wrap;word-break:break-word}",
        "</style></head><body>",
        f"<h1>{title}</h1>",
        f"<div class='meta'>Exported from Asthra{(' &middot; ' + e(model)) if model else ''}</div>",
    ]
    for m in messages:
        role = e(_ROLE_LABEL.get(m.get("role"), (m.get("role") or "message").title()))
        parts.append(f"<div class='msg'><div class='role'>{role}</div>")
        if m.get("thinking"):
            parts.append(f"<div class='thinking'><b>Thought:</b> {e(m['thinking'])}</div>")
        tools = m.get("tools") or []
        if tools:
            parts.append("<div class='tools'>")
            for t in tools:
                parts.append(
                    f"<div class='tool'><b>{e(str(t.get('name')))}</b>("
                    f"<code>{e(_fmt_args(t.get('args')))}</code>)</div>"
                )
                if t.get("result"):
                    parts.append(f"<pre class='tool-res'>{e(str(t.get('result')))}</pre>")
            parts.append("</div>")
        if m.get("content"):
            parts.append(f"<div class='content'>{e(m['content'])}</div>")
        parts.append("</div>")
    parts.append("</body></html>")
    return "".join(parts)
