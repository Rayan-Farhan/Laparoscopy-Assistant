from celery import Celery

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "laparoscopy_assistant_worker",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.tasks.jobs"],
)

celery_app.conf.task_routes = {"app.tasks.jobs.run_processing_job": {"queue": "processing"}}
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
)

# Ensure task modules are imported so workers register tasks at startup.
from app.tasks import jobs  # noqa: F401, E402

