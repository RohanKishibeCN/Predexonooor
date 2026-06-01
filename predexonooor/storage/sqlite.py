from __future__ import annotations

import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class PositionRow:
    id: int
    predexon_id: str
    venue: str
    token_id: str
    size: float
    entry_price: float
    entry_ts: int
    take_profit: float
    stop_loss: float
    max_hold_until: int
    status: str


def connect(db_path: str | Path) -> sqlite3.Connection:
    p = Path(db_path)
    conn = sqlite3.connect(str(p))
    conn.row_factory = sqlite3.Row
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS positions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          predexon_id TEXT NOT NULL,
          venue TEXT NOT NULL,
          token_id TEXT NOT NULL,
          size REAL NOT NULL,
          entry_price REAL NOT NULL,
          entry_ts INTEGER NOT NULL,
          take_profit REAL NOT NULL,
          stop_loss REAL NOT NULL,
          max_hold_until INTEGER NOT NULL,
          status TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ts INTEGER NOT NULL,
          kind TEXT NOT NULL,
          payload TEXT NOT NULL
        )
        """
    )
    conn.commit()


def log_event(conn: sqlite3.Connection, *, kind: str, payload: str) -> None:
    conn.execute("INSERT INTO events (ts, kind, payload) VALUES (?, ?, ?)", (int(time.time()), kind, payload))
    conn.commit()


def open_position(
    conn: sqlite3.Connection,
    *,
    predexon_id: str,
    venue: str,
    token_id: str,
    size: float,
    entry_price: float,
    take_profit: float,
    stop_loss: float,
    max_hold_until: int,
) -> int:
    cur = conn.execute(
        """
        INSERT INTO positions (
          predexon_id, venue, token_id, size, entry_price, entry_ts,
          take_profit, stop_loss, max_hold_until, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            predexon_id,
            venue,
            token_id,
            float(size),
            float(entry_price),
            int(time.time()),
            float(take_profit),
            float(stop_loss),
            int(max_hold_until),
            "open",
        ),
    )
    conn.commit()
    return int(cur.lastrowid)


def close_position(conn: sqlite3.Connection, *, position_id: int) -> None:
    conn.execute("UPDATE positions SET status = ? WHERE id = ?", ("closed", int(position_id)))
    conn.commit()


def list_open_positions(conn: sqlite3.Connection) -> list[PositionRow]:
    rows = conn.execute("SELECT * FROM positions WHERE status = 'open' ORDER BY id ASC").fetchall()
    out: list[PositionRow] = []
    for r in rows:
        out.append(
            PositionRow(
                id=int(r["id"]),
                predexon_id=str(r["predexon_id"]),
                venue=str(r["venue"]),
                token_id=str(r["token_id"]),
                size=float(r["size"]),
                entry_price=float(r["entry_price"]),
                entry_ts=int(r["entry_ts"]),
                take_profit=float(r["take_profit"]),
                stop_loss=float(r["stop_loss"]),
                max_hold_until=int(r["max_hold_until"]),
                status=str(r["status"]),
            )
        )
    return out


def exposures(conn: sqlite3.Connection) -> dict[str, float]:
    rows = conn.execute(
        "SELECT predexon_id, SUM(size * entry_price) AS notional FROM positions WHERE status = 'open' GROUP BY predexon_id"
    ).fetchall()
    out: dict[str, float] = {}
    for r in rows:
        out[str(r["predexon_id"])] = float(r["notional"] or 0.0)
    return out


def total_exposure(conn: sqlite3.Connection) -> float:
    row = conn.execute("SELECT SUM(size * entry_price) AS notional FROM positions WHERE status = 'open'").fetchone()
    if not row:
        return 0.0
    return float(row["notional"] or 0.0)
