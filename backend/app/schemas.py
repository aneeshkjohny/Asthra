"""Pydantic request schemas shared across controllers."""
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class ChatRequest(BaseModel):
    model: str
    messages: List[Dict[str, Any]]          # [{role, content, attachments?}]
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
    images: List[str] = []                  # legacy (image names)
    attachments: List[Dict[str, Any]] = []  # rich attachments (Phase 0+)
    thinking: Optional[str] = None
