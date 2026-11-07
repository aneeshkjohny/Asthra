"""Controller (Phase 4): Projects — workspaces grouping chats, files & default skills."""
import os
import uuid

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from .. import config
from ..models import project
from ..models.attachment import detect_kind

router = APIRouter()


def _get_or_404(project_id: str) -> dict:
    p = project.get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    return p


@router.get("/api/projects")
def list_projects() -> list:
    return project.list_all()


@router.post("/api/projects")
def create_project(body: dict) -> dict:
    return project.create(
        name=body.get("name", ""),
        description=body.get("description", ""),
        system_prompt=body.get("system_prompt", ""),
        default_skills=body.get("default_skills", []),
    )


@router.get("/api/projects/{project_id}")
def get_project(project_id: str) -> dict:
    p = _get_or_404(project_id)
    p["files"] = project.list_files(project_id)
    return p


@router.patch("/api/projects/{project_id}")
def update_project(project_id: str, body: dict) -> dict:
    _get_or_404(project_id)
    updated = project.update(project_id, body)
    if not updated:
        raise HTTPException(404, "Project not found")
    return updated


@router.delete("/api/projects/{project_id}")
def delete_project(project_id: str) -> dict:
    _get_or_404(project_id)
    project.delete(project_id)
    return {"deleted": project_id}


# --- project files ---------------------------------------------------------

@router.get("/api/projects/{project_id}/files")
def list_files(project_id: str) -> list:
    _get_or_404(project_id)
    return project.list_files(project_id)


@router.post("/api/projects/{project_id}/files")
async def add_file(project_id: str, file: UploadFile = File(...)) -> dict:
    _get_or_404(project_id)
    raw = await file.read()
    if len(raw) > config.MAX_UPLOAD:
        raise HTTPException(413, f"File too large (max {config.MAX_UPLOAD_MB} MB)")
    stored = uuid.uuid4().hex + os.path.splitext(file.filename or "")[1]
    with open(os.path.join(project.file_dir(project_id), stored), "wb") as fh:
        fh.write(raw)
    mime = file.content_type or "application/octet-stream"
    return project.add_file(project_id, {
        "filename": stored,
        "name": file.filename or stored,
        "kind": detect_kind(file.filename, mime),
        "mime": mime,
        "size": len(raw),
    })


@router.delete("/api/projects/{project_id}/files/{file_id}")
def delete_file(project_id: str, file_id: str) -> dict:
    _get_or_404(project_id)
    if not project.delete_file(project_id, file_id):
        raise HTTPException(404, "File not found")
    return {"deleted": file_id}


@router.get("/api/projects/{project_id}/files/{file_id}/download")
def download_file(project_id: str, file_id: str) -> FileResponse:
    _get_or_404(project_id)
    row = project.get_file_row(project_id, file_id)
    if not row:
        raise HTTPException(404, "File not found")
    path = os.path.join(project.file_dir(project_id), row["filename"])
    if not os.path.isfile(path):
        raise HTTPException(404, "File not found on disk")
    return FileResponse(path, filename=row["name"])
