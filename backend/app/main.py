"""Application factory: wires the MVC layers together, adds middleware,
serves the built frontend, and runs the server."""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import config
from . import database as db
from . import __version__
from .controllers import chat, conversations, projects, skills, uploads


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init_db()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Asthra", version=__version__, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Controllers
    app.include_router(chat.router)
    app.include_router(conversations.router)
    app.include_router(projects.router)
    app.include_router(uploads.router)
    app.include_router(skills.router)

    # Frontend (production build), if present
    if os.path.isdir(config.DIST_DIR):
        app.mount("/assets", StaticFiles(directory=os.path.join(config.DIST_DIR, "assets")),
                  name="assets")

        @app.get("/{path:path}")
        async def spa_fallback(path: str):
            full = os.path.join(config.DIST_DIR, path)
            if path and os.path.isfile(full):
                return FileResponse(full)
            return FileResponse(os.path.join(config.DIST_DIR, "index.html"))
    else:
        @app.get("/api/health")
        def health() -> dict:
            return {"status": "ok", "frontend": "not built — run `npm run build` in frontend/"}

    return app


app = create_app()


def run() -> None:
    import uvicorn
    uvicorn.run(app, host=config.HOST, port=config.PORT)
