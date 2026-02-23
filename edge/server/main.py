"""
STC Solutions AI Edge Server - Full local API + UI + 14-day trial.
Serves: dashboard, cameras (fire/smoke/anti-theft modules), events, settings, license.
Runs standalone for 14 days without cloud; then syncs license when online.
"""
import asyncio
import base64
import json
import random
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel

from db import (
    get_conn,
    init_schema,
    get_config,
    set_config,
    get_license,
    insert_event,
    get_events,
    get_event_by_id,
    audit,
    get_person_snapshots_list,
    get_person_snapshot_by_id,
    get_person_snapshot_by_event_id,
)

# Default config keys
KEY_CAMERAS = "cameras"
KEY_HARDWARE = "hardware"
KEY_ARMED = "armed"
KEY_SITE = "site"
KEY_DEVICE_KEY = "device_key"
KEY_CLOUD_URL = "cloud_url"
KEY_SYSTEM = "system_settings"

DEFAULT_CAMERAS = []
DEFAULT_HARDWARE = {
    "siren_enabled": True,
    "siren_pin": 1,
    "siren_output": "hardware",
    "sound_fire_smoke": "preset1",
    "sound_theft": "preset1",
    "sound_person": "preset1",
    "siren_duration_sec": 3,
    "relays": [],
    "mqtt_topic": "",
}
DEFAULT_SITE = {"name": "Site", "timezone": "UTC"}
DEFAULT_SYSTEM = {
    "notifications": {"enabled": True, "sound": True, "critical_only": False, "min_priority": "medium", "email_enabled": False, "email": ""},
    "whatsapp": {"enabled": False, "webhook_url": "", "phone": ""},
    "mobile_link": {"enabled": False, "push_enabled": False, "paired_devices": [], "pairing_code": "", "pairing_code_expires_at": ""},
    "advanced": {
        "sync_interval_sec": 60,
        "log_level": "INFO",
        "detection_interval_sec": 15,
        "mock_events_enabled": False,
        "ai_modules": {
            "fire_smoke": {"enabled": True, "sensitivity": 0.7, "description": "كشف لهب ودخان وشرر"},
            "anti_theft": {
                "enabled": True,
                "schedule": "always",
                "time_windows": [],
                "sensitivity": 0.7,
                "description": "تسلل وتجمهر وعبث",
                "event_types": ["intrusion", "loitering"],
                "min_duration_sec": 2,
                "entry_delay_sec": 30,
                "exit_delay_sec": 60,
                "arm_mode": "away",
                "alarm_duration_sec": 120,
                "silent_alarm": False,
                "zones": [],
            },
            "person": {"enabled": True, "sensitivity": 0.7, "save_snapshots": True, "min_confidence": 0.6, "description": "اكتشاف أشخاص وعدّ وعمر وجنس"},
        },
    },
}


class CameraCreate(BaseModel):
    name: str
    rtsp_url: str
    modules: list[str]  # fire, smoke, anti_theft
    sensitivity: float = 0.7
    fps_sample: int = 2
    enabled: bool = True


class CameraUpdate(BaseModel):
    name: str | None = None
    rtsp_url: str | None = None
    modules: list[str] | None = None
    sensitivity: float | None = None
    fps_sample: int | None = None
    enabled: bool | None = None


class HardwareUpdate(BaseModel):
    siren_enabled: bool | None = None
    siren_pin: int | None = None
    siren_output: str | None = None
    sound_fire_smoke: str | None = None
    sound_theft: str | None = None
    sound_person: str | None = None
    siren_duration_sec: float | None = None


class SiteUpdate(BaseModel):
    name: str | None = None
    timezone: str | None = None


class ArmUpdate(BaseModel):
    armed: bool


class SystemSettingsUpdate(BaseModel):
    notifications: dict | None = None
    whatsapp: dict | None = None
    mobile_link: dict | None = None
    advanced: dict | None = None


def _trial_ok(license_row: dict) -> bool:
    """True if within 14-day trial or active license."""
    if not license_row:
        return True
    from datetime import datetime, timezone
    ends = license_row.get("trial_ends_at")
    if ends:
        try:
            end_dt = datetime.fromisoformat(ends.replace("Z", "+00:00"))
            if end_dt.tzinfo is None:
                end_dt = end_dt.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) < end_dt:
                return True
        except Exception:
            pass
    expires = license_row.get("expires_at")
    if expires:
        try:
            exp_dt = datetime.fromisoformat(expires.replace("Z", "+00:00"))
            if exp_dt.tzinfo is None:
                exp_dt = exp_dt.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) < exp_dt:
                return True
        except Exception:
            pass
    return False


