# backend/app/services/enrollment_service.py

import logging
from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.face_detector import face_detector
from app.core.face_embedder import face_embedder
from app.db.minio import delete_object, upload_image
from app.db.postgres import Employee, FaceImage
from app.db.qdrant import delete_by_person, upsert_vector

logger = logging.getLogger(__name__)


@dataclass
class EnrollmentResult:
    success: bool
    person_id: str | None
    message: str
    points_created: int = 0


def check_employee_exists(emp_code: str, db: Session) -> dict | None:
    """Trả về {emp_code, name, points_count} nếu active employee tồn tại, None nếu chưa."""
    employee = db.query(Employee).filter(
        Employee.code == emp_code, Employee.is_active == True
    ).first()
    if not employee:
        return None
    points_count = (
        db.query(FaceImage).filter(FaceImage.person_id == employee.id).count()
    )
    return {"emp_code": employee.code, "name": employee.name, "points_count": points_count}


def delete_employee_completely(emp_code: str, db: Session) -> None:
    """Xóa employee khỏi 4 nơi theo thứ tự an toàn."""
    employee = db.query(Employee).filter(
        Employee.code == emp_code, Employee.is_active == True
    ).first()
    if not employee:
        return

    employee_uuid = str(employee.id)
    face_images   = db.query(FaceImage).filter(FaceImage.person_id == employee_uuid).all()
    minio_keys    = [fi.minio_key for fi in face_images if fi.minio_key]

    try:
        delete_by_person(employee_uuid)
    except Exception as e:
        logger.warning("[Delete] Qdrant delete failed for %s: %s", emp_code, e)

    for key in minio_keys:
        try:
            delete_object(key, folder="faces")
        except Exception as e:
            logger.warning("[Delete] MinIO delete failed for %s: %s", key, e)

    db.delete(employee)
    db.commit()
    logger.info(
        "[Delete] Deleted %s — %d face image(s) removed", emp_code, len(minio_keys)
    )


# ── Service ──

class EnrollmentService:

    def enroll(
        self,
        images_bytes: list[bytes],
        person_code: str,
        name: str,
        force: bool,
        db: Session,
        landmarks_list: list | None = None,
    ) -> EnrollmentResult:
        existing = check_employee_exists(person_code, db)
        if existing and not force:
            raise HTTPException(
                status_code=409,
                detail={
                    "detail": "Mã nhân viên đã tồn tại",
                    "existing": existing,
                },
            )
        if existing and force:
            logger.info("[Enroll] force=True — replacing employee %s", person_code)
            delete_employee_completely(person_code, db)

        employee = Employee(name=name, code=person_code)
        db.add(employee)
        db.flush()

        points_created = 0
        for idx, image_bytes in enumerate(images_bytes):
            outcome = face_detector.detect_from_bytes(image_bytes, apply_oval_gate=False)
            if outcome.face is None:
                logger.warning("[Enroll] Ảnh %d/%d: không detect được mặt, bỏ qua", idx + 1, len(images_bytes))
                continue

            embedding = face_embedder.get_embedding(outcome.face.face_array)
            minio_key = upload_image(
                image_bytes=image_bytes,
                folder="faces",
                filename=f"{person_code}_{id(image_bytes)}.jpg",
            )
            lms = landmarks_list[idx] if landmarks_list and idx < len(landmarks_list) else None
            qdrant_id = upsert_vector(
                embedding=embedding,
                person_id=str(employee.id),
                code=person_code,
                name=name,
                image_index=idx,
                landmarks=lms,
            )
            db.add(FaceImage(
                person_id=str(employee.id),
                minio_key=minio_key,
                qdrant_id=qdrant_id,
            ))
            points_created += 1

        if points_created == 0:
            logger.warning(
                "[Enroll] No face detected in %d image(s) for %s — rolling back",
                len(images_bytes), person_code,
            )
            db.delete(employee)
            db.commit()
            raise HTTPException(400, "Không detect được mặt nào trong các ảnh đã gửi")

        db.commit()
        return EnrollmentResult(
            success=True,
            person_id=str(employee.id),
            message=f"Đăng ký thành công {points_created}/{len(images_bytes)} ảnh",
            points_created=points_created,
        )


enrollment_service = EnrollmentService()
