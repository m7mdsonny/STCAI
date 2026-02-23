"""
Edge Server - SQLite DB init and helpers.
Schema: events, config, license_cache, cameras (in config JSON), audit_log, hardware_actions.
"""
import aiosqlite
import json
import os
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = os.environ.get("EDGE_DB_PATH", str(Path(__file__).resolve().parent.parent / "data" / "riskintel.db"))

async def get_conn():
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    return await aiosqlite.connect(DB_PATH)

async def init_schema(conn):
    await conn.executescript("""
        CREATE TABLE IF NOT EXISTS schema_version (version INT PRIMARY KEY, applied_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS license_cache (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            tier TEXT NOT NULL DEFAULT 'PROFESSIONAL',
            trial_ends_at TEXT,
            expires_at TEXT,
            feature_flags TEXT NOT NULL DEFAULT '{}',
            last_verified_at TEXT,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            priority TEXT NOT NULL,
            risk_score REAL,
            camera_id TEXT,
            zone_id TEXT,
            snapshot_path TEXT,
            clip_path TEXT,
            payload TEXT,
            occurred_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            synced_at TEXT,
            signed_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_events_occurred ON events(occurred_at);
        CREATE INDEX IF NOT EXISTS idx_events_synced ON events(synced_at) WHERE synced_at IS NULL;
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            actor TEXT,
            details TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS hardware_actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id TEXT NOT NULL,
            action_type TEXT NOT NULL,
            triggered_at TEXT NOT NULL,
            latency_ms INT,
            success INT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS person_snapshots (
            id TEXT PRIMARY KEY,
            event_id TEXT NOT NULL,
            camera_id TEXT NOT NULL,
            file_path TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            occurred_at TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_person_snapshots_occurred ON person_snapshots(occurred_at);
        CREATE INDEX IF NOT EXISTS idx_person_snapshots_camera ON person_snapshots(camera_id);
    """)
    await conn.commit()
    # Ensure trial row exists (14-day trial from first run)
    cur = await conn.execute("SELECT 1 FROM license_cache WHERE id = 1")
    if await cur.fetchone() is None:
        from datetime import timedelta
        ends = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()
        await conn.execute(
            """INSERT INTO license_cache (id, tier, trial_ends_at, feature_flags, updated_at)
               VALUES (1, 'PROFESSIONAL', ?, '{"fire":true,"smoke":true,"anti_theft":true}', ?)""",
            (ends, datetime.now(timezone.utc).isoformat())
        )
        await conn.commit()
    # First-run: 2 demo cameras for immediate 14-day trial (all modules)
    cur = await conn.execute("SELECT value FROM config WHERE key = 'cameras'")
    row = await cur.fetchone()
    if row is None or row[0] in ("", "[]", "null"):
        now = datetime.now(timezone.utc).isoformat()
        demo_cameras = json.dumps([
            {"id": "demo-cam-1", "name": "Camera 1", "rtsp_url": "rtsp://localhost/demo1", "modules": ["fire", "smoke", "anti_theft", "person"], "sensitivity": 0.7, "fps_sample": 2, "enabled": True},
            {"id": "demo-cam-2", "name": "Camera 2", "rtsp_url": "rtsp://localhost/demo2", "modules": ["fire", "smoke", "anti_theft", "person"], "sensitivity": 0.7, "fps_sample": 2, "enabled": True},
        ])
        await conn.execute("INSERT OR REPLACE INTO config (key, value, updated_at) VALUES ('cameras', ?, ?)", (demo_cameras, now))
        await conn.commit()

async def get_config(conn, key: str, default=None):
    cur = await conn.execute("SELECT value FROM config WHERE key = ?", (key,))
    row = await cur.fetchone()
    if row is None:
        return default
    try:
        return json.loads(row[0])
    except Exception:
        return row[0]

async def set_config(conn, key: str, value, commit=True):
    if not isinstance(value, str):
        value = json.dumps(value)
    now = datetime.now(timezone.utc).isoformat()
    await conn.execute(
        "INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, ?)",
        (key, value, now)
    )
    if commit:
        await conn.commit()

