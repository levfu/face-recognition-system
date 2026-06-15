# backend/app/api/routes/enrollment.py

from typing import List, Optional
import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.db.postgres import get_db
from app.services.enrollment_service import enrollment_service
from app.api.routes.auth import get_current_admin
from app.workers.celery_tasks import enroll_face_task
import base64

router = APIRouter(prefix="/api/enroll", tags=["enrollment"])


@router.post("/")
async def enroll_face(
    person_id: str            = Form(...),
    name: str                 = Form(...),
    images: List[UploadFile]  = File(...),
    force: bool               = Form(False),
    landmarks: Optional[str]  = Form(None),
    db: Session               = Depends(get_db),
    _                         = Depends(get_current_admin),
):
    """
    Đăng ký khuôn mặt (1–10 ảnh, nhiều góc).
    force=False (default): 409 Conflict nếu mã NV đã tồn tại — KHÔNG xóa gì.
    force=True: xóa toàn bộ data cũ rồi enroll lại.
    """
    if not 1 <= len(images) <= 10:
        raise HTTPException(400, "Need 1–10 images per enrollment")

    images_bytes: list[bytes] = []
    total_size = 0
    for img in images:
        if img.content_type not in ["image/jpeg", "image/png"]:
            raise HTTPException(400, f"Image '{img.filename}' must be JPEG or PNG")
        data = await img.read()
        if len(data) > 10 * 1024 * 1024:
            raise HTTPException(400, f"Image '{img.filename}' is too large, maximum 10MB per image")
        total_size += len(data)
        images_bytes.append(data)

    if total_size > 50 * 1024 * 1024:
        raise HTTPException(400, "Total image size exceeds 50MB")

    landmarks_list = None
    if landmarks:
        try:
            landmarks_list = json.loads(landmarks)
        except Exception:
            raise HTTPException(400, "landmarks must be valid JSON")
        if len(landmarks_list) != len(images_bytes):
            raise HTTPException(
                400,
                f"Number of landmarks ({len(landmarks_list)}) does not match number of images ({len(images_bytes)})"
            )

    result = enrollment_service.enroll(
        images_bytes=images_bytes,
        person_code=person_id,
        name=name,
        force=force,
        db=db,
        landmarks_list=landmarks_list,
    )

    return {
        "success":        True,
        "employee_id":    result.person_id,
        "points_created": result.points_created,
        "message":        result.message,
    }


@router.post("/bulk")
async def enroll_bulk(
    person_id: str     = Form(...),
    images: list[UploadFile] = File(...),
    _                  = Depends(get_current_admin)
):
    """
    Enroll nhiều ảnh cùng lúc → đẩy vào Celery queue.
    Dùng cho trường hợp enroll nhiều góc độ.
    """
    if len(images) > 10:
        raise HTTPException(400, "Maximum 10 images per request")

    task_ids = []
    for img in images:
        image_bytes = await img.read()
        task = enroll_face_task.delay(
            person_id=person_id,
            image_b64=base64.b64encode(image_bytes).decode()
        )
        task_ids.append(task.id)

    return {
        "success": True,
        "message": f"Processing {len(images)} images in the background",
        "task_ids": task_ids
    }


@router.delete("/{person_id}")
def delete_face(
    person_id: str,
    db: Session = Depends(get_db),
    _           = Depends(get_current_admin)
):
    """Xóa toàn bộ dữ liệu khuôn mặt của 1 người."""
    from app.db.qdrant import delete_by_person
    from app.db.postgres import FaceImage

    delete_by_person(person_id)
    db.query(FaceImage).filter(
        FaceImage.person_id == person_id
    ).delete()
    db.commit()

    return {"success": True, "message": f"Deleted face data for {person_id}"}