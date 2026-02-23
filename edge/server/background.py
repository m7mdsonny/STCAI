"""
Edge Server - Background loop: run detectors per camera, event engine, write events, trigger siren.
Trial: no cloud required; events stored locally and optionally synced when online.
"""
import asyncio
import logging
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

# Add parent for event_engine and inference
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from db import (
    get_conn,
    get_config,
    insert_event,
    audit,
    get_unsynced_events,
    mark_events_synced,
    insert_person_snapshot,
    get_person_snapshots_total_size,
    get_person_snapshots_oldest,
    delete_person_snapshot,
    PERSON_SNAPSHOTS_MAX_BYTES,
)

logger = logging.getLogger("edge.background")

try:
    from event_engine.engine import process_detection, trigger_hardware, Detection as EDetection, Event
except ImportError:
    EDetection = None
    Event = None
    def process_detection(det, buf, last):  # type: ignore
        return None
    def trigger_hardware(ev):  # type: ignore
        pass


async def get_cameras_config():
    conn = await get_conn()
    try:
        cameras = await get_config(conn, "cameras", [])
        if not isinstance(cameras, list):
            cameras = []
        armed = await get_config(conn, "armed", False)
        if isinstance(armed, str):
            armed = armed.lower() in ("true", "1")
        hw = await get_config(conn, "hardware", {})
        if not isinstance(hw, dict):
            hw = {}
        system = await get_config(conn, "system_settings", {})
        if not isinstance(system, dict):
            system = {}
        ai_modules = (system.get("advanced") or {}).get("ai_modules") or {}
        return cameras, armed, hw, ai_modules, system
    finally:
        await conn.close()


def _anti_theft_in_schedule(ai_modules: dict) -> bool:
    """True if anti_theft should run now (schedule allows)."""
    cfg = (ai_modules.get("anti_theft") or {}) if isinstance(ai_modules, dict) else {}
    schedule = (cfg.get("schedule") or "always").strip() or "always"
    if schedule != "custom":
        return True
    now = datetime.now(timezone.utc)
    windows = cfg.get("time_windows") or []
    if not windows:
        return True
    now_min = now.hour * 60 + now.minute
    for w in windows:
        start_s = (w.get("start") or "00:00").strip()
        end_s = (w.get("end") or "23:59").strip()
        try:
            sh, sm = map(int, start_s.split(":")[:2])
            eh, em = map(int, end_s.split(":")[:2])
            start_min, end_min = sh * 60 + sm, eh * 60 + em
            if start_min <= end_min and start_min <= now_min <= end_min:
                return True
            if start_min > end_min and (now_min >= start_min or now_min <= end_min):
                return True
        except Exception:
            continue
    return False


def run_detectors_sync(camera_id: str, modules: list[str], sensitivity: float, ai_modules: dict = None):
    try:
        from inference.detectors import run_detectors
        mods = list(modules or ["fire"])
        if "anti_theft" in mods and ai_modules and not _anti_theft_in_schedule(ai_modules or {}):
            mods = [m for m in mods if m != "anti_theft"]
        if not mods:
            return []
        return run_detectors(camera_id, mods, sensitivity, None, ai_modules=ai_modules)
    except Exception as e:
        logger.warning("Detectors error: %s", e)
        return []


def _do_siren_sync(ev, hw: dict):
    """Run in executor: trigger relay and/or PC speaker from config."""
    siren_out = (hw.get("siren_output") or "hardware").strip() or "hardware"
    if siren_out == "pc_speaker":
        try:
            from siren_sound import play_pc_sound
            play_pc_sound(ev.type, hw)
        except Exception as e:
            logger.warning("PC siren play failed: %s", e)
    else:
        trigger_hardware(ev)


def _priority_level(p: str) -> int:
    return {"critical": 4, "high": 3, "medium": 2, "low": 1}.get((p or "").lower(), 0)


async def process_and_store_event(conn, ev, armed: bool, siren_enabled: bool, hw: dict, min_priority: str = "low"):
    event_id = getattr(ev, "event_id", None) or str(uuid.uuid4())
    setattr(ev, "event_id", event_id)
    occurred_at = getattr(ev, "occurred_at", None) or datetime.now(timezone.utc).isoformat()
    if not isinstance(occurred_at, str):
        occurred_at = datetime.now(timezone.utc).isoformat()
    await insert_event(
        conn,
        event_id=event_id,
        type_=ev.type,
        priority=ev.priority,
        risk_score=ev.risk_score,
        camera_id=ev.camera_id,
        zone_id=ev.zone_id,
        payload=getattr(ev, "payload", None) or {},
        occurred_at=occurred_at,
    )
    if armed and siren_enabled and _priority_level(ev.priority) >= _priority_level(min_priority):
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, lambda: _do_siren_sync(ev, hw))
        await conn.execute(
            "INSERT INTO hardware_actions (event_id, action_type, triggered_at, latency_ms, success) VALUES (?, ?, ?, ?, 1)",
            (event_id, "siren_on", occurred_at, None),
        )
        await conn.commit()
    logger.info("Event: %s %s %s", ev.type, ev.priority, ev.camera_id)


