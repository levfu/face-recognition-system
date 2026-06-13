# backend/app/core/landmark_3d.py

import os
import threading
import logging
import urllib.request

import cv2
import numpy as np

logger = logging.getLogger(__name__)

MODEL_PATH = "/app/models/face_landmarker.task"
MODEL_URL  = (
    "https://storage.googleapis.com/mediapipe-models/"
    "face_landmarker/face_landmarker/float16/1/face_landmarker.task"
)

_landmarker = None
_lock       = threading.Lock()


def _load_landmarker():
    global _landmarker
    if _landmarker is not None:
        return _landmarker

    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    if not os.path.exists(MODEL_PATH):
        logger.info("Downloading MediaPipe face_landmarker.task (~10 MB) ...")
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
        logger.info("MediaPipe face_landmarker.task downloaded")

    try:
        import mediapipe as mp
        from mediapipe.tasks.python import vision
        from mediapipe.tasks.python.core.base_options import BaseOptions

        opts = vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=MODEL_PATH),
            num_faces=1,
            min_face_detection_confidence=0.5,
            min_face_presence_confidence=0.5,
            min_tracking_confidence=0.5,
            output_face_blendshapes=False,
            output_facial_transformation_matrixes=False,
        )
        _landmarker = vision.FaceLandmarker.create_from_options(opts)
        logger.info("MediaPipe Face Landmarker loaded")
    except Exception as exc:
        import traceback
        print(f"[ERROR][Landmark3D load] {type(exc).__name__}: {exc}")
        print(traceback.format_exc())
        logger.error(f"[Landmark3D] load failed: {exc}")
        _landmarker = None

    return _landmarker


def compute_landmarks_3d(image_bytes: bytes) -> list[float] | None:
    """
    Returns flat list 1434 floats [x0,y0,z0, x1,y1,z1, ...] (478 lm x 3)
    or None if MediaPipe unavailable / no face detected.
    """
    with _lock:
        landmarker = _load_landmarker()
    if landmarker is None:
        return None

    try:
        import mediapipe as mp

        nparr   = np.frombuffer(image_bytes, np.uint8)
        img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img_bgr is None:
            return None
        img_rgb  = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)

        with _lock:
            result = landmarker.detect(mp_image)

        if not result.face_landmarks:
            return None

        flat = []
        for lm in result.face_landmarks[0]:
            flat.extend([lm.x, lm.y, lm.z])
        return flat

    except Exception as exc:
        import traceback
        print(f"[ERROR][Landmark3D compute] {type(exc).__name__}: {exc}")
        print(traceback.format_exc())
        logger.warning(f"[Landmark3D] compute failed: {exc}")
        return None
