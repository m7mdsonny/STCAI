"""
STC Solutions AI - Fire, Smoke, Anti-theft, Person detection modules.
Each module returns detections (camera_id, model, class_name, confidence).
Production: ONNX inference; here: configurable mock for standalone demo.
"""
from __future__ import annotations

import random
import time
from dataclasses import dataclass
from typing import Any


@dataclass
class Detection:
    camera_id: str
    model: str
    class_name: str
    confidence: float
    timestamp: float
    zone_id: str | None = None
    payload: dict | None = None


# Fire & Smoke: classes fire, smoke, spark
def run_fire_smoke(camera_id: str, sensitivity: float, _frame: Any = None) -> list[Detection]:
    """Fire/smoke module. Real impl: ONNX model on frame."""
    out = []
    # Mock: demo probability so events appear regularly (production: ONNX)
    if random.random() < 0.06 * sensitivity:
        out.append(Detection(
            camera_id=camera_id,
            model="fire_smoke_v1",
            class_name=random.choice(["fire", "smoke"]),
            confidence=round(0.6 + random.random() * 0.35, 2),
            timestamp=time.time(),
        ))
    return out


# Anti-theft: intrusion, loitering, tampering
def run_anti_theft(
    camera_id: str,
    sensitivity: float,
    _frame: Any = None,
    event_types: list[str] | None = None,
) -> list[Detection]:
    """Anti-theft module. event_types: only emit these (e.g. ["intrusion", "loitering"])."""
    out = []
    types = event_types if event_types else ["intrusion", "loitering"]
    if not types:
        return out
    if random.random() < 0.05 * sensitivity:
        out.append(Detection(
            camera_id=camera_id,
            model="anti_theft_v1",
            class_name=random.choice(types),
            confidence=round(0.55 + random.random() * 0.4, 2),
            timestamp=time.time(),
        ))
    return out


# Person: count, age range, gender (analytics)
def run_person(camera_id: str, sensitivity: float, _frame: Any = None) -> list[Detection]:
    """Person detection: count, age, gender. Real impl: ONNX person/age/gender model."""
    out = []
    if random.random() < 0.12 * sensitivity:
        n = random.randint(1, 5)
        age = random.choice(["child", "teen", "adult", "senior"])
        gender = random.choice(["male", "female", "unknown"])
        out.append(Detection(
            camera_id=camera_id,
            model="person_v1",
            class_name="person",
            confidence=round(0.7 + random.random() * 0.25, 2),
            timestamp=time.time(),
            payload={"count": n, "age_range": age, "gender": gender},
        ))
    return out


def run_detectors(
    camera_id: str,
    modules: list[str],
    sensitivity: float,
    frame: Any = None,
    ai_modules: dict | None = None,
) -> list[Detection]:
    """Run enabled modules for one camera; return all detections. ai_modules: config from system.advanced.ai_modules."""
    dets = []
    ai = ai_modules or {}
    if "fire" in modules or "smoke" in modules:
        dets.extend(run_fire_smoke(camera_id, sensitivity, frame))
    if "anti_theft" in modules:
        theft_cfg = ai.get("anti_theft") or {}
        event_types = theft_cfg.get("event_types")
        if not event_types and "event_types" not in theft_cfg:
            event_types = ["intrusion", "loitering"]
        dets.extend(run_anti_theft(camera_id, sensitivity, frame, event_types=event_types))
    if "person" in modules:
        dets.extend(run_person(camera_id, sensitivity, frame))
    return dets
