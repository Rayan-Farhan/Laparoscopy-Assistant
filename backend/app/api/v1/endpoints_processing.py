from __future__ import annotations

import json
import time

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.utils import get_case_for_user_or_404
from app.core.config import get_settings
from app.core.dependencies import get_current_user
from app.db.session import SessionLocal, get_db
from app.models.entities import CaseStatus, JobStatus, ProcessingJob, UploadStatus, User, VideoAsset
from app.schemas.api import JobResponse, ProcessCaseRequest
from app.services.audit import log_audit_event
from app.services.processing import process_job
from app.tasks.jobs import run_processing_job

router = APIRouter(tags=["processing"])


def _dispatch_processing_job(job_id: str) -> None:
    settings = get_settings()
    if settings.processing_dispatch == "inline":
        process_job(job_id)
        return
    run_processing_job.delay(job_id)


@router.post("/cases/{case_id}/process", response_model=JobResponse, status_code=status.HTTP_202_ACCEPTED)
def enqueue_case_processing(
    case_id: str,
    payload: ProcessCaseRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JobResponse:
    case_row = get_case_for_user_or_404(db, case_id, current_user)

    selected_video: VideoAsset | None = None
    if payload.video_asset_id:
        selected_video = db.get(VideoAsset, payload.video_asset_id)
        if selected_video is None or selected_video.case_id != case_row.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video asset not found for case.")
    else:
        selected_video = db.scalar(
            select(VideoAsset)
            .where(VideoAsset.case_id == case_row.id, VideoAsset.upload_status == UploadStatus.uploaded)
            .order_by(VideoAsset.created_at.desc())
        )
        if selected_video is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No uploaded videos available for case.")

    if selected_video.upload_status != UploadStatus.uploaded:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected video is not uploaded.")

    job = ProcessingJob(
        case_id=case_row.id,
        video_asset_id=selected_video.id,
        status=JobStatus.queued,
        progress_percent=0,
        model_version=payload.model_version or "best.pt",
    )
    db.add(job)
    case_row.status = CaseStatus.processing
    db.commit()
    db.refresh(job)

    log_audit_event(
        db,
        actor_user_id=current_user.id,
        action_type="processing.enqueue",
        target_type="processing_job",
        target_id=job.id,
        metadata={"case_id": case_row.id, "video_asset_id": selected_video.id},
    )
    _dispatch_processing_job(job.id)
    db.refresh(job)
    return JobResponse.model_validate(job)


@router.get("/jobs/{job_id}", response_model=JobResponse)
def get_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JobResponse:
    job = db.get(ProcessingJob, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    get_case_for_user_or_404(db, job.case_id, current_user)
    return JobResponse.model_validate(job)


@router.get("/cases/{case_id}/jobs", response_model=list[JobResponse])
def list_case_jobs(
    case_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[JobResponse]:
    case_row = get_case_for_user_or_404(db, case_id, current_user)
    jobs = db.scalars(select(ProcessingJob).where(ProcessingJob.case_id == case_row.id).order_by(ProcessingJob.created_at.desc())).all()
    return [JobResponse.model_validate(job) for job in jobs]


@router.get("/jobs/{job_id}/events")
def stream_job_events(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    first_job = db.get(ProcessingJob, job_id)
    if first_job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    get_case_for_user_or_404(db, first_job.case_id, current_user)

    def event_stream():
        last_payload: str | None = None
        for _ in range(120):
            local_db = SessionLocal()
            try:
                job = local_db.get(ProcessingJob, job_id)
                if job is None:
                    payload = json.dumps({"error": "Job not found"})
                    yield f"event: error\ndata: {payload}\n\n"
                    break

                payload = json.dumps(
                    {
                        "id": job.id,
                        "status": job.status.value,
                        "progress_percent": job.progress_percent,
                        "error_message": job.error_message,
                        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
                    }
                )
                if payload != last_payload:
                    yield f"event: update\ndata: {payload}\n\n"
                    last_payload = payload

                if job.status in {JobStatus.succeeded, JobStatus.failed}:
                    break
            finally:
                local_db.close()
            time.sleep(1)

    return StreamingResponse(event_stream(), media_type="text/event-stream")

