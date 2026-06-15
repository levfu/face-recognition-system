# backend/app/services/backup_service.py
"""Sao lưu định kỳ PostgreSQL, Qdrant và MinIO."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

from app.config import settings
from app.db.minio import minio_client
from app.db.qdrant import qdrant_client

MANIFEST_VERSION = 1


def _timestamp_dir() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def backup_postgres(dest: Path) -> dict:
    out_file = dest / "postgres.dump"
    env = {**os.environ, "PGPASSWORD": settings.postgres_password}
    cmd = [
        "pg_dump",
        "-h", settings.postgres_host,
        "-p", str(settings.postgres_port),
        "-U", settings.postgres_user,
        "-d", settings.postgres_db,
        "-F", "c",
        "-f", str(out_file),
    ]
    subprocess.run(cmd, env=env, check=True, capture_output=True, text=True)
    return {"file": out_file.name, "size_bytes": out_file.stat().st_size}


def backup_qdrant(dest: Path) -> dict:
    snapshot = qdrant_client.create_snapshot(collection_name=settings.qdrant_collection)
    snapshot_name = snapshot.name
    out_file = dest / f"qdrant_{settings.qdrant_collection}.snapshot"
    url = (
        f"http://{settings.qdrant_host}:{settings.qdrant_port}"
        f"/collections/{settings.qdrant_collection}/snapshots/{snapshot_name}"
    )
    urllib.request.urlretrieve(url, out_file)
    return {
        "file": out_file.name,
        "snapshot_name": snapshot_name,
        "size_bytes": out_file.stat().st_size,
    }


def backup_minio(dest: Path) -> dict:
    minio_root = dest / "minio"
    minio_root.mkdir(parents=True, exist_ok=True)
    buckets = [settings.minio_bucket_faces, settings.minio_bucket_snapshots]
    counts: dict[str, int] = {}

    for bucket in buckets:
        if not minio_client.bucket_exists(bucket):
            counts[bucket] = 0
            continue

        bucket_dir = minio_root / bucket
        n = 0
        for obj in minio_client.list_objects(bucket_name=bucket, recursive=True):
            out_path = bucket_dir / obj.object_name
            out_path.parent.mkdir(parents=True, exist_ok=True)
            response = minio_client.get_object(bucket, obj.object_name)
            try:
                with open(out_path, "wb") as f:
                    for chunk in response.stream(32 * 1024):
                        f.write(chunk)
            finally:
                response.close()
                response.release_conn()
            n += 1
        counts[bucket] = n

    return {"buckets": counts}


def cleanup_old_backups() -> int:
    root = Path(settings.backup_dir)
    if not root.exists():
        return 0

    cutoff = datetime.now() - timedelta(days=settings.backup_retention_days)
    deleted = 0
    for child in root.iterdir():
        if not child.is_dir():
            continue
        try:
            folder_time = datetime.strptime(child.name, "%Y%m%d_%H%M%S")
        except ValueError:
            continue
        if folder_time < cutoff:
            shutil.rmtree(child)
            deleted += 1
    return deleted


def run_full_backup() -> dict:
    if not settings.backup_enabled:
        return {"success": True, "skipped": True, "reason": "backup_disabled"}

    root = Path(settings.backup_dir)
    root.mkdir(parents=True, exist_ok=True)
    dest = root / _timestamp_dir()
    dest.mkdir(parents=True)

    started = datetime.now()
    components: dict = {}

    try:
        components["postgres"] = backup_postgres(dest)
        components["qdrant"] = backup_qdrant(dest)
        if settings.backup_include_minio:
            components["minio"] = backup_minio(dest)
        else:
            components["minio"] = {
                "skipped": True,
                "note": "Original images are stored in the MinIO volume: minio_data.",
            }

        manifest = {
            "version": MANIFEST_VERSION,
            "created_at": started.isoformat(),
            "finished_at": datetime.now().isoformat(),
            "components": components,
            "settings": {
                "postgres_db": settings.postgres_db,
                "qdrant_collection": settings.qdrant_collection,
                "minio_buckets": [
                    settings.minio_bucket_faces,
                    settings.minio_bucket_snapshots,
                ],
            },
        }
        manifest_path = dest / "manifest.json"
        manifest_path.write_text(
            json.dumps(manifest, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

        removed = cleanup_old_backups()
        total_size = sum(
            f.stat().st_size for f in dest.rglob("*") if f.is_file()
        )

        from app.services.gdrive_uploader import upload_backup_to_gdrive

        gdrive = upload_backup_to_gdrive(dest)

        result = {
            "success": True,
            "backup_dir": str(dest),
            "components": components,
            "size_bytes": total_size,
            "old_backups_removed": removed,
            "gdrive": gdrive,
        }
        if settings.gdrive_enabled and not gdrive.get("success"):
            result["gdrive_warning"] = (
                "Local backup OK, but Google Drive upload failed."
            )
        return result
    except Exception as exc:
        if dest.exists():
            shutil.rmtree(dest, ignore_errors=True)
        return {"success": False, "error": str(exc)}
