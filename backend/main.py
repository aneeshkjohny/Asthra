#!/usr/bin/env python3
"""Asthra backend entrypoint.

The implementation lives in the `app` package, organized as MVC:
    app/models/       data access (SQLite)      -> Model
    app/controllers/  FastAPI routers           -> Controller
    app/views/        serializers               -> View

Run with:  python3 main.py     (or ./start.sh)
"""
from app.main import run

if __name__ == "__main__":
    run()
