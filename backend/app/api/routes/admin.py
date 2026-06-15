# backend/app/api/routes/admin.py

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime, time as dtime
from app.db.postgres import get_db, Employee, AccessLog, Admin, AdminAuditLog
from app.api.routes.auth import get_current_admin, require_super_admin
from app.config import settings
from app.services.audit_log_service import log_action

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ── Pydantic Schemas ──
class EmployeeCreate(BaseModel):
    name: str
    code: str
    department: Optional[str] = None


class EmployeeUpdate(BaseModel):
    name: Optional[str]       = None
    department: Optional[str] = None
    is_active: Optional[bool] = None


class AdminCreate(BaseModel):
    username: str
    password: str


class AdminResetPassword(BaseModel):
    new_password: str


# ── Admin accounts ──
@router.get("/admins")
def list_admins(
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_super_admin),
):
    admins = db.query(Admin).order_by(Admin.created_at.asc()).all()
    return [
        {
            "id": str(a.id),
            "username": a.username,
            "role": getattr(a, 'role', 'admin'),
            "is_active": a.is_active,
            "created_at": str(a.created_at),
            "is_self": str(a.id) == str(current_admin.id),
        }
        for a in admins
    ]


@router.post("/admins")
def create_admin(
    body: AdminCreate,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_super_admin),
):
    username = body.username.strip()
    if len(username) < 3:
        raise HTTPException(400, "Username must be at least 3 characters")
    if len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")

    existing = db.query(Admin).filter(Admin.username == username).first()
    if existing:
        raise HTTPException(400, f"Account '{username}' already exists")

    admin = Admin(username=username)
    admin.set_password(body.password)
    db.add(admin)
    db.commit()
    db.refresh(admin)
    log_action(db, str(current_admin.id), "create_admin", target_type="admin", target_id=str(admin.id), details={"username": admin.username})
    return {
        "success": True,
        "id": str(admin.id),
        "username": admin.username,
    }


@router.post("/admins/{admin_id}/reset-password")
def reset_admin_password(
    admin_id: str,
    body: AdminResetPassword,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_super_admin),
):
    if len(body.new_password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")

    admin = db.query(Admin).filter(Admin.id == admin_id).first()
    if not admin:
        raise HTTPException(404, "Admin account not found")

    if getattr(admin, 'role', 'admin') == 'super_admin':
        raise HTTPException(400, "Cannot reset password for Super Admin account")

    admin.set_password(body.new_password)
    db.commit()
    log_action(db, str(current_admin.id), "reset_password", target_type="admin", target_id=str(admin.id), details={"username": admin.username})
    return {"success": True, "message": f"Password reset for {admin.username}"}


@router.delete("/admins/{admin_id}")
def delete_admin(
    admin_id: str,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_super_admin),
):
    if str(current_admin.id) == admin_id:
        raise HTTPException(400, "Cannot delete the currently logged-in account")

    admin = db.query(Admin).filter(Admin.id == admin_id).first()
    if not admin:
        raise HTTPException(404, "Admin account not found")

    if getattr(admin, 'role', 'admin') == 'super_admin':
        raise HTTPException(400, "Cannot delete Super Admin account")

    total = db.query(Admin).count()
    if total <= 1:
        raise HTTPException(400, "Must keep at least one admin account")

    deleted_username = admin.username
    db.delete(admin)
    db.commit()
    log_action(db, str(current_admin.id), "delete_admin", target_type="admin", target_id=admin_id, details={"username": deleted_username})
    return {"success": True, "message": f"Account {deleted_username} deleted"}


# ── Employee CRUD ──
@router.get("/employees")
def list_employees(
    db: Session = Depends(get_db),
    _             = Depends(get_current_admin)
):
    employees = db.query(Employee).filter(Employee.is_active == True).all()
    return [
        {
            "id":         str(e.id),
            "name":       e.name,
            "code":       e.code,
            "department": e.department,
            "is_active":  e.is_active,
            "created_at": str(e.created_at)
        }
        for e in employees
    ]