async def _save_person_snapshot_and_enforce_quota(conn, ev, rtsp_url: str):
    """Capture frame from RTSP, save as person snapshot, enforce 20GB limit (FIFO)."""
    try:
        from camera_snapshot import capture_snapshot_sync
    except ImportError:
        return
    loop = asyncio.get_running_loop()
    jpg_bytes = await loop.run_in_executor(None, lambda: capture_snapshot_sync(rtsp_url))
    if not jpg_bytes:
        return
    data_dir = Path(os.environ.get("EDGE_DB_PATH", str(Path(__file__).resolve().parent.parent / "data" / "riskintel.db"))).parent
    snap_dir = data_dir / "person_snapshots"
    snap_dir.mkdir(parents=True, exist_ok=True)
    snapshot_id = str(uuid.uuid4())
    event_id = getattr(ev, "event_id", None) or ""
    occurred_at = getattr(ev, "occurred_at", None) or datetime.now(timezone.utc).isoformat()
    if not isinstance(occurred_at, str):
        occurred_at = datetime.now(timezone.utc).isoformat()
    file_path = snap_dir / f"{snapshot_id}.jpg"
    file_path.write_bytes(jpg_bytes)
    size_bytes = len(jpg_bytes)
    await insert_person_snapshot(conn, snapshot_id, event_id, ev.camera_id, str(file_path), size_bytes, occurred_at)
    total = await get_person_snapshots_total_size(conn)
    while total > PERSON_SNAPSHOTS_MAX_BYTES:
        oldest = await get_person_snapshots_oldest(conn, limit=10)
        if not oldest:
            break
        for sid, fpath in oldest:
            removed = await delete_person_snapshot(conn, sid)
            if removed and os.path.isfile(removed):
                try:
                    os.unlink(removed)
                except OSError:
                    pass
            total = await get_person_snapshots_total_size(conn)
            if total <= PERSON_SNAPSHOTS_MAX_BYTES:
                break
    logger.info("Person snapshot saved: %s (%d bytes)", snapshot_id, size_bytes)


async def sync_events_to_cloud():
    """Push unsynced events to cloud when base URL and device key are set (env or config)."""
    base_url = os.environ.get("SYNC_BASE_URL", "").rstrip("/")
    device_key = os.environ.get("SYNC_DEVICE_KEY", "")
    if not device_key:
        conn = await get_conn()
        try:
            device_key = await get_config(conn, "device_key", "") or ""
        finally:
            await conn.close()
    if not base_url:
        conn = await get_conn()
        try:
            base_url = (await get_config(conn, "cloud_url", "") or "").rstrip("/")
        finally:
            await conn.close()
    if not base_url or not device_key:
        return
    try:
        import httpx
    except ImportError:
        return
    conn = await get_conn()
    try:
        events = await get_unsynced_events(conn, limit=50)
        if not events:
            return
        payload = [
            {
                "event_id": e["id"],
                "type": e["type"],
                "priority": e["priority"],
                "risk_score": float(e.get("risk_score") or 0),
                "camera_id": e.get("camera_id") or "",
                "zone_id": e.get("zone_id") or "",
                "occurred_at": e.get("occurred_at") or datetime.now(timezone.utc).isoformat(),
                "payload": e.get("payload") or {},
            }
            for e in events
        ]
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(
                f"{base_url}/v1/sync/events",
                json={"events": payload},
                headers={"Content-Type": "application/json", "X-Device-Key": device_key},
            )
            if r.is_success:
                await mark_events_synced(conn, [e["id"] for e in events])
                logger.info("Synced %d events to cloud", len(events))
            else:
                logger.warning("Cloud sync failed: %s %s", r.status_code, r.text[:200])
    except Exception as e:
        logger.warning("Sync to cloud: %s", e)
    finally:
        await conn.close()


