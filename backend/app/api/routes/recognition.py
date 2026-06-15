# backend/app/api/routes/recognition.py

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from app.db.postgres import get_db
from app.services.recognition_service import recognition_service
from app.services.log_service import log_service
from collections import deque
import base64
import json

router = APIRouter(tags=["recognition"])

_CONSENSUS_N = 3
_session_results: dict[int, deque] = {}


@router.websocket("/ws/recognize")
async def recognize_stream(
    websocket: WebSocket,
    camera_id: str = "default",
    action: str    = "check_in",
    db: Session    = Depends(get_db)
):
    """
    WebSocket endpoint receiving frame stream from frontend.
    Each frame → recognition → returns JSON result.
    Multi-frame consensus (N=3): only log when 3 consecutive frames
    agree on the same employee_id.
    """
    await websocket.accept()
    session_id = id(websocket)
    _session_results[session_id] = deque(maxlen=_CONSENSUS_N)
    if action not in ("check_in", "check_out"):
        action = "check_in"
    print(f"[WS] Camera {camera_id} connected (action={action})", flush=True)

    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                print(f"[WS] Camera {camera_id} disconnected", flush=True)
                break
            frame_bytes = None
            if "bytes" in message and message["bytes"] is not None:
                frame_bytes = message["bytes"]
            elif "text" in message and message["text"]:
                payload = json.loads(message["text"])
                frame_data = payload.get("frame", "")
                if frame_data.startswith("data:image"):
                    frame_data = frame_data.split(",", 1)[1]
                frame_bytes = base64.b64decode(frame_data)

            if not frame_bytes:
                continue

            # Recognize without logging — consensus decides when to log
            result = recognition_service.recognize(
                image_bytes=frame_bytes,
                camera_id=camera_id,
                db=None
            )

            # ── Multi-frame consensus ──
            checkin_status = None
            consensus_matched = False
            pending_count = 0
            _commit_message = None
            _commit_time = None
            buf = _session_results[session_id]

            if not result.success and not result.is_live and result.bbox:
                checkin_status = "spoof"
                buf.clear()  # spoof resets the streak — prevents 2+1+1 bypass
            elif result.success:
                # Both matched and unmatched (Unknown) participate in consensus
                buf.append(result.person_id)  # None for Unknown

                if len(buf) < _CONSENSUS_N:
                    checkin_status = "pending"
                    pending_count = len(buf)
                else:
                    ids = list(buf)
                    if len(set(ids)) == 1:
                        if ids[0] is not None:
                            # Known employee consensus — commit log
                            buf.clear()
                            consensus_matched = True
                            _commit = recognition_service.commit_log(
                                db=db,
                                person_id=result.person_id,
                                action=action,
                                confidence=result.confidence,
                                image_bytes=frame_bytes,
                                camera_id=camera_id,
                                access_granted=result.access_granted,
                            )
                            checkin_status = _commit.get("status") if _commit else None
                            _commit_message = _commit.get("message") if _commit else None
                            _commit_time = _commit.get("time") if _commit else None
                        else:
                            # N consecutive unknowns — confirmed unknown
                            buf.clear()
                            checkin_status = "unknown"
                    else:
                        # Mix of identities — reset
                        buf.clear()
                        checkin_status = "pending"
                        pending_count = 0

            # matched=True in response only when consensus confirmed
            matched_out = result.matched and consensus_matched

            try:
                response_data = {
                    "success": result.success,
                    "matched": matched_out,
                    "person_id": result.person_id if matched_out else None,
                    "name": result.name if matched_out else None,
                    "confidence": result.confidence,
                    "bbox": result.bbox,
                    "is_live": result.is_live,
                    "message": result.message,
                    "access_granted": result.access_granted if matched_out else False,
                    "score_2d": result.score_2d,
                    "score_3d": result.score_3d,
                    "status": result.message,
                    "action": action,
                    "checkin_status": checkin_status,
                    "checkin_message": _commit_message,
                    "checkin_time": _commit_time.isoformat() if _commit_time else None,
                    "pending_count": pending_count,
                    "timestamp": None,
                    "faces": [
                        {
                            "x": result.bbox.get("x", 0),
                            "y": result.bbox.get("y", 0),
                            "w": result.bbox.get("w", 0),
                            "h": result.bbox.get("h", 0),
                            "name": result.name if matched_out else "Unknown",
                            "confidence": result.confidence,
                        }
                    ]
                    if result.bbox
                    else [],
                }
                await websocket.send_text(json.dumps(response_data))
            except Exception as _resp_e:
                import traceback as _tb_resp
                print(f"[ERROR][WS BUILD-RESPONSE] {type(_resp_e).__name__}: {_resp_e}", flush=True)
                print(_tb_resp.format_exc(), flush=True)
                raise

    except WebSocketDisconnect:
        print(f"[WS] Camera {camera_id} disconnected", flush=True)
    except Exception as e:
        import traceback
        print(f"[ERROR][WS] {type(e).__name__}: {e}", flush=True)
        print(traceback.format_exc())
        try:
            await websocket.close()
        except RuntimeError:
            pass
    finally:
        _session_results.pop(session_id, None)