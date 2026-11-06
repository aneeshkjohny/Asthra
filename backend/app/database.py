"""Model layer (infrastructure): SQLite connection, schema, and migrations."""
import sqlite3
import threading
from typing import Any, Iterator

from . import config

_lock = threading.Lock()


def lock() -> threading.Lock:
    """Process-wide write lock around SQLite (single-writer safety)."""
    return _lock


def conn() -> sqlite3.Connection:
    c = sqlite3.connect(config.DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def get_all(sql: str, params: tuple = ()) -> Any:
    with _lock, conn() as c:
        return c.execute(sql, params).fetchall()


def get_one(sql: str, params: tuple = ()):
    with _lock, conn() as c:
        return c.execute(sql, params).fetchone()


def execute(sql: str, params: tuple = ()) -> int:
    with _lock, conn() as c:
        cur = c.execute(sql, params)
        return cur.rowcount


def execute_many(sql: str, rows: Iterator[tuple]) -> None:
    with _lock, conn() as c:
        c.executemany(sql, rows)


SCHEMA = """
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    model TEXT NOT NULL,
    settings TEXT NOT NULL DEFAULT '{}',
    skills TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    thinking TEXT,
    images TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
"""


def _migrate(c: sqlite3.Connection) -> None:
    """Idempotent, forward-only migrations for existing databases."""
    cols = [r["name"] for r in c.execute("PRAGMA table_info(messages)").fetchall()]
    if "attachments" not in cols:
        c.execute("ALTER TABLE messages ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]'")
    if "tools" not in cols:
        c.execute("ALTER TABLE messages ADD COLUMN tools TEXT NOT NULL DEFAULT '[]'")
    cconv = [r["name"] for r in c.execute("PRAGMA table_info(conversations)").fetchall()]
    if "skills" not in cconv:
        c.execute("ALTER TABLE conversations ADD COLUMN skills TEXT NOT NULL DEFAULT '[]'")


def init_db() -> None:
    with _lock, conn() as c:
        c.executescript(SCHEMA)
        _migrate(c)