@router.post("/employees")
def create_employee(
    body: EmployeeCreate,
    db: Session = Depends(get_db),
    _             = Depends(get_current_admin)
):
    existing = db.query(Employee).filter(
        Employee.code == body.code, Employee.is_active == True
    ).first()
    if existing:
        raise HTTPException(400, f"Employee code {body.code} already exists")

    employee = Employee(
        name=body.name,
        code=body.code,
        department=body.department
    )
    db.add(employee)
    db.commit()
    db.refresh(employee)
    return {"success": True, "id": str(employee.id)}


@router.put("/employees/{employee_id}")
def update_employee(
    employee_id: str,
    body: EmployeeUpdate,
    db: Session = Depends(get_db),
    _             = Depends(get_current_admin)
):
    employee = db.query(Employee).filter(
        Employee.id == employee_id
    ).first()
    if not employee:
        raise HTTPException(404, "Employee not found")

    if body.name is not None:
        employee.name = body.name
    if body.department is not None:
        employee.department = body.department
    if body.is_active is not None:
        employee.is_active = body.is_active

    db.commit()
    return {"success": True, "message": "Update successful"}


@router.delete("/employees/{employee_id}")
def delete_employee(
    employee_id: str,
    db: Session = Depends(get_db),
    _             = Depends(get_current_admin)
):
    employee = db.query(Employee).filter(
        Employee.id == employee_id
    ).first()
    if not employee:
        raise HTTPException(404, "Employee not found")

    from datetime import datetime as _dt
    import logging as _log
    emp_code = employee.code
    emp_name = employee.name
    emp_uuid = str(employee.id)

    employee.is_active = False
    employee.deleted_at = _dt.now()
    db.commit()

    try:
        from app.db.qdrant import delete_by_person
        delete_by_person(emp_uuid)
    except Exception as exc:
        _log.getLogger(__name__).warning("[SoftDelete] Qdrant delete failed for %s: %s", emp_code, exc)

    return {
        "success": True,
        "message": f"Employee {emp_name} deactivated",
        "deleted": {"emp_code": emp_code, "name": emp_name},
    }


# ── Access Logs ──
@router.get("/logs")
def get_logs(
    limit: int          = 50,
    person_id: str      = None,
    db: Session         = Depends(get_db),
    _                   = Depends(get_current_admin)
):
    query = db.query(AccessLog).order_by(AccessLog.created_at.desc())
    if person_id:
        query = query.filter(AccessLog.person_id == person_id)

    rows = query.limit(limit).all()

    pids = {r.person_id for r in rows if r.person_id}
    emp_status: dict[str, bool] = {}
    if pids:
        emp_status = {
            str(e.id): e.is_active
            for e in db.query(Employee.id, Employee.is_active).filter(Employee.id.in_(pids)).all()
        }

    return [
        {
            "id":           str(l.id),
            "person_id":     str(l.person_id) if l.person_id else None,
            "employee_code":  l.employee_code,
            "employee_name":  l.employee_name,
            "recognized":     l.recognized,
            "confidence":     l.confidence,
            "camera_id":      l.camera_id,
            "access_granted": l.access_granted,
            "action":         getattr(l, 'action', 'check_in'),
            "snapshot_key":   l.snapshot_key,
            "created_at":     str(l.created_at),
            "is_active":      emp_status.get(str(l.person_id)) if l.person_id else None,
        }
        for l in rows
    ]


