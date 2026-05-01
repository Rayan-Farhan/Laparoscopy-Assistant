from __future__ import annotations

import json
import tempfile
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.entities import CaseStatus, JobStatus, ProcessingJob, ToolTimeline, UploadStatus, VideoAsset
from app.services.reports import generate_reports_for_job
from app.services.storage import get_storage_service


@dataclass
class TimelineRow:
    track_id: int
    tool_name: str
    class_id: int
    start_sec: float
    end_sec: float
    duration_sec: float
    mean_conf: float
    frame_count: int


def _load_mock_timeline() -> list[TimelineRow]:
    candidate_paths = [
        Path(__file__).resolve().parents[3] / "test_surgeries" / "surgery3" / "instrument_timeline.json",
        Path(__file__).resolve().parents[3] / "test_surgeries" / "surgery2" / "instrument_timeline.json",
    ]
    for candidate in candidate_paths:
        if candidate.exists():
            raw_rows = json.loads(candidate.read_text(encoding="utf-8"))
            return [
                TimelineRow(
                    track_id=int(item["track_id"]),
                    tool_name=str(item["tool"]),
                    class_id=int(item["class_id"]),
                    start_sec=float(item["start_sec"]),
                    end_sec=float(item["end_sec"]),
                    duration_sec=float(item["duration_sec"]),
                    mean_conf=float(item["mean_conf"]),
                    frame_count=int(item["frame_count"]),
                )
                for item in raw_rows
            ]
    raise RuntimeError("Mock inference was enabled, but no sample timeline JSON file was found.")


def _extract_timeline_with_yolo(video_path: str, *, model_path: str) -> list[TimelineRow]:
    try:
        import cv2
    except ImportError as exc:
        raise RuntimeError("OpenCV is not installed. Install inference dependencies before running inference.") from exc

    try:
        from ultralytics import YOLO
    except ImportError as exc:
        raise RuntimeError("Ultralytics is not installed. Install inference dependencies before running inference.") from exc

    if not Path(model_path).exists():
        raise RuntimeError(f"Model file not found: {model_path}")

    capture = cv2.VideoCapture(video_path)
    fps = capture.get(cv2.CAP_PROP_FPS)
    capture.release()
    fps = fps if fps and fps > 0 else 30.0

    model = YOLO(model_path)
    names_map: dict[int, str] = {}
    raw_names: Any = getattr(model, "names", {})
    if isinstance(raw_names, dict):
        names_map = {int(k): str(v) for k, v in raw_names.items()}

    tracks: dict[int, dict[str, Any]] = {}

    results = model.track(
        source=video_path,
        stream=True,
        tracker="bytetrack.yaml",
        verbose=False,
        persist=True,
        save=False,
    )

    for frame_index, frame_result in enumerate(results):
        boxes = getattr(frame_result, "boxes", None)
        if boxes is None or boxes.id is None:
            continue

        ids = boxes.id.cpu().numpy().astype(int)
        classes = boxes.cls.cpu().numpy().astype(int)
        confidences = boxes.conf.cpu().numpy().astype(float)

        for track_id, class_id, conf in zip(ids, classes, confidences, strict=True):
            data = tracks.get(track_id)
            if data is None:
                data = {
                    "start_frame": frame_index,
                    "end_frame": frame_index,
                    "class_counter": Counter([class_id]),
                    "conf_sum": float(conf),
                    "frame_count": 1,
                }
                tracks[track_id] = data
            else:
                data["end_frame"] = frame_index
                data["class_counter"][class_id] += 1
                data["conf_sum"] += float(conf)
                data["frame_count"] += 1

    timeline_rows: list[TimelineRow] = []
    for track_id, data in tracks.items():
        dominant_class = data["class_counter"].most_common(1)[0][0]
        start_sec = round(data["start_frame"] / fps, 2)
        end_sec = round(data["end_frame"] / fps, 2)
        duration = round(max(end_sec - start_sec, 0.0), 2)
        mean_conf = round(data["conf_sum"] / max(data["frame_count"], 1), 3)
        timeline_rows.append(
            TimelineRow(
                track_id=int(track_id),
                tool_name=names_map.get(int(dominant_class), f"class_{dominant_class}"),
                class_id=int(dominant_class),
                start_sec=start_sec,
                end_sec=end_sec,
                duration_sec=duration,
                mean_conf=mean_conf,
                frame_count=int(data["frame_count"]),
            )
        )

    timeline_rows.sort(key=lambda item: (item.start_sec, item.track_id))
    return timeline_rows