async def background_loop(app):
    """Every 15s run detectors per camera, track connection status, store events, trigger siren. Sync to cloud every 4th run."""
    frame_buffer = {}
    last_events = {}
    loop_count = 0
    if not hasattr(app.state, "camera_status"):
        app.state.camera_status = {}
    if not hasattr(app.state, "camera_status_prev"):
        app.state.camera_status_prev = {}
    while True:
        try:
            await asyncio.sleep(15)
            loop_count += 1
            cameras, armed, hw, ai_modules, system = await get_cameras_config()
            notif = (system.get("notifications") or {}) if isinstance(system, dict) else {}
            min_priority = (notif.get("min_priority") or "low").strip() or "low"
            siren_enabled = hw.get("siren_enabled", True)
            conn = await get_conn()
            try:
                for cam in cameras:
                    if not cam.get("enabled", True):
                        continue
                    cid = cam.get("id", "unknown")
                    rtsp_url = (cam.get("rtsp_url") or "").strip()
                    modules = cam.get("modules", ["fire"])
                    sensitivity = float(cam.get("sensitivity", 0.7))
                    connected = False
                    last_error = None
                    # Real connectivity: check RTSP host:port reachable
                    try:
                        from camera_connect import check_rtsp_reachable
                        connected, last_error = await asyncio.get_running_loop().run_in_executor(
                            None, lambda: check_rtsp_reachable(rtsp_url)
                        )
                    except Exception as e:
                        last_error = str(e)[:80]
                        connected = False
                    if not connected:
                        app.state.camera_status[cid] = {"connected": False, "last_check": datetime.now(timezone.utc).isoformat(), "last_error": last_error}
                        app.state.camera_status_prev[cid] = {"connected": False, "last_check": datetime.now(timezone.utc).isoformat()}
                        prev = app.state.camera_status_prev.get(cid, {})
                        if prev.get("connected") is True:
                            await insert_event(conn, event_id=str(uuid.uuid4()), type_="camera_status", priority="high", risk_score=90.0, camera_id=cid, zone_id=None, payload={"status": "disconnected", "camera_id": cid, "last_error": last_error}, occurred_at=datetime.now(timezone.utc).isoformat())
                            await conn.commit()
                            logger.info("Camera %s disconnected", cid)
                        continue
                    try:
                        mock_ok = (system.get("advanced") or {}) if isinstance(system, dict) else {}
                        if not mock_ok.get("mock_events_enabled", False):
                            dets = []
                        else:
                            dets = await asyncio.get_running_loop().run_in_executor(
                                None,
                                lambda cid=cid, mods=modules, sens=sensitivity: run_detectors_sync(cid, mods, sens, ai_modules),
                            )
                        for d in dets:
                            det = (EDetection or type(d))(
                                camera_id=d.camera_id,
                                model=d.model,
                                class_name=d.class_name,
                                confidence=d.confidence,
                                timestamp=d.timestamp,
                                payload=getattr(d, "payload", None),
                            )
                            ev = process_detection(det, frame_buffer, last_events)
                            if ev is not None:
                                await process_and_store_event(conn, ev, armed, siren_enabled, hw, min_priority)
                                if ev.type == "person" and rtsp_url:
                                    person_cfg = (ai_modules.get("person") or {}) if isinstance(ai_modules, dict) else {}
                                    if person_cfg.get("save_snapshots", True):
                                        await _save_person_snapshot_and_enforce_quota(conn, ev, rtsp_url)
                    except Exception as e:
                        last_error = str(e)
                    if connected:
                        now_iso = datetime.now(timezone.utc).isoformat()
                        prev = app.state.camera_status_prev.get(cid, {})
                        prev_connected = prev.get("connected", None)
                        app.state.camera_status[cid] = {"connected": True, "last_check": now_iso, "last_error": last_error}
                        app.state.camera_status_prev[cid] = {"connected": True, "last_check": now_iso}
                        if prev_connected is not None and prev_connected is not True:
                            await insert_event(
                                conn,
                                event_id=str(uuid.uuid4()),
                                type_="camera_status",
                                priority="medium",
                                risk_score=20.0,
                                camera_id=cid,
                                zone_id=None,
                                payload={"status": "connected", "camera_id": cid},
                                occurred_at=now_iso,
                            )
                            await conn.commit()
                            logger.info("Camera %s connected", cid)
                # Every 4th loop (~60s) push unsynced events to cloud when configured
                if loop_count % 4 == 0:
                    await sync_events_to_cloud()
            finally:
                await conn.close()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.exception("Background loop: %s", e)


def start_background(app):
    """Start background task (called from lifespan, so event loop is running)."""
    app.state.camera_status = {}
    app.state.camera_status_prev = {}
    task = asyncio.create_task(background_loop(app))
    setattr(app.state, "_bg_task", task)
