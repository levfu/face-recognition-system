from __future__ import annotations

import uuid
from datetime import datetime

from passlib.context import CryptContext  # type: ignore[reportMissingModuleSource]
from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    department: Mapped[str | None] = mapped_column(String(128), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)

    face_images: Mapped[list["FaceImage"]] = relationship(back_populates="employee", cascade="all, delete-orphan")


class FaceImage(Base):
    __tablename__ = "face_images"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    person_id: Mapped[str] = mapped_column(String(36), ForeignKey("employees.id", ondelete="CASCADE"), index=True)
    minio_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    qdrant_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)

    employee: Mapped[Employee] = relationship(back_populates="face_images")


class AccessLog(Base):
    __tablename__ = "access_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    person_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("employees.id", ondelete="SET NULL"), nullable=True)
    employee_code: Mapped[str | None] = mapped_column(String(64),  nullable=True)
    employee_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recognized: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    snapshot_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    action: Mapped[str] = mapped_column(String(20), nullable=False, default='check_in', index=True)
    camera_id: Mapped[str] = mapped_column(String(64), default="default", nullable=False)
    access_granted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False, index=True)


class Admin(Base):
    __tablename__ = "admins"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default='admin')
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)

    def set_password(self, raw_password: str) -> None:
        self.password_hash = pwd_context.hash(raw_password)

    def verify_password(self, raw_password: str) -> bool:
        return pwd_context.verify(raw_password, self.password_hash)


class AdminAuditLog(Base):
    __tablename__ = "admin_audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    actor_admin_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("admins.id", ondelete="SET NULL"), nullable=True, index=True
    )
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    target_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    target_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    details: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False, index=True)

    actor: Mapped["Admin | None"] = relationship("Admin", foreign_keys=[actor_admin_id])


engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_default_admin() -> None:
    db = SessionLocal()
    try:
        # Migrate: add role column if it doesn't exist yet (idempotent)
        from sqlalchemy import text
        try:
            db.execute(text(
                "ALTER TABLE admins ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'admin'"
            ))
            db.commit()
        except Exception:
            db.rollback()

        # Migrate: add deleted_at to employees (idempotent)
        try:
            db.execute(text(
                "ALTER TABLE employees ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ"
            ))
            db.commit()
        except Exception:
            db.rollback()

        # Migrate: replace full unique constraint on employees.code with a partial
        # unique index that only covers active rows, allowing reuse of codes from
        # soft-deleted employees.
        try:
            row = db.execute(text("""
                SELECT tc.constraint_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name
                 AND tc.table_schema    = kcu.table_schema
                WHERE tc.table_name      = 'employees'
                  AND tc.constraint_type = 'UNIQUE'
                  AND kcu.column_name    = 'code'
                LIMIT 1
            """)).first()
            if row:
                db.execute(text(f'ALTER TABLE employees DROP CONSTRAINT "{row[0]}"'))
                db.commit()
        except Exception:
            db.rollback()

        # Also drop full unique index created by SQLAlchemy's index=True+unique=True combo
        try:
            db.execute(text("DROP INDEX IF EXISTS ix_employees_code"))
            db.commit()
        except Exception:
            db.rollback()

        try:
            db.execute(text("""
                CREATE UNIQUE INDEX IF NOT EXISTS employees_active_code_unique
                  ON employees(code)
                  WHERE is_active = true
            """))
            db.commit()
        except Exception:
            db.rollback()

        admin = db.query(Admin).filter(Admin.username == "admin").first()
        if admin:
            # Sửa hash cũ (pbkdf2/plain) không tương thích bcrypt
            if pwd_context.identify(admin.password_hash) != "bcrypt":
                admin.set_password("admin123")
            admin.role = 'super_admin'
            db.commit()
            return
        admin = Admin(username="admin", role='super_admin')
        admin.set_password("admin123")
        db.add(admin)
        db.commit()
    finally:
        db.close()