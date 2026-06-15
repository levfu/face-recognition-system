# backend/app/services/recognition_service.py

import logging
from dataclasses import dataclass
from typing import Optional

from app.core.face_detector import face_detector
from app.core.face_embedder import face_embedder
from app.core.face_matcher import face_matcher, MatchResult
from app.core.liveness import liveness_detector
from app.core.landmark_3d import compute_landmarks_3d
from app.services.log_service import log_service
from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class RecognitionResult:
    success: bool
    matched: bool
    person_id: Optional[str]
    name: Optional[str]
    confidence: float
    bbox: dict
    is_live: bool
    message: str
    access_granted: bool
    score_2d: float = 0.0
    score_3d: Optional[float] = None
    checkin_status: Optional[str] = None


class RecognitionService:

    def recognize(
        self,
        image_bytes: bytes,
        camera_id: str = "default",
        db=None
    ) -> RecognitionResult:
        import traceback as _tb

        try:
            outcome = face_detector.detect_from_bytes(image_bytes)
            if outcome.no_face_in_zone:
                return RecognitionResult(
                    success=False, matched=False, person_id=None, name=None,
                    confidence=0.0, bbox={}, is_live=False,
                    message="no_face_in_zone", access_granted=False
                )
            detected = outcome.face
            if detected is None:
                return RecognitionResult(
                    success=False, matched=False, person_id=None, name=None,
                    confidence=0.0, bbox={}, is_live=False,
                    message="No face detected", access_granted=False
                )

            try:
                liveness = liveness_detector.check(detected.face_array, image_bytes=image_bytes)
            except Exception as _e2:
                print(f"[RECOGNIZE ERROR] liveness: {type(_e2).__name__}: {_e2}", flush=True)
                print(_tb.format_exc(), flush=True)
                raise
            if not liveness.is_live:
                return RecognitionResult(
                    success=False, matched=False, person_id=None, name=None,
                    confidence=0.0, bbox=detected.bbox, is_live=False,
                    message=liveness.message, access_granted=False
                )

            try:
                embedding = face_embedder.get_embedding(detected.face_array)
            except Exception as _e3:
                print(f"[RECOGNIZE ERROR] embedder: {type(_e3).__name__}: {_e3}", flush=True)
                print(_tb.format_exc(), flush=True)
                raise

            landmarks_3d = None
            if settings.landmark_3d_enabled:
                try:
                    landmarks_3d = compute_landmarks_3d(image_bytes)
                except Exception as _e:
                    print(f"[ERROR][Landmark block] {type(_e).__name__}: {_e}", flush=True)
                    print(_tb.format_exc(), flush=True)

            match: MatchResult = face_matcher.match(embedding, landmarks_3d=landmarks_3d)
            print(
                f"[Fusion] camera={camera_id} 2D={match.score_2d:.4f} "
                f"3D={match.score_3d} final={match.confidence:.4f}",
                flush=True
            )

            access_granted = match.matched and liveness.is_live

            checkin_status = None
            if db and match.matched:
                try:
                    checkin_status = log_service.save_log(
                        db=db,
                        person_id=match.person_id,
                        recognized=True,
                        confidence=match.confidence,
                        image_bytes=image_bytes,
                        camera_id=camera_id,
                        access_granted=access_granted
                    )
                except Exception as _e7:
                    print(f"[RECOGNIZE ERROR] save_log: {type(_e7).__name__}: {_e7}", flush=True)
                    print(_tb.format_exc(), flush=True)
                    raise

            return RecognitionResult(
                success=True,
                matched=match.matched,
                person_id=match.person_id,
                name=match.name,
                confidence=match.confidence,
                bbox=detected.bbox,
                is_live=liveness.is_live,
                message=match.message,
                access_granted=access_granted,
                checkin_status=checkin_status,
                score_2d=match.score_2d,
                score_3d=match.score_3d,
            )

        except Exception as e:
            print(f"[RECOGNIZE ERROR] {type(e).__name__}: {e}", flush=True)
            print(_tb.format_exc(), flush=True)
            raise


    def commit_log(
        self,
        db,
        person_id: str,
        action: str = 'check_in',
        confidence: float = 0.0,
        image_bytes: Optional[bytes] = None,
        camera_id: str = "default",
        access_granted: bool = False,
    ) -> dict:
        from datetime import date, datetime as _dt
        from sqlalchemy import func, cast
        from sqlalchemy import Date as SADate
        from app.db.postgres import AccessLog, Employee

        today = date.today()

        existing_in = db.query(AccessLog).filter(
            AccessLog.person_id == person_id,
            AccessLog.action == 'check_in',
            func.cast(AccessLog.created_at, SADate) == today,
        ).first()

        existing_out = db.query(AccessLog).filter(
            AccessLog.person_id == person_id,
            AccessLog.action == 'check_out',
            func.cast(AccessLog.created_at, SADate) == today,
        ).first()

        if action == 'check_in':
            if existing_in:
                return {
                    "status": "already_checked_in",
                    "first_time": existing_in.created_at,
                    "message": f"You already checked in at {existing_in.created_at.strftime('%H:%M')}",
                }
        elif action == 'check_out':
            if not existing_in:
                return {
                    "status": "no_checkin_yet",
                    "message": "You have not checked in today. Please check in first.",
                }
            if existing_out:
                return {
                    "status": "already_checked_out",
                    "first_time": existing_out.created_at,
                    "message": f"You already checked out at {existing_out.created_at.strftime('%H:%M')}",
                }
        else:
            return {"status": "invalid_action"}

        snapshot_key = None
        if image_bytes:
            from app.db.minio import upload_image
            import uuid as _uuid
            try:
                snapshot_key = upload_image(
                    image_bytes=image_bytes,
                    folder="snapshots",
                    filename=f"{_uuid.uuid4()}.jpg",
                )
            except Exception as _snap_e:
                print(f"[commit_log] Snapshot upload failed: {_snap_e}")

        emp = db.query(Employee).filter(Employee.id == person_id).first()
        if emp and not emp.is_active:
            return {"status": "employee_inactive"}

        now = _dt.now()
        new_log = AccessLog(
            person_id=person_id,
            employee_code=emp.code if emp else None,
            employee_name=emp.name if emp else None,
            action=action,
            recognized=True,
            confidence=confidence,
            snapshot_key=snapshot_key,
            camera_id=camera_id,
            access_granted=access_granted,
            created_at=now,
        )
        try:
            db.add(new_log)
            db.commit()
            db.refresh(new_log)
        except Exception as _db_e:
            db.rollback()
            print(f"[commit_log] DB write failed: {_db_e}")
            return {"status": "db_error", "message": str(_db_e)}

        return {
            "status": "success",
            "action": action,
            "log_id": new_log.id,
            "time": new_log.created_at,
            "message": "Check-in successful" if action == 'check_in' else "Check-out successful",
        }


recognition_service = RecognitionService()