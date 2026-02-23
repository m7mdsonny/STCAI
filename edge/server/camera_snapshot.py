"""Capture one JPEG frame from RTSP. Used by live view and person snapshot save."""
from __future__ import annotations


def capture_snapshot_sync(rtsp_url: str) -> bytes | None:
    """Blocking: capture one frame from RTSP, return JPEG bytes or None."""
    if not (rtsp_url or "").strip():
        return None
    try:
        import cv2
        cap = cv2.VideoCapture(rtsp_url.strip())
        cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MS, 5000)
        cap.set(cv2.CAP_PROP_READ_TIMEOUT_MS, 5000)
        ret, frame = cap.read()
        cap.release()
        if not ret or frame is None:
            return None
        _, jpg = cv2.imencode(".jpg", frame)
        return jpg.tobytes()
    except Exception:
        return None
