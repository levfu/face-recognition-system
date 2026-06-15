# backend/app/main.py

import asyncio
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api.routes import auth, enrollment, recognition, admin


# ── Health cache — written by background poller, read by endpoint ──
_health_cache: dict = {
    "status": "ok",
    "components": {
        "database": "ok",
        "qdrant":   "ok",
        "redis":    "ok",
        "minio":    "ok",
    },
    "checked_at": None,
}


async def _health_poller() -> None:
    from sqlalchemy import text

    async def safe_ping(fn) -> str:
        try:
            await asyncio.wait_for(asyncio.to_thread(fn), timeout=1.5)
            return "ok"
        except Exception:
            return "down"

    def _check_postgres():
        from app.db.postgres import SessionLocal
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
        finally:
            db.close()

    def _check_qdrant():
        from app.db.qdrant import qdrant_client
        qdrant_client.get_collections()

    def _check_redis():
        import redis as _redis
        r = _redis.Redis.from_url(
            settings.redis_url,
            socket_connect_timeout=1,
            socket_timeout=1,
        )
        r.ping()

    def _check_minio():
        from app.db.minio import minio_client
        minio_client.list_buckets()

    while True:
        try:
            db_s, qd_s, rd_s, mn_s = await asyncio.gather(
                safe_ping(_check_postgres),
                safe_ping(_check_qdrant),
                safe_ping(_check_redis),
                safe_ping(_check_minio),
            )
            components = {
                "database": db_s,
                "qdrant":   qd_s,
                "redis":    rd_s,
                "minio":    mn_s,
            }
            down_count = sum(1 for v in components.values() if v == "down")
            overall = "ok" if down_count == 0 else "degraded" if down_count <= 2 else "down"
            _health_cache.update({
                "status":     overall,
                "components": components,
                "checked_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            })
        except Exception:
            pass
        await asyncio.sleep(1.5)


# ── Startup / Shutdown ──
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[Startup] Starting system...")

    from app.db.postgres import Base, engine, ensure_default_admin, SessionLocal, Admin
    Base.metadata.create_all(bind=engine)
    try:
        _db = SessionLocal()
        _needs_seed = _db.query(Admin).count() == 0
        _db.close()
        ensure_default_admin()
        if _needs_seed:
            print("[Startup] Created default super admin: admin/admin123", flush=True)
    except Exception as e:
        print(f"[Startup] Auto-seed admin failed: {e}", flush=True)

    from sqlalchemy import text as _sql_text
    try:
        with engine.connect() as _conn:
            _conn.execute(_sql_text("""
                DO $$ BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name='access_logs' AND column_name='action'
                    ) THEN
                        ALTER TABLE access_logs ADD COLUMN action VARCHAR(20)
                            NOT NULL DEFAULT 'check_in';
                        CREATE INDEX IF NOT EXISTS ix_access_logs_action_date
                            ON access_logs(action, created_at);
                    END IF;
                END $$;
            """))
            _conn.commit()
        print("[Startup] Migration access_logs.action: OK")
    except Exception as _me:
        print(f"[Startup] Migration access_logs.action failed: {_me}")

    print("[Startup] PostgreSQL")

    from app.db.qdrant import init_collection
    init_collection()
    print("[Startup] Qdrant")

    from app.db.minio import ensure_bucket_exists
    ensure_bucket_exists(settings.minio_bucket_faces)
    ensure_bucket_exists(settings.minio_bucket_snapshots)
    print("[Startup] MinIO")

    from app.core.face_detector import face_detector
    from app.core.face_embedder import face_embedder
    print("[Startup] AI Models")

    poller = asyncio.create_task(_health_poller())
    print("[Startup] Health poller (1.5s interval)")

    print("[Startup] System ready")

    yield

    poller.cancel()
    print("[Shutdown] Shutting down system...")


# ── Initialize FastAPI ──
app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Real-time face recognition system",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan
)


# ── CORS ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


# ── Include Routers ──
app.include_router(auth.router)
app.include_router(enrollment.router)
app.include_router(recognition.router)
app.include_router(admin.router)


# ── Health check — instant, reads from cache ──
@app.get("/api/health")
async def health_check():
    return _health_cache