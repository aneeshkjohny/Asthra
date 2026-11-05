"""Controller: list, fetch, create, edit, and delete skills (stored on disk)."""
from typing import Any

from fastapi import APIRouter, HTTPException

from ..models import skills

router = APIRouter()


@router.get("/api/skills")
def list_skills() -> Any:
    return skills.list_skills()


@router.get("/api/skills/{name}")
def get_skill(name: str) -> Any:
    s = skills.get_skill(name)
    if not s:
        raise HTTPException(404, f"Unknown skill: {name}")
    return s


@router.post("/api/skills")
def create_skill(body: dict) -> Any:
    try:
        return skills.save_skill(
            name=body.get("name", ""),
            description=body.get("description", ""),
            content=body.get("content", ""),
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.put("/api/skills/{name}")
def update_skill(name: str, body: dict) -> Any:
    try:
        return skills.save_skill(
            name=name,
            description=body.get("description", ""),
            content=body.get("content", ""),
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.delete("/api/skills/{name}")
def delete_skill(name: str) -> Any:
    skills.delete_skill(name)
    return {"deleted": name}
