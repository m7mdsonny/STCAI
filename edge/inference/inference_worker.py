"""
STC Solutions AI - AI Inference Worker
ONNX GPU, batch inference, per-camera threshold, ROI.
Latency target: contribute to <500ms event path.
See docs/edge/01-edge-core-spec.md, 02-ai-modules.md
"""

from __future__ import annotations

import argparse
import logging
import time
from pathlib import Path
from typing import Any

# import numpy as np
# import onnxruntime as ort

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("inference_worker")


def load_model(model_path: Path, use_gpu: bool = True) -> Any:
    """Load ONNX model; prefer GPU execution provider."""
    # providers = ["CUDAExecutionProvider", "CPUExecutionProvider"] if use_gpu else ["CPUExecutionProvider"]
    # return ort.InferenceSession(str(model_path), providers=providers)
    logger.info("Model load stub: %s (gpu=%s)", model_path, use_gpu)
    return None


def run_inference(session: Any, batch_frames: list[Any]) -> list[dict]:
    """Run batch inference; return list of detections per frame."""
    # inputs = prepare_inputs(batch_frames)
    # outputs = session.run(None, inputs)
    # return parse_detections(outputs, batch_frames)
    return []


def main() -> None:
    parser = argparse.ArgumentParser(description="STC Solutions AI Inference Worker")
    parser.add_argument("--model", type=Path, default=Path("models/fire_v1.onnx"), help="ONNX model path")
    parser.add_argument("--no-gpu", action="store_true", help="Use CPU only")
    args = parser.parse_args()

    logger.info("Starting inference worker")
    session = load_model(args.model, use_gpu=not args.no_gpu)

    # TODO: connect to frame queue (Redis, ZMQ, or shared memory from ingestion)
    # TODO: batch frames, run_inference(session, batch), push detections to event engine
    # TODO: backpressure: if queue full, drop or reduce FPS
    while True:
        time.sleep(1.0)
        # batch = get_next_batch()
        # if batch:
        #     detections = run_inference(session, batch)
        #     send_to_event_engine(detections)


if __name__ == "__main__":
    main()
