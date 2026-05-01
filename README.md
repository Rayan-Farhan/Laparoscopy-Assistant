# Laparoscopy Assistant

Production-style fullstack application for laparoscopic video analytics, built around the YOLOv8 surgical tool model in `models/best.pt`.

## What this includes

- **Frontend:** Next.js (App Router) + TypeScript + Tailwind + React Query + Recharts
- **Backend API:** FastAPI + SQLAlchemy + Alembic + Pydantic v2 + JWT auth (access/refresh)
- **Async processing:** Celery worker + Redis
- **Data layer:** PostgreSQL
- **Object storage:** S3-compatible (MinIO local)
- **Reports:** JSON + CSV + PDF generation from detected tool timelines
- **Dockerized local stack:** frontend, backend, worker, postgres, redis, minio

## Repository structure

```text
surgical-tools-CV/
├── backend/
│   ├── app/
│   │   ├── api/v1/                  # FastAPI routers
│   │   ├── core/                    # settings, auth, dependencies
│   │   ├── db/                      # session + seed script
│   │   ├── models/                  # SQLAlchemy models
│   │   ├── schemas/                 # Pydantic request/response models
│   │   ├── services/                # storage, processing, reports, audit
│   │   └── tasks/                   # Celery app + tasks
│   ├── alembic/                     # migrations
│   ├── tests/                       # unit, integration, e2e tests
│   └── Dockerfile
├── frontend/
│   ├── src/app/                     # auth + protected pages
│   ├── src/components/              # UI + shell + providers
│   ├── src/lib/                     # API client + shared types
│   └── Dockerfile
├── models/                          # trained YOLO weights
├── test_surgeries/                  # sample timeline outputs
├── docker-compose.yml
├── .env.example
└── Makefile
```

## Core product flows

1. User signs up / logs in.
2. User creates a surgery case.
3. User uploads a laparoscopy video.
4. User triggers processing.
5. Worker runs inference + tracking and writes timeline rows.
6. JSON/CSV/PDF reports are generated and stored.
7. Dashboard + case detail pages expose status, timeline charts, and downloads.

## Roles and access

- **surgeon / doctor**
  - upload videos
  - trigger processing
  - view case timeline and reports in their organization
- **admin**
  - all case visibility
  - user management (`GET /users`, `PATCH /users/{id}`)

## Environment setup

1. Copy env file:
   ```bash
   cp .env.example .env
   ```
2. Ensure model path is correct (default points to `models/best.pt`).
3. For local quick testing without YOLO inference, set:
    - `MOCK_INFERENCE=true`
    - `PROCESSING_DISPATCH=inline` (optional for synchronous behavior)
    - `BACKEND_WORKER_TARGET=worker-lite` (default; avoids heavy inference deps)
4. For full YOLO inference in Docker, set:
   - `MOCK_INFERENCE=false`
   - `BACKEND_WORKER_TARGET=worker`

## Run with Docker

```bash
docker compose up --build
```

Services:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`
- OpenAPI docs: `http://localhost:8000/docs`
- MinIO console: `http://localhost:9001`

## Migrations and seed data

```bash
# Apply migrations
docker compose run --rm backend alembic upgrade head

# Seed demo records
docker compose run --rm backend python -m app.db.seed_demo
```

## Key API endpoints

All versioned under `/api/v1`.

### Auth

- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /auth/change-password`
- `GET /auth/me`

### Cases

- `POST /cases`
- `GET /cases`
- `GET /cases/{id}`
- `PATCH /cases/{id}`
- `DELETE /cases/{id}`

### Videos

- `POST /cases/{id}/videos/upload-url`
- `POST /cases/{id}/videos/complete`
- `POST /cases/{id}/videos/upload` (multipart convenience)
- `GET /cases/{id}/videos`
- `DELETE /videos/{id}`

### Processing

- `POST /cases/{id}/process`
- `GET /jobs/{id}`
- `GET /cases/{id}/jobs`
- `GET /jobs/{id}/events` (SSE stream)

### Results and reports

- `GET /cases/{id}/timeline`
- `GET /cases/{id}/reports`
- `POST /cases/{id}/reports/generate`
- `GET /reports/{id}/download`

### Health

- `GET /health/live`
- `GET /health/ready`

## Example request flow

### 1) Signup

```http
POST /api/v1/auth/signup
Content-Type: application/json

{
  "full_name": "Dr Jane Doe",
  "email": "jane@example.com",
  "password": "StrongPass123!",
  "role": "surgeon",
  "organization_name": "City Hospital"
}
```

### 2) Create case

```http
POST /api/v1/cases
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "case_code": "CASE-001",
  "procedure_type": "Laparoscopic Cholecystectomy",
  "surgery_date": "2026-04-18",
  "notes": "Initial case note"
}
```

### 3) Upload video (multipart)

```http
POST /api/v1/cases/{case_id}/videos/upload
Authorization: Bearer <access_token>
Content-Type: multipart/form-data
```

### 4) Trigger processing

```http
POST /api/v1/cases/{case_id}/process
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "video_asset_id": "<video_id>"
}
```

### 5) Download reports

```http
GET /api/v1/cases/{case_id}/reports?page=1&page_size=20
GET /api/v1/reports/{report_id}/download
```

## Tests

Backend tests (unit + integration + e2e happy path):

```bash
docker compose run --rm backend pytest -q
```

Frontend component tests:

```bash
docker compose run --rm frontend npm run test -- --run
```

## Security and compliance-aware basics implemented

- Password hashing with bcrypt
- JWT access + refresh tokens with rotation
- Role checks for protected routes
- Server-side input validation
- Upload MIME/type and size validation
- Signed URLs for private S3 object access
- Audit logs for key user actions
- No hardcoded secrets (env-based config)
- UI disclaimer: decision-support only, not final diagnosis

## Notes

- Inference uses the existing YOLO model path from env (`MODEL_PATH`).
- Set `MOCK_INFERENCE=true` for fast local/demo runs without heavy model execution.
- Backend Docker now uses separate build targets: `api-dev` (API + test deps), `worker-lite` (fast local worker), and `worker` (inference deps + media libs).
- Docker Compose defaults to `worker-lite` + `MOCK_INFERENCE=true`, which avoids pulling heavy CV/ML dependencies and keeps local image size/build time down.
- Worker image pins CPU-only PyTorch wheels to avoid accidentally pulling large CUDA packages.
- Celery worker consumes the `processing` queue (plus default `celery`) so queued processing jobs are executed.
- Real email delivery for password reset is not included; development reset token is returned in development mode.

