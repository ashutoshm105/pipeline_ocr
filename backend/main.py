from __future__ import annotations

import json
import logging
import os
import platform
import sys
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

if platform.system() == "Windows":
    os.environ.setdefault("PADDLE_USE_GPU", "1")
    os.environ.setdefault("FLAGS_use_gpu", "1")
    os.environ.pop("CUDA_VISIBLE_DEVICES", None)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


# ── Structured JSON logging ────────────────────────────────────

class _JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "msg": record.getMessage(),
            "module": record.module,
            "line": record.lineno,
        }
        if hasattr(record, "extra"):
            entry.update(record.extra)
        return json.dumps(entry, default=str)


_handler = logging.StreamHandler(sys.stdout)
_handler.setFormatter(_JSONFormatter())
logger = logging.getLogger("medvault")
logger.setLevel(logging.INFO)
logger.addHandler(_handler)


from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from database import init_db, get_db

# ── Route layers ──────────────────────────────────────────────
from routes.auth_routes import router as auth_router
from routes.patient_routes import router as patient_router
from routes.doctor_routes import router as doctor_router
from routes.reports_routes import router as reports_router
from routes.admin_routes import router as admin_router
from routes.evaluation_routes import router as evaluation_router
from routes.pipeline_routes import router as pipeline_router
from routes.hub_routes import router as hub_router
from routes.research_routes import router as research_router

DEFAULT_PATIENT_ID: str | None = None


def _seed_default_patient() -> str:
    from auth import _hash_pw

    default_phone = "5511999"
    default_name = "Test Patient"
    default_password = "password"
    now = datetime.now(timezone.utc).isoformat()

    conn = get_db()
    try:
        row = conn.execute(
            "SELECT id FROM patients WHERE phone=?", (default_phone,)
        ).fetchone()
        if row:
            return row["id"]
        pid = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO patients (id, phone, password_hash, name, created_at) "
            "VALUES (?,?,?,?,?)",
            (pid, default_phone, _hash_pw(default_password), default_name, now),
        )
        conn.commit()
        logger.info(f"Seeded default patient '{default_name}' ({pid})")
        return pid
    finally:
        conn.close()


# ── Request logging middleware ──────────────────────────────────

class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - start) * 1000
        logger.info(
            "%s %s → %d (%.1fms)",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
        )
        return response


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        import torch
        if torch.cuda.is_available():
            logger.info(f"CUDA ready: {torch.cuda.get_device_name(0)}")
        else:
            logger.warning("CUDA NOT available — handwritten OCR will error")
    except ImportError:
        logger.warning("torch not installed; Qwen OCR backend unavailable")

    UPLOAD_DIR = Path(__file__).parent / "uploads"
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    init_db()

    global DEFAULT_PATIENT_ID
    DEFAULT_PATIENT_ID = _seed_default_patient()

    preload_env = os.getenv("MEDVAULT_PRELOAD_GPU", "1")
    if preload_env == "1":
        try:
            from gpu_manager import preload_models
            logger.info("Preloading GPU models...")
            preload_models(blocking=False)
        except Exception as e:
            logger.warning(f"GPU preload skipped: {e}")

    yield


app = FastAPI(title="MedVault", lifespan=lifespan)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(patient_router)
app.include_router(doctor_router)
app.include_router(reports_router)
app.include_router(admin_router)
app.include_router(evaluation_router)
app.include_router(pipeline_router)
app.include_router(hub_router)
app.include_router(research_router)


# ── Health / readiness probes ──────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "medvault"}


@app.get("/ready")
def readiness():
    try:
        conn = get_db()
        conn.execute("SELECT 1")
        conn.close()
        db_ok = True
    except Exception:
        db_ok = False

    gpu_ok = False
    try:
        import torch
        gpu_ok = torch.cuda.is_available()
    except ImportError:
        pass

    return {
        "ready": db_ok,
        "checks": {"database": db_ok, "gpu": gpu_ok},
    }


# ── Serve frontend SPA ────────────────────────────────────────
FRONTEND_DIST = Path(os.getenv("MEDVAULT_STATIC_DIR", str(Path(__file__).parent.parent / "frontend" / "dist")))
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="spa")
