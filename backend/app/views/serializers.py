"""View layer: turn DB rows / raw data into clean API response dicts."""
import json
from typing import Any, Dict


def row_to_conversation(row) -> Dict[str, Any]:
    keys = row.keys()
    return {
        "id": row["id"],
        "title": row["title"],
        "model": row["model"],
        "settings": json.loads(row["settings"] or "{}"),
        "skills": json.loads(row["skills"] or "[]") if "skills" in keys else [],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def row_to_message(row) -> Dict[str, Any]:
    keys = row.keys()
    attachments = json.loads(row["attachments"] or "[]") if "attachments" in keys else []
    # Back-compat: older rows stored only image names in the `images` column.
    if not attachments:
        legacy = json.loads(row["images"] or "[]")
        attachments = [{"name": n, "kind": "image", "url": f"/api/uploads/{n}"} for n in legacy]
    images = [a.get("name") for a in attachments if a.get("kind") == "image"]
    return {
        "id": row["id"],
        "conversation_id": row["conversation_id"],
        "role": row["role"],
        "content": row["content"],
        "thinking": row["thinking"],
        "attachments": attachments,
        "images": images,
        "created_at": row["created_at"],
    }


def to_attachment(a: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize an attachment dict to a stable key set."""
    keep = ("id", "name", "kind", "mime", "size", "url", "b64", "data_url", "text")
    return {k: a[k] for k in keep if a.get(k) not in (None, "")}
