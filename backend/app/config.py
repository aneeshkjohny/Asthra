"""Central configuration / settings for the Asthra backend."""
import os

# Path layout (this file lives at backend/app/config.py)
_APP_DIR = os.path.dirname(os.path.abspath(__file__))       # backend/app
BACKEND_DIR = os.path.dirname(_APP_DIR)                     # backend/
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)                 # project root

DB_PATH = os.path.join(BACKEND_DIR, "asthra.db")
UPLOAD_DIR = os.path.join(BACKEND_DIR, "uploads")
DIST_DIR = os.path.join(PROJECT_ROOT, "frontend", "dist")

# Network / runtime (all overridable per-machine via env vars)
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
PORT = int(os.environ.get("ASTHRA_PORT", "8787"))
# Local-only by default. Set ASTHRA_HOST=0.0.0.0 to allow LAN access.
HOST = os.environ.get("ASTHRA_HOST", "127.0.0.1")

# Limits (overridable per-machine via env var, in megabytes)
MAX_UPLOAD_MB = int(os.environ.get("ASTHRA_MAX_UPLOAD_MB", "100"))
MAX_UPLOAD = MAX_UPLOAD_MB * 1024 * 1024

# Skills (Phase 3): instruction bundles. Each skill is a folder with instruction.md
# or a single .md file under this directory (see skills/).
SKILLS_DIR = os.path.join(PROJECT_ROOT, "skills")

os.makedirs(UPLOAD_DIR, exist_ok=True)
