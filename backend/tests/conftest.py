from __future__ import annotations

import os
import shutil
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("APP_NAME", "Laparoscopy Assistant Test")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("API_V1_PREFIX", "/api/v1")
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_laparoscopy.db")
os.environ.setdefault("CELERY_BROKER_URL", "redis://localhost:6379/0")
os.environ.setdefault("CELERY_RESULT_BACKEND", "redis://localhost:6379/1")
os.environ.setdefault("PROCESSING_DISPATCH", "inline")
os.environ.setdefault("MOCK_INFERENCE", "true")
os.environ.setdefault("STORAGE_MODE", "local")
os.environ.setdefault("LOCAL_STORAGE_PATH", str(Path(__file__).resolve().parents[1] / ".test-storage"))
os.environ.setdefault("S3_BUCKET", "test-bucket")
os.environ.setdefault("S3_ENDPOINT_URL", "http://localhost:9000")
os.environ.setdefault("MODEL_PATH", str(Path(__file__).resolve().parents[2] / "models" / "best.pt"))

from app.core.config import get_settings

get_settings.cache_clear()

from app.db.base import Base
from app.db.session import engine
from app.main import app
from tests.utils import create_user_and_tokens


@pytest.fixture(autouse=True)
def reset_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    storage_path = Path(os.environ["LOCAL_STORAGE_PATH"])
    if storage_path.exists():
        shutil.rmtree(storage_path)
    storage_path.mkdir(parents=True, exist_ok=True)
    yield


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client

@pytest.fixture
def doctor_tokens(client: TestClient) -> dict[str, str]:
    return create_user_and_tokens(client, role="doctor")


@pytest.fixture
def admin_tokens(client: TestClient) -> dict[str, str]:
    return create_user_and_tokens(client, role="admin")

