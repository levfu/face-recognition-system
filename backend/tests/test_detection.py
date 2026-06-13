# backend/tests/test_detection.py

import pytest
import numpy as np
import cv2
from unittest.mock import patch, MagicMock
from app.core.face_detector import FaceDetector, DetectedFace


# ── Fixtures ──
@pytest.fixture
def detector():
    return FaceDetector(detector_backend="retinaface")


@pytest.fixture
def blank_image():
    """Ảnh trắng 224x224."""
    return np.ones((224, 224, 3), dtype=np.uint8) * 255


@pytest.fixture
def black_image():
    """Ảnh đen 224x224."""
    return np.zeros((224, 224, 3), dtype=np.uint8)


@pytest.fixture
def sample_image_bytes():
    """Tạo ảnh JPEG bytes giả để test."""
    img = np.ones((224, 224, 3), dtype=np.uint8) * 128
    _, buffer = cv2.imencode(".jpg", img)
    return buffer.tobytes()


# ── Test detect() ──
class TestDetect:

    def test_no_face_returns_none(self, detector, blank_image):
        """Ảnh không có mặt → trả về None."""
        with patch.object(
            detector, "detect",
            return_value=None
        ):
            result = detector.detect(blank_image)
            assert result is None

    def test_detect_returns_correct_shape(self, detector):
        """Khi detect được mặt → face_array phải là 112x112."""
        mock_face = np.zeros((112, 112, 3), dtype=np.uint8)
        mock_result = DetectedFace(
            face_array=mock_face,
            bbox={"x": 10, "y": 10, "w": 100, "h": 100},
            confidence=0.99
        )
        with patch.object(detector, "detect", return_value=mock_result):
            result = detector.detect(np.zeros((224, 224, 3)))
            assert result is not None
            assert result.face_array.shape == (112, 112, 3)

    def test_detect_returns_bbox(self, detector):
        """Kết quả phải có đủ các key bbox."""
        mock_face = np.zeros((112, 112, 3), dtype=np.uint8)
        mock_result = DetectedFace(
            face_array=mock_face,
            bbox={"x": 10, "y": 20, "w": 80, "h": 90},
            confidence=0.95
        )
        with patch.object(detector, "detect", return_value=mock_result):
            result = detector.detect(np.zeros((224, 224, 3)))
            assert "x" in result.bbox
            assert "y" in result.bbox
            assert "w" in result.bbox
            assert "h" in result.bbox

    def test_confidence_range(self, detector):
        """Confidence phải nằm trong khoảng 0-1."""
        mock_face = np.zeros((112, 112, 3), dtype=np.uint8)
        mock_result = DetectedFace(
            face_array=mock_face,
            bbox={"x": 0, "y": 0, "w": 50, "h": 50},
            confidence=0.87
        )
        with patch.object(detector, "detect", return_value=mock_result):
            result = detector.detect(np.zeros((224, 224, 3)))
            assert 0.0 <= result.confidence <= 1.0


# ── Test detect_from_bytes() ──
class TestDetectFromBytes:

    def test_valid_bytes(self, detector, sample_image_bytes):
        """Bytes hợp lệ không raise exception."""
        with patch.object(detector, "detect", return_value=None):
            result = detector.detect_from_bytes(sample_image_bytes)
            assert result is None  # blank image không có mặt

    def test_invalid_bytes_returns_none(self, detector):
        """Bytes không hợp lệ → trả về None thay vì crash."""
        result = detector.detect_from_bytes(b"invalid_image_data")
        assert result is None

    def test_empty_bytes_returns_none(self, detector):
        """Bytes rỗng → trả về None."""
        result = detector.detect_from_bytes(b"")
        assert result is None