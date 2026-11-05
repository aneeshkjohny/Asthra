"""Conversation model: data access (CRUD). Controllers raise HTTP errors;
this layer returns data or None and stays HTTP-agnostic."""
import json
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from .. import database as db
from ..views.serializers import row_to_conversation


def create(title: str, model: str, settings: Dict[str, Any],
           skills: Optional[List[str]] = None) -> Dict[str, Any]:
    skills = skills or []
    conv_id = uuid.uuid4().hex
    now = datetime.utcnow().isoformat()
    db.execute(
        "INSERT INTO conversations (id, title, model, settings, skills, created_at, updated_at)"
        " VALUES (?,?,?,?,?,?,?)",
        (conv_id, title, model, json.dumps(settings or {}), json.dumps(skills), now, now),
    )
    return {
        "id": conv_id, "title": title, "model": model, "settings": settings or {},
        "skills": skills, "created_at": now, "updated_at": now,
    }


def list_all() -> List[Dict[str, Any]]:
    rows = db.get_all("SELECT * FROM conversations ORDER BY updated_at DESC")
    return [row_to_conversation(r) for r in rows]


def get(conv_id: str) -> Optional[Dict[str, Any]]:
    row = db.get_one("SELECT * FROM conversations WHERE id=?", (conv_id,))
    return row_to_conversation(row) if row else None


def update(conv_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    fields, values = [], []
    for key in ("title", "model", "settings", "skills"):
        if key in body:
            fields.append(f"{key}=?")
            values.append(json.dumps(body[key]) if key in ("settings", "skills") else body[key])
    values.append(conv_id)
    if fields:
        db.execute(f"UPDATE conversations SET {', '.join(fields)} WHERE id=?", values)
    return get(conv_id)


def delete(conv_id: str) -> None:
    db.execute("DELETE FROM messages WHERE conversation_id=?", (conv_id,))
    db.execute("DELETE FROM conversations WHERE id=?", (conv_id,))


def set_title_if_default(conv_id: str, title: str) -> None:
    """Auto-title a conversation from its first user message."""
    cur = db.execute(
        "UPDATE conversations SET title=? WHERE id=? AND title='New chat'",
        (title, conv_id),
    )
    if cur:
        db.execute(
            "UPDATE conversations SET updated_at=? WHERE id=?",
            (datetime.utcnow().isoformat(), conv_id),
        )