@asynccontextmanager
async def lifespan(app: FastAPI):
    conn = await get_conn()
    await init_schema(conn)
    await conn.close()
    try:
        from background import start_background
        start_background(app)
    except Exception as e:
        import logging
        logging.getLogger("uvicorn.error").warning("Background loop not started: %s", e)
    yield
    if getattr(app.state, "_bg_task", None):
        app.state._bg_task.cancel()


app = FastAPI(title="STC Solutions AI", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        return response


app.add_middleware(SecurityHeadersMiddleware)


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Return consistent JSON for unhandled server errors. HTTPException is handled by FastAPI."""
    from fastapi import HTTPException as FastAPIHTTPException
    if isinstance(exc, FastAPIHTTPException):
        raise exc
    import logging
    logging.getLogger("uvicorn.error").exception("Unhandled exception: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "خطأ داخلي في الخادم", "error": str(exc)},
    )


# ----- API -----

@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "edge"}


@app.get("/api/license")
async def api_license():
    conn = await get_conn()
    try:
        row = await get_license(conn)
        if not row:
            return {"tier": "PROFESSIONAL", "trial_ends_at": None, "expires_at": None, "feature_flags": {}, "within_trial": True}
        within = _trial_ok(row)
        return {**row, "within_trial": within}
    finally:
        await conn.close()


@app.get("/api/config")
async def api_config():
    conn = await get_conn()
    try:
        cameras = await get_config(conn, KEY_CAMERAS, DEFAULT_CAMERAS)
        if not isinstance(cameras, list):
            cameras = DEFAULT_CAMERAS
        hardware = await get_config(conn, KEY_HARDWARE, DEFAULT_HARDWARE)
        if not isinstance(hardware, dict):
            hardware = DEFAULT_HARDWARE
        armed = await get_config(conn, KEY_ARMED, False)
        if isinstance(armed, str):
            armed = armed.lower() in ("true", "1")
        site = await get_config(conn, KEY_SITE, DEFAULT_SITE)
        if not isinstance(site, dict):
            site = DEFAULT_SITE
        device_key = await get_config(conn, KEY_DEVICE_KEY, "") or ""
        cloud_url = await get_config(conn, KEY_CLOUD_URL, "") or ""
        system = await get_config(conn, KEY_SYSTEM, DEFAULT_SYSTEM)
        if not isinstance(system, dict):
            system = dict(DEFAULT_SYSTEM)
        return {"cameras": cameras, "hardware": hardware, "armed": armed, "site": site, "device_key_configured": bool(device_key), "cloud_url": cloud_url or None, "system_settings": system}
    finally:
        await conn.close()


@app.put("/api/config/arm")
async def api_arm(body: ArmUpdate):
    conn = await get_conn()
    try:
        await set_config(conn, KEY_ARMED, body.armed)
        await audit(conn, "arm" if body.armed else "disarm", "local", {"armed": body.armed})
        return {"armed": body.armed}
    finally:
        await conn.close()


@app.get("/api/cameras")
async def api_cameras_list():
    conn = await get_conn()
    try:
        cameras = await get_config(conn, KEY_CAMERAS, DEFAULT_CAMERAS)
        return {"cameras": cameras}
    finally:
        await conn.close()


@app.get("/api/cameras/status")
async def api_cameras_status():
    """Return current connection status per camera (from background loop)."""
    status = getattr(app.state, "camera_status", None)
    if status is None:
        return {"status": {}}
    return {"status": dict(status)}


# Minimal 1x1 gray JPEG when camera snapshot fails (live view still shows an image)
_SNAPSHOT_PLACEHOLDER_JPEG = base64.b64decode(
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="
)

_SNAPSHOT_TIMEOUT_SEC = 8


def _capture_snapshot_sync(rtsp_url: str) -> bytes | None:
    """Blocking: capture one frame from RTSP. Delegates to shared module."""
    try:
        from camera_snapshot import capture_snapshot_sync
        return capture_snapshot_sync(rtsp_url)
    except ImportError:
        return None


def _is_demo_or_unreachable_url(rtsp_url: str) -> bool:
    """Return True if URL is demo/localhost so we skip blocking capture."""
    u = (rtsp_url or "").strip().lower()
    return not u or "localhost" in u or "127.0.0.1" in u or "/demo" in u or u.startswith("rtsp://localhost")


@app.get("/api/cameras/{camera_id}/snapshot")
async def api_camera_snapshot(camera_id: str):
    """Return one JPEG frame from camera RTSP stream for live view. Placeholder if capture fails or demo URL."""
    conn = await get_conn()
    try:
        cameras = await get_config(conn, KEY_CAMERAS, DEFAULT_CAMERAS)
        cam = next((c for c in (cameras or []) if c.get("id") == camera_id), None)
        if not cam:
            raise HTTPException(status_code=404, detail="Camera not found")
        rtsp_url = (cam.get("rtsp_url") or "").strip()
    finally:
        await conn.close()
    if not rtsp_url or _is_demo_or_unreachable_url(rtsp_url):
        return Response(content=_SNAPSHOT_PLACEHOLDER_JPEG, media_type="image/jpeg")
    loop = asyncio.get_running_loop()
    try:
        jpg_bytes = await asyncio.wait_for(
            loop.run_in_executor(None, lambda: _capture_snapshot_sync(rtsp_url)),
            timeout=_SNAPSHOT_TIMEOUT_SEC,
        )
    except asyncio.TimeoutError:
        jpg_bytes = None
    if not jpg_bytes:
        jpg_bytes = _SNAPSHOT_PLACEHOLDER_JPEG
    return Response(
        content=jpg_bytes,
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
    )


_MJPEG_BOUNDARY = "stc-mjpeg-frame"


async def _mjpeg_stream_gen(camera_id: str, cam: dict, interval_sec: float):
    """Async generator: yield MJPEG multipart chunks. For demo URLs yield placeholder only."""
    rtsp_url = (cam.get("rtsp_url") or "").strip()
    is_demo = _is_demo_or_unreachable_url(rtsp_url)
    loop = asyncio.get_running_loop()
    while True:
        try:
            if is_demo or not rtsp_url:
                jpg = _SNAPSHOT_PLACEHOLDER_JPEG
            else:
                try:
                    jpg = await asyncio.wait_for(
                        loop.run_in_executor(None, lambda: _capture_snapshot_sync(rtsp_url)),
                        timeout=_SNAPSHOT_TIMEOUT_SEC,
                    )
                except asyncio.TimeoutError:
                    jpg = None
                if not jpg:
                    jpg = _SNAPSHOT_PLACEHOLDER_JPEG
            chunk = (
                b"--" + _MJPEG_BOUNDARY.encode() + b"\r\n"
                b"Content-Type: image/jpeg\r\nContent-Length: " + str(len(jpg)).encode() + b"\r\n\r\n"
                + jpg + b"\r\n"
            )
            yield chunk
        except asyncio.CancelledError:
            break
        except Exception:
            yield (
                b"--" + _MJPEG_BOUNDARY.encode() + b"\r\n"
                b"Content-Type: image/jpeg\r\nContent-Length: " + str(len(_SNAPSHOT_PLACEHOLDER_JPEG)).encode() + b"\r\n\r\n"
                + _SNAPSHOT_PLACEHOLDER_JPEG + b"\r\n"
            )
        await asyncio.sleep(max(0.5, interval_sec))


@app.get("/api/cameras/{camera_id}/stream")
async def api_camera_stream_mjpeg(camera_id: str, interval: float = 2.0):
    """MJPEG stream for live view. Browser uses <img src=\".../stream\"> for continuous updates."""
    conn = await get_conn()
    try:
        cameras = await get_config(conn, KEY_CAMERAS, DEFAULT_CAMERAS)
        cam = next((c for c in (cameras or []) if c.get("id") == camera_id), None)
        if not cam:
            raise HTTPException(status_code=404, detail="Camera not found")
    finally:
        await conn.close()
    interval_sec = max(0.5, min(10.0, float(interval)))
    return StreamingResponse(
        _mjpeg_stream_gen(camera_id, cam, interval_sec),
        media_type=f"multipart/x-mixed-replace; boundary={_MJPEG_BOUNDARY}",
    )


@app.get("/api/mobile/pairing-code")
async def api_mobile_pairing_code():
    """Return or generate 6-digit pairing code for mobile link. Valid 10 minutes."""
    conn = await get_conn()
    try:
        system = await get_config(conn, KEY_SYSTEM, DEFAULT_SYSTEM)
        if not isinstance(system, dict):
            system = dict(DEFAULT_SYSTEM)
        mobile = system.get("mobile_link") or {}
        if not mobile.get("enabled"):
            return {"code": "", "expires_at": None, "message": "Enable mobile link in settings first."}
        now = datetime.now(timezone.utc)
        expires_at = mobile.get("pairing_code_expires_at") or ""
        code = (mobile.get("pairing_code") or "").strip()
        if not code or not expires_at:
            code = "".join(str(random.randint(0, 9)) for _ in range(6))
            expires_at = (now + timedelta(minutes=10)).isoformat()
            mobile["pairing_code"] = code
            mobile["pairing_code_expires_at"] = expires_at
            system["mobile_link"] = mobile
            await set_config(conn, KEY_SYSTEM, system)
        else:
            try:
                exp_dt = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
                if exp_dt.tzinfo is None:
                    exp_dt = exp_dt.replace(tzinfo=timezone.utc)
                if now >= exp_dt:
                    code = "".join(str(random.randint(0, 9)) for _ in range(6))
                    expires_at = (now + timedelta(minutes=10)).isoformat()
                    mobile["pairing_code"] = code
                    mobile["pairing_code_expires_at"] = expires_at
                    system["mobile_link"] = mobile
                    await set_config(conn, KEY_SYSTEM, system)
            except Exception:
                code = "".join(str(random.randint(0, 9)) for _ in range(6))
                expires_at = (now + timedelta(minutes=10)).isoformat()
                mobile["pairing_code"] = code
                mobile["pairing_code_expires_at"] = expires_at
                system["mobile_link"] = mobile
                await set_config(conn, KEY_SYSTEM, system)
        return {"code": code, "expires_at": expires_at}
    finally:
        await conn.close()


@app.post("/api/cameras")
async def api_camera_create(body: CameraCreate):
    conn = await get_conn()
    try:
        cameras = await get_config(conn, KEY_CAMERAS, DEFAULT_CAMERAS)
        cam = {
            "id": str(uuid.uuid4()),
            "name": body.name,
            "rtsp_url": body.rtsp_url,
            "modules": body.modules or ["fire"],
            "sensitivity": max(0.1, min(1.0, body.sensitivity)),
            "fps_sample": max(1, min(10, body.fps_sample)),
            "enabled": body.enabled,
        }
        cameras.append(cam)
        await set_config(conn, KEY_CAMERAS, cameras)
        await audit(conn, "camera_add", "local", {"camera_id": cam["id"], "name": cam["name"]})
        return cam
    finally:
        await conn.close()


@app.put("/api/cameras/{camera_id}")
async def api_camera_update(camera_id: str, body: CameraUpdate):
    conn = await get_conn()
    try:
        cameras = await get_config(conn, KEY_CAMERAS, DEFAULT_CAMERAS)
        idx = next((i for i, c in enumerate(cameras) if c.get("id") == camera_id), None)
        if idx is None:
            raise HTTPException(status_code=404, detail="Camera not found")
        c = cameras[idx]
        if body.name is not None:
            c["name"] = body.name
        if body.rtsp_url is not None:
            c["rtsp_url"] = body.rtsp_url
        if body.modules is not None:
            c["modules"] = body.modules
        if body.sensitivity is not None:
            c["sensitivity"] = max(0.1, min(1.0, body.sensitivity))
        if body.fps_sample is not None:
            c["fps_sample"] = max(1, min(10, body.fps_sample))
        if body.enabled is not None:
            c["enabled"] = body.enabled
        await set_config(conn, KEY_CAMERAS, cameras)
        await audit(conn, "camera_update", "local", {"camera_id": camera_id})
        return c
    finally:
        await conn.close()


@app.delete("/api/cameras/{camera_id}")
async def api_camera_delete(camera_id: str):
    conn = await get_conn()
    try:
        cameras = await get_config(conn, KEY_CAMERAS, DEFAULT_CAMERAS)
        cameras = [c for c in cameras if c.get("id") != camera_id]
        await set_config(conn, KEY_CAMERAS, cameras)
        await audit(conn, "camera_delete", "local", {"camera_id": camera_id})
        return {"deleted": camera_id}
    finally:
        await conn.close()


@app.get("/api/events")
async def api_events_list(limit: int = 50, type: str | None = None, camera_id: str | None = None, include_payload: bool = False):
    limit = min(max(1, limit), 500)
    conn = await get_conn()
    try:
        events = await get_events(conn, limit=limit, type_filter=type, camera_id=camera_id, include_payload=include_payload)
        return {"events": events, "total": len(events)}
    finally:
        await conn.close()


@app.get("/api/events/{event_id}")
async def api_event_by_id(event_id: str):
    conn = await get_conn()
    try:
        ev = await get_event_by_id(conn, event_id, include_payload=True)
        if not ev:
            raise HTTPException(status_code=404, detail="Event not found")
        return ev
    finally:
        await conn.close()


@app.get("/api/events/{event_id}/snapshot")
async def api_event_snapshot_image(event_id: str):
    """Return person snapshot image for this event if available (person events only)."""
    conn = await get_conn()
    try:
        row = await get_person_snapshot_by_event_id(conn, event_id)
    finally:
        await conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="No snapshot for this event")
    path = Path(row["file_path"])
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Image file not found")
    return FileResponse(path, media_type="image/jpeg")


