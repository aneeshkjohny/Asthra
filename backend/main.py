"""Asthra — a local LLM chat backend.

FastAPI service that proxies Ollama, persists conversations in SQLite,
and serves the built React frontend from frontend/dist.
"""
import base64
import json
import os
import re
import sqlite3
import threading
import time
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
DB_PATH = os.path.join(BASE_DIR, "asthra.db")
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
DIST_DIR = os.path.join(ROOT_DIR, "frontend", "dist")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
PORT = int(os.environ.get("ASTHRA_PORT", "8787"))
# Bind address: local-only by default. Set ASTHRA_HOST=0.0.0.0 to allow LAN access.
HOST = os.environ.get("ASTHRA_HOST", "127.0.0.1")

os.makedirs(UPLOAD_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
_db_lock = threading.Lock()


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _db_lock, _conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                model TEXT NOT NULL,
                settings TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                thinking TEXT,
                images TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
            """
        )


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class ChatRequest(BaseModel):
    model: str
    messages: List[Dict[str, Any]]  # [{role, content, images?}]
    system: Optional[str] = None
    temperature: float = 0.7
    max_tokens: Optional[int] = None
    think: bool = False
    conversation_id: Optional[str] = None


class ConversationIn(BaseModel):
    title: str = "New chat"
    model: str = "qwen3.8:latest"
    settings: Dict[str, Any] = {}


class MessageIn(BaseModel):
    role: str
    content: str
    images: List[str] = []
    thinking: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def row_to_conversation(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "model": row["model"],
        "settings": json.loads(row["settings"] or "{}"),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def row_to_message(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "conversation_id": row["conversation_id"],
        "role": row["role"],
        "content": row["content"],
        "thinking": row["thinking"],
        "images": json.loads(row["images"] or "[]"),
        "created_at": row["created_at"],
    }


def get_conversation_or_404(conv_id: str) -> Dict[str, Any]:
    with _db_lock, _conn() as conn:
        row = conn.execute("SELECT * FROM conversations WHERE id=?", (conv_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Conversation not found")
    return row_to_conversation(row)


def list_messages(conv_id: str) -> List[Dict[str, Any]]:
    with _db_lock, _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at, rowid", (conv_id,)
        ).fetchall()
    return [row_to_message(r) for r in rows]


def add_message(conv_id: str, role: str, content: str,
                images: Optional[List[str]] = None, thinking: Optional[str] = None) -> Dict[str, Any]:
    msg_id = uuid.uuid4().hex
    now = datetime.utcnow().isoformat()
    with _db_lock, _conn() as conn:
        conn.execute(
            "INSERT INTO messages (id, conversation_id, role, content, thinking, images, created_at)"
            " VALUES (?,?,?,?,?,?,?)",
            (msg_id, conv_id, role, content, thinking, json.dumps(images or []), now),
        )
        conn.execute(
            "UPDATE conversations SET updated_at=? WHERE id=?", (now, conv_id)
        )
    return {"id": msg_id, "conversation_id": conv_id, "role": role, "content": content,
            "thinking": thinking, "images": images or [], "created_at": now}


def auto_title(conv_id: str, user_text: str) -> None:
    """Set the conversation title from the first user message (only if still default)."""
    title = re.sub(r"\s+", " ", user_text).strip()[:60]
    if not title:
        return
    with _db_lock, _conn() as conn:
        cur = conn.execute(
            "UPDATE conversations SET title=? WHERE id=? AND title='New chat'",
            (title, conv_id),
        )
        if cur.rowcount:
            conn.execute("UPDATE conversations SET updated_at=? WHERE id=?",
                         (datetime.utcnow().isoformat(), conv_id))


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="Asthra", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    init_db()


# ----- models -------------------------------------------------------------
@app.get("/api/models")
async def list_models() -> Any:
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            r = await client.get(f"{OLLAMA_URL}/api/tags")
            r.raise_for_status()
        except httpx.HTTPError as e:
            raise HTTPException(502, f"Ollama unreachable at {OLLAMA_URL}: {e}")
    data = r.json()
    models = []
    for m in data.get("models", []):
        details = m.get("details", {})
        models.append({
            "name": m["name"],
            "size": m.get("size", 0),
            "family": details.get("family", ""),
            "parameter_size": details.get("parameter_size", ""),
            "quantization": details.get("quantization_level", ""),
            "capabilities": m.get("capabilities", []),
        })
    return models


# ----- conversations ------------------------------------------------------
@app.post("/api/conversations")
def create_conversation(body: ConversationIn) -> Dict[str, Any]:
    conv_id = uuid.uuid4().hex
    now = datetime.utcnow().isoformat()
    with _db_lock, _conn() as conn:
        conn.execute(
            "INSERT INTO conversations (id, title, model, settings, created_at, updated_at)"
            " VALUES (?,?,?,?,?,?)",
            (conv_id, body.title, body.model, json.dumps(body.settings), now, now),
        )
    return {"id": conv_id, "title": body.title, "model": body.model,
            "settings": body.settings, "created_at": now, "updated_at": now}


@app.get("/api/conversations")
def list_conversations() -> Any:
    with _db_lock, _conn() as conn:
        rows = conn.execute("SELECT * FROM conversations ORDER BY updated_at DESC").fetchall()
    return [row_to_conversation(r) for r in rows]


@app.get("/api/conversations/{conv_id}")
def get_conversation(conv_id: str) -> Any:
    conv = get_conversation_or_404(conv_id)
    conv["messages"] = list_messages(conv_id)
    return conv


@app.patch("/api/conversations/{conv_id}")
def update_conversation(conv_id: str, body: Dict[str, Any]) -> Dict[str, Any]:
    get_conversation_or_404(conv_id)
    fields, values = [], []
    for key in ("title", "model", "settings"):
        if key in body:
            fields.append(f"{key}=?")
            values.append(json.dumps(body[key]) if key == "settings" else body[key])
    values.append(conv_id)
    with _db_lock, _conn() as conn:
        if fields:
            conn.execute(f"UPDATE conversations SET {', '.join(fields)} WHERE id=?", values)
        row = conn.execute("SELECT * FROM conversations WHERE id=?", (conv_id,)).fetchone()
    return row_to_conversation(row)


@app.delete("/api/conversations/{conv_id}")
def delete_conversation(conv_id: str) -> Any:
    get_conversation_or_404(conv_id)
    with _db_lock, _conn() as conn:
        conn.execute("DELETE FROM messages WHERE conversation_id=?", (conv_id,))
        conn.execute("DELETE FROM conversations WHERE id=?", (conv_id,))
    return {"deleted": conv_id}


# ----- messages -----------------------------------------------------------
@app.post("/api/conversations/{conv_id}/messages")
def add_conversation_message(conv_id: str, body: MessageIn) -> Dict[str, Any]:
    get_conversation_or_404(conv_id)
    return add_message(conv_id, body.role, body.content, body.images, body.thinking)


# ----- chat (streaming proxy to Ollama) -----------------------------------
def _ollama_body(req: ChatRequest) -> Dict[str, Any]:
    messages = []
    for m in req.messages:
        entry: Dict[str, Any] = {"role": m.get("role", "user"), "content": m.get("content", "")}
        if m.get("images"):
            entry["images"] = m["images"]
        messages.append(entry)
    body: Dict[str, Any] = {"model": req.model, "messages": messages, "stream": True}
    if req.system:
        body["messages"].insert(0, {"role": "system", "content": req.system})
    options: Dict[str, Any] = {"temperature": req.temperature}
    if req.max_tokens:
        options["num_predict"] = req.max_tokens
    body["options"] = options
    if req.think:
        body["think"] = True
    return body


@app.post("/api/chat")
async def chat(req: ChatRequest) -> Any:
    body = _ollama_body(req)

    async def stream() -> Any:
        started = time.time()
        async with httpx.AsyncClient(timeout=httpx.Timeout(300, connect=10)) as client:
            async with client.stream("POST", f"{OLLAMA_URL}/api/chat", json=body) as r:
                if r.status_code != 200:
                    err = (await r.aread()).decode("utf-8", "replace")
                    yield f"data: {json.dumps({'error': err, 'status': r.status_code})}\n\n"
                    return
                async for line in r.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    out: Dict[str, Any] = {}
                    msg = chunk.get("message", {})
                    out["content"] = msg.get("content", "")
                    if msg.get("thinking"):
                        out["thinking"] = msg["thinking"]
                    if chunk.get("done"):
                        out["done"] = True
                        out["stats"] = {
                            "duration_s": round(chunk.get("total_duration", 0) / 1e9, 2),
                            "eval_count": chunk.get("eval_count", 0),
                            "eval_duration_s": round(chunk.get("eval_count", 0)
                                and chunk.get("eval_duration", 0) / 1e9 or 0, 2),
                            "prompt_eval_count": chunk.get("prompt_eval_count", 0),
                        }
                    yield f"data: {json.dumps(out)}\n\n"

    # Persist the user's turn immediately.
    if req.conversation_id:
        last_user = next((m for m in reversed(req.messages) if m.get("role") == "user"), None)
        if last_user:
            add_message(req.conversation_id, "user", last_user.get("content", ""),
                        last_user.get("images"))
            auto_title(req.conversation_id, last_user.get("content", ""))

    return StreamingResponse(stream(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    })


@app.post("/api/chat/persist")
def persist_assistant(req: Dict[str, Any]) -> Any:
    """Save the assistant reply after the stream finished (client-side accumulation)."""
    conv_id = req.get("conversation_id")
    if not conv_id:
        raise HTTPException(400, "conversation_id required")
    get_conversation_or_404(conv_id)
    return add_message(conv_id, "assistant", req.get("content", ""),
                       thinking=req.get("thinking") or None)


# ----- uploads --------------------------------------------------------------
MAX_UPLOAD = 10 * 1024 * 1024  # 10 MB


@app.post("/api/upload")
async def upload(file: UploadFile = File(...)) -> Any:
    raw = await file.read()
    if len(raw) > MAX_UPLOAD:
        raise HTTPException(413, "File too large (max 10 MB)")
    name = uuid.uuid4().hex + os.path.splitext(file.filename or "")[-1]
    path = os.path.join(UPLOAD_DIR, name)
    with open(path, "wb") as f:
        f.write(raw)
    # Serve back as base64 for the vision API + a URL for display
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    mime = file.content_type or "application/octet-stream"
    return {
        "name": file.filename or name,
        "url": f"/api/uploads/{name}",
        "data_url": f"data:{mime};base64,{b64}",
        "b64": b64,
    }


@app.get("/api/uploads/{filename}")
def get_upload(filename: str) -> Any:
    safe = os.path.basename(filename)
    path = os.path.join(UPLOAD_DIR, safe)
    if not os.path.exists(path):
        raise HTTPException(404, "Not found")
    return FileResponse(path)


# ----- frontend static files -------------------------------------------------
if os.path.isdir(DIST_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST_DIR, "assets")), name="assets")

    @app.get("/{path:path}")
    async def spa_fallback(path: str) -> Any:
        full = os.path.join(DIST_DIR, path)
        if path and os.path.isfile(full):
            return FileResponse(full)
        return FileResponse(os.path.join(DIST_DIR, "index.html"))
else:
    @app.get("/api/health")
    def health() -> Any:
        return {"status": "ok", "frontend": "not built — run `npm run build` in frontend/"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
