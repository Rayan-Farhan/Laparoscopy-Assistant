from fastapi.testclient import TestClient

from tests.utils import auth_headers


def test_case_crud(client: TestClient, doctor_tokens: dict[str, str]):
    headers = auth_headers(doctor_tokens["access_token"])

    create_response = client.post(
        "/api/v1/cases",
        headers=headers,
        json={
            "case_code": "CASE-100",
            "procedure_type": "Laparoscopic Procedure",
            "surgery_date": "2026-04-18",
            "notes": "Initial notes",
            "de_identification_notes": "Masked patient identifiers",
        },
    )
    assert create_response.status_code == 201, create_response.text
    case_payload = create_response.json()
    case_id = case_payload["id"]
    assert case_payload["case_code"] == "CASE-100"

    list_response = client.get("/api/v1/cases?page=1&page_size=10&status=draft", headers=headers)
    assert list_response.status_code == 200
    assert list_response.json()["pagination"]["total"] == 1

    update_response = client.patch(
        f"/api/v1/cases/{case_id}",
        headers=headers,
        json={"status": "uploaded", "notes": "Updated notes"},
    )
    assert update_response.status_code == 200
    assert update_response.json()["status"] == "uploaded"

    delete_response = client.delete(f"/api/v1/cases/{case_id}", headers=headers)
    assert delete_response.status_code == 200

    final_list_response = client.get("/api/v1/cases?page=1&page_size=10", headers=headers)
    assert final_list_response.status_code == 200
    assert final_list_response.json()["pagination"]["total"] == 0