# ── Stats Overview ──
@router.get("/stats/overview")
def get_stats_overview(
    db: Session = Depends(get_db),
    _ = Depends(get_current_admin),
):
    from datetime import date, timedelta, datetime as dt

    today = date.today()

    total_employees = db.query(Employee).filter(Employee.is_active == True).count()

    # today's recognized check-ins
    from sqlalchemy import func, cast, Date as SADate
    checkins_today = (
        db.query(AccessLog)
        .filter(
            func.cast(AccessLog.created_at, SADate) == today,
            AccessLog.recognized == True,
        )
        .count()
    )

    # this week: Monday → today
    week_start = today - timedelta(days=today.weekday())
    checkins_this_week = (
        db.query(AccessLog)
        .filter(
            AccessLog.created_at >= dt.combine(week_start, dt.min.time()),
            AccessLog.recognized == True,
        )
        .count()
    )

    # last 7 days chart
    seven_days_ago = today - timedelta(days=6)
    rows = (
        db.query(
            func.cast(AccessLog.created_at, SADate).label("day"),
            func.count().label("cnt"),
        )
        .filter(
            AccessLog.created_at >= dt.combine(seven_days_ago, dt.min.time()),
            AccessLog.recognized == True,
        )
        .group_by(func.cast(AccessLog.created_at, SADate))
        .all()
    )
    counts_by_date = {str(r.day): r.cnt for r in rows}
    checkins_last_7_days = [
        {"date": str(seven_days_ago + timedelta(days=i)),
         "count": counts_by_date.get(str(seven_days_ago + timedelta(days=i)), 0)}
        for i in range(7)
    ]

    return {
        "total_employees": total_employees,
        "checkins_today": checkins_today,
        "checkins_this_week": checkins_this_week,
        "checkins_last_7_days": checkins_last_7_days,
    }


# ── Stats: checkins by date range ──
@router.get("/stats/checkins-range")
def get_checkins_range(
    start_date: str,
    end_date: str,
    db: Session = Depends(get_db),
    _ = Depends(get_current_admin),
):
    from datetime import date, timedelta, datetime as dt
    from sqlalchemy import func, cast, Date as SADate

    try:
        start = date.fromisoformat(start_date)
        end   = date.fromisoformat(end_date)
    except ValueError:
        raise HTTPException(400, "Invalid date format, use YYYY-MM-DD")

    if (end - start).days > 31:
        raise HTTPException(400, "Maximum range is 31 days")
    if start > end:
        raise HTTPException(400, "start_date must be less than or equal to end_date")

    rows = (
        db.query(
            func.cast(AccessLog.created_at, SADate).label("day"),
            func.count().label("cnt"),
        )
        .filter(
            AccessLog.created_at >= dt.combine(start, dt.min.time()),
            AccessLog.created_at <= dt.combine(end, dt.max.time()),
            AccessLog.recognized == True,
        )
        .group_by(func.cast(AccessLog.created_at, SADate))
        .all()
    )
    counts_by_date = {str(r.day): r.cnt for r in rows}
    total_days = (end - start).days + 1
    return [
        {"date": str(start + timedelta(days=i)),
         "count": counts_by_date.get(str(start + timedelta(days=i)), 0)}
        for i in range(total_days)
    ]


# ── Stats: employees who checked in on a given date ──
@router.get("/stats/checkins-by-date")
def get_checkins_by_date(
    date: Optional[str] = None,
    db: Session = Depends(get_db),
    _ = Depends(get_current_admin),
):
    from datetime import date as date_type, datetime as dt
    from sqlalchemy import func, cast, Date as SADate

    if date:
        try:
            target = date_type.fromisoformat(date)
        except ValueError:
            raise HTTPException(400, "Invalid date format, use YYYY-MM-DD")
    else:
        target = date_type.today()

    rows = (
        db.query(
            AccessLog.person_id,
            AccessLog.employee_code,
            AccessLog.employee_name,
            func.min(AccessLog.created_at).label("checkin_time"),
        )
        .filter(
            func.cast(AccessLog.created_at, SADate) == target,
            AccessLog.recognized == True,
        )
        .group_by(AccessLog.person_id, AccessLog.employee_code, AccessLog.employee_name)
        .order_by(func.min(AccessLog.created_at).desc())
        .all()
    )
    pids = {r.person_id for r in rows if r.person_id}
    emp_status: dict[str, bool] = {}
    if pids:
        emp_status = {
            str(e.id): e.is_active
            for e in db.query(Employee.id, Employee.is_active).filter(Employee.id.in_(pids)).all()
        }
    return [
        {
            "employee_id":   str(r.person_id) if r.person_id else None,
            "employee_code": r.employee_code,
            "employee_name": r.employee_name,
            "checkin_time":  r.checkin_time.strftime("%H:%M:%S") if r.checkin_time else None,
            "is_active":     emp_status.get(str(r.person_id)) if r.person_id else None,
        }
        for r in rows
    ]


