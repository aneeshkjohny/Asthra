"""Controller: model listing, streaming chat (proxy to Ollama), and
persistence of the assistant's turn."""
import json
import os
from typing import Any, Dict, List, Tuple

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from .. import config
from .. import ingest
from ..models import conversation as conversations
from ..models import message as messages
from ..schemas import ChatRequest

router = APIRouter()

# Dedicated OCR model (fully local, via Ollama). Override with ASTHRA_OCR_MODEL.
OCR_MODEL = os.environ.get(
    "ASTHRA_OCR_MODEL", "hf.co/sahilchachra/Unlimited-OCR-GGUF:Q4_K_M")


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


def _clean_ocr(text: str) -> str:
    """Strip DeepSeek-OCR's per-region markers (e.g. `text [x1, y1, x2, y2]`) to plain text."""
    import re
    text = re.sub(r'\btext\s*\[\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\]', '\n', text)
    text = re.sub(r'\[\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\]', '', text)
    return re.sub(r'\n{3,}', '\n\n', text).strip()


async def _ocr_page(client: httpx.AsyncClient, b64: str) -> str:
    """OCR one page image with the dedicated local OCR model -> cleaned text."""
    payload = {
        "model": OCR_MODEL,
        "stream": False,
        "options": {"temperature": 0},
        "system": "You are an OCR engine. Read the image and output only the "
                  "transcribed text, nothing else.",
        "messages": [{"role": "user", "content": "OCR:", "images": [b64]}],
    }
    r = await client.post(f"{config.OLLAMA_URL}/api/chat", json=payload)
    r.raise_for_status()
    return _clean_ocr(r.json().get("message", {}).get("content", ""))


async def _build_entry(m: Dict[str, Any], client: httpx.AsyncClient) -> Dict[str, Any]:
    """Build one Ollama message, expanding attachments into prompt text and/or vision images.

    - image attachments         -> vision `images` (base64)
    - text/doc/code files       -> extracted text in the prompt
    - scanned PDF (no text layer) -> pages OCR'd by the local OCR model into text;
                                      falls back to page images for the vision model
    """
    atts = m.get("attachments") or []
    entry: Dict[str, Any] = {"role": m.get("role", "user"), "content": m.get("content", "")}
    blocks: List[str] = []
    images: List[str] = [a.get("b64") for a in atts if a.get("kind") == "image" and a.get("b64")]

    for a in atts:
        if a.get("kind") == "image":
            continue
        name = a.get("name") or a.get("id") or "file"
        fid = a.get("id") or os.path.basename(a.get("url") or name)
        path = os.path.join(config.UPLOAD_DIR, os.path.basename(fid))
        if not os.path.isfile(path):
            continue

        is_pdf = a.get("kind") == "pdf" or os.path.splitext(name)[1].lower() == ".pdf"
        if is_pdf and ingest.pdf_text_is_thin(path):
            pages = ingest.render_pdf_pages_b64(path)
            ocr_texts: List[str] = []
            for b64 in pages:
                try:
                    t = await _ocr_page(client, b64)
                    if t.strip():
                        ocr_texts.append(t)
                except Exception:
                    pass  # keep going; fall back to vision images if nothing OCR'd
            if any(t.strip() for t in ocr_texts):
                blocks.append(f"[File: {name}]\n" + "\n\n".join(ocr_texts))
            elif pages:
                images.extend(pages)  # fallback: let the main vision model read the pages
                blocks.append(
                    f"[File: {name}] (scanned document — {len(pages)} page image(s) "
                    f"attached for the model to read)"
                )
            else:
                blocks.append(f"[File: {name}] (could not read this PDF)")
            continue

        text = ingest.extract_text(path, name, a.get("kind", ""))
        if text and text.strip():
            blocks.append(f"[File: {name}]\n{text}")
        else:
            blocks.append(f"[File: {name}] (no readable text found)")

    if blocks:
        base = (m.get("content") or "").strip()
        entry["content"] = (base + "\n\n" if base else "") + "Attached file contents:\n\n" + "\n\n".join(blocks)
    if images:
        entry["images"] = images
    elif m.get("images"):
        entry["images"] = m["images"]  # legacy back-compat
    return entry


def _apply_skills(req: ChatRequest) -> Tuple[str, List[Dict[str, Any]]]:
    """Fold skill instructions into the system prompt.

    Two ways a skill is active for a turn:
      - pinned to the conversation (stored in conversations.skills)
      - invoked in the latest user message via /<name>

    Returns (effective_system_prompt, cleaned_messages).
    """
    from ..models import skills as skills_model

    names: List[str] = []
    if req.conversation_id:
        conv = conversations.get(req.conversation_id)
        for n in (conv or {}).get("skills") or []:
            if n not in names:
                names.append(n)

    msgs = [dict(m) for m in req.messages]
    for i in range(len(msgs) - 1, -1, -1):
        if msgs[i].get("role") == "user":
            text = msgs[i].get("content") or ""
            text, invoked = skills_model.extract_invocations(text)
            msgs[i]["content"] = text
            for n in invoked:
                if n not in names:
                    names.append(n)
            break

    blocks = skills_model.resolve(names)
    base = (req.system or "").strip()
    if blocks:
        system = (base + "\n\n" if base else "") + \
            "Active skills (follow these instructions for this reply):\n\n" + "\n\n".join(blocks)
    else:
        system = req.system or ""
    return system, msgs


