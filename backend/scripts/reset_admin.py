"""
CLI script to reset an admin's password directly via the database.

Usage:
    # Non-interactive
    python -m scripts.reset_admin <username> <new_password> [--force]

    # Interactive (prompts for password securely)
    python -m scripts.reset_admin <username>
    python -m scripts.reset_admin
"""

from __future__ import annotations

import argparse
import getpass
import sys


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Reset an admin password via the database."
    )
    parser.add_argument("username", nargs="?", help="Admin username")
    parser.add_argument("new_password", nargs="?", help="New password (min 6 chars)")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Skip confirmation prompt when resetting a non-super_admin account",
    )
    return parser.parse_args()


def prompt_username() -> str:
    username = input("Username: ").strip()
    if not username:
        print("ERROR: Username không được để trống.", file=sys.stderr)
        sys.exit(1)
    return username


def prompt_password() -> str:
    password = getpass.getpass("New password: ")
    confirm = getpass.getpass("Confirm password: ")
    if password != confirm:
        print("ERROR: Mật khẩu xác nhận không khớp.", file=sys.stderr)
        sys.exit(1)
    return password


def main() -> None:
    args = parse_args()

    username: str = args.username or prompt_username()
    new_password: str | None = args.new_password

    # Lazy import so DB connection happens after arg validation
    from app.db.postgres import Admin, SessionLocal

    db = SessionLocal()
    try:
        admin = db.query(Admin).filter(Admin.username == username).first()

        if admin is None:
            print(
                f"ERROR: Không tìm thấy admin với username '{username}'.",
                file=sys.stderr,
            )
            sys.exit(1)

        if admin.role != "super_admin" and not args.force:
            print(
                f"WARNING: '{username}' có role '{admin.role}', không phải 'super_admin'.\n"
                "Dùng UI để reset thông thường. Script này dành cho Super Admin.",
            )
            answer = input("Vẫn tiếp tục? (y/N): ").strip().lower()
            if answer != "y":
                print("Đã huỷ.")
                sys.exit(0)

        if new_password is None:
            new_password = prompt_password()

        if len(new_password) < 6:
            print("ERROR: Mật khẩu phải có ít nhất 6 ký tự.", file=sys.stderr)
            sys.exit(1)

        admin.set_password(new_password)
        db.commit()
        print(f"✓ Đã reset mật khẩu cho '{username}' (role: {admin.role}).")

    finally:
        db.close()


if __name__ == "__main__":
    main()
