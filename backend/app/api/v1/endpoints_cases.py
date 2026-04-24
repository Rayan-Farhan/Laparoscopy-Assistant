from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.v1.utils import count_query, get_case_for_user_or_404, get_member_org_id_or_error, get_pagination
from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.entities import CaseStatus, SurgeryCase, User, UserRole
from app.schemas.api import CaseCreateRequest, CaseUpdateRequest, CasesListResponse, PaginationMeta, SurgeryCaseResponse
from app.services.audit import log_audit_event

router = APIRouter(prefix="/cases", tags=["cases"])


@router.post("", response_model=SurgeryCaseResponse, status_code=status.HTTP_201_CREATED)
def create_case(
    payload: CaseCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SurgeryCaseResponse:
    org_id = get_member_org_id_or_error(db, current_user)
    existing = db.scalar(
        select(SurgeryCase).where(
            SurgeryCase.case_code == payload.case_code,
            SurgeryCase.organization_id == org_id,
            SurgeryCase.is_deleted.is_(False),
        )
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Case code already exists in organization.")

    case_row = SurgeryCase(
        organization_id=org_id,
        created_by_user_id=current_user.id,
        case_code=payload.case_code,
        procedure_type=payload.procedure_type,
        surgery_date=payload.surgery_date,
        notes=payload.notes,
        de_identification_notes=payload.de_identification_notes,
        status=CaseStatus.draft,
    )
    db.add(case_row)
    db.commit()
    db.refresh(case_row)

    log_audit_event(
        db,
        actor_user_id=current_user.id,
        action_type="cases.create",
        target_type="surgery_case",
        target_id=case_row.id,
        metadata={"case_code": case_row.case_code},
    )
    return SurgeryCaseResponse.model_validate(case_row)


@router.get("", response_model=CasesListResponse)
def list_cases(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status_filter: CaseStatus | None = Query(default=None, alias="status"),
    procedure: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    query: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CasesListResponse:
    offset, limit = get_pagination(page, page_size)
    stmt = select(SurgeryCase).where(SurgeryCase.is_deleted.is_(False))

    if current_user.role != UserRole.admin:
        org_id = get_member_org_id_or_error(db, current_user)
        stmt = stmt.where(SurgeryCase.organization_id == org_id)

    if status_filter is not None:
        stmt = stmt.where(SurgeryCase.status == status_filter)
    if procedure:
        stmt = stmt.where(SurgeryCase.procedure_type.ilike(f"%{procedure.strip()}%"))
    if date_from:
        stmt = stmt.where(SurgeryCase.surgery_date >= date_from)
    if date_to:
        stmt = stmt.where(SurgeryCase.surgery_date <= date_to)
    if query:
        q = query.strip()
        stmt = stmt.where(or_(SurgeryCase.case_code.ilike(f"%{q}%"), SurgeryCase.notes.ilike(f"%{q}%")))

    stmt = stmt.order_by(SurgeryCase.created_at.desc())
    total = count_query(db, stmt)
    items = db.scalars(stmt.offset(offset).limit(limit)).all()
    return CasesListResponse(
        items=[SurgeryCaseResponse.model_validate(item) for item in items],
        pagination=PaginationMeta(page=page, page_size=page_size, total=total),
    )


@router.get("/{case_id}", response_model=SurgeryCaseResponse)
def get_case(
    case_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SurgeryCaseResponse:
    case_row = get_case_for_user_or_404(db, case_id, current_user)
    return SurgeryCaseResponse.model_validate(case_row)


@router.patch("/{case_id}", response_model=SurgeryCaseResponse)
def update_case(
    case_id: str,
    payload: CaseUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SurgeryCaseResponse:
    case_row = get_case_for_user_or_404(db, case_id, current_user)

    updates = payload.model_dump(exclude_none=True)
    for key, value in updates.items():
        setattr(case_row, key, value)

    db.commit()
    db.refresh(case_row)

    log_audit_event(
        db,
        actor_user_id=current_user.id,
        action_type="cases.update",
        target_type="surgery_case",
        target_id=case_row.id,
        metadata=updates,
    )
    return SurgeryCaseResponse.model_validate(case_row)


@router.delete("/{case_id}", response_model=dict)
def delete_case(
    case_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    case_row = get_case_for_user_or_404(db, case_id, current_user)
    case_row.is_deleted = True
    case_row.status = CaseStatus.archived
    db.commit()
    log_audit_event(
        db,
        actor_user_id=current_user.id,
        action_type="cases.delete",
        target_type="surgery_case",
        target_id=case_row.id,
        metadata=None,
    )
    return {"message": "Case archived successfully."}

