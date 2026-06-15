# backend/app/core/face_detector.py

import cv2
import numpy as np
import tensorflow as tf
tf.config.set_visible_devices([], 'GPU') 
from deepface import DeepFace
from dataclasses import dataclass
from typing import Optional

DETECTOR_BACKEND = "mtcnn"  
OVAL_GATE = {"cx": 0.5, "cy": 0.5, "rx": 0.15, "ry": 0.36}


@dataclass
class DetectedFace:
    """Kết quả sau khi detect 1 khuôn mặt."""
    face_array: np.ndarray      # ảnh đã crop + align, shape (112, 112, 3)
    bbox: dict                  # {"x": int, "y": int, "w": int, "h": int}
    confidence: float           # độ tin cậy của detector


@dataclass
class DetectionOutcome:
    face: Optional[DetectedFace]
    no_face_in_zone: bool       # True khi có mặt nhưng tất cả nằm ngoài oval


def _in_oval(bbox: dict, img_w: int, img_h: int) -> bool:
    """Tâm bbox có nằm trong oval gate không."""
    cx = (bbox["x"] + bbox["w"] / 2) / img_w
    cy = (bbox["y"] + bbox["h"] / 2) / img_h
    g = OVAL_GATE
    return ((cx - g["cx"]) / g["rx"]) ** 2 + ((cy - g["cy"]) / g["ry"]) ** 2 <= 1.0


class FaceDetector:

    def __init__(self, detector_backend: str = DETECTOR_BACKEND):
        self.detector_backend = detector_backend

    def detect(self, image: np.ndarray, apply_oval_gate: bool = True) -> DetectionOutcome:
        """
        Nhận ảnh numpy array (BGR) → DetectionOutcome.
        apply_oval_gate=True (mặc định): lọc mặt trong vùng oval (dùng cho Kiosk).
        apply_oval_gate=False: bỏ qua oval, chọn mặt to nhất trong toàn ảnh (dùng cho enroll).
        """
        img_h, img_w = image.shape[:2]
        try:
            results = DeepFace.extract_faces(
                img_path=image,
                detector_backend=self.detector_backend,
                align=True,
                enforce_detection=True
            )

            if not results:
                return DetectionOutcome(face=None, no_face_in_zone=False)

            if apply_oval_gate:
                candidates = [
                    r for r in results
                    if _in_oval(
                        {
                            "x": r.get("facial_area", {}).get("x", 0),
                            "y": r.get("facial_area", {}).get("y", 0),
                            "w": r.get("facial_area", {}).get("w", 0),
                            "h": r.get("facial_area", {}).get("h", 0),
                        },
                        img_w, img_h
                    )
                ]
                if not candidates:
                    return DetectionOutcome(face=None, no_face_in_zone=True)
            else:
                candidates = results

            best = max(
                candidates,
                key=lambda r: r.get("facial_area", {}).get("w", 0)
                              * r.get("facial_area", {}).get("h", 0)
            )

            face_arr = (best["face"] * 255).astype(np.uint8)
            face_arr = cv2.resize(face_arr, (112, 112))
            face_arr = cv2.cvtColor(face_arr, cv2.COLOR_RGB2BGR)

            facial_area = best.get("facial_area", {})
            bbox = {
                "x": facial_area.get("x", 0),
                "y": facial_area.get("y", 0),
                "w": facial_area.get("w", 0),
                "h": facial_area.get("h", 0),
            }

            return DetectionOutcome(
                face=DetectedFace(
                    face_array=face_arr,
                    bbox=bbox,
                    confidence=best.get("confidence", 0.0)
                ),
                no_face_in_zone=False
            )

        except ValueError:
            return DetectionOutcome(face=None, no_face_in_zone=False)
        except Exception as e:
            print(f"[FaceDetector] Error: {e}")
            return DetectionOutcome(face=None, no_face_in_zone=False)

    def detect_from_bytes(self, image_bytes: bytes, apply_oval_gate: bool = True) -> DetectionOutcome:
        """Nhận raw bytes (từ upload hoặc WebSocket) → detect."""
        nparr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if image is None:
            return DetectionOutcome(face=None, no_face_in_zone=False)
        return self.detect(image, apply_oval_gate=apply_oval_gate)


# Singleton — dùng chung toàn app, tránh load model nhiều lần
face_detector = FaceDetector(detector_backend=DETECTOR_BACKEND)
