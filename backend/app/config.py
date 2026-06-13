# backend/app/config.py

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings

class Settings(BaseSettings):

    # ── PostgreSQL ──
    postgres_host: str = "postgres"
    postgres_port: int = 5432
    postgres_db: str   = "facerecog"
    postgres_user: str = "admin"
    postgres_password: str = "password"

    @property
    def database_url(self) -> str:
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    # ── Redis ──
    redis_host: str = "redis"
    redis_port: int = 6379

    @property
    def redis_url(self) -> str:
        return f"redis://{self.redis_host}:{self.redis_port}/0"

    # ── MinIO ──
    minio_endpoint: str        = "minio:9000"
    minio_access_key: str      = "minioadmin"
    minio_secret_key: str      = "minioadmin123"
    minio_bucket_faces: str    = "face-images"
    minio_bucket_snapshots: str = "snapshots"
    minio_secure: bool         = False

    # ── Qdrant ──
    qdrant_host: str       = "qdrant"
    qdrant_port: int       = 6333
    qdrant_collection: str = "face_embeddings"

    # ── AI Model ──
    model_path: str        = "models/best_model.pth"
    embedding_size: int    = 512
    ai_threshold: float    = 0.75
    liveness_enabled: bool = True

    # Fusion 3D landmark (Sprint A2)
    landmark_3d_enabled: bool = True
    fusion_weight_2d: float   = 0.7
    fusion_weight_3d: float   = 0.3
    landmark_d_max: float     = 5.0
    liveness_score_min: float = 0.6

    # ── Attendance thresholds ──
    late_threshold_hour: int = 9
    late_threshold_minute: int = 0
    absent_cutoff_hour: int = 17
    absent_cutoff_minute: int = 0

    # ── JWT ──
    jwt_secret: str         = "your-secret-key-here"
    jwt_algorithm: str      = "HS256"
    jwt_expire_minutes: int = 60 * 24  # 1 ngày

    # ── Backup định kỳ ──
    backup_enabled: bool = True
    backup_dir: str = "/backups"
    backup_retention_days: int = 14
    # false = chỉ PostgreSQL + Qdrant (~vài chục MB); ảnh gốc vẫn ở volume MinIO
    backup_include_minio: bool = Field(
        default=False,
        validation_alias="BACKUP_INCLUDE_MINIO",
    )

    # ── Google Drive (upload sau backup local) ──
    gdrive_enabled: bool = Field(default=False, validation_alias="GOOGLE_DRIVE_ENABLED")
    gdrive_credentials_path: str = Field(
        default="/secrets/gdrive-service-account.json",
        validation_alias="GOOGLE_DRIVE_CREDENTIALS",
    )
    gdrive_folder_id: str = Field(default="", validation_alias="GOOGLE_DRIVE_FOLDER_ID")
    # oauth = Gmail cá nhân (khuyến nghị) | service_account = Workspace Shared Drive
    gdrive_auth_mode: str = Field(
        default="oauth",
        validation_alias="GOOGLE_DRIVE_AUTH_MODE",
    )
    gdrive_oauth_token_path: str = Field(
        default="/secrets/gdrive-oauth-token.json",
        validation_alias="GOOGLE_DRIVE_OAUTH_TOKEN",
    )

    # ── App ──
    app_name: str  = "Face Recognition System"
    debug: bool    = False
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost",
    ]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()