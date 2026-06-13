from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.db.postgres import AdminAuditLog


def log_action(
    db: Session,
    actor_admin_id: str,
    action: str,
    target_type: str | None = None,
    target_id: str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    entry = AdminAuditLog(
        actor_admin_id=actor_admin_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        details=details,
    )
    db.add(entry)
    db.commit()
