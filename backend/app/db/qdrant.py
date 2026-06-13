from __future__ import annotations

import uuid
from typing import Any

from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, Filter, PointStruct, SearchParams, VectorParams
from qdrant_client.http.models import FieldCondition, MatchValue

from app.config import settings
from app.db.postgres import Employee, SessionLocal

qdrant_client = QdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)


def init_collection() -> None:
    collections = qdrant_client.get_collections().collections
    if any(col.name == settings.qdrant_collection for col in collections):
        return
    qdrant_client.create_collection(
        collection_name=settings.qdrant_collection,
        vectors_config=VectorParams(size=settings.embedding_size, distance=Distance.COSINE),
    )


def upsert_vector(
    embedding: list[float],
    person_id: str,
    code: str | None = None,
    name: str | None = None,
    image_index: int | None = None,
    landmarks: list | None = None,
) -> str:
    point_id = str(uuid.uuid4())
    payload: dict = {"person_id": person_id}
    if code is not None:
        payload["code"] = code
    if name is not None:
        payload["name"] = name
    if image_index is not None:
        payload["image_index"] = image_index
    if landmarks is not None:
        # Flat list 1434 floats: [x0,y0,z0, x1,y1,z1, ...]
        payload["landmarks_3d"] = [
            coord
            for lm in landmarks
            for coord in (lm["x"], lm["y"], lm["z"])
        ]
    qdrant_client.upsert(
        collection_name=settings.qdrant_collection,
        points=[
            PointStruct(
                id=point_id,
                vector=embedding,
                payload=payload,
            )
        ],
    )
    return point_id


def search_vector(embedding: list[float], top_k: int = 1):
    return qdrant_client.search(
        collection_name=settings.qdrant_collection,
        query_vector=embedding,
        limit=top_k,
        search_params=SearchParams(hnsw_ef=128, exact=False),
    )


def delete_by_person(person_id: str) -> None:
    selector = Filter(must=[FieldCondition(key="person_id", match=MatchValue(value=person_id))])
    qdrant_client.delete(collection_name=settings.qdrant_collection, points_selector=selector)


def get_person_info(person_id: str) -> dict[str, Any] | None:
    db = SessionLocal()
    try:
        person = db.query(Employee).filter(Employee.id == person_id).first()
        if not person:
            return None
        return {"id": str(person.id), "name": person.name, "is_active": person.is_active}
    finally:
        db.close()