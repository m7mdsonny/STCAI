"""
STC Solutions AI - Event Engine (stub).
Multi-frame validation, risk score, dedup, hardware trigger.
See docs/edge/01-edge-core-spec.md § 4.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger("event_engine")

# Config (from sync config or local)
CONSECUTIVE_FRAMES = 1  # 1 = emit on first detection (demo); use 2+ for production
CONFIDENCE_THRESHOLD = 0.6
DEDUP_SECONDS = 45


@dataclass
class Detection:
    camera_id: str
    model: str
    class_name: str
    confidence: float
    timestamp: float
    payload: dict | None = None


@dataclass
class Event:
    event_id: str
    type: str
    priority: str
    risk_score: float
    camera_id: str
    zone_id: str | None
    occurred_at: str
    payload: dict[str, Any]


def _risk_score(d: Detection) -> float:
    """Base score from class and confidence."""
    base = {"fire": 90, "smoke": 70, "intrusion": 60, "loitering": 50, "person": 25}.get(d.class_name, 50)
    return min(100, base * (0.5 + 0.5 * d.confidence))


def _priority(score: float) -> str:
    if score >= 80:
        return "critical"
    if score >= 60:
        return "high"
    if score >= 40:
        return "medium"
    return "low"


def process_detection(det: Detection, frame_buffer: dict, last_events: dict) -> Event | None:
    """
    Stub: require CONSECUTIVE_FRAMES above threshold; dedup by camera+type.
    Returns Event if should emit, else None.
    """
    key = (det.camera_id, det.class_name)
    if det.confidence < CONFIDENCE_THRESHOLD:
        frame_buffer[key] = []
        return None
    buf = frame_buffer.get(key, [])
    buf.append(det.timestamp)
    if len(buf) > CONSECUTIVE_FRAMES:
        buf.pop(0)
    frame_buffer[key] = buf
    if len(buf) < CONSECUTIVE_FRAMES:
        return None
    # Dedup
    last = last_events.get(key, 0)
    if time.time() - last < DEDUP_SECONDS:
        return None
    last_events[key] = time.time()
    score = _risk_score(det)
    event_id = f"{det.camera_id}-{det.class_name}-{int(det.timestamp)}"
    payload = {"model": det.model, "confidence": det.confidence}
    if getattr(det, "payload", None):
        payload = {**payload, **det.payload}
    return Event(
        event_id=event_id,
        type=det.class_name,
        priority=_priority(score),
        risk_score=score,
        camera_id=det.camera_id,
        zone_id=None,
        occurred_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(det.timestamp)),
        payload=payload,
    )


def trigger_hardware(event: Event) -> None:
    """Stub: send siren/relay command. Target <500ms. See docs/edge/03-hardware-automation.md."""
    logger.info("Hardware trigger: event=%s priority=%s", event.event_id, event.priority)
    # TODO: GPIO / MQTT / Modbus
    pass
