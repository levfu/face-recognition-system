from __future__ import annotations

import io
import sys
import types
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def _install_cv2_stub() -> None:
    cv2 = types.ModuleType("cv2")
    cv2.IMREAD_COLOR = 1
    cv2.COLOR_BGR2GRAY = 6
    cv2.COLOR_RGB2BGR = 4
    cv2.COLOR_BGR2RGB = 5
    cv2.CV_64F = np.float64

    def imencode(ext: str, img: np.ndarray):
        rgb = img[:, :, ::-1] if img.ndim == 3 else img
        pil = Image.fromarray(rgb.astype(np.uint8))
        buff = io.BytesIO()
        format_name = "JPEG" if ext.lower() in {".jpg", ".jpeg"} else "PNG"
        pil.save(buff, format=format_name)
        arr = np.frombuffer(buff.getvalue(), dtype=np.uint8)
        return True, arr

    def imdecode(arr: np.ndarray, _flag: int):
        try:
            pil = Image.open(io.BytesIO(bytes(arr))).convert("RGB")
            rgb = np.array(pil)
            return rgb[:, :, ::-1]
        except Exception:
            return None

    def cvtColor(img: np.ndarray, code: int):
        if code in (cv2.COLOR_RGB2BGR, cv2.COLOR_BGR2RGB):
            return img[:, :, ::-1]
        if code == cv2.COLOR_BGR2GRAY:
            return (0.114 * img[:, :, 0] + 0.587 * img[:, :, 1] + 0.299 * img[:, :, 2]).astype(np.uint8)
        raise ValueError("Unsupported color conversion code")

    def resize(img: np.ndarray, size: tuple[int, int]):
        pil = Image.fromarray(img.astype(np.uint8))
        resized = pil.resize(size, Image.BILINEAR)
        return np.array(resized)

    def Laplacian(gray: np.ndarray, _dtype):
        gx = np.gradient(gray.astype(np.float64), axis=1)
        gy = np.gradient(gray.astype(np.float64), axis=0)
        gxx = np.gradient(gx, axis=1)
        gyy = np.gradient(gy, axis=0)
        return gxx + gyy

    def Sobel(gray: np.ndarray, _dtype, dx: int, dy: int, ksize: int = 3):
        arr = gray.astype(np.float64)
        if dx == 1 and dy == 0:
            return np.gradient(arr, axis=1)
        if dx == 0 and dy == 1:
            return np.gradient(arr, axis=0)
        return np.zeros_like(arr)

    cv2.imencode = imencode
    cv2.imdecode = imdecode
    cv2.cvtColor = cvtColor
    cv2.resize = resize
    cv2.Laplacian = Laplacian
    cv2.Sobel = Sobel
    sys.modules["cv2"] = cv2


def _install_deepface_stub() -> None:
    deepface_mod = types.ModuleType("deepface")

    class DeepFace:
        @staticmethod
        def extract_faces(*args, **kwargs):
            return []

    deepface_mod.DeepFace = DeepFace
    sys.modules["deepface"] = deepface_mod


def _install_qdrant_stub() -> None:
    qdrant_client_mod = types.ModuleType("qdrant_client")
    qdrant_http_mod = types.ModuleType("qdrant_client.http")
    qdrant_models_mod = types.ModuleType("qdrant_client.http.models")

    class _Simple:
        def __init__(self, *args, **kwargs):
            for k, v in kwargs.items():
                setattr(self, k, v)

    class QdrantClient:
        def __init__(self, *args, **kwargs):
            pass

        def get_collections(self):
            return types.SimpleNamespace(collections=[])

        def create_collection(self, *args, **kwargs):
            return None

        def upsert(self, *args, **kwargs):
            return None

        def search(self, *args, **kwargs):
            return []

        def delete(self, *args, **kwargs):
            return None

    qdrant_client_mod.QdrantClient = QdrantClient
    qdrant_models_mod.Distance = _Simple
    qdrant_models_mod.Filter = _Simple
    qdrant_models_mod.PointStruct = _Simple
    qdrant_models_mod.SearchParams = _Simple
    qdrant_models_mod.VectorParams = _Simple
    qdrant_models_mod.FieldCondition = _Simple
    qdrant_models_mod.MatchValue = _Simple

    sys.modules["qdrant_client"] = qdrant_client_mod
    sys.modules["qdrant_client.http"] = qdrant_http_mod
    sys.modules["qdrant_client.http.models"] = qdrant_models_mod