async def get_license(conn):
    cur = await conn.execute(
        "SELECT tier, trial_ends_at, expires_at, feature_flags, last_verified_at, updated_at FROM license_cache WHERE id = 1"
    )
    row = await cur.fetchone()
    if not row:
        return None
    return {
        "tier": row[0],
        "trial_ends_at": row[1],
        "expires_at": row[2],
        "feature_flags": json.loads(row[3]) if row[3] else {},
        "last_verified_at": row[4],
        "updated_at": row[5],
    }

async def insert_event(conn, event_id: str, type_: str, priority: str, risk_score: float,
                      camera_id: str = None, zone_id: str = None, payload: dict = None, occurred_at: str = None):
    now = datetime.now(timezone.utc).isoformat()
    occ = occurred_at if occurred_at else now
    payload_s = json.dumps(payload or {})
    await conn.execute(
        """INSERT OR IGNORE INTO events (id, type, priority, risk_score, camera_id, zone_id, payload, occurred_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (event_id, type_, priority, risk_score, camera_id, zone_id, payload_s, occ, now)
    )
    await conn.commit()

async def get_events(conn, limit=100, type_filter=None, camera_id=None, include_payload=False):
    if include_payload:
        q = "SELECT id, type, priority, risk_score, camera_id, occurred_at, synced_at, payload FROM events WHERE 1=1"
    else:
        q = "SELECT id, type, priority, risk_score, camera_id, occurred_at, synced_at FROM events WHERE 1=1"
    params = []
    if type_filter:
        q += " AND type = ?"
        params.append(type_filter)
    if camera_id:
        q += " AND camera_id = ?"
        params.append(camera_id)
    q += " ORDER BY occurred_at DESC LIMIT ?"
    params.append(limit)
    cur = await conn.execute(q, params)
    rows = await cur.fetchall()
    if include_payload:
        return [
            {"id": r[0], "type": r[1], "priority": r[2], "risk_score": r[3], "camera_id": r[4], "occurred_at": r[5], "synced_at": r[6], "payload": json.loads(r[7]) if r[7] else {}}
            for r in rows
        ]
    return [
        {"id": r[0], "type": r[1], "priority": r[2], "risk_score": r[3], "camera_id": r[4], "occurred_at": r[5], "synced_at": r[6]}
        for r in rows
    ]


async def get_event_by_id(conn, event_id: str, include_payload: bool = True) -> dict | None:
    if include_payload:
        cur = await conn.execute(
            "SELECT id, type, priority, risk_score, camera_id, zone_id, payload, occurred_at, synced_at FROM events WHERE id = ?",
            (event_id,),
        )
    else:
        cur = await conn.execute(
            "SELECT id, type, priority, risk_score, camera_id, zone_id, occurred_at, synced_at FROM events WHERE id = ?",
            (event_id,),
        )
    row = await cur.fetchone()
    if not row:
        return None
    if include_payload:
        return {
            "id": row[0], "type": row[1], "priority": row[2], "risk_score": row[3],
            "camera_id": row[4], "zone_id": row[5], "payload": json.loads(row[6]) if row[6] else {},
            "occurred_at": row[7], "synced_at": row[8],
        }
    return {"id": row[0], "type": row[1], "priority": row[2], "risk_score": row[3], "camera_id": row[4], "zone_id": row[5], "occurred_at": row[6], "synced_at": row[7]}


async def get_unsynced_events(conn, limit=50):
    """Events with synced_at IS NULL for cloud push."""
    cur = await conn.execute(
        "SELECT id, type, priority, risk_score, camera_id, zone_id, payload, occurred_at FROM events WHERE synced_at IS NULL ORDER BY occurred_at ASC LIMIT ?",
        (limit,),
    )
    rows = await cur.fetchall()
    return [
        {"id": r[0], "type": r[1], "priority": r[2], "risk_score": r[3], "camera_id": r[4], "zone_id": r[5], "payload": json.loads(r[6]) if r[6] else {}, "occurred_at": r[7]}
        for r in rows
    ]


async def mark_events_synced(conn, event_ids: list):
    """Set synced_at = now() for given event ids."""
    if not event_ids:
        return
    now = datetime.now(timezone.utc).isoformat()
    placeholders = ",".join("?" * len(event_ids))
    await conn.execute(f"UPDATE events SET synced_at = ? WHERE id IN ({placeholders})", [now] + event_ids)
    await conn.commit()

PERSON_SNAPSHOTS_MAX_BYTES = 20 * 1024 * 1024 * 1024  # 20 GB


async def insert_person_snapshot(conn, snapshot_id: str, event_id: str, camera_id: str, file_path: str, size_bytes: int, occurred_at: str):
    now = datetime.now(timezone.utc).isoformat()
    await conn.execute(
        """INSERT INTO person_snapshots (id, event_id, camera_id, file_path, size_bytes, occurred_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (snapshot_id, event_id, camera_id, file_path, size_bytes, occurred_at, now),
    )
    await conn.commit()


async def get_person_snapshots_total_size(conn) -> int:
    cur = await conn.execute("SELECT COALESCE(SUM(size_bytes), 0) FROM person_snapshots")
    row = await cur.fetchone()
    return int(row[0]) if row else 0


async def get_person_snapshots_oldest(conn, limit: int = 100):
    cur = await conn.execute(
        "SELECT id, file_path FROM person_snapshots ORDER BY occurred_at ASC LIMIT ?",
        (limit,),
    )
    return await cur.fetchall()


async def delete_person_snapshot(conn, snapshot_id: str) -> str | None:
    cur = await conn.execute("SELECT file_path FROM person_snapshots WHERE id = ?", (snapshot_id,))
    row = await cur.fetchone()
    if not row:
        return None
    await conn.execute("DELETE FROM person_snapshots WHERE id = ?", (snapshot_id,))
    await conn.commit()
    return row[0]


async def get_person_snapshots_list(conn, limit: int = 100, camera_id: str | None = None, from_date: str | None = None, to_date: str | None = None):
    q = "SELECT id, event_id, camera_id, file_path, size_bytes, occurred_at FROM person_snapshots WHERE 1=1"
    params = []
    if camera_id:
        q += " AND camera_id = ?"
        params.append(camera_id)
    if from_date:
        q += " AND occurred_at >= ?"
        params.append(from_date)
    if to_date:
        q += " AND occurred_at <= ?"
        params.append(to_date + "T23:59:59.999Z" if len(to_date) <= 10 else to_date)
    q += " ORDER BY occurred_at DESC LIMIT ?"
    params.append(limit)
    cur = await conn.execute(q, params)
    rows = await cur.fetchall()
    return [
        {"id": r[0], "event_id": r[1], "camera_id": r[2], "file_path": r[3], "size_bytes": r[4], "occurred_at": r[5]}
        for r in rows
    ]


async def get_person_snapshot_by_id(conn, snapshot_id: str) -> dict | None:
    cur = await conn.execute(
        "SELECT id, event_id, camera_id, file_path, size_bytes, occurred_at FROM person_snapshots WHERE id = ?",
        (snapshot_id,),
    )
    row = await cur.fetchone()
    if not row:
        return None
    return {"id": row[0], "event_id": row[1], "camera_id": row[2], "file_path": row[3], "size_bytes": row[4], "occurred_at": row[5]}


async def get_person_snapshot_by_event_id(conn, event_id: str) -> dict | None:
    cur = await conn.execute(
        "SELECT id, event_id, camera_id, file_path, size_bytes, occurred_at FROM person_snapshots WHERE event_id = ? ORDER BY occurred_at DESC LIMIT 1",
        (event_id,),
    )
    row = await cur.fetchone()
    if not row:
        return None
    return {"id": row[0], "event_id": row[1], "camera_id": row[2], "file_path": row[3], "size_bytes": row[4], "occurred_at": row[5]}


async def audit(conn, action: str, actor: str = "local", details: dict = None):
    now = datetime.now(timezone.utc).isoformat()
    await conn.execute(
        "INSERT INTO audit_log (action, actor, details, created_at) VALUES (?, ?, ?, ?)",
        (action, actor, json.dumps(details or {}), now)
    )
    await conn.commit()
