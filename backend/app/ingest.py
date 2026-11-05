"""Phase 1 — extract readable text from an attached file on disk so the model can read it.

Dispatches by file extension / attachment kind:
  - PDF      -> pypdf (page text)
  - .docx    -> python-docx (paragraphs + tables)
  - .xlsx    -> openpyxl (sheet rows)
  - text/code/data -> read as UTF-8 text (best-effort)

Everything is best-effort and bounded: extraction never throws out of this module
and the returned text is capped so one huge file can't blow the model's context.
"""
import os

# Cap extracted text per file (chars). Override with ASTHRA_MAX_EXTRACT_CHARS.
MAX_CHARS = int(os.environ.get("ASTHRA_MAX_EXTRACT_CHARS", "20000"))

_TEXT_EXTS = {
    ".txt", ".md", ".markdown", ".log", ".text", ".rst",
    ".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".json",
    ".html", ".htm", ".css", ".scss", ".sh", ".bash", ".yml", ".yaml",
    ".toml", ".ini", ".cfg", ".conf", ".env", ".c", ".h", ".cpp", ".hpp",
    ".cc", ".java", ".go", ".rs", ".rb", ".php", ".swift", ".kt", ".sql",
    ".xml", ".vue", ".svelte", ".r", ".lua", ".dart", ".cs", ".csv", ".tsv",
}


def extract_text(path: str, name: str = "", kind: str = "") -> str:
    """Return best-effort extracted text for a file at `path`, capped to MAX_CHARS."""
    ext = os.path.splitext(name or path)[1].lower()
    text = ""
    try:
        if ext == ".pdf" or kind == "pdf":
            text = _pdf(path)
        elif ext == ".docx":
            text = _docx(path)
        elif ext == ".xlsx":
            text = _xlsx(path)
        else:
            # text / code / data / anything else -> read as text (best-effort)
            text = _read_text(path)
    except Exception as e:  # never let extraction break the request
        return f"[could not extract text from {name or os.path.basename(path)}: {type(e).__name__}: {e}]"

    text = (text or "").strip()
    if len(text) > MAX_CHARS:
        text = text[:MAX_CHARS] + f"\n\n[... truncated at {MAX_CHARS} chars ...]"
    return text


def _read_text(path: str) -> str:
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        return f.read()


def _pdf(path: str) -> str:
    from pypdf import PdfReader
    reader = PdfReader(path)
    parts = []
    for page in reader.pages:
        t = page.extract_text() or ""
        if t.strip():
            parts.append(t)
    return "\n".join(parts)


def _docx(path: str) -> str:
    import docx
    d = docx.Document(path)
    lines = [p.text for p in d.paragraphs if p.text.strip()]
    for table in d.tables:
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells]
            if any(cells):
                lines.append(" | ".join(cells))
    return "\n".join(lines)


def _xlsx(path: str) -> str:
    import openpyxl
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    lines = []
    try:
        for ws in wb.worksheets:
            lines.append(f"# sheet: {ws.title}")
            for row in ws.iter_rows(values_only=True):
                vals = ["" if v is None else str(v) for v in row]
                if any(v.strip() for v in vals):
                    lines.append(" | ".join(vals))
    finally:
        wb.close()
    return "\n".join(lines)
