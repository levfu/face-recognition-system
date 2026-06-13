# backend/app/services/gdrive_uploader.py
"""Upload bản backup (tar.gz) lên Google Drive."""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta
from pathlib import Path

from app.config import settings

ARCHIVE_PREFIX = "facerecog_backup_"
SCOPES_SA = ["https://www.googleapis.com/auth/drive.file"]
# OAuth: upload vào folder Drive của chính tài khoản Gmail (có quota)
SCOPES_OAUTH = ["https://www.googleapis.com/auth/drive.file"]


def _friendly_gdrive_error(exc: Exception) -> str:
    msg = str(exc)
    if "storageQuotaExceeded" in msg or "do not have storage quota" in msg:
        return (
            "Service Account không có dung lượng Google Drive (quota = 0). "
            "Gmail cá nhân: đặt GOOGLE_DRIVE_AUTH_MODE=oauth và chạy "
            "scripts/gdrive_oauth_setup.py. Workspace: dùng Shared Drive. "
            "Chi tiết: docs/BACKUP_GOOGLE_DRIVE.md"
        )
    return msg


def _resolve_credentials_path(path: str) -> Path:
    p = Path(path)
    if p.is_file():
        return p
    # Trong Docker: /secrets/... ; .env hay ghi ./secrets/...
    fallback = Path("/secrets") / p.name
    if fallback.is_file():
        return fallback
    return p


def _drive_service_sa():
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    cred_path = _resolve_credentials_path(settings.gdrive_credentials_path)
    if not cred_path.is_file():
        raise FileNotFoundError(
            f"Không tìm thấy Service Account JSON: {cred_path}. "
            "Trong Docker dùng GOOGLE_DRIVE_CREDENTIALS=/secrets/gdrive-service-account.json"
        )

    creds = service_account.Credentials.from_service_account_file(
        str(cred_path),
        scopes=SCOPES_SA,
    )
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def _drive_service_oauth():
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    token_path = _resolve_credentials_path(settings.gdrive_oauth_token_path)
    if not token_path.is_file():
        raise FileNotFoundError(
            f"Không tìm thấy OAuth token: {token_path}. "
            "Chạy: python scripts/gdrive_oauth_setup.py"
        )

    creds = Credentials.from_authorized_user_file(str(token_path), SCOPES_OAUTH)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        token_path.write_text(creds.to_json(), encoding="utf-8")

    if not creds.valid:
        raise RuntimeError(
            "OAuth token hết hạn. Chạy lại: python scripts/gdrive_oauth_setup.py"
        )

    return build("drive", "v3", credentials=creds, cache_discovery=False)


def _drive_service():
    mode = (settings.gdrive_auth_mode or "service_account").lower()
    if mode == "oauth":
        return _drive_service_oauth()
    return _drive_service_sa()


def create_backup_archive(backup_dir: Path) -> Path:
    import tarfile

    archive_path = backup_dir.parent / f"{ARCHIVE_PREFIX}{backup_dir.name}.tar.gz"
    with tarfile.open(archive_path, "w:gz") as tar:
        tar.add(backup_dir, arcname=backup_dir.name)
    return archive_path


def upload_backup_archive(archive_path: Path) -> dict:
    from googleapiclient.http import MediaFileUpload

    if not settings.gdrive_folder_id:
        raise ValueError("GOOGLE_DRIVE_FOLDER_ID chưa được cấu hình")

    service = _drive_service()
    media = MediaFileUpload(
        str(archive_path),
        mimetype="application/gzip",
        resumable=True,
    )
    body = {
        "name": archive_path.name,
        "parents": [settings.gdrive_folder_id],
    }
    created = (
        service.files()
        .create(
            body=body,
            media_body=media,
            fields="id,name,size,webViewLink",
            supportsAllDrives=True,
        )
        .execute()
    )
    return {
        "file_id": created.get("id"),
        "name": created.get("name"),
        "size_bytes": int(created.get("size", 0)),
        "web_view_link": created.get("webViewLink"),
    }


def _parse_backup_timestamp(filename: str) -> datetime | None:
    match = re.search(r"facerecog_backup_(\d{8}_\d{6})", filename)
    if not match:
        return None
    try:
        return datetime.strptime(match.group(1), "%Y%m%d_%H%M%S")
    except ValueError:
        return None


def cleanup_old_gdrive_backups() -> int:
    service = _drive_service()
    folder_id = settings.gdrive_folder_id
    query = (
        f"'{folder_id}' in parents and trashed=false "
        f"and name contains '{ARCHIVE_PREFIX}'"
    )
    cutoff = datetime.now() - timedelta(days=settings.backup_retention_days)
    deleted = 0
    page_token = None

    while True:
        response = (
            service.files()
            .list(
                q=query,
                fields="nextPageToken, files(id,name,createdTime)",
                pageToken=page_token,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            )
            .execute()
        )
        for item in response.get("files", []):
            ts = _parse_backup_timestamp(item.get("name", ""))
            if ts is None:
                continue
            if ts < cutoff:
                service.files().delete(
                    fileId=item["id"],
                    supportsAllDrives=True,
                ).execute()
                deleted += 1
        page_token = response.get("nextPageToken")
        if not page_token:
            break
    return deleted


def upload_backup_to_gdrive(backup_dir: Path) -> dict:
    if not settings.gdrive_enabled:
        return {"success": True, "skipped": True, "reason": "gdrive_disabled"}

    archive_path: Path | None = None
    try:
        archive_path = create_backup_archive(backup_dir)
        uploaded = upload_backup_archive(archive_path)
        removed = cleanup_old_gdrive_backups()
        return {
            "success": True,
            "auth_mode": settings.gdrive_auth_mode,
            "archive": archive_path.name,
            "uploaded": uploaded,
            "old_files_removed": removed,
        }
    except Exception as exc:
        return {"success": False, "error": _friendly_gdrive_error(exc)}
    finally:
        if archive_path and archive_path.exists():
            archive_path.unlink()
