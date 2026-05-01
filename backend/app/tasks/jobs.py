from app.services.processing import process_job
from app.tasks.celery_app import celery_app


@celery_app.task(name="app.tasks.jobs.run_processing_job", bind=True, max_retries=2)
def run_processing_job(self, job_id: str) -> None:
    process_job(job_id)

