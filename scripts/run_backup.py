#!/usr/bin/env python3
"""
Chạy backup thủ công (ngoài lịch Celery).

Trong Docker:
  docker compose exec worker python /scripts/run_backup.py

Hoặc từ thư mục backend (đã cấu hình .env):
  cd backend && python -m scripts.run_backup
"""
from __future__ import annotations

import json
import sys
from pathlib import Path


def _backend_root() -> Path:
    if Path("/app/app").exists():
        return Path("/app")
    return Path(__file__).resolve().parents[1] / "backend"


sys.path.insert(0, str(_backend_root()))

from app.services.backup_service import run_full_backup  # noqa: E402


def main() -> int:
    result = run_full_backup()
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0 if result.get("success") else 1


if __name__ == "__main__":
    raise SystemExit(main())
