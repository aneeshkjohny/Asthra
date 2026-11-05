"""Skills: instruction bundles loaded from the skills/ directory.

A skill is one of:
  skills/<name>/instruction.md   (folder form, may hold extra files)
  skills/<name>.md               (single-file form)

Optionally starts with a frontmatter block for a short description:
  ---
  description: What this skill does
  ---

Skills are pure instructions — the user activates them by pinning one to a
conversation or by typing /<name> in the composer.
"""
import os
import re
from typing import Any, Dict, List, Optional, Tuple

from .. import config


def _root() -> str:
    return config.SKILLS_DIR


# A safe skill name: lowercase letters/numbers and dashes, must not start with a dash.
_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")


def _skill_paths(name: str):
    return (os.path.join(config.SKILLS_DIR, name, "instruction.md"),
            os.path.join(config.SKILLS_DIR, name + ".md"))


def _description(content: str) -> str:
    m = re.match(r"^\s*---\s*\n(.*?)\n---", content, re.S)
    if m:
        for line in m.group(1).splitlines():
            if line.strip().lower().startswith("description:"):
                return line.split(":", 1)[1].strip().strip("\"'")
    for line in content.splitlines():
        s = line.strip()
        if s and not s.startswith("---"):
            return s[:140]
    return ""


def _strip_frontmatter(content: str) -> str:
    return re.sub(r"^\s*---\s*\n.*?\n---\s*\n?", "", content, count=1, flags=re.S).strip()


def _load(name: str, path: str) -> Optional[Dict[str, str]]:
    with open(path, encoding="utf-8", errors="replace") as fh:
        content = fh.read()
    return {
        "name": name,
        "description": _description(content),
        "content": content,
        "body": _strip_frontmatter(content) or content,
    }


def list_skills() -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    root = _root()
    if not os.path.isdir(root):
        return out
    for entry in sorted(os.listdir(root)):
        path = os.path.join(root, entry)
        if os.path.isdir(path):
            inst = os.path.join(path, "instruction.md")
            if os.path.isfile(inst):
                s = _load(entry, inst)
                if s:
                    out.append({"name": s["name"], "description": s["description"]})
        elif entry.lower().endswith(".md") and os.path.isfile(path):
            name = os.path.splitext(entry)[0]
            s = _load(name, path)
            if s:
                out.append({"name": s["name"], "description": s["description"]})
    return out


def get_skill(name: str) -> Optional[Dict[str, str]]:
    root = _root()
    for candidate in (
        os.path.join(root, name, "instruction.md"),
        os.path.join(root, name + ".md"),
    ):
        if os.path.isfile(candidate):
            return _load(name, candidate)
    return None


def save_skill(name: str, description: str, content: str) -> Optional[Dict[str, str]]:
    """Create or overwrite a skill on disk (keeps the existing folder/file form)."""
    name = (name or "").strip()
    if not _NAME_RE.match(name):
        raise ValueError("Skill name must be lowercase letters/numbers with dashes (e.g. my-skill)")
    if not (content or "").strip():
        raise ValueError("Skill content is required")

    folder_form, file_form = _skill_paths(name)
    if os.path.isfile(folder_form):
        path = folder_form
    elif os.path.isfile(file_form):
        path = file_form
    else:
        path = file_form

    desc = (description or "").strip()
    body = (content or "").strip()
    text = (f"---\ndescription: {desc}\n---\n\n{body}\n" if desc else body + "\n")

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)

    saved = get_skill(name)
    if not saved:
        raise ValueError("Could not save the skill")
    return saved


def delete_skill(name: str) -> None:
    """Remove a skill's folder or file, if present."""
    folder_form, file_form = _skill_paths(name)
    folder_dir = os.path.dirname(folder_form)
    if os.path.isfile(folder_form):
        import shutil
        shutil.rmtree(folder_dir, ignore_errors=True)
    if os.path.isfile(file_form):
        os.remove(file_form)


def resolve(names: List[str]) -> List[str]:
    """Instruction blocks (body text) for the given skill names, in order, deduped."""
    blocks: List[str] = []
    seen = set()
    for n in names:
        if n in seen:
            continue
        s = get_skill(n)
        if not s:
            continue
        body = (s.get("body") or "").strip()
        if body:
            blocks.append(f"[Skill: {n}]\n{body}")
            seen.add(n)
    return blocks


def extract_invocations(text: str) -> Tuple[str, List[str]]:
    """Pull known /skill tokens out of a message.

    Returns (remaining_text, [names]). Only recognized skill names are stripped,
    so a URL or "C:\\path" is left alone.
    """
    if not text or "/" not in text:
        return text, []
    known = {s["name"] for s in list_skills()}
    if not known:
        return text, []
    names: List[str] = []
    parts: List[str] = []
    for tok in text.split():
        if tok.startswith("/") and len(tok) > 1 and tok[1:] in known and tok[1:] not in names:
            names.append(tok[1:])
        else:
            parts.append(tok)
    return " ".join(parts).strip(), names
