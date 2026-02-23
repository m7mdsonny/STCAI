"""Capture one JPEG frame from RTSP. Used by live view and person snapshot save."""
from __future__ import annotations

import os
import time

_RTSP_REACHABLE_CACHE: dict[str, tuple[float, bool]] = {}
_RTSP_CACHE_TTL_SEC = 8


def _rtsp_precheck(rtsp_url: str) -> bool:
    url = (rtsp_url or "").strip()
    if not url:
        return False
    now = time.time()
    cached = _RTSP_REACHABLE_CACHE.get(url)
    if cached and now - cached[0] < _RTSP_CACHE_TTL_SEC:
        return cached[1]
    if "localhost" in url or "127.0.0.1" in url:
        _RTSP_REACHABLE_CACHE[url] = (now, True)
        return True
    ok = True
    try:
        from camera_connect import check_rtsp_reachable
        ok, _ = check_rtsp_reachable(url)
    except Exception:
        ok = True
    _RTSP_REACHABLE_CACHE[url] = (now, ok)
    return ok


def _open_capture(rtsp_url: str):
    import cv2

    rtsp_transport = (os.environ.get("RTSP_TRANSPORT") or "tcp").strip().lower()
    if rtsp_transport in {"tcp", "udp"} and "rtsp_transport=" not in rtsp_url:
        sep = "&" if "?" in rtsp_url else "?"
        rtsp_url = f"{rtsp_url}{sep}rtsp_transport={rtsp_transport}"

    cap = cv2.VideoCapture(rtsp_url.strip(), cv2.CAP_FFMPEG)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MS, int(os.environ.get("RTSP_OPEN_TIMEOUT_MS", "6000")))
    cap.set(cv2.CAP_PROP_READ_TIMEOUT_MS, int(os.environ.get("RTSP_READ_TIMEOUT_MS", "6000")))
    return cap


def capture_snapshot_sync(rtsp_url: str) -> bytes | None:
    """Blocking: capture one frame from RTSP, return JPEG bytes or None."""
    if not (rtsp_url or "").strip():
        return None
    try:
        import cv2

        if not _rtsp_precheck(rtsp_url):
            return None

        for _ in range(2):
            cap = _open_capture(rtsp_url)
            try:
                ret, frame = cap.read()
            finally:
                cap.release()
            if ret and frame is not None:
                ok, jpg = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
                if ok:
                    return jpg.tobytes()
        return None
    except Exception:
        return None
