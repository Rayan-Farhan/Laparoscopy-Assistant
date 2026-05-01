from uuid import uuid4

from fastapi.testclient import TestClient


def auth_headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}


def create_user_and_tokens(
    client: TestClient,
    *,
    role: str = "doctor",
    email: str | None = None,
    full_name: str = "Test User",
    password: str = "StrongPass123!",
) -> dict[str, str]:
    user_email = email or f"user-{uuid4().hex[:8]}@example.com"
    response = client.post(
        "/api/v1/auth/signup",
        json={
            "full_name": full_name,
            "email": user_email,
            "password": password,
            "role": role,
            "organization_name": "Test Org",
        },
    )
    assert response.status_code == 201, response.text
    payload = response.json()
    return {
        "email": user_email,
        "password": password,
        "access_token": payload["access_token"],
        "refresh_token": payload["refresh_token"],
    }

