from pathlib import Path
import sys


def _backend_root() -> Path:
    if Path("/app/app").exists():
        return Path("/app")
    return Path(__file__).resolve().parents[1] / "backend"


sys.path.insert(0, str(_backend_root()))

from app.db.postgres import Admin, Base, Employee, SessionLocal, engine  # noqa: E402  # type: ignore[reportMissingImports]


def seed() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        admin = db.query(Admin).filter(Admin.username == "admin").first()
        if not admin:
            admin = Admin(username="admin", role="super_admin")
            admin.set_password("admin123")
            db.add(admin)

        sample_employees = [
            ("Nguyen Van A", "EMP001", "HR"),
            ("Tran Thi B", "EMP002", "Finance"),
            ("Le Van C", "EMP003", "IT"),
            ("Pham Thi D", "EMP004", "Operations"),
        ]
        for name, code, department in sample_employees:
            existing = db.query(Employee).filter(Employee.code == code).first()
            if existing:
                continue
            db.add(Employee(name=name, code=code, department=department))

        db.commit()
        print("Seed data created successfully.")
        print("Admin login: admin / admin123")
    finally:
        db.close()


if __name__ == "__main__":
    seed()