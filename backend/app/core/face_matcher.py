# backend/app/core/face_matcher.py

from dataclasses import dataclass, field
from typing import Optional
import numpy as np
from app.config import settings


@dataclass
class MatchResult:
    """Kết quả sau khi so khớp embedding."""
    matched: bool
    person_id: Optional[str]
    name: Optional[str]
    confidence: float
    message: str
    score_2d: float = 0.0
    score_3d: Optional[float] = None


class FaceMatcher:

    def __init__(self):
        try:
            from app.db.qdrant import search_vector, get_person_info
            self._search_vector  = search_vector
            self._get_person_info = get_person_info
        except Exception as e:
            import traceback
            print(f"[ERROR][FaceMatcher.__init__] {type(e).__name__}: {e}")
            print(traceback.format_exc())
            self._search_vector   = lambda **kwargs: []
            self._get_person_info = lambda person_id: None

    def match(self, embedding: list[float], landmarks_3d=None) -> MatchResult:
        """
        Nhận embedding 512D → top-5 Qdrant → fusion 2D+3D → MatchResult.
        Nếu landmarks_3d=None hoặc payload thiếu, fallback 2D thuần.
        """
        try:
            import traceback as _tb
            top_k = 5 if settings.landmark_3d_enabled else 1
            results = self._search_vector(embedding=embedding, top_k=top_k)

            if not results:
                return MatchResult(
                    matched=False, person_id=None, name=None,
                    confidence=0.0, message="Không tìm thấy ai trong hệ thống",
                    score_2d=0.0, score_3d=None
                )

            best_final    = 0.0
            best_score_2d = 0.0
            best_score_3d = None
            best_cand     = None

            for cand in results:
                cosine_2d  = cand.score
                score_3d_c = None

                if (settings.landmark_3d_enabled
                        and landmarks_3d
                        and cand.payload.get("landmarks_3d")):
                    stored = cand.payload["landmarks_3d"]
                    a    = np.array(landmarks_3d, dtype=np.float32)
                    b    = np.array(stored,       dtype=np.float32)
                    dist = float(np.linalg.norm(a - b))
                    score_3d_c = max(0.0, 1.0 - dist / settings.landmark_d_max)
                    final = (settings.fusion_weight_2d * cosine_2d
                             + settings.fusion_weight_3d * score_3d_c)
                else:
                    final = cosine_2d

                if final > best_final:
                    best_final    = final
                    best_cand     = cand
                    best_score_2d = cosine_2d
                    best_score_3d = score_3d_c

            score   = best_final
            user_id = best_cand.payload.get("person_id")

            def _round3d(v):
                return round(v, 4) if v is not None else None

            if score < settings.ai_threshold:
                return MatchResult(
                    matched=False, person_id=None, name=None,
                    confidence=round(score, 4),
                    message="Không nhận ra khuôn mặt",
                    score_2d=round(best_score_2d, 4),
                    score_3d=_round3d(best_score_3d)
                )

            person = self._get_person_info(user_id)
            if not person:
                return MatchResult(
                    matched=False, person_id=user_id, name=None,
                    confidence=round(score, 4),
                    message="Người dùng không tồn tại trong hệ thống",
                    score_2d=round(best_score_2d, 4),
                    score_3d=_round3d(best_score_3d)
                )

            if not person.get("is_active", True):
                return MatchResult(
                    matched=False, person_id=user_id, name=person.get("name"),
                    confidence=round(score, 4),
                    message="Tài khoản đã bị vô hiệu hóa",
                    score_2d=round(best_score_2d, 4),
                    score_3d=_round3d(best_score_3d)
                )

            return MatchResult(
                matched=True, person_id=user_id, name=person.get("name"),
                confidence=round(score, 4),
                message="Xác nhận thành công",
                score_2d=round(best_score_2d, 4),
                score_3d=_round3d(best_score_3d)
            )

        except Exception as e:
            print(f"[ERROR][FaceMatcher] {type(e).__name__}: {e}")
            print(_tb.format_exc())
            return MatchResult(
                matched=False, person_id=None, name=None,
                confidence=0.0, message=f"Lỗi hệ thống: {str(e)}",
                score_2d=0.0, score_3d=None
            )


# Singleton
face_matcher = FaceMatcher()
