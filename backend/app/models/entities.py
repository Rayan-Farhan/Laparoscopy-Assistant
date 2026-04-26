from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any
from uuid import uuid4

from sqlalchemy import JSON, Boolean, Date, DateTime, Enum as SqlEnum, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _uuid_str() -> str:
    return str(uuid4())


class UserRole(str, Enum):
    surgeon = "surgeon"
    doctor = "doctor"
    admin = "admin"


class CaseStatus(str, Enum):
    draft = "draft"
    uploaded = "uploaded"
    processing = "processing"
    completed = "completed"
    failed = "failed"
    archived = "archived"


class UploadStatus(str, Enum):
    pending = "pending"
    uploaded = "uploaded"
    deleted = "deleted"


class JobStatus(str, Enum):
    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"


class ReportType(str, Enum):
    json = "json"
    pdf = "pdf"
    csv = "csv"
    png = "png"


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(SqlEnum(UserRole, name="user_role"), nullable=False, default=UserRole.doctor)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    memberships: Mapped[list["OrganizationMember"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=datetime.utcnow, nullable=False)

    memberships: Mapped[list["OrganizationMember"]] = relationship(
        back_populates="organization", cascade="all, delete-orphan"
    )


class OrganizationMember(Base):
    __tablename__ = "organization_members"
    __table_args__ = (Index("ix_org_member_org_user", "organization_id", "user_id", unique=True),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    role_in_org: Mapped[str] = mapped_column(String(100), nullable=False, default="member")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=datetime.utcnow, nullable=False)

    organization: Mapped[Organization] = relationship(back_populates="memberships")
    user: Mapped[User] = relationship(back_populates="memberships")


class SurgeryCase(Base, TimestampMixin):
    __tablename__ = "surgery_cases"
    __table_args__ = (
        Index("ix_case_status_date", "status", "surgery_date"),
        Index("ix_case_created_at", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    created_by_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    case_code: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    procedure_type: Mapped[str] = mapped_column(String(255), nullable=False)
    surgery_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    de_identification_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[CaseStatus] = mapped_column(SqlEnum(CaseStatus, name="case_status"), nullable=False, default=CaseStatus.draft)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    videos: Mapped[list["VideoAsset"]] = relationship(back_populates="case", cascade="all, delete-orphan")
    jobs: Mapped[list["ProcessingJob"]] = relationship(back_populates="case", cascade="all, delete-orphan")


class VideoAsset(Base):
    __tablename__ = "video_assets"
    __table_args__ = (Index("ix_video_created_at", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    case_id: Mapped[str] = mapped_column(ForeignKey("surgery_cases.id"), nullable=False, index=True)
    uploader_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_sec: Mapped[float | None] = mapped_column(Float, nullable=True)
    mime_type: Mapped[str] = mapped_column(String(255), nullable=False)
    checksum: Mapped[str | None] = mapped_column(String(255), nullable=True)
    upload_status: Mapped[UploadStatus] = mapped_column(
        SqlEnum(UploadStatus, name="upload_status"), nullable=False, default=UploadStatus.pending
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=datetime.utcnow, nullable=False)

    case: Mapped[SurgeryCase] = relationship(back_populates="videos")


class ProcessingJob(Base):
    __tablename__ = "processing_jobs"
    __table_args__ = (
        Index("ix_job_status_created", "status", "created_at"),
        Index("ix_job_case_created", "case_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    case_id: Mapped[str] = mapped_column(ForeignKey("surgery_cases.id"), nullable=False, index=True)
    video_asset_id: Mapped[str] = mapped_column(ForeignKey("video_assets.id"), nullable=False, index=True)
    status: Mapped[JobStatus] = mapped_column(SqlEnum(JobStatus, name="job_status"), nullable=False, default=JobStatus.queued)
    progress_percent: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_version: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=datetime.utcnow, nullable=False)

    case: Mapped[SurgeryCase] = relationship(back_populates="jobs")
    timeline_rows: Mapped[list["ToolTimeline"]] = relationship(back_populates="job", cascade="all, delete-orphan")
    reports: Mapped[list["GeneratedReport"]] = relationship(back_populates="job", cascade="all, delete-orphan")


class ToolTimeline(Base):
    __tablename__ = "tool_timelines"
    __table_args__ = (Index("ix_timeline_job_tool", "job_id", "tool_name"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    job_id: Mapped[str] = mapped_column(ForeignKey("processing_jobs.id"), nullable=False, index=True)
    track_id: Mapped[int] = mapped_column(Integer, nullable=False)
    tool_name: Mapped[str] = mapped_column(String(255), nullable=False)
    class_id: Mapped[int] = mapped_column(Integer, nullable=False)
    start_sec: Mapped[float] = mapped_column(Float, nullable=False)
    end_sec: Mapped[float] = mapped_column(Float, nullable=False)
    duration_sec: Mapped[float] = mapped_column(Float, nullable=False)
    mean_conf: Mapped[float] = mapped_column(Float, nullable=False)
    frame_count: Mapped[int] = mapped_column(Integer, nullable=False)

    job: Mapped[ProcessingJob] = relationship(back_populates="timeline_rows")


class GeneratedReport(Base):
    __tablename__ = "generated_reports"
    __table_args__ = (Index("ix_report_case_created", "case_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    case_id: Mapped[str] = mapped_column(ForeignKey("surgery_cases.id"), nullable=False, index=True)
    job_id: Mapped[str] = mapped_column(ForeignKey("processing_jobs.id"), nullable=False, index=True)
    report_type: Mapped[ReportType] = mapped_column(SqlEnum(ReportType, name="report_type"), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=datetime.utcnow, nullable=False)

    job: Mapped[ProcessingJob] = relationship(back_populates="reports")


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_actor_created", "actor_user_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    actor_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    action_type: Mapped[str] = mapped_column(String(255), nullable=False)
    target_type: Mapped[str] = mapped_column(String(255), nullable=False)
    target_id: Mapped[str] = mapped_column(String(255), nullable=False)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=datetime.utcnow, nullable=False)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    __table_args__ = (Index("ix_refresh_user_expires", "user_id", "expires_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=datetime.utcnow, nullable=False)