@app.get("/api/person-snapshots")
async def api_person_snapshots_list(limit: int = 100, camera_id: str | None = None, from_date: str | None = None, to_date: str | None = None):
    conn = await get_conn()
    try:
        items = await get_person_snapshots_list(conn, limit=limit, camera_id=camera_id, from_date=from_date, to_date=to_date)
        return {"snapshots": items, "total": len(items)}
    finally:
        await conn.close()


@app.get("/api/person-snapshots/{snapshot_id}/image")
async def api_person_snapshot_image(snapshot_id: str):
    conn = await get_conn()
    try:
        row = await get_person_snapshot_by_id(conn, snapshot_id)
    finally:
        await conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    path = Path(row["file_path"])
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Image file not found")
    return FileResponse(path, media_type="image/jpeg")


SOUNDS_DIR = Path(__file__).resolve().parent.parent / "data" / "sounds"


@app.get("/api/sounds")
async def api_sounds_list():
    """List uploaded custom siren sound files (WAV)."""
    if not SOUNDS_DIR.exists():
        return {"sounds": []}
    files = [f.name for f in SOUNDS_DIR.iterdir() if f.is_file() and f.suffix.lower() == ".wav"]
    return {"sounds": sorted(files)}


@app.post("/api/sounds/upload")
async def api_sounds_upload(file: UploadFile = File(...)):
    """Upload a WAV file for custom siren sound. Replaces if same name."""
    if not file.filename or not file.filename.lower().endswith(".wav"):
        raise HTTPException(status_code=400, detail="Only .wav files allowed")
    safe_name = "".join(c for c in file.filename if c.isalnum() or c in "._- ").strip() or "custom.wav"
    if not safe_name.lower().endswith(".wav"):
        safe_name += ".wav"
    SOUNDS_DIR.mkdir(parents=True, exist_ok=True)
    path = SOUNDS_DIR / safe_name
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")
    path.write_bytes(content)
    return {"filename": safe_name, "message": "تم رفع الملف. اختر «مخصص: " + safe_name + "» من قائمة الصوت."}