# ── Stats: check-ins for a given week per employee ──
@router.get("/stats/checkins-by-week")
def get_checkins_by_week(
    week_start: Optional[str] = None,
    db: Session = Depends(get_db),
    _ = Depends(get_current_admin),
):
    from datetime import date as date_type, timedelta, datetime as dt
    from sqlalchemy import func

    if week_start:
        try:
            start = date_type.fromisoformat(week_start)
        except ValueError:
            raise HTTPException(400, "Invalid date format, use YYYY-MM-DD")
    else:
        today = date_type.today()
        start = today - timedelta(days=today.weekday())

    end = start + timedelta(days=6)

    rows = (
        db.query(
            AccessLog.person_id,
            AccessLog.employee_code,
            AccessLog.employee_name,
            func.count().label("checkin_count"),
        )
        .filter(
            AccessLog.created_at >= dt.combine(start, dt.min.time()),
            AccessLog.created_at <= dt.combine(end, dt.max.time()),
            AccessLog.recognized == True,
        )
        .group_by(AccessLog.person_id, AccessLog.employee_code, AccessLog.employee_name)
        .order_by(func.count().desc())
        .all()
    )
    pids = {r.person_id for r in rows if r.person_id}
    emp_status: dict[str, bool] = {}
    if pids:
        emp_status = {
            str(e.id): e.is_active
            for e in db.query(Employee.id, Employee.is_active).filter(Employee.id.in_(pids)).all()
        }
    return [
        {
            "employee_id":   str(r.person_id) if r.person_id else None,
            "employee_code": r.employee_code,
            "employee_name": r.employee_name,
            "checkin_count": r.checkin_count,
            "is_active":     emp_status.get(str(r.person_id)) if r.person_id else None,
        }
        for r in rows
    ]


# ── Settings ──
class SystemSettings(BaseModel):
    ai_threshold:       Optional[float] = None
    liveness_enabled:   Optional[bool]  = None
    liveness_score_min: Optional[float] = None


@router.get("/settings")
def get_settings(_ = Depends(require_super_admin)):
    return {
        "ai_threshold":      settings.ai_threshold,
        "liveness_enabled":  settings.liveness_enabled,
        "liveness_score_min": settings.liveness_score_min,
    }


@router.put("/settings")
def update_settings(
    body: SystemSettings,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(require_super_admin),
):
    from app.config import settings as app_settings
    changes: dict = {}

    def _apply(field: str, value):
        if value is not None and value != getattr(app_settings, field):
            changes[field] = {"old": getattr(app_settings, field), "new": value}
            setattr(app_settings, field, value)

    _apply("ai_threshold",       body.ai_threshold)
    _apply("liveness_enabled",   body.liveness_enabled)
    _apply("liveness_score_min", body.liveness_score_min)

    if changes:
        log_action(db, str(current_admin.id), "update_settings", details={"changes": changes})
    return {"success": True, "message": "Configuration updated successfully"}


