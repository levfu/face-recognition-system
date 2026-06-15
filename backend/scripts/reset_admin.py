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
        print("ERROR: Username cannot be empty.", file=sys.stderr)
        sys.exit(1)
    return username


def prompt_password() -> str:
    password = getpass.getpass("New password: ")
    confirm = getpass.getpass("Confirm password: ")
    if password != confirm:
        print("ERROR: Passwords do not match.", file=sys.stderr)
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
                f"ERROR: Admin with username '{username}' not found.",
                file=sys.stderr,
            )
            sys.exit(1)

        if admin.role != "super_admin" and not args.force:
            print(
                f"WARNING: '{username}' has role '{admin.role}', not 'super_admin'.\n"
                "Use the UI for standard resets. This script is intended for Super Admins.",
            )
            answer = input("Continue anyway? (y/N): ").strip().lower()
            if answer != "y":
                print("Aborted.")
                sys.exit(0)

        if new_password is None:
            new_password = prompt_password()

        if len(new_password) < 6:
            print("ERROR: Password must be at least 6 characters.", file=sys.stderr)
            sys.exit(1)

        admin.set_password(new_password)
        db.commit()
        print(f"✓ Password reset for '{username}' (role: {admin.role}).")

    finally:
        db.close()


if __name__ == "__main__":
    main()