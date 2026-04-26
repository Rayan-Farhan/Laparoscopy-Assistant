from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.entities import CaseStatus, JobStatus, ReportType, UploadStatus, UserRole


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class MessageResponse(APIModel):
    message: str


class TokenPairResponse(APIModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class SignupRequest(APIModel):
    full_name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: UserRole = UserRole.doctor
    organization_name: str | None = Field(default=None, max_length=255)


class LoginRequest(APIModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class RefreshRequest(APIModel):
    refresh_token: str = Field(min_length=32)


class LogoutRequest(APIModel):
    refresh_token: str = Field(min_length=32)


class ForgotPasswordRequest(APIModel):
    email: EmailStr


class ResetPasswordRequest(APIModel):
    reset_token: str = Field(min_length=32)
    new_password: str = Field(min_length=8, max_length=128)


class ChangePasswordRequest(APIModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class UserResponse(APIModel):
    id: str
    full_name: str
    email: EmailStr
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime


class MeResponse(APIModel):
    user: UserResponse
    organization_id: str | None = None


class UserUpdateRequest(APIModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    role: UserRole | None = None
    is_active: bool | None = None


class OrganizationResponse(APIModel):
    id: str
    name: str
    created_at: datetime


class CaseCreateRequest(APIModel):
    case_code: str = Field(min_length=2, max_length=120)
    procedure_type: str = Field(min_length=2, max_length=255)
    surgery_date: date | None = None
    notes: str | None = None
    de_identification_notes: str | None = None


class CaseUpdateRequest(APIModel):
    procedure_type: str | None = Field(default=None, min_length=2, max_length=255)
    surgery_date: date | None = None
    notes: str | None = None
    de_identification_notes: str | None = None
    status: CaseStatus | None = None


class SurgeryCaseResponse(APIModel):
    id: str
    organization_id: str
    created_by_user_id: str
    case_code: str
    procedure_type: str
    surgery_date: date | None
    notes: str | None
    de_identification_notes: str | None
    status: CaseStatus
    created_at: datetime
    updated_at: datetime


class PaginationMeta(APIModel):
    page: int
    page_size: int
    total: int


class CasesListResponse(APIModel):
    items: list[SurgeryCaseResponse]
    pagination: PaginationMeta


class UploadUrlRequest(APIModel):
    original_filename: str = Field(min_length=1, max_length=255)
    file_size_bytes: int = Field(gt=0)
    mime_type: str = Field(min_length=3, max_length=255)


class UploadCompleteRequest(APIModel):
    video_asset_id: str
    storage_key: str
    checksum: str | None = None


class VideoAssetResponse(APIModel):
    id: str
    case_id: str
    uploader_user_id: str
    storage_key: str
    original_filename: str
    file_size_bytes: int
    duration_sec: float | None
    mime_type: str
    checksum: str | None
    upload_status: UploadStatus
    created_at: datetime


class UploadUrlResponse(APIModel):
    video_asset_id: str
    storage_key: str
    upload_url: str
    required_headers: dict[str, str]


class ProcessCaseRequest(APIModel):
    video_asset_id: str | None = None
    model_version: str | None = None


class JobResponse(APIModel):
    id: str
    case_id: str
    video_asset_id: str
    status: JobStatus
    progress_percent: int
    started_at: datetime | None
    finished_at: datetime | None
    error_message: str | None
    model_version: str | None
    created_at: datetime


class ToolTimelineResponse(APIModel):
    id: str
    job_id: str
    track_id: int
    tool_name: str
    class_id: int
    start_sec: float
    end_sec: float
    duration_sec: float
    mean_conf: float
    frame_count: int


class ReportResponse(APIModel):
    id: str
    case_id: str
    job_id: str
    report_type: ReportType
    storage_key: str
    size_bytes: int
    created_at: datetime


class ReportsListResponse(APIModel):
    items: list[ReportResponse]
    pagination: PaginationMeta


class DownloadResponse(APIModel):
    download_url: str | None = None
    stream: bool = False


class ReportGenerateRequest(APIModel):
    report_types: list[Literal["json", "csv", "pdf"]] = Field(default_factory=lambda: ["json", "csv", "pdf"])

    @field_validator("report_types")
    @classmethod
    def validate_unique_types(cls, values: list[str]) -> list[str]:
        if len(set(values)) != len(values):
            raise ValueError("Report types must not contain duplicates.")
        return values

