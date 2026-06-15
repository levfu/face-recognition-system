#!/usr/bin/env python3
"""
Đăng nhập Google (OAuth) một lần — lưu refresh token để worker upload backup tự động.

Chạy trên máy Windows (có trình duyệt), KHÔNG chạy trong container worker.

Bước chuẩn bị:
  1. Google Cloud → Credentials → Create OAuth client ID → Desktop app
  2. Tải JSON → lưu secrets/gdrive-oauth-client.json
  3. Chạy script này → đăng nhập Gmail → chọn Allow

Sau đó trong .env:
  GOOGLE_DRIVE_AUTH_MODE=oauth
  GOOGLE_DRIVE_OAUTH_TOKEN=/secrets/gdrive-oauth-token.json
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SECRETS = ROOT / "secrets"
CLIENT_FILE = SECRETS / "gdrive-oauth-client.json"
TOKEN_FILE = SECRETS / "gdrive-oauth-token.json"

SCOPES = ["https://www.googleapis.com/auth/drive.file"]


def main() -> int:
    if not CLIENT_FILE.is_file():
        print(f"Missing file OAuth client: {CLIENT_FILE}", file=sys.stderr)
        print("Create Desktop OAuth client on Google Cloud Console.", file=sys.stderr)
        return 1

    try:
        from google_auth_oauthlib.flow import InstalledAppFlow
    except ImportError:
        print("Install: pip install google-auth-oauthlib", file=sys.stderr)
        return 1

    SECRETS.mkdir(parents=True, exist_ok=True)
    flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_FILE), SCOPES)
    creds = flow.run_local_server(port=0, prompt="consent")

    TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")
    print(f"Đã lưu token: {TOKEN_FILE}")
    print("Cập nhật .env:")
    print("  GOOGLE_DRIVE_AUTH_MODE=oauth")
    print("  GOOGLE_DRIVE_OAUTH_TOKEN=/secrets/gdrive-oauth-token.json")
    print("  GOOGLE_DRIVE_CREDENTIALS=  # Service Account is no longer required")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