def _extract_timeline(video_path: str) -> list[TimelineRow]:
    settings = get_settings()
    if settings.mock_inference:
        return _load_mock_timeline()
    rows = _extract_timeline_with_yolo(video_path, model_path=settings.model_path)
    if not rows:
        raise RuntimeError("Inference completed but returned no tracked instruments.")
    return rows


def process_job(job_id: str) -> None:
    db: Session = SessionLocal()
    storage = get_storage_service()
    temp_file_path: Path | None = None
    try:
        job = db.get(ProcessingJob, job_id)
        if job is None:
            raise RuntimeError(f"Job '{job_id}' not found.")
        video = db.get(VideoAsset, job.video_asset_id)
        if video is None:
            raise RuntimeError(f"Video asset '{job.video_asset_id}' not found.")
        if video.upload_status != UploadStatus.uploaded:
            raise RuntimeError(f"Video asset '{video.id}' is not uploaded yet.")

        job.status = JobStatus.running
        job.progress_percent = 5
        job.started_at = datetime.now(UTC).replace(tzinfo=None)
        job.error_message = None
        db.commit()

        video_bytes = storage.download_bytes(video.storage_key)
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(video.original_filename).suffix or ".mp4") as temp_file:
            temp_file.write(video_bytes)
            temp_file_path = Path(temp_file.name)

        timeline_rows = _extract_timeline(str(temp_file_path))
        job.progress_percent = 70
        db.commit()

        db.execute(delete(ToolTimeline).where(ToolTimeline.job_id == job.id))
        for row in timeline_rows:
            db.add(
                ToolTimeline(
                    job_id=job.id,
                    track_id=row.track_id,
                    tool_name=row.tool_name,
                    class_id=row.class_id,
                    start_sec=row.start_sec,
                    end_sec=row.end_sec,
                    duration_sec=row.duration_sec,
                    mean_conf=row.mean_conf,
                    frame_count=row.frame_count,
                )
            )
        db.commit()

        job.progress_percent = 85
        db.commit()
        generate_reports_for_job(db, job=job)

        case_row = job.case
        if case_row is not None:
            case_row.status = CaseStatus.completed

        job.status = JobStatus.succeeded
        job.progress_percent = 100
        job.finished_at = datetime.now(UTC).replace(tzinfo=None)
        db.commit()
    except Exception as exc:
        job = db.get(ProcessingJob, job_id)
        if job is not None:
            job.status = JobStatus.failed
            job.error_message = str(exc)
            job.progress_percent = 100
            job.finished_at = datetime.now(UTC).replace(tzinfo=None)
            case_row = job.case
            if case_row is not None:
                case_row.status = CaseStatus.failed
            db.commit()
        raise
    finally:
        if temp_file_path is not None and temp_file_path.exists():
            temp_file_path.unlink(missing_ok=True)
        db.close()


def latest_case_timeline(db: Session, case_id: str) -> list[ToolTimeline]:
    latest_job = db.scalar(
        select(ProcessingJob)
        .where(ProcessingJob.case_id == case_id, ProcessingJob.status == JobStatus.succeeded)
        .order_by(ProcessingJob.created_at.desc())
    )
    if latest_job is None:
        return []
    return db.scalars(select(ToolTimeline).where(ToolTimeline.job_id == latest_job.id).order_by(ToolTimeline.start_sec)).all()

