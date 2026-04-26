from fastapi import APIRouter

from app.api.v1.endpoints_auth import router as auth_router
from app.api.v1.endpoints_cases import router as cases_router
from app.api.v1.endpoints_health import router as health_router
from app.api.v1.endpoints_org_users import router as org_user_router
from app.api.v1.endpoints_processing import router as processing_router
from app.api.v1.endpoints_reports import router as reports_router
from app.api.v1.endpoints_videos import router as videos_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(org_user_router)
api_router.include_router(cases_router)
api_router.include_router(videos_router)
api_router.include_router(processing_router)
api_router.include_router(reports_router)
api_router.include_router(health_router)

