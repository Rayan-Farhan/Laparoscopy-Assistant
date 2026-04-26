from fastapi import HTTPException, status
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user_org_id
from app.models.entities import OrganizationMember, SurgeryCase, User, UserRole


def get_pagination(page: int, page_size: int) -> tuple[int, int]:
    if page < 1:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="page must be >= 1")
    if page_size < 1 or page_size > 100:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="page_size must be between 1 and 100")
    offset = (page - 1) * page_size
    return offset, page_size


def count_query(db: Session, stmt: Select) -> int:
    subquery = stmt.order_by(None).subquery()
    count_stmt = select(func.count()).select_from(subquery)
    return int(db.scalar(count_stmt) or 0)


def get_member_org_id_or_error(db: Session, current_user: User) -> str:
    return get_current_user_org_id(current_user, db)


def get_case_for_user_or_404(db: Session, case_id: str, current_user: User) -> SurgeryCase:
    case_row = db.get(SurgeryCase, case_id)
    if case_row is None or case_row.is_deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.")

    if current_user.role == UserRole.admin:
        return case_row

    membership = db.scalar(
        select(OrganizationMember).where(
            OrganizationMember.user_id == current_user.id,
            OrganizationMember.organization_id == case_row.organization_id,
        )
    )
    if membership is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Case access denied.")
    return case_row

