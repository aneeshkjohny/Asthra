"""Project model (Phase 4): workspaces that group chats, files, and default skills.

A project carries:
  - a name + optional description
  - an optional system prompt (used as the base for chats in the project)
  - a list of default skill names (applied to chats that don't pin their own)
  - files stored under uploads/projects/<id>/ (shared context for the project)

Conversations link to a project via conversations.project_id (nullable, so a chat
may also be "general"). Deleting a project keeps its chats (they become general)
and removes its files.
"""
import json
import os
import shutil
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from .. import config
from .. import database as db
from ..views.serializers import row_to_project, to_project_file


def file_dir(project_id: str) -> str:
    """On-disk directory for a project's files (created on demand)."""
    d = os.path.join(config.PROJECT_UPLOAD_DIR, os.path.basename(project_id))
    os.makedirs(d, exist_ok=True)
    return d


# --- projects -------------------------------------------------------------

def create(name: str, description: str = "", system_prompt: str = "",
           default_skills: Optional[List[str]] = None) -> Dict[str, Any]:
    name = (name or "").strip() or "Untitled project"
    skills = default_skills or []
    pid = uuid.uuid4().hex
    now = datetime.utcnow().isoformat()
    db.execute(
        "INSERT INTO projects (id, name, description, system_prompt, default_skills, created_at, updated_at)"
        " VALUES (?,?,?,?,?,?,?)",
        (pid, name, (description or "").strip(), (system_prompt or "").strip(),
         json.dumps(skills), now, now),
    )
    return get(pid) or {}


def get(project_id: str) -> Optional[Dict[str, Any]]:
    row = db.get_one(
        "SELECT p.*,"
        " (SELECT COUNT(*) FROM conversations c WHERE c.project_id=p.id) AS n_conversations,"
        " (SELECT COUNT(*) FROM project_files f WHERE f.project_id=p.id) AS n_files"
        " FROM projects p WHERE p.id=?",
        (project_id,),
    )
    return row_to_project(row) if row else None


def list_all() -> List[Dict[str, Any]]:
    rows = db.get_all(
        "SELECT p.*,"
        " (SELECT COUNT(*) FROM conversations c WHERE c.project_id=p.id) AS n_conversations,"
        " (SELECT COUNT(*) FROM project_files f WHERE f.project_id=p.id) AS n_files"
        " FROM projects p ORDER BY p.updated_at DESC"
    )
    return [row_to_project(r) for r in rows]


def update(project_id: str, body: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    fields: List[str] = []
    values: List[Any] = []
    for key in ("name", "description", "system_prompt", "default_skills"):
        if key in body:
            fields.append(f"{key}=?")
            values.append(json.dumps(body[key]) if key == "default_skills" else (body[key] or ""))
    if fields:
        fields.append("updated_at=?")
        values.append(datetime.utcnow().isoformat())
        values.append(project_id)
        db.execute(f"UPDATE projects SET {', '.join(fields)} WHERE id=?", values)
    return get(project_id)


def delete(project_id: str) -> None:
    # Keep the chats (they become general); remove the project's files and row.
    db.execute("UPDATE conversations SET project_id=NULL WHERE project_id=?", (project_id,))
    d = os.path.join(config.PROJECT_UPLOAD_DIR, os.path.basename(project_id))
    if os.path.isdir(d):
        shutil.rmtree(d, ignore_errors=True)
    db.execute("DELETE FROM project_files WHERE project_id=?", (project_id,))
    db.execute("DELETE FROM projects WHERE id=?", (project_id,))


# --- files ----------------------------------------------------------------

def add_file(project_id: str, meta: Dict[str, Any]) -> Dict[str, Any]:
    """Record a file already written into file_dir(project_id)."""
    fid = uuid.uuid4().hex
    now = datetime.utcnow().isoformat()
    db.execute(
        "INSERT INTO project_files (id, project_id, filename, name, kind, mime, size, created_at)"
        " VALUES (?,?,?,?,?,?,?,?)",
        (fid, project_id, meta.get("filename", ""), meta.get("name", ""),
         meta.get("kind", "file"), meta.get("mime", ""), int(meta.get("size", 0)), now),
    )
    row = file_row(fid)
    return to_project_file(row) if row else {}


def list_files(project_id: str) -> List[Dict[str, Any]]:
    rows = db.get_all(
        "SELECT * FROM project_files WHERE project_id=? ORDER BY created_at DESC",
        (project_id,),
    )
    return [to_project_file(r) for r in rows]


def file_row(file_id: str):
    return db.get_one("SELECT * FROM project_files WHERE id=?", (file_id,))


def get_file_row(project_id: str, file_id: str):
    return db.get_one(
        "SELECT * FROM project_files WHERE id=? AND project_id=?", (file_id, project_id)
    )


def delete_file(project_id: str, file_id: str) -> bool:
    row = get_file_row(project_id, file_id)
    if not row:
        return False
    try:
        os.remove(os.path.join(file_dir(project_id), row["filename"]))
    except OSError:
        pass
    db.execute("DELETE FROM project_files WHERE id=?", (file_id,))
    return True


def file_paths(project_id: str) -> List[Dict[str, str]]:
    """[{name, kind, path}] for a project's files present on disk (for context injection)."""
    out: List[Dict[str, str]] = []
    d = file_dir(project_id)
    for row in db.get_all("SELECT * FROM project_files WHERE project_id=?", (project_id,)):
        path = os.path.join(d, row["filename"])
        if os.path.isfile(path):
            out.append({"name": row["name"], "kind": row["kind"], "path": path})
    return out
