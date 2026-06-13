from __future__ import annotations

import io
import uuid
from datetime import datetime

from minio import Minio
from minio.error import S3Error

from app.config import settings

minio_client = Minio(
    endpoint=settings.minio_endpoint,
    access_key=settings.minio_access_key,
    secret_key=settings.minio_secret_key,
    secure=settings.minio_secure,
)


def ensure_bucket_exists(bucket_name: str) -> None:
    if not minio_client.bucket_exists(bucket_name):
        minio_client.make_bucket(bucket_name)


def _pick_bucket(folder: str) -> str:
    if folder == "snapshots":
        return settings.minio_bucket_snapshots
    return settings.minio_bucket_faces


def upload_image(image_bytes: bytes, folder: str = "faces", filename: str | None = None) -> str:
    bucket = _pick_bucket(folder)
    ensure_bucket_exists(bucket)
    filename = filename or f"{uuid.uuid4()}.jpg"
    object_name = f"{folder}/{datetime.utcnow().strftime('%Y%m%d')}/{filename}"

    minio_client.put_object(
        bucket_name=bucket,
        object_name=object_name,
        data=io.BytesIO(image_bytes),
        length=len(image_bytes),
        content_type="image/jpeg",
    )
    return object_name


def get_image_url(object_name: str, folder: str = "faces", expires: int = 3600) -> str:
    bucket = _pick_bucket(folder)
    url = minio_client.presigned_get_object(bucket_name=bucket, object_name=object_name, expires=expires)
    return url


def list_objects(folder: str = "snapshots"):
    bucket = _pick_bucket(folder)
    if not minio_client.bucket_exists(bucket):
        return []
    return list(minio_client.list_objects(bucket_name=bucket, prefix=f"{folder}/", recursive=True))


def delete_object(object_name: str, folder: str = "snapshots") -> None:
    bucket = _pick_bucket(folder)
    try:
        minio_client.remove_object(bucket_name=bucket, object_name=object_name)
    except S3Error:
        return