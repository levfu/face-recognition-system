# backend/tests/test_recognition.py

import pytest
import numpy as np
from unittest.mock import patch, MagicMock
from app.core.face_matcher import FaceMatcher, MatchResult
from app.core.liveness import LivenessDetector, LivenessResult
from app.services.recognition_service import RecognitionService


# ── Fixtures ──
@pytest.fixture
def sample_embedding():
    """Embedding vector 512 chiều giả."""
    vec = np.random.rand(512).tolist()
    norm = sum(x**2 for x in vec) ** 0.5
    return [x / norm for x in vec]


@pytest.fixture
def sample_face_array():
    """Ảnh khuôn mặt giả 112x112."""
    return np.random.randint(0, 255, (112, 112, 3), dtype=np.uint8)


@pytest.fixture
def sample_image_bytes():
    import cv2
    img = np.random.randint(0, 255, (224, 224, 3), dtype=np.uint8)
    _, buffer = cv2.imencode(".jpg", img)
    return buffer.tobytes()


# ── Test FaceMatcher ──
class TestFaceMatcher:

    def test_match_success(self, sample_embedding):
        """Embedding khớp → trả về MatchResult với matched=True."""
        mock_result = MagicMock()
        mock_result.score = 0.85
        mock_result.payload = {"person_id": "emp_001"}

        matcher = FaceMatcher.__new__(FaceMatcher)
        matcher._search_vector = MagicMock(return_value=[mock_result])
        matcher._get_person_info = MagicMock(return_value={
            "name": "Nguyen Van A",
            "is_active": True
        })

        with patch("app.config.settings") as mock_settings:
            mock_settings.ai_threshold = 0.5
            result = matcher.match(sample_embedding)

        assert result.matched is True
        assert result.name == "Nguyen Van A"
        assert result.confidence == 0.85

    def test_match_below_threshold(self, sample_embedding):
        """Score thấp hơn threshold → matched=False."""
        mock_result = MagicMock()
        mock_result.score = 0.3
        mock_result.payload = {"person_id": "emp_001"}

        matcher = FaceMatcher.__new__(FaceMatcher)
        matcher._search_vector = MagicMock(return_value=[mock_result])
        matcher._get_person_info = MagicMock()

        with patch("app.config.settings") as mock_settings:
            mock_settings.ai_threshold = 0.5
            result = matcher.match(sample_embedding)

        assert result.matched is False
        assert result.person_id is None

    def test_match_inactive_user(self, sample_embedding):
        """User bị vô hiệu hóa → matched=False."""
        mock_result = MagicMock()
        mock_result.score = 0.9
        mock_result.payload = {"person_id": "emp_002"}

        matcher = FaceMatcher.__new__(FaceMatcher)
        matcher._search_vector = MagicMock(return_value=[mock_result])
        matcher._get_person_info = MagicMock(return_value={
            "name": "Nguyen Van B",
            "is_active": False   # ← bị block
        })

        with patch("app.config.settings") as mock_settings:
            mock_settings.ai_threshold = 0.5
            result = matcher.match(sample_embedding)

        assert result.matched is False
        assert "Disable" in result.message

    def test_no_results_from_qdrant(self, sample_embedding):
        """Qdrant trả về rỗng → matched=False."""
        matcher = FaceMatcher.__new__(FaceMatcher)
        matcher._search_vector = MagicMock(return_value=[])
        matcher._get_person_info = MagicMock()

        with patch("app.config.settings") as mock_settings:
            mock_settings.ai_threshold = 0.5
            result = matcher.match(sample_embedding)

        assert result.matched is False


# ── Test LivenessDetector ──
class TestLivenessDetector:

    def test_liveness_disabled(self, sample_face_array):
        """Khi liveness tắt → luôn trả về is_live=True."""
        with patch("app.config.settings") as mock_settings:
            mock_settings.liveness_enabled = False
            detector = LivenessDetector()
            result = detector.check(sample_face_array)
            assert result.is_live is True

    def test_score_range(self, sample_face_array):
        """Score phải nằm trong khoảng 0-1."""
        with patch("app.config.settings") as mock_settings:
            mock_settings.liveness_enabled = True
            detector = LivenessDetector()
            result = detector.check(sample_face_array)
            assert 0.0 <= result.score <= 1.0

    def test_returns_liveness_result(self, sample_face_array):
        """Phải trả về đúng kiểu LivenessResult."""
        with patch("app.config.settings") as mock_settings:
            mock_settings.liveness_enabled = True
            detector = LivenessDetector()
            result = detector.check(sample_face_array)
            assert isinstance(result, LivenessResult)
            assert isinstance(result.is_live, bool)
            assert isinstance(result.message, str)


# ── Test RecognitionService ──
class TestRecognitionService:

    def test_no_face_detected(self, sample_image_bytes):
        """Không detect được mặt → access_granted=False."""
        service = RecognitionService()

        with patch(
            "app.services.recognition_service.face_detector"
        ) as mock_detector:
            mock_detector.detect_from_bytes.return_value = None
            result = service.recognize(sample_image_bytes)

        assert result.success is False
        assert result.access_granted is False
        assert result.matched is False

    def test_fake_face_blocked(self, sample_image_bytes):
        """Phát hiện ảnh giả → access_granted=False."""
        service = RecognitionService()

        mock_detected = MagicMock()
        mock_detected.face_array = np.zeros((112, 112, 3), dtype=np.uint8)
        mock_detected.bbox = {"x": 0, "y": 0, "w": 100, "h": 100}

        with patch(
            "app.services.recognition_service.face_detector"
        ) as mock_detector, patch(
            "app.services.recognition_service.liveness_detector"
        ) as mock_liveness:
            mock_detector.detect_from_bytes.return_value = mock_detected
            mock_liveness.check.return_value = LivenessResult(
                is_live=False,
                score=0.2,
                message="Spoofing detected"
            )
            result = service.recognize(sample_image_bytes)

        assert result.is_live is False
        assert result.access_granted is False

    def test_successful_recognition(self, sample_image_bytes):
        """Nhận diện thành công → access_granted=True."""
        service = RecognitionService()

        mock_detected = MagicMock()
        mock_detected.face_array = np.zeros((112, 112, 3), dtype=np.uint8)
        mock_detected.bbox = {"x": 10, "y": 10, "w": 80, "h": 80}

        with patch(
            "app.services.recognition_service.face_detector"
        ) as mock_detector, patch(
            "app.services.recognition_service.liveness_detector"
        ) as mock_liveness, patch(
            "app.services.recognition_service.face_embedder"
        ) as mock_embedder, patch(
            "app.services.recognition_service.face_matcher"
        ) as mock_matcher:

            mock_detector.detect_from_bytes.return_value = mock_detected
            mock_liveness.check.return_value = LivenessResult(
                is_live=True, score=0.9, message="Real face"
            )
            mock_embedder.get_embedding.return_value = [0.1] * 512
            mock_matcher.match.return_value = MatchResult(
                matched=True,
                person_id="emp_001",
                name="Nguyen Van A",
                confidence=0.92,
                message="Confirm successfully"
            )

            result = service.recognize(sample_image_bytes)

        assert result.success is True
        assert result.matched is True
        assert result.access_granted is True
        assert result.name == "Nguyen Van A"
        assert result.confidence == 0.92