@app.put("/api/settings/hardware")
async def api_hardware_update(body: HardwareUpdate):
    conn = await get_conn()
    try:
        hw = await get_config(conn, KEY_HARDWARE, DEFAULT_HARDWARE)
        if body.siren_enabled is not None:
            hw["siren_enabled"] = body.siren_enabled
        if body.siren_pin is not None:
            hw["siren_pin"] = body.siren_pin
        if body.siren_output is not None:
            hw["siren_output"] = body.siren_output if body.siren_output in ("hardware", "pc_speaker") else hw.get("siren_output", "hardware")
        if body.sound_fire_smoke is not None:
            hw["sound_fire_smoke"] = body.sound_fire_smoke.strip() or "preset1"
        if body.sound_theft is not None:
            hw["sound_theft"] = body.sound_theft.strip() or "preset1"
        if body.sound_person is not None:
            hw["sound_person"] = body.sound_person.strip() or "preset1"
        if body.siren_duration_sec is not None:
            hw["siren_duration_sec"] = max(1, min(30, float(body.siren_duration_sec)))
        await set_config(conn, KEY_HARDWARE, hw)
        await audit(conn, "hardware_update", "local", hw)
        return hw
    finally:
        await conn.close()


class LicenseLinkBody(BaseModel):
    device_key: str
    cloud_url: str | None = None


