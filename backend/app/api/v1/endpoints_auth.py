from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.dependencies import get_current_user
from app.core.security import (
    create_access_token,
    create_password_reset_token,
    create_refresh_token,
    get_password_hash,
    hash_token,
    parse_token_subject,
    verify_password,
)
from app.db.session import get_db
from app.models.entities import Organization, OrganizationMember, RefreshToken, User, UserRole
from app.schemas.api import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    LogoutRequest,
    MeResponse,
    MessageResponse,
    RefreshRequest,
    ResetPasswordRequest,
    SignupRequest,
    TokenPairResponse,
    UserResponse,
)
from app.services.audit import log_audit_event

router = APIRouter(prefix="/auth", tags=["auth"])


def _issue_token_pair(db: Session, user: User) -> TokenPairResponse:
    settings = get_settings()
    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)
    refresh_row = RefreshToken(
        user_id=user.id,
        token_hash=hash_token(refresh_token),
        expires_at=(datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days)).replace(tzinfo=None),
    )
    db.add(refresh_row)
    db.commit()
    return TokenPairResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/signup", response_model=TokenPairResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, db: Session = Depends(get_db)) -> TokenPairResponse:
    existing = db.scalar(select(User).where(User.email == payload.email.lower()))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already in use.")

    user = User(
        full_name=payload.full_name,
        email=payload.email.lower(),
        password_hash=get_password_hash(payload.password),
        role=payload.role if payload.role in {UserRole.surgeon, UserRole.doctor, UserRole.admin} else UserRole.doctor,
        is_active=True,
    )
    db.add(user)
    db.flush()

    organization = Organization(name=payload.organization_name or f"{payload.full_name}'s Organization")
    db.add(organization)
    db.flush()

    membership = OrganizationMember(
        organization_id=organization.id,
        user_id=user.id,
        role_in_org="owner",
    )
    db.add(membership)
    db.commit()
    db.refresh(user)

    log_audit_event(
        db,
        actor_user_id=user.id,
        action_type="auth.signup",
        target_type="user",
        target_id=user.id,
        metadata={"email": user.email},
    )
    return _issue_token_pair(db, user)


@router.post("/login", response_model=TokenPairResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenPairResponse:
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is inactive.")

    log_audit_event(
        db,
        actor_user_id=user.id,
        action_type="auth.login",
        target_type="user",
        target_id=user.id,
        metadata=None,
    )
    return _issue_token_pair(db, user)


@router.post("/refresh", response_model=TokenPairResponse)
def refresh_tokens(payload: RefreshRequest, db: Session = Depends(get_db)) -> TokenPairResponse:
    try:
        user_id = parse_token_subject(payload.refresh_token, "refresh")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    token_hash = hash_token(payload.refresh_token)
    token_row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    if token_row is None or token_row.revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token is invalid.")
    if token_row.expires_at < datetime.now(UTC).replace(tzinfo=None):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token has expired.")

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User account is unavailable.")

    token_row.revoked_at = datetime.now(UTC).replace(tzinfo=None)
    db.commit()
    return _issue_token_pair(db, user)


@router.post("/logout", response_model=MessageResponse)
def logout(payload: LogoutRequest, db: Session = Depends(get_db)) -> MessageResponse:
    token_hash = hash_token(payload.refresh_token)
    token_row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    if token_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Refresh token not found.")
    if token_row.revoked_at is None:
        token_row.revoked_at = datetime.now(UTC).replace(tzinfo=None)
        db.commit()
    return MessageResponse(message="Logged out successfully.")


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if user is None:
        return {"message": "If the account exists, reset instructions have been generated."}

    reset_token = create_password_reset_token(user.id)
    log_audit_event(
        db,
        actor_user_id=user.id,
        action_type="auth.forgot_password",
        target_type="user",
        target_id=user.id,
        metadata=None,
    )

    if get_settings().environment == "development":
        return {
            "message": "Reset token generated for development usage.",
            "reset_token": reset_token,
        }
    return {"message": "If the account exists, reset instructions have been generated."}


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)) -> MessageResponse:
    try:
        user_id = parse_token_subject(payload.reset_token, "password_reset")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    user.password_hash = get_password_hash(payload.new_password)
    db.commit()
    log_audit_event(
        db,
        actor_user_id=user.id,
        action_type="auth.reset_password",
        target_type="user",
        target_id=user.id,
        metadata=None,
    )
    return MessageResponse(message="Password reset successful.")


@router.get("/me", response_model=MeResponse)
def me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> MeResponse:
    membership = db.scalar(select(OrganizationMember).where(OrganizationMember.user_id == current_user.id))
    return MeResponse(
        user=UserResponse.model_validate(current_user),
        organization_id=membership.organization_id if membership is not None else None,
    )


@router.post("/change-password", response_model=MessageResponse)
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect.")
    current_user.password_hash = get_password_hash(payload.new_password)
    db.commit()
    log_audit_event(
        db,
        actor_user_id=current_user.id,
        action_type="auth.change_password",
        target_type="user",
        target_id=current_user.id,
        metadata=None,
    )
    return MessageResponse(message="Password changed successfully.")

