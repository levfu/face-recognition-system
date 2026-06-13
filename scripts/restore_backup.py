#!/usr/bin/env python3
"""
Khôi phục từ một thư mục backup (YYYYMMDD_HHMMSS).

CẢNH BÁO: Ghi đè dữ liệu hiện tại. Chỉ chạy khi hệ thống đang dừng hoặc chấp nhận downtime.

Ví dụ:
  python scripts/restore_backup.py backups/20260521_030000

Yêu cầu: pg_restore, curl/wget, mc hoặc minio client — khuyến nghị chạy trong container worker.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

def _backend_root() -> Path:
    if Path("/app/app").exists():
        return Path("/app")
    return Path(__file__).resolve().parents[1] / "backend"


sys.path.insert(0, str(_backend_root()))

from app.config import settings  # noqa: E402
from app.db.minio import minio_client  # noqa: E402
from app.db.qdrant import qdrant_client  # noqa: E402


def restore_postgres(backup_dir: Path) -> None:
    dump_file = backup_dir / "postgres.dump"
    if not dump_file.exists():
        raise FileNotFoundError(f"Thiếu {dump_file}")

    env = {**os.environ, "PGPASSWORD": settings.postgres_password}
    # --clean: xóa object cũ trước khi restore (cần quyền phù hợp)
    cmd = [
        "pg_restore",
        "-h", settings.postgres_host,
        "-p", str(settings.postgres_port),
        "-U", settings.postgres_user,
        "-d", settings.postgres_db,
        "--clean",
        "--if-exists",
        str(dump_file),
    ]
    subprocess.run(cmd, env=env, check=True)
    print("[Restore] PostgreSQL — xong")


def restore_qdrant(backup_dir: Path) -> None:
    matches = list(backup_dir.glob("qdrant_*.snapshot"))
    if not matches:
        raise FileNotFoundError("Không tìm thấy file qdrant_*.snapshot")

    snapshot_path = matches[0]
    with open(snapshot_path, "rb") as snap_file:
        qdrant_client.http.snapshots_api.recover_from_uploaded_snapshot(
            collection_name=settings.qdrant_collection,
            snapshot=snap_file,
            wait=True,
        )
    print("[Restore] Qdrant — xong")


def restore_minio(backup_dir: Path) -> None:
    minio_root = backup_dir / "minio"
    if not minio_root.exists():
        print("[Restore] MinIO — bỏ qua (không có thư mục minio/)")
        return

    for bucket_dir in minio_root.iterdir():
        if not bucket_dir.is_dir():
            continue
        bucket = bucket_dir.name
        if not minio_client.bucket_exists(bucket):
            minio_client.make_bucket(bucket)

        n = 0
        for file_path in bucket_dir.rglob("*"):
            if not file_path.is_file():
                continue
            object_name = str(file_path.relative_to(bucket_dir)).replace("\\", "/")
            minio_client.fput_object(bucket, object_name, str(file_path))
            n += 1
        print(f"[Restore] MinIO bucket '{bucket}' — {n} object")


def main() -> int:
    parser = argparse.ArgumentParser(description="Khôi phục backup Face Recognition System")
    parser.add_argument(
        "backup_path",
        type=Path,
        help="Đường dẫn thư mục backup (vd. backups/20260521_030000)",
    )
    parser.add_argument(
        "--only",
        choices=["postgres", "qdrant", "minio"],
        action="append",
        help="Chỉ restore thành phần chỉ định (có thể lặp)",
    )
    parser.add_argument("-y", "--yes", action="store_true", help="Bỏ qua xác nhận")
    args = parser.parse_args()

    backup_dir = args.backup_path.resolve()
    if not backup_dir.is_dir():
        print(f"Không tìm thấy thư mục: {backup_dir}", file=sys.stderr)
        return 1

    manifest = backup_dir / "manifest.json"
    if manifest.exists():
        print(manifest.read_text(encoding="utf-8"))

    if not args.yes:
        confirm = input(f"Khôi phục từ {backup_dir}? Gõ 'yes' để tiếp tục: ")
        if confirm.strip().lower() != "yes":
            print("Đã hủy.")
            return 0

    targets = args.only or ["postgres", "qdrant", "minio"]
    try:
        if "postgres" in targets:
            restore_postgres(backup_dir)
        if "qdrant" in targets:
            restore_qdrant(backup_dir)
        if "minio" in targets:
            restore_minio(backup_dir)
    except Exception as exc:
        print(f"Lỗi: {exc}", file=sys.stderr)
        return 1

    print("[Restore] Hoàn tất.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