@app.post("/api/license/link")
async def api_license_link(body: LicenseLinkBody):
    """Save device key (and optional cloud URL) from cloud for sync. After 14-day trial, enter key from cloud."""
    key = (body.device_key or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="device_key is required")
    conn = await get_conn()
    try:
        await set_config(conn, KEY_DEVICE_KEY, key)
        if body.cloud_url is not None and body.cloud_url.strip():
            await set_config(conn, KEY_CLOUD_URL, body.cloud_url.strip())
        await audit(conn, "license_link", "local", {"has_key": True})
        return {"success": True, "message": "Device key saved. Sync will use it."}
    finally:
        await conn.close()


def _trigger_siren_sync(ev_type: str, hw: dict):
    """Sync helper: trigger relay and/or PC speaker from config."""
    from event_engine.engine import trigger_hardware
    from event_engine.engine import Event
    ev = Event(event_id="siren", type=ev_type, priority="high", risk_score=0, camera_id="", zone_id=None, occurred_at=__import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(), payload={})
    siren_out = (hw.get("siren_output") or "hardware").strip() or "hardware"
    if siren_out == "pc_speaker":
        from siren_sound import play_pc_sound
        play_pc_sound(ev_type, hw)
    else:
        trigger_hardware(ev)


@app.post("/api/hardware/siren/test")
async def api_siren_test():
    """Trigger siren for test (relay or PC speaker per config)."""
    conn = await get_conn()
    try:
        hw = await get_config(conn, KEY_HARDWARE, DEFAULT_HARDWARE)
        if not isinstance(hw, dict):
            hw = dict(DEFAULT_HARDWARE)
    finally:
        await conn.close()
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, lambda: _trigger_siren_sync("test", hw))
    return {"success": True, "message": "Siren test triggered."}


