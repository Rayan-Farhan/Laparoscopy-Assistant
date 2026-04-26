from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.utils import count_query, get_case_for_user_or_404, get_pagination
from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.entities import GeneratedReport, JobStatus, ProcessingJob, ReportType, ToolTimeline, User
from app.schemas.api import (
    PaginationMeta,
    ReportGenerateRequest,
    ReportResponse,
    ReportsListResponse,
    ToolTimelineResponse,
)
from app.services.audit import log_audit_event
from app.services.reports import generate_reports_for_job
from app.services.storage import get_storage_service

router = APIRouter(tags=["reports-and-results"])


@router.get("/cases/{case_id}/timeline", response_model=list[ToolTimelineResponse])
def get_case_timeline(
    case_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ToolTimelineResponse]:
    case_row = get_case_for_user_or_404(db, case_id, current_user)
    latest_job = db.scalar(
        select(ProcessingJob)
        .where(ProcessingJob.case_id == case_row.id, ProcessingJob.status == JobStatus.succeeded)
        .order_by(ProcessingJob.created_at.desc())
    )
    if latest_job is None:
        return []
    timeline_rows = db.scalars(select(ToolTimeline).where(ToolTimeline.job_id == latest_job.id).order_by(ToolTimeline.start_sec)).all()
    return [ToolTimelineResponse.model_validate(row) for row in timeline_rows]


@router.get("/cases/{case_id}/reports", response_model=ReportsListResponse)
def list_case_reports(
    case_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    report_type: ReportType | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReportsListResponse:
    case_row = get_case_for_user_or_404(db, case_id, current_user)
    offset, limit = get_pagination(page, page_size)
    stmt = select(GeneratedReport).where(GeneratedReport.case_id == case_row.id)
    if report_type is not None:
        stmt = stmt.where(GeneratedReport.report_type == report_type)
    stmt = stmt.order_by(GeneratedReport.created_at.desc())
    total = count_query(db, stmt)
    reports = db.scalars(stmt.offset(offset).limit(limit)).all()
    return ReportsListResponse(
        items=[ReportResponse.model_validate(report) for report in reports],
        pagination=PaginationMeta(page=page, page_size=page_size, total=total),
    )


@router.post("/cases/{case_id}/reports/generate", response_model=list[ReportResponse], status_code=status.HTTP_201_CREATED)
def regenerate_reports(
    case_id: str,
    payload: ReportGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ReportResponse]:
    case_row = get_case_for_user_or_404(db, case_id, current_user)
    latest_job = db.scalar(
        select(ProcessingJob)
        .where(ProcessingJob.case_id == case_row.id, ProcessingJob.status == JobStatus.succeeded)
        .order_by(ProcessingJob.created_at.desc())
    )
    if latest_job is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No successful job exists for report generation.",
        )

    requested_types = [ReportType(type_name) for type_name in payload.report_types]
    created = generate_reports_for_job(db, job=latest_job, report_types=requested_types)
    log_audit_event(
        db,
        actor_user_id=current_user.id,
        action_type="reports.generate",
        target_type="surgery_case",
        target_id=case_id,
        metadata={"report_types": payload.report_types},
    )
    return [ReportResponse.model_validate(row) for row in created]


@router.get("/reports/{report_id}/download", response_model=None)
def download_report(
    report_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response | dict[str, str | bool]:
    report = db.get(GeneratedReport, report_id)
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")
    get_case_for_user_or_404(db, report.case_id, current_user)

    storage = get_storage_service()
    log_audit_event(
        db,
        actor_user_id=current_user.id,
        action_type="reports.download",
        target_type="generated_report",
        target_id=report.id,
        metadata={"report_type": report.report_type.value},
    )

    if storage.settings.storage_mode == "s3":
        url = storage.generate_download_url(storage_key=report.storage_key)
        return {"download_url": url, "stream": False}

    payload = storage.download_bytes(report.storage_key)
    media_type = {
        ReportType.json: "application/json",
        ReportType.csv: "text/csv",
        ReportType.pdf: "application/pdf",
        ReportType.png: "image/png",
    }[report.report_type]
    filename = f"report-{report.id}.{report.report_type.value}"
    return Response(
        content=payload,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

