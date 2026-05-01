from fastapi.testclient import TestClient

from tests.utils import auth_headers


def test_job_state_transitions_and_reports(client: TestClient, doctor_tokens: dict[str, str]):
    headers = auth_headers(doctor_tokens["access_token"])

    case_response = client.post(
        "/api/v1/cases",
        headers=headers,
        json={
            "case_code": "CASE-JOB-001",
            "procedure_type": "Laparoscopy",
            "surgery_date": "2026-04-18",
        },
    )
    assert case_response.status_code == 201
    case_id = case_response.json()["id"]

    upload_response = client.post(
        f"/api/v1/cases/{case_id}/videos/upload",
        headers=headers,
        files={"file": ("sample.mp4", b"fake-video-bytes", "video/mp4")},
    )
    assert upload_response.status_code == 201, upload_response.text
    video_id = upload_response.json()["id"]

    process_response = client.post(
        f"/api/v1/cases/{case_id}/process",
        headers=headers,
        json={"video_asset_id": video_id},
    )
    assert process_response.status_code == 202, process_response.text
    job_id = process_response.json()["id"]

    job_response = client.get(f"/api/v1/jobs/{job_id}", headers=headers)
    assert job_response.status_code == 200
    assert job_response.json()["status"] in {"queued", "running", "succeeded"}

    timeline_response = client.get(f"/api/v1/cases/{case_id}/timeline", headers=headers)
    assert timeline_response.status_code == 200
    assert len(timeline_response.json()) > 0

    reports_response = client.get(f"/api/v1/cases/{case_id}/reports?page=1&page_size=20", headers=headers)
    assert reports_response.status_code == 200
    assert len(reports_response.json()["items"]) >= 3

