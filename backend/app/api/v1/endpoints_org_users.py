from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.utils import count_query, get_member_org_id_or_error, get_pagination
from app.core.dependencies import get_current_user, require_roles
from app.db.session import get_db
from app.models.entities import Organization, User, UserRole
from app.schemas.api import OrganizationResponse, PaginationMeta, UserResponse, UserUpdateRequest
from app.services.audit import log_audit_event

router = APIRouter(tags=["organizations-and-users"])


@router.get("/organizations/current", response_model=OrganizationResponse)
def get_current_organization(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OrganizationResponse:
    org_id = get_member_org_id_or_error(db, current_user)
    org = db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found.")
    return OrganizationResponse.model_validate(org)


@router.get("/users")
def list_users(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(require_roles(UserRole.admin)),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    offset, limit = get_pagination(page, page_size)
    stmt = select(User).order_by(User.created_at.desc())
    total = count_query(db, stmt)
    users = db.scalars(stmt.offset(offset).limit(limit)).all()
    return {
        "items": [UserResponse.model_validate(user) for user in users],
        "pagination": PaginationMeta(page=page, page_size=page_size, total=total),
    }


@router.patch("/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: str,
    payload: UserUpdateRequest,
    current_user: User = Depends(require_roles(UserRole.admin)),
    db: Session = Depends(get_db),
) -> UserResponse:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.role is not None:
        user.role = payload.role
    if payload.is_active is not None:
        user.is_active = payload.is_active

    db.commit()
    db.refresh(user)
    log_audit_event(
        db,
        actor_user_id=current_user.id,
        action_type="users.update",
        target_type="user",
        target_id=user.id,
        metadata=payload.model_dump(exclude_none=True),
    )
    return UserResponse.model_validate(user)

