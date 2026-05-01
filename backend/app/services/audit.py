from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models.entities import AuditLog


def log_audit_event(
    db: Session,
    *,
    actor_user_id: str | None,
    action_type: str,
    target_type: str,
    target_id: str,
    metadata: dict[str, Any] | None = None,
) -> AuditLog:
    row = AuditLog(
        actor_user_id=actor_user_id,
        action_type=action_type,
        target_type=target_type,
        target_id=target_id,
        metadata_json=metadata,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row