# ── Activity Logs ──
@router.get("/activity-logs")
def get_activity_logs(
    limit: int = 50,
    offset: int = 0,
    action: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db),
    _: Admin = Depends(require_super_admin),
):
    from datetime import date as date_type, datetime as dt

    query = db.query(AdminAuditLog).order_by(AdminAuditLog.created_at.desc())

    if action:
        query = query.filter(AdminAuditLog.action == action)
    if date_from:
        try:
            d = date_type.fromisoformat(date_from)
            query = query.filter(AdminAuditLog.created_at >= dt.combine(d, dt.min.time()))
        except ValueError:
            pass
    if date_to:
        try:
            d = date_type.fromisoformat(date_to)
            query = query.filter(AdminAuditLog.created_at <= dt.combine(d, dt.max.time()))
        except ValueError:
            pass

    total = query.count()
    rows = query.offset(offset).limit(limit).all()

    actor_ids = {r.actor_admin_id for r in rows if r.actor_admin_id}
    actors: dict[str, str] = {}
    if actor_ids:
        admin_rows = db.query(Admin).filter(Admin.id.in_(actor_ids)).all()
        actors = {str(a.id): a.username for a in admin_rows}

    return {
        "total": total,
        "items": [
            {
                "id": str(r.id),
                "actor_admin_id": str(r.actor_admin_id) if r.actor_admin_id else None,
                "actor_username": actors.get(str(r.actor_admin_id)) if r.actor_admin_id else None,
                "action": r.action,
                "target_type": r.target_type,
                "target_id": str(r.target_id) if r.target_id else None,
                "details": r.details,
                "created_at": str(r.created_at),
            }
            for r in rows
        ],
    }


# ── Helper: build employee status rows for a given date ──
def _build_employee_status_rows(db: Session, target_date: date) -> list[dict]:
    from sqlalchemy import func, cast, Date as SADate

    now = datetime.now()
    is_today = (target_date == date.today())
    late_h = settings.late_threshold_hour
    late_m = settings.late_threshold_minute
    absent_h = settings.absent_cutoff_hour
    absent_m = settings.absent_cutoff_minute

    employees = db.query(Employee).filter(Employee.is_active == True).all()
    result = []
    for emp in employees:
        ci = (
            db.query(AccessLog)
            .filter(
                AccessLog.person_id == emp.id,
                AccessLog.action == 'check_in',
                func.cast(AccessLog.created_at, SADate) == target_date,
            )
            .order_by(AccessLog.created_at.asc())
            .first()
        )
        co = (
            db.query(AccessLog)
            .filter(
                AccessLog.person_id == emp.id,
                AccessLog.action == 'check_out',
                func.cast(AccessLog.created_at, SADate) == target_date,
            )
            .order_by(AccessLog.created_at.desc())
            .first()
        )

        if ci:
            late_cutoff = datetime.combine(target_date, dtime(late_h, late_m))
            if ci.created_at <= late_cutoff:
                status = "on_time"
            else:
                minutes_late = int((ci.created_at - late_cutoff).total_seconds() / 60)
                status = f"late:{minutes_late}"
        else:
            absent_cutoff = datetime.combine(target_date, dtime(absent_h, absent_m))
            if is_today and now < absent_cutoff:
                status = "pending"
            else:
                status = "absent"

        work_minutes = None
        if ci and co:
            work_minutes = int((co.created_at - ci.created_at).total_seconds() / 60)

        result.append({
            "id": str(emp.id),
            "employee_code": emp.code,
            "name": emp.name,
            "department": emp.department,
            "check_in_time": ci.created_at.isoformat() if ci else None,
            "check_out_time": co.created_at.isoformat() if co else None,
            "work_minutes": work_minutes,
            "status": status,
        })
    return result


@router.get("/employees/with-status")
def list_employees_with_status(
    target_date: Optional[date] = None,
    db: Session = Depends(get_db),
    _ = Depends(get_current_admin),
):
    td = target_date or date.today()
    return _build_employee_status_rows(db, td)


@router.get("/stats/late-today")
def get_late_today(
    db: Session = Depends(get_db),
    _ = Depends(get_current_admin),
):
    rows = _build_employee_status_rows(db, date.today())
    return [r for r in rows if r["status"].startswith("late:")]


@router.get("/stats/absent-today")
def get_absent_today(
    db: Session = Depends(get_db),
    _ = Depends(get_current_admin),
):
    rows = _build_employee_status_rows(db, date.today())
    return [r for r in rows if r["status"] == "absent"]
