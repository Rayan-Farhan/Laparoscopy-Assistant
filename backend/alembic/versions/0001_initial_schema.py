"""Initial schema for Laparoscopy Assistant

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-04-18
"""

from alembic import op
import sqlalchemy as sa


revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


user_role = sa.Enum("surgeon", "doctor", "admin", name="user_role")
case_status = sa.Enum("draft", "uploaded", "processing", "completed", "failed", "archived", name="case_status")
upload_status = sa.Enum("pending", "uploaded", "deleted", name="upload_status")
job_status = sa.Enum("queued", "running", "succeeded", "failed", name="job_status")
report_type = sa.Enum("json", "pdf", "csv", "png", name="report_type")


def upgrade() -> None:
    bind = op.get_bind()
    user_role.create(bind, checkfirst=True)
    case_status.create(bind, checkfirst=True)
    upload_status.create(bind, checkfirst=True)
    job_status.create(bind, checkfirst=True)
    report_type.create(bind, checkfirst=True)

    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", user_role, nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=False)

    op.create_table(
        "organizations",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "organization_members",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("organization_id", sa.String(length=36), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("role_in_org", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_organization_members_organization_id", "organization_members", ["organization_id"], unique=False)
    op.create_index("ix_organization_members_user_id", "organization_members", ["user_id"], unique=False)
    op.create_index("ix_org_member_org_user", "organization_members", ["organization_id", "user_id"], unique=True)

    op.create_table(
        "surgery_cases",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("organization_id", sa.String(length=36), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("created_by_user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("case_code", sa.String(length=120), nullable=False),
        sa.Column("procedure_type", sa.String(length=255), nullable=False),
        sa.Column("surgery_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("de_identification_notes", sa.Text(), nullable=True),
        sa.Column("status", case_status, nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_surgery_cases_organization_id", "surgery_cases", ["organization_id"], unique=False)
    op.create_index("ix_surgery_cases_created_by_user_id", "surgery_cases", ["created_by_user_id"], unique=False)
    op.create_index("ix_surgery_cases_case_code", "surgery_cases", ["case_code"], unique=False)
    op.create_index("ix_case_status_date", "surgery_cases", ["status", "surgery_date"], unique=False)
    op.create_index("ix_case_created_at", "surgery_cases", ["created_at"], unique=False)

    op.create_table(
        "video_assets",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("case_id", sa.String(length=36), sa.ForeignKey("surgery_cases.id"), nullable=False),
        sa.Column("uploader_user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("storage_key", sa.String(length=512), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("file_size_bytes", sa.Integer(), nullable=False),
        sa.Column("duration_sec", sa.Float(), nullable=True),
        sa.Column("mime_type", sa.String(length=255), nullable=False),
        sa.Column("checksum", sa.String(length=255), nullable=True),
        sa.Column("upload_status", upload_status, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_video_assets_case_id", "video_assets", ["case_id"], unique=False)
    op.create_index("ix_video_assets_uploader_user_id", "video_assets", ["uploader_user_id"], unique=False)
    op.create_index("ix_video_created_at", "video_assets", ["created_at"], unique=False)

    op.create_table(
        "processing_jobs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("case_id", sa.String(length=36), sa.ForeignKey("surgery_cases.id"), nullable=False),
        sa.Column("video_asset_id", sa.String(length=36), sa.ForeignKey("video_assets.id"), nullable=False),
        sa.Column("status", job_status, nullable=False),
        sa.Column("progress_percent", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("model_version", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_processing_jobs_case_id", "processing_jobs", ["case_id"], unique=False)
    op.create_index("ix_processing_jobs_video_asset_id", "processing_jobs", ["video_asset_id"], unique=False)
    op.create_index("ix_job_status_created", "processing_jobs", ["status", "created_at"], unique=False)
    op.create_index("ix_job_case_created", "processing_jobs", ["case_id", "created_at"], unique=False)

    op.create_table(
        "tool_timelines",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("job_id", sa.String(length=36), sa.ForeignKey("processing_jobs.id"), nullable=False),
        sa.Column("track_id", sa.Integer(), nullable=False),
        sa.Column("tool_name", sa.String(length=255), nullable=False),
        sa.Column("class_id", sa.Integer(), nullable=False),
        sa.Column("start_sec", sa.Float(), nullable=False),
        sa.Column("end_sec", sa.Float(), nullable=False),
        sa.Column("duration_sec", sa.Float(), nullable=False),
        sa.Column("mean_conf", sa.Float(), nullable=False),
        sa.Column("frame_count", sa.Integer(), nullable=False),
    )
    op.create_index("ix_tool_timelines_job_id", "tool_timelines", ["job_id"], unique=False)
    op.create_index("ix_timeline_job_tool", "tool_timelines", ["job_id", "tool_name"], unique=False)

    op.create_table(
        "generated_reports",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("case_id", sa.String(length=36), sa.ForeignKey("surgery_cases.id"), nullable=False),
        sa.Column("job_id", sa.String(length=36), sa.ForeignKey("processing_jobs.id"), nullable=False),
        sa.Column("report_type", report_type, nullable=False),
        sa.Column("storage_key", sa.String(length=512), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_generated_reports_case_id", "generated_reports", ["case_id"], unique=False)
    op.create_index("ix_generated_reports_job_id", "generated_reports", ["job_id"], unique=False)
    op.create_index("ix_report_case_created", "generated_reports", ["case_id", "created_at"], unique=False)

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("actor_user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action_type", sa.String(length=255), nullable=False),
        sa.Column("target_type", sa.String(length=255), nullable=False),
        sa.Column("target_id", sa.String(length=255), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_audit_logs_actor_user_id", "audit_logs", ["actor_user_id"], unique=False)
    op.create_index("ix_audit_actor_created", "audit_logs", ["actor_user_id", "created_at"], unique=False)

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token_hash", sa.String(length=255), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"], unique=False)
    op.create_index("ix_refresh_tokens_token_hash", "refresh_tokens", ["token_hash"], unique=False)
    op.create_index("ix_refresh_user_expires", "refresh_tokens", ["user_id", "expires_at"], unique=False)


def downgrade() -> None:
    op.drop_table("refresh_tokens")
    op.drop_table("audit_logs")
    op.drop_table("generated_reports")
    op.drop_table("tool_timelines")
    op.drop_table("processing_jobs")
    op.drop_table("video_assets")
    op.drop_table("surgery_cases")
    op.drop_table("organization_members")
    op.drop_table("organizations")
    op.drop_table("users")

    bind = op.get_bind()
    report_type.drop(bind, checkfirst=True)
    job_status.drop(bind, checkfirst=True)
    upload_status.drop(bind, checkfirst=True)
    case_status.drop(bind, checkfirst=True)
    user_role.drop(bind, checkfirst=True)

