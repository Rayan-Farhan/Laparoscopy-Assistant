from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.utils import get_case_for_user_or_404
from app.core.config import get_settings
from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.entities import CaseStatus, UploadStatus, User, VideoAsset
from app.schemas.api import UploadCompleteRequest, UploadUrlRequest, UploadUrlResponse, VideoAssetResponse
from app.services.audit import log_audit_event
from app.services.storage import get_storage_service

router = APIRouter(tags=["videos"])


def _build_video_storage_key(case_id: str, filename: str) -> str:
    suffix = Path(filename).suffix or ".mp4"
    return f"videos/{case_id}/{uuid4()}{suffix}"


@router.post("/cases/{case_id}/videos/upload-url", response_model=UploadUrlResponse)
def create_upload_url(
    case_id: str,
    payload: UploadUrlRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UploadUrlResponse:
    case_row = get_case_for_user_or_404(db, case_id, current_user)
    storage = get_storage_service()
    storage_key = _build_video_storage_key(case_row.id, payload.original_filename)
    upload_url = storage.generate_upload_url(storage_key=storage_key, content_type=payload.mime_type)

    video = VideoAsset(
        case_id=case_row.id,
        uploader_user_id=current_user.id,
        storage_key=storage_key,
        original_filename=payload.original_filename,
        file_size_bytes=payload.file_size_bytes,
        mime_type=payload.mime_type,
        upload_status=UploadStatus.pending,
    )
    db.add(video)
    db.commit()
    db.refresh(video)

    log_audit_event(
        db,
        actor_user_id=current_user.id,
        action_type="videos.upload_url",
        target_type="video_asset",
        target_id=video.id,
        metadata={"case_id": case_id},
    )
    return UploadUrlResponse(
        video_asset_id=video.id,
        storage_key=storage_key,
        upload_url=upload_url,
        required_headers={"Content-Type": payload.mime_type},
    )


@router.post("/cases/{case_id}/videos/complete", response_model=VideoAssetResponse)
def complete_upload(
    case_id: str,
    payload: UploadCompleteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> VideoAssetResponse:
    case_row = get_case_for_user_or_404(db, case_id, current_user)
    video = db.get(VideoAsset, payload.video_asset_id)
    if video is None or video.case_id != case_row.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video asset not found.")
    if video.storage_key != payload.storage_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Storage key mismatch.")

    storage = get_storage_service()
    if not storage.object_exists(video.storage_key):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded object not found in storage.")

    video.upload_status = UploadStatus.uploaded
    video.checksum = payload.checksum
    case_row.status = CaseStatus.uploaded
    db.commit()
    db.refresh(video)

    log_audit_event(
        db,
        actor_user_id=current_user.id,
        action_type="videos.complete_upload",
        target_type="video_asset",
        target_id=video.id,
        metadata=None,
    )
    return VideoAssetResponse.model_validate(video)


@router.post("/cases/{case_id}/videos/upload", response_model=VideoAssetResponse, status_code=status.HTTP_201_CREATED)
async def upload_video_multipart(
    case_id: str,
    file: UploadFile = File(...),
    checksum: str | None = Form(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> VideoAssetResponse:
    case_row = get_case_for_user_or_404(db, case_id, current_user)
    settings = get_settings()

    if not file.content_type or not file.content_type.startswith("video/"):
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Only video uploads are allowed.")

    raw = await file.read()
    max_size_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(raw) > max_size_bytes:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Video exceeds maximum upload size.")
    if len(raw) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")

    storage = get_storage_service()
    storage_key = _build_video_storage_key(case_row.id, file.filename or "surgery-video.mp4")
    storage.upload_bytes(storage_key=storage_key, content=raw, content_type=file.content_type)

    video = VideoAsset(
        case_id=case_row.id,
        uploader_user_id=current_user.id,
        storage_key=storage_key,
        original_filename=file.filename or "surgery-video.mp4",
        file_size_bytes=len(raw),
        mime_type=file.content_type,
        checksum=checksum,
        upload_status=UploadStatus.uploaded,
    )
    db.add(video)
    case_row.status = CaseStatus.uploaded
    db.commit()
    db.refresh(video)

    log_audit_event(
        db,
        actor_user_id=current_user.id,
        action_type="videos.upload_multipart",
        target_type="video_asset",
        target_id=video.id,
        metadata={"size_bytes": len(raw)},
    )
    return VideoAssetResponse.model_validate(video)


@router.get("/cases/{case_id}/videos", response_model=list[VideoAssetResponse])
def list_case_videos(
    case_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[VideoAssetResponse]:
    case_row = get_case_for_user_or_404(db, case_id, current_user)
    videos = db.scalars(
        select(VideoAsset).where(VideoAsset.case_id == case_row.id, VideoAsset.upload_status != UploadStatus.deleted)
    ).all()
    return [VideoAssetResponse.model_validate(video) for video in videos]


@router.delete("/videos/{video_id}", response_model=dict)
def delete_video(
    video_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    video = db.get(VideoAsset, video_id)
    if video is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video asset not found.")
    case_row = get_case_for_user_or_404(db, video.case_id, current_user)
    if case_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.")
    video.upload_status = UploadStatus.deleted
    db.commit()
    log_audit_event(
        db,
        actor_user_id=current_user.id,
        action_type="videos.delete",
        target_type="video_asset",
        target_id=video_id,
        metadata=None,
    )
    return {"message": "Video deleted successfully."}

