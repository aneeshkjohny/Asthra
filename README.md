# Asthra

A clean, minimal chat interface for **fully local** LLMs.
All inference runs on your machine via [Ollama](https://ollama.com) — no cloud, no API keys, works offline.

```
Browser  →  http://localhost:8787 (FastAPI backend)
         →  http://localhost:11434 (Ollama, your process)
         →  your GPUs / CPU
```

## Features

- **Streaming** token output with tok/s + duration stats
- **Markdown** rendering with GitHub-flavored tables, lists, and **copy-able syntax-highlighted code blocks**
- **Thinking mode** — collapsible "thought process" blocks for reasoning models (qwen3.8, gemma4)
- **Vision** — attach images (drag files into the upload button) for vision-capable models
- **Multiple models** — switch between any Ollama model on the fly
- **Conversations** — sidebar history, auto-titled, persisted in SQLite, rename/delete
- **Settings** — system prompt, temperature, max tokens, thinking toggle (per conversation)
- **Stop / Regenerate** — abort a running generation, or redo the last answer
- **Light & dark themes**, keyboard-first (Enter to send, Shift+Enter for newline)

## Requirements

- Python 3.8+ with `pip`
- Node.js 18+ (only needed to build the frontend)
- Ollama running with at least one model (`ollama pull qwen3.8`)

## Quick start

```bash
./start.sh
```

Then open **http://localhost:8787** in your browser.

### Development mode (hot reload)

```bash
./start.sh --dev
```

Backend on `:8787`, Vite dev server with HMR on `:5173`.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `OLLAMA_URL` | `http://localhost:11434` | Where the backend finds Ollama |
| `ASTHRA_PORT` | `8787` | Port for the FastAPI server |
| `ASTHRA_HOST` | `127.0.0.1` | Bind address — local-only by default (set `0.0.0.0` for LAN access) |

## API (if you want to script against it)

- `GET /api/models` — list Ollama models + capabilities
- `POST /api/conversations` / `GET` / `PATCH /{id}` / `DELETE /{id}`
- `POST /api/chat` — SSE stream: `{model, messages, system, temperature, max_tokens, think, conversation_id}`
- `POST /api/upload` — multipart image upload → returns base64 for the vision API
- `POST /api/chat/persist` — save the assistant turn after streaming

## Project layout

```
backend/
  main.py            # FastAPI: SSE proxy, SQLite persistence, uploads, static serving
  asthra.db          # SQLite (created at first run)
  uploads/           # uploaded images (created at first run)
frontend/
  src/
    App.tsx          # state, chat loop, streaming
    api.ts           # typed API client (same-origin, no CORS)
    styles.css       # design tokens + component styles (light/dark)
    components/      # Sidebar, Message, Markdown, Composer, Settings
start.sh             # one-command launcher
```

## Privacy

- Chat data never leaves your machine.
- The only network use is the one-time `npm install` / `pip install` for open-source libraries.
- To be fully offline after setup, no further connectivity is required.
