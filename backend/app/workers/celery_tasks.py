# backend/app/workers/celery_tasks.py

from celery import Celery
from app.config import settings

# ── Khởi tạo Celery ──
celery_app = Celery(
    "face_recognition",
    broker=settings.redis_url,
    backend=settings.redis_url
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Ho_Chi_Minh",
    task_track_started=True,
    task_routes={
        "app.workers.celery_tasks.enroll_face_task":   {"queue": "enroll"},
        "app.workers.celery_tasks.cleanup_task":        {"queue": "maintenance"},
        "app.workers.celery_tasks.daily_report_task":   {"queue": "maintenance"},
        "app.workers.celery_tasks.backup_task":         {"queue": "maintenance"},
    }
)


# ── Task 1: Enroll khuôn mặt trong nền ──
@celery_app.task(bind=True, max_retries=3, name="enroll_face_task")
def enroll_face_task(self, person_id: str, image_b64: str):
    """
    Enroll khuôn mặt bất đồng bộ.
    Dùng cho bulk enroll nhiều ảnh cùng lúc.
    """
    try:
        import base64
        import uuid
        from app.core.face_detector import face_detector
        from app.core.face_embedder import face_embedder
        from app.db.qdrant import upsert_vector
        from app.db.minio import upload_image
        from app.db.postgres import SessionLocal, FaceImage

        image_bytes = base64.b64decode(image_b64)

        # apply_oval_gate=False: bulk enroll không cần kiểm tra vùng oval
        outcome = face_detector.detect_from_bytes(image_bytes, apply_oval_gate=False)
        if outcome.face is None:
            return {"success": False, "message": "Không phát hiện khuôn mặt"}

        embedding = face_embedder.get_embedding(outcome.face.face_array)
        minio_key = upload_image(
            image_bytes=image_bytes,
            folder="faces",
            filename=f"{person_id}_{uuid.uuid4()}.jpg"
        )
        qdrant_id = upsert_vector(
            embedding=embedding,
            person_id=person_id
        )
        db = SessionLocal()
        try:
            face_image = FaceImage(
                person_id=person_id,
                minio_key=minio_key,
                qdrant_id=qdrant_id
            )
            db.add(face_image)
            db.commit()
        finally:
            db.close()

        return {
            "success":   True,
            "person_id": person_id,
            "qdrant_id": qdrant_id,
            "minio_key": minio_key
        }

    except Exception as exc:
        raise self.retry(exc=exc, countdown=5)


# ── Task 2: Dọn dẹp ảnh rác trong MinIO ──
@celery_app.task(name="cleanup_task")
def cleanup_task():
    """
    Xóa ảnh snapshot cũ hơn 30 ngày trong MinIO.
    Chạy tự động mỗi đêm lúc 2h sáng.
    """
    try:
        from app.db.minio import list_objects, delete_object
        from app.db.postgres import SessionLocal, AccessLog
        from datetime import datetime, timedelta

        cutoff = datetime.now() - timedelta(days=30)

        db = SessionLocal()
        try:
            old_logs = db.query(AccessLog).filter(
                AccessLog.created_at < cutoff,
                AccessLog.snapshot_key.isnot(None)
            ).all()

            deleted = 0
            for log in old_logs:
                delete_object(log.snapshot_key)
                log.snapshot_key = None
                deleted += 1

            db.commit()
        finally:
            db.close()

        return {"success": True, "deleted": deleted}

    except Exception as e:
        return {"success": False, "error": str(e)}


# ── Task 3: Báo cáo chấm công cuối ngày ──
@celery_app.task(name="daily_report_task")
def daily_report_task():
    """
    Tổng hợp lịch sử ra vào trong ngày.
    Chạy tự động lúc 11:59 PM mỗi ngày.
    """
    try:
        from app.db.postgres import SessionLocal, AccessLog, Employee
        from datetime import datetime, timedelta

        today_start = datetime.now().replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        today_end = today_start + timedelta(days=1)

        db = SessionLocal()
        try:
            logs = db.query(AccessLog).filter(
                AccessLog.created_at >= today_start,
                AccessLog.created_at < today_end,
                AccessLog.recognized == True
            ).all()

            summary = {}
            for log in logs:
                pid = str(log.person_id)
                if pid not in summary:
                    summary[pid] = {"count": 0, "last_seen": None}
                summary[pid]["count"] += 1
                summary[pid]["last_seen"] = str(log.created_at)

        finally:
            db.close()

        print(f"[DailyReport] {today_start.date()} — {len(summary)} người, {len(logs)} lượt")
        return {
            "success": True,
            "date":    str(today_start.date()),
            "total_people": len(summary),
            "total_logs":   len(logs),
            "summary":      summary
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


# ── Task 4: Sao lưu dữ liệu định kỳ ──
@celery_app.task(name="backup_task")
def backup_task():
    """
    Sao lưu PostgreSQL, Qdrant và MinIO.
    Chạy tự động lúc 3h sáng mỗi ngày (sau cleanup 2h).
    """
    from app.services.backup_service import run_full_backup

    result = run_full_backup()
    if result.get("success"):
        if result.get("skipped"):
            print("[Backup] Đã tắt (BACKUP_ENABLED=false)")
        else:
            gdrive = result.get("gdrive") or {}
            gdrive_msg = ""
            if gdrive.get("skipped"):
                pass
            elif gdrive.get("success"):
                up = gdrive.get("uploaded") or {}
                gdrive_msg = f", Drive: {up.get('name', 'OK')}"
            elif settings.gdrive_enabled:
                gdrive_msg = f", Drive LỖI: {gdrive.get('error')}"
            print(
                f"[Backup] OK — {result.get('backup_dir')} "
                f"({result.get('size_bytes', 0) // 1024} KB), "
                f"đã xóa {result.get('old_backups_removed', 0)} bản cũ local"
                f"{gdrive_msg}"
            )
    else:
        print(f"[Backup] Lỗi — {result.get('error')}")
    return result


# ── Lịch chạy tự động (Celery Beat) ──
from celery.schedules import crontab

celery_app.conf.beat_schedule = {
    # Dọn rác lúc 2h sáng mỗi ngày
    "cleanup-every-night": {
        "task":     "cleanup_task",
        "schedule": crontab(hour=2, minute=0)
    },
    # Báo cáo lúc 11:59 PM mỗi ngày
    "daily-report": {
        "task":     "daily_report_task",
        "schedule": crontab(hour=23, minute=59)
    },
    # Sao lưu lúc 3h sáng mỗi ngày (sau cleanup 2h)
    "nightly-backup": {
        "task":     "backup_task",
        "schedule": crontab(hour=3, minute=0)
    },
}