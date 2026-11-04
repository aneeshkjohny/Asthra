"""Attachment model: file-kind detection and shared constants.

A *kind* drives both the UI icon and how the backend treats the file:
  image  -> base64 to the vision API
  text / code / data / pdf / office -> extracted to text (Phase 1+)
"""
import os
from typing import Optional

KIND_BY_EXT = {
    ".png": "image", ".jpg": "image", ".jpeg": "image", ".gif": "image", ".webp": "image",
    ".bmp": "image", ".tif": "image", ".tiff": "image", ".svg": "image", ".ico": "image",
    ".txt": "text", ".md": "text", ".markdown": "text", ".log": "text", ".text": "text", ".rst": "text",
    ".py": "code", ".js": "code", ".ts": "code", ".tsx": "code", ".jsx": "code", ".mjs": "code",
    ".cjs": "code", ".json": "code", ".html": "code", ".htm": "code", ".css": "code", ".scss": "code",
    ".sh": "code", ".bash": "code", ".zsh": "code", ".yml": "code", ".yaml": "code", ".toml": "code",
    ".ini": "code", ".cfg": "code", ".conf": "code", ".env": "code", ".c": "code", ".h": "code",
    ".cpp": "code", ".hpp": "code", ".cc": "code", ".java": "code", ".go": "code", ".rs": "code",
    ".rb": "code", ".php": "code", ".swift": "code", ".kt": "code", ".sql": "code", ".xml": "code",
    ".vue": "code", ".svelte": "code", ".r": "code", ".lua": "code", ".dart": "code", ".cs": "code",
    ".csv": "data", ".tsv": "data", ".parquet": "data",
    ".pdf": "pdf",
    ".doc": "office", ".docx": "office", ".xls": "office", ".xlsx": "office",
    ".ppt": "office", ".pptx": "office", ".odt": "office", ".ods": "office",
}

# Kinds whose bytes can be read as plain text.
TEXT_KINDS = {"text", "code", "data"}


def detect_kind(filename: str, mime: Optional[str] = None) -> str:
    ext = os.path.splitext(filename or "")[1].lower()
    if ext in KIND_BY_EXT:
        return KIND_BY_EXT[ext]
    if mime:
        if mime.startswith("image/"):
            return "image"
        if "pdf" in mime:
            return "pdf"
        if mime.startswith("text/"):
            return "text"
        if "json" in mime or "javascript" in mime:
            return "code"
        if "spreadsheet" in mime or "ms-excel" in mime:
            return "data"
        if "word" in mime or "presentation" in mime or "opendocument" in mime:
            return "office"
    return "file"