async def _ollama_body(req: ChatRequest, system: str,
                       msgs_in: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Translate our request into Ollama's /api/chat body (M -> C translation)."""
    msgs: List[Dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=httpx.Timeout(180, connect=15)) as client:
        for m in msgs_in:
            msgs.append(await _build_entry(m, client))

    body: Dict[str, Any] = {"model": req.model, "messages": msgs, "stream": True}
    if system:
        body["messages"].insert(0, {"role": "system", "content": system})
    options: Dict[str, Any] = {"temperature": req.temperature}
    if req.max_tokens:
        options["num_predict"] = req.max_tokens
    body["options"] = options
    if req.think:
        body["think"] = True
    return body


# Safety cap on how many tool-call rounds we run per turn (calculator / python / now
# are fast and local; this mainly guards against a model that keeps asking for tools).
MAX_TOOL_ITERATIONS = 6


def _merge_tool_calls(merged: List[Dict[str, Any]], incoming: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Accumulate Ollama/OpenAI-style tool calls, which may stream across chunks.

    Handles dict `arguments` (single chunk) as well as JSON-string fragments, and
    parallel calls keyed by `function.index`.
    """
    for tc in incoming:
        fn = tc.get("function", {})
        idx = fn.get("index", 0)
        while len(merged) <= idx:
            merged.append({"function": {"index": idx, "name": "", "arguments": {}}})
        target = merged[idx]
        if "id" in tc and "id" not in target:
            target["id"] = tc["id"]
        tfn = target["function"]
        if fn.get("name"):
            tfn["name"] = fn["name"]
        args = fn.get("arguments")
        if isinstance(args, dict):
            tfn["arguments"].update(args)
        elif isinstance(args, str) and args:
            target.setdefault("_raw_args", "")
            target["_raw_args"] += args
    return merged


def _finalize_tool_calls(tool_calls: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Ensure every call has a dict `arguments`; parse any accumulated JSON string."""
    out: List[Dict[str, Any]] = []
    for tc in tool_calls:
        t = dict(tc)
        raw = t.pop("_raw_args", None)
        fn = dict(t.get("function", {}))
        args = fn.get("arguments")
        if isinstance(args, str):
            try:
                fn["arguments"] = json.loads(args or "{}")
            except ValueError:
                fn["arguments"] = {}
        if raw:
            try:
                fn["arguments"] = json.loads(raw)
            except ValueError:
                pass
        fn.setdefault("arguments", {})
        t["function"] = fn
        out.append(t)
    return out


@router.post("/api/chat")
async def chat(req: ChatRequest) -> Any:
    system, msgs = _apply_skills(req)
    base_body = await _ollama_body(req, system, msgs)
    if req.tools:
        from .. import tools as tools_module
        base_body["tools"] = tools_module.TOOLS

    async def stream() -> Any:
        from .. import tools as tools_module
        work_msgs: List[Dict[str, Any]] = list(base_body["messages"])
        acc = {"total_duration": 0, "eval_count": 0, "eval_duration": 0, "prompt_eval_count": 0}

        for _ in range(MAX_TOOL_ITERATIONS):
            body = dict(base_body)
            body["messages"] = work_msgs
            async with httpx.AsyncClient(timeout=httpx.Timeout(300, connect=10)) as client:
                async with client.stream("POST", f"{config.OLLAMA_URL}/api/chat", json=body) as r:
                    if r.status_code != 200:
                        err = (await r.aread()).decode("utf-8", "replace")
                        yield f"data: {json.dumps({'error': err, 'status': r.status_code})}\n\n"
                        return
                    tool_calls: List[Dict[str, Any]] = []
                    async for line in r.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            chunk = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        msg = chunk.get("message", {})
                        out: Dict[str, Any] = {}
                        content = msg.get("content", "")
                        if content:
                            out["content"] = content
                        if msg.get("thinking"):
                            out["thinking"] = msg["thinking"]
                        # Tool calls can arrive in a chunk BEFORE the final done chunk
                        # (and across several chunks), so capture them from any chunk.
                        in_tc = msg.get("tool_calls") or []
                        if in_tc:
                            _merge_tool_calls(tool_calls, in_tc)
                        if chunk.get("done"):
                            acc["total_duration"] += chunk.get("total_duration", 0) or 0
                            acc["eval_count"] += chunk.get("eval_count", 0) or 0
                            acc["eval_duration"] += chunk.get("eval_duration", 0) or 0
                            acc["prompt_eval_count"] += chunk.get("prompt_eval_count", 0) or 0
                        if out:
                            yield f"data: {json.dumps(out)}\n\n"

            if not tool_calls:
                break  # model produced its final answer

            # Record the assistant's tool-call turn + each tool result, then loop.
            tool_calls = _finalize_tool_calls(tool_calls)
            work_msgs.append({"role": "assistant", "content": "", "tool_calls": tool_calls})
            for tc in tool_calls:
                fn = tc.get("function", {})
                name = fn.get("name", "")
                args = fn.get("arguments", {})
                result = tools_module.execute(name, args)
                work_msgs.append({"role": "tool", "name": name, "content": result})
                yield f"data: {json.dumps({'tool': {'name': name, 'args': args, 'result': result}})}\n\n"

        stats = {
            "duration_s": round(acc["total_duration"] / 1e9, 2),
            "eval_count": acc["eval_count"],
            "eval_duration_s": round((acc["eval_count"] and acc["eval_duration"] / 1e9) or 0, 2),
            "prompt_eval_count": acc["prompt_eval_count"],
        }
        yield f"data: {json.dumps({'done': True, 'stats': stats})}\n\n"

    # Persist the user's turn immediately (cleaned of any /skill tokens).
    if req.conversation_id:
        last_user = next((m for m in reversed(msgs) if m.get("role") == "user"), None)
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
    return messages.add(
        conv_id, "assistant", req.get("content", ""),
        thinking=req.get("thinking") or None,
        tools=req.get("tools") or None,
    )
