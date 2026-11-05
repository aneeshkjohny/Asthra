"""Controller: file upload (type-aware) and serving stored uploads."""
import base64
import os
import uuid

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from .. import config
from ..models.attachment import detect_kind
from ..views.serializers import to_attachment

router = APIRouter()


@router.post("/api/upload")
async def upload(file: UploadFile = File(...)) -> dict:
    raw = await file.read()
    if len(raw) > config.MAX_UPLOAD:
        raise HTTPException(413, f"File too large (max {config.MAX_UPLOAD_MB} MB)")

    stored = uuid.uuid4().hex + os.path.splitext(file.filename or "")[1]
    path = os.path.join(config.UPLOAD_DIR, stored)
    with open(path, "wb") as f:
        f.write(raw)

    mime = file.content_type or "application/octet-stream"
    kind = detect_kind(file.filename, mime)

    # Only images need base64 right now (for the vision API); other kinds get
    # text extraction in a later phase.
    b64 = ""
    if kind == "image":
        with open(path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()

    return to_attachment({
        "id": stored,
        "name": file.filename or stored,
        "kind": kind,
        "mime": mime,
        "size": len(raw),
        "url": f"/api/uploads/{stored}",
        "b64": b64,
        "data_url": f"data:{mime};base64,{b64}" if b64 else "",
        "text": "",
    })


@router.get("/api/uploads/{filename}")
def get_upload(filename: str) -> FileResponse:
    safe = os.path.basename(filename)
    path = os.path.join(config.UPLOAD_DIR, safe)
    if not os.path.exists(path):
        raise HTTPException(404, "Not found")
    return FileResponse(path)
