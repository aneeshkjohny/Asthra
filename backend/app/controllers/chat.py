"""Controller: model listing, streaming chat (proxy to Ollama), and
persistence of the assistant's turn."""
import json
import os
from typing import Any, Dict, List

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from .. import config
from .. import ingest
from ..models import conversation as conversations
from ..models import message as messages
from ..schemas import ChatRequest

router = APIRouter()


@router.get("/api/models")
async def list_models() -> Any:
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            r = await client.get(f"{config.OLLAMA_URL}/api/tags")
            r.raise_for_status()
        except httpx.HTTPError as e:
            raise HTTPException(502, f"Ollama unreachable at {config.OLLAMA_URL}: {e}")
    data = r.json()
    models = []
    for m in data.get("models", []):
        d = m.get("details", {})
        models.append({
            "name": m["name"],
            "size": m.get("size", 0),
            "family": d.get("family", ""),
            "parameter_size": d.get("parameter_size", ""),
            "quantization": d.get("quantization_level", ""),
            "capabilities": m.get("capabilities", []),
        })
    return models


def _attachment_context(atts: List[Dict[str, Any]]) -> str:
    """Extract the text of non-image attachments (PDF / doc / code) read from disk,
    formatted as a prompt block the model can read."""
    blocks = []
    for a in atts or []:
        if a.get("kind") == "image":
            continue  # images are handled via the vision `images` field
        name = a.get("name") or a.get("id") or "file"
        fid = a.get("id") or os.path.basename(a.get("url") or name)
        path = os.path.join(config.UPLOAD_DIR, os.path.basename(fid))
        if not os.path.isfile(path):
            continue
        text = ingest.extract_text(path, name, a.get("kind", ""))
        if text and text.strip():
            blocks.append(f"[File: {name}]\n{text}")
        else:
            blocks.append(
                f"[File: {name}] — no readable text found (may be a scanned/image-only "
                "document; OCR is not enabled yet)."
            )
    return "\n\n".join(blocks)


def _ollama_body(req: ChatRequest) -> Dict[str, Any]:
    """Translate our request into Ollama's /api/chat body (M -> C translation)."""
    msgs = []
    for m in req.messages:
        atts = m.get("attachments") or []
        entry: Dict[str, Any] = {"role": m.get("role", "user"), "content": m.get("content", "")}

        # Phase 1: feed the text of non-image attachments (PDF / doc / code) into the prompt.
        doc_ctx = _attachment_context(atts)
        if doc_ctx:
            base = (m.get("content") or "").strip()
            entry["content"] = (base + "\n\n" if base else "") + "Attached file contents:\n\n" + doc_ctx

        # Images go to the vision `images` field (base64).
        img_b64 = [a.get("b64") for a in atts if a.get("kind") == "image" and a.get("b64")]
        if img_b64:
            entry["images"] = img_b64
        elif m.get("images"):
            entry["images"] = m["images"]  # legacy back-compat
        msgs.append(entry)

    body: Dict[str, Any] = {"model": req.model, "messages": msgs, "stream": True}
    if req.system:
        body["messages"].insert(0, {"role": "system", "content": req.system})
    options: Dict[str, Any] = {"temperature": req.temperature}
    if req.max_tokens:
        options["num_predict"] = req.max_tokens
    body["options"] = options
    if req.think:
        body["think"] = True
    return body


@router.post("/api/chat")
async def chat(req: ChatRequest) -> Any:
    body = _ollama_body(req)

    async def stream() -> Any:
        async with httpx.AsyncClient(timeout=httpx.Timeout(300, connect=10)) as client:
            async with client.stream("POST", f"{config.OLLAMA_URL}/api/chat", json=body) as r:
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
                            "eval_duration_s": round(
                                (chunk.get("eval_count", 0) and chunk.get("eval_duration", 0) / 1e9) or 0, 2),
                            "prompt_eval_count": chunk.get("prompt_eval_count", 0),
                        }
                    yield f"data: {json.dumps(out)}\n\n"

    # Persist the user's turn immediately.
    if req.conversation_id:
        last_user = next((m for m in reversed(req.messages) if m.get("role") == "user"), None)
        if last_user:
            messages.add(req.conversation_id, "user", last_user.get("content", ""),
                         last_user.get("attachments"))
            messages.auto_title(req.conversation_id, last_user.get("content", ""))

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/api/chat/persist")
def persist_assistant(req: Dict[str, Any]) -> Any:
    """Save the assistant reply after the stream finished (client-side accumulation)."""
    conv_id = req.get("conversation_id")
    if not conv_id:
        raise HTTPException(400, "conversation_id required")
    if not conversations.get(conv_id):
        raise HTTPException(404, "Conversation not found")
    return messages.add(conv_id, "assistant", req.get("content", ""),
                        thinking=req.get("thinking") or None)
