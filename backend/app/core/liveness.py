# backend/app/core/liveness.py
import os
import logging
import tempfile
import numpy as np
from dataclasses import dataclass
from deepface import DeepFace
from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class LivenessResult:
    is_live: bool
    score: float
    message: str


class LivenessDetector:
    """MiniFASNet anti-spoofing via DeepFace built-in (>=0.0.93)."""

    def check(self, face_array: np.ndarray, image_bytes: bytes = None) -> LivenessResult:
        if not settings.liveness_enabled:
            return LivenessResult(is_live=True, score=1.0, message="Liveness tat")

        if image_bytes is None:
            logger.error("[Liveness] image_bytes=None - cannot run anti-spoof")
            return LivenessResult(is_live=True, score=1.0, message="No bytes")

        tmp_path = None
        try:
            # Write FULL image (not cropped face) to temp file
            with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
                f.write(image_bytes)
                tmp_path = f.name

            results = DeepFace.extract_faces(
                img_path=tmp_path,
                detector_backend="mtcnn",
                anti_spoofing=True,
                enforce_detection=False,
            )

            if not results:
                logger.warning("[Liveness] DeepFace returned no faces")
                # Cannot judge -> pass through, let recognition handle no-face case
                return LivenessResult(is_live=True, score=1.0, message="No face")

            face = results[0]
            is_real = bool(face.get("is_real", True))
            anti_score = float(face.get("antispoof_score", 1.0))

            logger.info(
                f"[Liveness] is_real={is_real} score={anti_score:.4f} "
                f"keys={list(face.keys())}"
            )

            if not is_real:
                return LivenessResult(
                    is_live=False,
                    score=anti_score,
                    message=f"Spoofing detected (score={anti_score:.2f})"
                )

            return LivenessResult(is_live=True, score=anti_score, message="OK")

        except TypeError as e:
            logger.error(f"[Liveness] TypeError (deepface version too old?): {e}")
            return LivenessResult(is_live=True, score=1.0, message="Liveness unavailable")
        except Exception as e:
            import traceback
            logger.error(f"[Liveness] Exception: {type(e).__name__}: {e}")
            logger.error(traceback.format_exc())
            return LivenessResult(is_live=True, score=1.0, message="Liveness error")
        finally:
            if tmp_path and os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                except Exception:
                    pass


liveness_detector = LivenessDetector()