def _install_face_embedder_stub() -> None:
    embedder_mod = types.ModuleType("app.core.face_embedder")

    class DummyFaceEmbedder:
        def get_embedding(self, _face_array):
            return [0.0] * 512

    embedder_mod.face_embedder = DummyFaceEmbedder()
    sys.modules["app.core.face_embedder"] = embedder_mod


def _install_passlib_stub() -> None:
    passlib_mod = types.ModuleType("passlib")
    passlib_context_mod = types.ModuleType("passlib.context")

    class CryptContext:
        def __init__(self, *args, **kwargs):
            pass

        def hash(self, raw_password: str) -> str:
            return f"stub::{raw_password}"

        def verify(self, raw_password: str, hashed_password: str) -> bool:
            return hashed_password == f"stub::{raw_password}"

    passlib_context_mod.CryptContext = CryptContext
    sys.modules["passlib"] = passlib_mod
    sys.modules["passlib.context"] = passlib_context_mod


def _install_minio_stub() -> None:
    minio_mod = types.ModuleType("minio")
    minio_error_mod = types.ModuleType("minio.error")

    class S3Error(Exception):
        pass

    class Minio:
        def __init__(self, *args, **kwargs):
            pass

        def bucket_exists(self, *args, **kwargs):
            return True

        def make_bucket(self, *args, **kwargs):
            return None

        def put_object(self, *args, **kwargs):
            return None

        def presigned_get_object(self, *args, **kwargs):
            return "http://localhost/fake-object"

        def list_objects(self, *args, **kwargs):
            return []

        def remove_object(self, *args, **kwargs):
            return None

    minio_mod.Minio = Minio
    minio_error_mod.S3Error = S3Error
    sys.modules["minio"] = minio_mod
    sys.modules["minio.error"] = minio_error_mod


def _install_postgres_stub() -> None:
    postgres_mod = types.ModuleType("app.db.postgres")

    class _Model:
        pass

    class Employee(_Model):
        id = None
        code = None
        name = None
        is_active = True

    class FaceImage(_Model):
        pass

    class AccessLog(_Model):
        created_at = None
        person_id = None
        snapshot_key = None
        recognized = None

    class Admin(_Model):
        id = None
        username = None

        def verify_password(self, _password: str) -> bool:
            return True

    class _BaseMeta:
        def create_all(self, *args, **kwargs):
            return None

    class Base:
        metadata = _BaseMeta()

    class _Session:
        def query(self, *args, **kwargs):
            return self

        def filter(self, *args, **kwargs):
            return self

        def first(self):
            return None

        def all(self):
            return []

        def add(self, *args, **kwargs):
            return None

        def commit(self):
            return None

        def refresh(self, *args, **kwargs):
            return None

        def close(self):
            return None

    def SessionLocal():
        return _Session()

    def get_db():
        db = _Session()
        try:
            yield db
        finally:
            db.close()

    def ensure_default_admin() -> None:
        return None

    postgres_mod.Employee = Employee
    postgres_mod.FaceImage = FaceImage
    postgres_mod.AccessLog = AccessLog
    postgres_mod.Admin = Admin
    postgres_mod.Base = Base
    postgres_mod.SessionLocal = SessionLocal
    postgres_mod.get_db = get_db
    postgres_mod.ensure_default_admin = ensure_default_admin
    postgres_mod.engine = object()
    sys.modules["app.db.postgres"] = postgres_mod


try:
    import cv2  # noqa: F401
except Exception:
    _install_cv2_stub()

try:
    import deepface  # noqa: F401
except Exception:
    _install_deepface_stub()

try:
    import qdrant_client  # noqa: F401
except Exception:
    _install_qdrant_stub()

try:
    import torch  # noqa: F401
except Exception:
    _install_face_embedder_stub()

try:
    import passlib.context  # noqa: F401
except Exception:
    _install_passlib_stub()

try:
    import minio  # noqa: F401
except Exception:
    _install_minio_stub()

try:
    import psycopg2  # noqa: F401
except Exception:
    _install_postgres_stub()
