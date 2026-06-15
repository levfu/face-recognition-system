# backend/app/services/log_service.py

from datetime import date
from sqlalchemy import func, cast, Date as SADate
from app.db.minio import upload_image
from app.db.postgres import AccessLog, Employee
import uuid


class LogService:

    def save_log(
        self,
        db,
        person_id: str | None,
        recognized: bool,
        confidence: float,
        image_bytes: bytes,
        camera_id: str = "default",
        access_granted: bool = False,
        action: str = 'check_in',
    ) -> str | None:
        """
        Ghi access log với chống spam:
        - Bỏ qua nếu không nhận diện được (recognized=False)
        - Bỏ qua nếu nhân viên đã có log cùng action hôm nay
        - Trả về: 'new_checkin' | 'already_checked_in' | None
        """
        if not recognized or not person_id:
            return None

        try:
            today = date.today()

            # ── Kiểm tra đã có log cùng action hôm nay chưa ──
            existing = (
                db.query(AccessLog)
                .filter(
                    AccessLog.person_id == person_id,
                    AccessLog.action == action,
                    func.cast(AccessLog.created_at, SADate) == today,
                )
                .first()
            )
            if existing:
                return "already_checked_in"

            # ── Upload snapshot ──
            snapshot_key = upload_image(
                image_bytes=image_bytes,
                folder="snapshots",
                filename=f"{uuid.uuid4()}.jpg"
            )

            # ── Snapshot employee info ──
            emp = db.query(Employee).filter(Employee.id == person_id).first()
            employee_code = emp.code if emp else None
            employee_name = emp.name if emp else None

            # Edge case: Qdrant delete failed → nhân viên đã nghỉ, bỏ qua
            if emp and not emp.is_active:
                return None

            # ── Ghi vào PostgreSQL ──
            log = AccessLog(
                person_id=person_id,
                employee_code=employee_code,
                employee_name=employee_name,
                action=action,
                recognized=True,
                confidence=confidence,
                snapshot_key=snapshot_key,
                camera_id=camera_id,
                access_granted=access_granted
            )
            db.add(log)
            db.commit()
            return "new_checkin"

        except Exception as e:
            print(f"[LogService] Error log: {e}")
            db.rollback()
            return None


log_service = LogService()
