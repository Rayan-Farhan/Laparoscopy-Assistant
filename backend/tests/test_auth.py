from fastapi.testclient import TestClient

from tests.utils import auth_headers, create_user_and_tokens


def test_signup_login_refresh_logout_flow(client: TestClient):
    tokens = create_user_and_tokens(client, role="doctor", email="auth-flow@example.com")

    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": tokens["email"], "password": tokens["password"]},
    )
    assert login_response.status_code == 200
    login_payload = login_response.json()
    assert login_payload["access_token"]
    assert login_payload["refresh_token"]

    refresh_response = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": login_payload["refresh_token"]},
    )
    assert refresh_response.status_code == 200
    refresh_payload = refresh_response.json()
    assert refresh_payload["access_token"] != login_payload["access_token"]

    me_response = client.get("/api/v1/auth/me", headers=auth_headers(refresh_payload["access_token"]))
    assert me_response.status_code == 200
    assert me_response.json()["user"]["email"] == tokens["email"]

    logout_response = client.post(
        "/api/v1/auth/logout",
        json={"refresh_token": refresh_payload["refresh_token"]},
    )
    assert logout_response.status_code == 200


def test_signup_accepts_long_passwords(client: TestClient):
    long_password = "a" * 100
    signup_response = client.post(
        "/api/v1/auth/signup",
        json={
            "full_name": "Long Password User",
            "email": "long-password@example.com",
            "password": long_password,
            "role": "doctor",
            "organization_name": "Test Org",
        },
    )
    assert signup_response.status_code == 201, signup_response.text

    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "long-password@example.com", "password": long_password},
    )
    assert login_response.status_code == 200, login_response.text

