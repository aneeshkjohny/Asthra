"""Message model: data access for chat turns and their attachments."""
import re
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from .. import database as db
from ..views.serializers import row_to_message


def list_for(conv_id: str) -> List[Dict[str, Any]]:
    rows = db.get_all(
        "SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at, rowid",
        (conv_id,),
    )
    return [row_to_message(r) for r in rows]


_KEEP = ("id", "name", "kind", "mime", "size", "url", "text")


def _slim(a: Dict[str, Any]) -> Dict[str, Any]:
    # Drop bulky base64 (the file is on disk, served via `url`) to keep the DB lean.
    return {k: a[k] for k in _KEEP if a.get(k) not in (None, "")}


def add(conv_id: str, role: str, content: str,
        attachments: Optional[List[Dict[str, Any]]] = None,
        thinking: Optional[str] = None,
        tools: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    attachments = [_slim(a) for a in (attachments or [])]
    image_names = [a.get("name") for a in attachments if a.get("kind") == "image"]
    tools = tools or []
    msg_id = uuid.uuid4().hex
    now = datetime.utcnow().isoformat()
    db.execute(
        "INSERT INTO messages (id, conversation_id, role, content, thinking, images, attachments, tools, created_at)"
        " VALUES (?,?,?,?,?,?,?,?,?)",
        (msg_id, conv_id, role, content, thinking,
         _json(image_names), _json(attachments), _json(tools), now),
    )
    db.execute(
        "UPDATE conversations SET updated_at=? WHERE id=?",
        (datetime.utcnow().isoformat(), conv_id),
    )
    return {
        "id": msg_id, "conversation_id": conv_id, "role": role, "content": content,
        "thinking": thinking, "attachments": attachments, "images": image_names,
        "tools": tools, "created_at": now,
    }


def _json(obj: Any) -> str:
    import json
    return json.dumps(obj)


def auto_title(conv_id: str, user_text: str) -> None:
    """Derive a conversation title from the first user message (kept short)."""
    from . import conversation
    title = re.sub(r"\s+", " ", user_text or "").strip()[:60]
    if title:
        conversation.set_title_if_default(conv_id, title)


def search(q: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Full-text-ish search (LIKE) over message content and conversation titles.

    Returns recent matches, each with a short snippet centered on the first hit.
    """
    q = (q or "").strip()
    if not q:
        return []
    like = f"%{q}%"
    rows = db.get_all(
        """
        SELECT m.id AS message_id, m.conversation_id, m.role, m.content,
               m.created_at, c.title AS conversation_title
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        WHERE m.content LIKE ? OR c.title LIKE ?
        ORDER BY m.created_at DESC, m.rowid DESC
        LIMIT ?
        """,
        (like, like, limit),
    )
    q_lower = q.lower()
    out: List[Dict[str, Any]] = []
    for r in rows:
        content = r["content"] or ""
        idx = content.lower().find(q_lower)
        if idx >= 0:
            start = max(0, idx - 60)
            end = min(len(content), idx + 90)
            snippet = content[start:end].replace("\n", " ")
            if start > 0:
                snippet = "…" + snippet
            if end < len(content):
                snippet = snippet + "…"
        else:
            snippet = re.sub(r"\s+", " ", content[:140])
            if len(content) > 140:
                snippet += "…"
        out.append({
            "conversation_id": r["conversation_id"],
            "conversation_title": r["conversation_title"],
            "message_id": r["message_id"],
            "role": r["role"],
            "snippet": snippet,
            "created_at": r["created_at"],
        })
    return out