class TestSoundBody(BaseModel):
    sound_type: str  # fire_smoke | theft | person
    preset: str | None = "preset1"


@app.post("/api/hardware/siren/test-sound")
async def api_siren_test_sound(body: TestSoundBody):
    """Play selected alarm preset through PC speakers (test only)."""
    if body.sound_type not in ("fire_smoke", "theft", "person"):
        raise HTTPException(status_code=400, detail="sound_type must be fire_smoke, theft, or person")
    conn = await get_conn()
    try:
        hw = await get_config(conn, KEY_HARDWARE, DEFAULT_HARDWARE)
        if not isinstance(hw, dict):
            hw = dict(DEFAULT_HARDWARE)
    finally:
        await conn.close()
    from siren_sound import play_test_sound
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, lambda: play_test_sound(body.sound_type, body.preset or "preset1", hw))
    return {"success": True}


@app.put("/api/settings/system")
async def api_system_update(body: SystemSettingsUpdate):
    """Update system settings: notifications, WhatsApp, mobile link, advanced."""
    conn = await get_conn()
    try:
        system = await get_config(conn, KEY_SYSTEM, DEFAULT_SYSTEM)
        if not isinstance(system, dict):
            system = dict(DEFAULT_SYSTEM)
        if body.notifications is not None:
            system["notifications"] = {**(system.get("notifications") or {}), **body.notifications}
        if body.whatsapp is not None:
            system["whatsapp"] = {**(system.get("whatsapp") or {}), **body.whatsapp}
        if body.mobile_link is not None:
            system["mobile_link"] = {**(system.get("mobile_link") or {}), **body.mobile_link}
        if body.advanced is not None:
            system["advanced"] = {**(system.get("advanced") or {}), **body.advanced}
        await set_config(conn, KEY_SYSTEM, system)
        await audit(conn, "system_settings_update", "local", {})
        return system
    finally:
        await conn.close()


@app.put("/api/settings/site")
async def api_site_update(body: SiteUpdate):
    conn = await get_conn()
    try:
        site = await get_config(conn, KEY_SITE, DEFAULT_SITE)
        if not isinstance(site, dict):
            site = dict(DEFAULT_SITE)
        if body.name is not None:
            site["name"] = body.name
        if body.timezone is not None:
            site["timezone"] = body.timezone
        await set_config(conn, KEY_SITE, site)
        await audit(conn, "site_update", "local", site)
        return site
    finally:
        await conn.close()


# ----- Serve UI -----
UI_DIR = Path(__file__).resolve().parent / "ui"
if not UI_DIR.exists():
    UI_DIR = Path(__file__).resolve().parent.parent / "ui"

@app.get("/")
async def root():
    index = UI_DIR / "index.html"
    if index.exists():
        return FileResponse(index)
    return {"message": "STC Solutions AI API", "ui": "Mount /ui or place index.html in edge/server/ui/"}


if UI_DIR.exists():
    app.mount("/static", StaticFiles(directory=UI_DIR), name="static")
