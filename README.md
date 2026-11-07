<p align="center">
  <img src="assets/logo.svg" alt="Asthra logo" width="72" height="72"/>
</p>

<h1 align="center">Asthra</h1>

<p align="center">
  <strong>A clean, minimal chat for fully local LLMs.</strong><br/>
  Every request runs on <em>your</em> machine via <a href="https://ollama.com">Ollama</a> — no cloud, no API keys, works offline.
</p>

<p align="center">
  <a href="#"><img src="https://img.shields.io/badge/local%20LLM-Ollama-d97757?style=flat-square" alt="Local LLM via Ollama"/></a>
  <a href="#"><img src="https://img.shields.io/badge/stack-React%20%2B%20FastAPI-4b5563?style=flat-square" alt="Stack: React and FastAPI"/></a>
  <a href="#"><img src="https://img.shields.io/badge/private-by%20default-111827?style=flat-square" alt="Private by default"/></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.8+-3776ab?logo=python&style=flat-square" alt="Python 3.8+" />
  <img src="https://img.shields.io/badge/Node-18+-339933?logo=node.js&style=flat-square" alt="Node 18+" />
  <img src="https://img.shields.io/badge/storage-SQLite-003b57?style=flat-square" alt="SQLite storage" />
</p>

<br/>

```
Browser  →  http://localhost:8787 (FastAPI backend)
         →  http://localhost:11434 (Ollama, your process)
         →  your GPUs / CPU
```

## ✨ Features

- **Streaming** token output with tok/s + duration stats
- **Thinking mode** — collapsible "thought process" blocks for reasoning models (qwen3.8, gemma4)
- **Vision** — attach images (drag files into the upload button) for vision-capable models
- **Documents & PDFs** — attach text/code files, and scanned PDFs (auto-OCR'd with a local model)
- **Tools** — let the model call local, sandboxed tools (calculator, Python, clock) and see the results
- **Skills** — reusable instruction bundles: pin them to a chat, or invoke any time with `/name`
- **Artifacts** — generated HTML/SVG pages render in a live, interactive side pane
- **Search & export** — find any message across all chats; download a conversation as Markdown or HTML
- **Multiple models** — switch between any Ollama model on the fly
- **Conversations** — sidebar history, auto-titled, persisted in SQLite, rename/delete
- **Projects** — group related chats under a workspace, each with its own system prompt, default skills, and shared documents the model draws on; move any existing chat in or out from its ⋯ menu
- **Stop / Regenerate** — abort a running generation, or redo the last answer
- **Light & dark themes**, keyboard-first (Enter to send, Shift+Enter for newline, **Ctrl/⌘+K** or **N** for a new chat)

## 🚀 Getting started

**Prerequisites**

- Python 3.8+ with `pip`
- Node.js 18+ (only needed to build the frontend)
- Ollama — not required yet; `./start.sh` can install it and pull a model for you.

**One command**

```bash
./start.sh
```

That's it. On first run, `start.sh` walks you through setup step by step:

1. Installs the **Python** and **Node** dependencies (if missing)
2. Checks **Ollama** — starts it if it's installed but stopped, or offers to install it
3. Checks for a **model** — if you don't have one, offers to download one (or pick a custom one)
4. Builds the web UI, then launches it

Then open **http://localhost:8787** in your browser.

> **Already have everything?** `start.sh` is idempotent — it detects what's already installed and skips straight to launching. Re-run it any time to bring the app up.

### Useful flags

```bash
./start.sh --dev      # Vite dev server on :5173 (hot reload) + backend on :8787
./start.sh --setup    # run the setup steps only, then stop (don't launch)
./start.sh --yes      # non-interactive: accept defaults, never prompt
./start.sh --help     # show all options
```

### Development mode (hot reload)

`./start.sh --dev` runs the backend on `:8787` plus the Vite dev server with HMR on `:5173`.

## ⚙️ Configuration

| Env var | Default | Purpose |
|---|---|---|
| `OLLAMA_URL` | `http://localhost:11434` | Where the backend finds Ollama |
| `ASTHRA_PORT` | `8787` | Port for the FastAPI server |
| `ASTHRA_HOST` | `127.0.0.1` | Bind address — local-only by default (set `0.0.0.0` for LAN access) |
| `ASTHRA_OCR_MODEL` | local OCR model | Dedicated local model used for scanned-PDF OCR |

## 🔌 API (if you want to script against it)

- `GET /api/models` — list Ollama models + capabilities
- `POST /api/chat` — SSE stream: `{model, messages, system, temperature, max_tokens, think, tools, conversation_id}`
- `POST /api/chat/persist` — save the assistant turn after streaming
- `GET /api/search?q=` — full-text search across all conversations
- `POST /api/upload` — multipart file upload (images / documents / PDFs)
- `GET /api/conversations/{id}/export?format=md|html` — download a conversation
- `GET|POST|PATCH|DELETE /api/conversations[/{id}]` — conversation CRUD
- `GET|POST|PATCH|DELETE /api/projects[/{id}]` — projects (workspaces that group chats)
- `POST /api/projects/{id}/files` · `GET /api/projects/{id}/files` · `DELETE …/files/{fid}` — shared project documents
- `GET|POST|PUT|DELETE /api/skills[/{name}]` — skill management

## 📁 Project layout

```
assets/logo.svg        # Asthra mark (used in the UI + this README)
skills/                # bundled instruction skills (code-review, summarize, …)
backend/
  main.py              # FastAPI entrypoint
  asthra.db            # SQLite (created at first run)
  uploads/             # uploaded files (created at first run)
  app/
    models/            # data access + migrations (conversations, projects, skills, …)
    controllers/       # routers (chat, conversations, projects, skills, uploads)
    views/             # serializers + export (md / html)
    tools.py           # local, sandboxed tool functions
    ingest.py          # text / PDF / OCR extraction
frontend/
  src/
    App.tsx            # state, chat loop, streaming
    api.ts             # typed API client (same-origin, no CORS)
    styles.css         # design tokens + component styles (light/dark)
    components/        # Sidebar, Message, Markdown, Composer, Settings, Skills, Projects, Artifacts
start.sh               # interactive first-run setup + one-command launcher
```

## 🔒 Privacy

- **Chat data never leaves your machine** — it lives in a local SQLite file.
- Inference is 100% local through Ollama; there are no API keys or telemetry.
- The only network use is the one-time `npm install` / `pip install` for open-source libraries.
- The server binds to `127.0.0.1` by default — nothing is exposed to your network unless you opt in.
