# backend/app/api/routes/auth.py

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session
from jose import JWTError, jwt
from datetime import datetime, timedelta
from app.config import settings
from app.db.postgres import get_db, Admin

router = APIRouter(prefix="/api/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def create_access_token(data: dict) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode(
        {**data, "exp": expire},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm
    )


def get_current_admin(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm]
        )
        admin_id = payload.get("sub")
        if not admin_id:
            raise HTTPException(status_code=401, detail="Token không hợp lệ")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token không hợp lệ")

    admin = db.query(Admin).filter(Admin.id == admin_id).first()
    if not admin:
        raise HTTPException(status_code=401, detail="Admin không tồn tại")
    return admin


def require_super_admin(current_admin: Admin = Depends(get_current_admin)):
    if getattr(current_admin, 'role', 'admin') != 'super_admin':
        raise HTTPException(status_code=403, detail="Yêu cầu quyền Super Admin")
    return current_admin


@router.post("/login")
def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    admin = db.query(Admin).filter(Admin.username == form.username).first()
    if not admin or not admin.verify_password(form.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sai username hoặc password"
        )
    token = create_access_token({"sub": str(admin.id)})
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": getattr(admin, 'role', 'admin'),
        "username": admin.username,
    }


@router.post("/logout")
def logout():
    # JWT stateless — client tự xóa token
    return {"message": "Đăng xuất thành công"}


@router.get("/me")
def get_me(current_admin: Admin = Depends(get_current_admin)):
    return {
        "id": str(current_admin.id),
        "username": current_admin.username,
        "role": getattr(current_admin, 'role', 'admin'),
    }


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


@router.post("/change-password")
def change_password(
    body: ChangePasswordRequest,
    current_admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if not current_admin.verify_password(body.old_password):
        raise HTTPException(400, "Mật khẩu hiện tại không đúng")
    if len(body.new_password) < 6:
        raise HTTPException(400, "Mật khẩu mới phải có ít nhất 6 ký tự")
    current_admin.set_password(body.new_password)
    db.commit()
    from app.services.audit_log_service import log_action
    log_action(db, str(current_admin.id), "change_password")
    return {"success": True, "message": "Đổi mật khẩu thành công"}