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
        thinking: Optional[str] = None) -> Dict[str, Any]:
    attachments = [_slim(a) for a in (attachments or [])]
    image_names = [a.get("name") for a in attachments if a.get("kind") == "image"]
    msg_id = uuid.uuid4().hex
    now = datetime.utcnow().isoformat()
    db.execute(
        "INSERT INTO messages (id, conversation_id, role, content, thinking, images, attachments, created_at)"
        " VALUES (?,?,?,?,?,?,?,?)",
        (msg_id, conv_id, role, content, thinking,
         _json(image_names), _json(attachments), now),
    )
    db.execute(
        "UPDATE conversations SET updated_at=? WHERE id=?",
        (datetime.utcnow().isoformat(), conv_id),
    )
    return {
        "id": msg_id, "conversation_id": conv_id, "role": role, "content": content,
        "thinking": thinking, "attachments": attachments, "images": image_names,
        "created_at": now,
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
