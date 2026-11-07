"""Controller: conversation CRUD, per-conversation messages, search, and export."""
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from ..models import conversation as conversations
from ..models import message as messages
from ..schemas import MessageIn
from ..views import export as views_export

router = APIRouter()


def _get_or_404(conv_id: str) -> dict:
    conv = conversations.get(conv_id)
    if not conv:
        raise HTTPException(404, "Conversation not found")
    return conv


@router.get("/api/search")
def search(q: str = Query("", description="Search term (message content or title)")) -> list:
    return messages.search(q)


@router.get("/api/conversations/{conv_id}/export")
def export_conv(conv_id: str, format: str = "md") -> Response:
    """Download the whole conversation as Markdown or standalone HTML."""
    conv = _get_or_404(conv_id)
    msgs = messages.list_for(conv_id)
    if format == "html":
        body, media, ext = views_export.render_html(conv, msgs), "text/html", "html"
    else:
        body, media, ext = views_export.render_md(conv, msgs), "text/markdown", "md"
    filename = (conv.get("title") or "conversation").replace("/", "-").replace(" ", "_")[:60]
    return Response(
        content=body,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}.{ext}"'},
    )


@router.post("/api/conversations")
def create_conv(body: dict) -> dict:
    return conversations.create(
        title=body.get("title", "New chat"),
        model=body.get("model", "qwen3.8:latest"),
        settings=body.get("settings", {}),
        skills=body.get("skills", []),
        project_id=body.get("project_id"),
    )


@router.get("/api/conversations")
def list_convs() -> list:
    return conversations.list_all()


@router.get("/api/conversations/{conv_id}")
def get_conv(conv_id: str) -> dict:
    conv = _get_or_404(conv_id)
    conv["messages"] = messages.list_for(conv_id)
    return conv


@router.patch("/api/conversations/{conv_id}")
def update_conv(conv_id: str, body: dict) -> dict:
    _get_or_404(conv_id)
    updated = conversations.update(conv_id, body)
    if not updated:
        raise HTTPException(404, "Conversation not found")
    return updated


@router.delete("/api/conversations/{conv_id}")
def delete_conv(conv_id: str) -> dict:
    _get_or_404(conv_id)
    conversations.delete(conv_id)
    return {"deleted": conv_id}


@router.post("/api/conversations/{conv_id}/messages")
def add_message(conv_id: str, body: MessageIn) -> dict:
    _get_or_404(conv_id)
    return messages.add(conv_id, body.role, body.content, body.attachments, body.thinking)
