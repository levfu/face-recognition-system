import { useEffect, useMemo, useRef, useState } from "react";
import { FaceLandmarker, HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const WASM_CDN  = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const HAND_MODEL_URL     = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task';
const OCCLUSION_THRESHOLD = 0.15;
const DETECT_INTERVAL_MS = 1000 / 30;
const FRAME_INTERVAL_MS  = 2000;

const RIGHT_EYE_IDX = [33, 160, 158, 133, 153, 144];
const LEFT_EYE_IDX  = [362, 385, 387, 263, 373, 380];
const EAR_THRESHOLD = 0.18;
const EAR_CLOSED_MS = 500;

function calcEAR(lms, idx) {
  const [p1, p2, p3, p4, p5, p6] = idx.map(i => lms[i]);
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  return (d(p2, p6) + d(p3, p5)) / (2 * d(p1, p4));
}

function checkHandOcclusion(handLandmarks, faceLandmarks) {
  if (!handLandmarks?.length || !faceLandmarks?.length) return false;
  const fxs = faceLandmarks.map(l => l.x);
  const fys = faceLandmarks.map(l => l.y);
  const fxMin = Math.min(...fxs), fxMax = Math.max(...fxs);
  const fyMin = Math.min(...fys), fyMax = Math.max(...fys);
  const faceArea = (fxMax - fxMin) * (fyMax - fyMin);
  if (faceArea <= 0) return false;
  for (const hand of handLandmarks) {
    const hxs = hand.map(l => l.x);
    const hys = hand.map(l => l.y);
    const ix = Math.max(0, Math.min(fxMax, Math.max(...hxs)) - Math.max(fxMin, Math.min(...hxs)));
    const iy = Math.max(0, Math.min(fyMax, Math.max(...hys)) - Math.max(fyMin, Math.min(...hys)));
    if ((ix * iy) / faceArea > OCCLUSION_THRESHOLD) return true;
  }
  return false;
}

const MIN_FACE_H = 0.45;
const MAX_FACE_H = 0.72;
const OVAL = { cx: 0.5, cy: 0.5, rx: 0.15, ry: 0.36 };

function buildWsUrl(action = 'check_in') {
  const override = import.meta.env.VITE_WS_RECOGNITION_URL;
  const base = override || `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws/recognize`;
  return `${base}?action=${action}`;
}

export default function CameraStream({ fps = 5, onRecognition, onFaceStatusChange, action = 'check_in', headerSlot }) {
  const videoRef         = useRef(null);
  const overlayCanvasRef = useRef(null);
  const captureCanvasRef = useRef(document.createElement("canvas"));
  const socketRef        = useRef(null);
  const timerRef         = useRef(null);
  const isSendingRef     = useRef(false);
  const landmarkerRef    = useRef(null);
  const handLandmarkerRef = useRef(null);
  const lastDetectRef    = useRef(0);
  const faceStatusRef       = useRef(null);
  const eyesClosedStartRef  = useRef(null);
  const cooldownUntilRef    = useRef(0);
  const localStreamRef   = useRef(null);

  const [status, setStatus]         = useState("Đang khởi động camera...");
  const [faceStatus, setFaceStatus] = useState(null);
  const wsUrl = useMemo(() => buildWsUrl(action), [action]);

  // ── Effect 1: Camera init (once) + WebSocket (reconnects when wsUrl changes) ──
  useEffect(() => {
    const connectSocket = () => {
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;
      socket.onopen    = () => { setStatus("WebSocket đã kết nối"); startCaptureLoop(); };
      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        drawOverlay(payload.faces || [], payload.checkin_status);
        if (faceStatusRef.current === 'ok') {
          onRecognition?.(payload);
          if (payload.matched || payload.checkin_status === 'spoof') {
            cooldownUntilRef.current = Date.now() + 3000;
          }
        }
        isSendingRef.current = false;
      };
      socket.onerror  = () => setStatus("WebSocket gặp lỗi");
      socket.onclose  = () => stopCaptureLoop();
    };

    const startCaptureLoop = () => {
      timerRef.current = window.setInterval(sendCurrentFrame, FRAME_INTERVAL_MS);
    };

    const init = async () => {
      try {
        // Camera init only once — reuse existing stream on WS reconnect
        if (!localStreamRef.current) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 1280, height: 720, facingMode: "user" },
            audio: false,
          });
          localStreamRef.current = stream;
          if (!videoRef.current) return;
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setStatus("Camera đã kết nối");
        }
        connectSocket();
      } catch {
        setStatus("Không thể truy cập webcam");
      }
    };

    init();

    return () => {
      stopCaptureLoop();
      socketRef.current?.close();
      // Camera stream persists across WS reconnects — cleaned up on unmount below
    };
  }, [fps, onRecognition, wsUrl]);

  // ── Camera cleanup on component unmount ──
  useEffect(() => {
    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    };
  }, []);

  // ── Effect 2: Load MediaPipe FaceLandmarker + HandLandmarker ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
        const [lm, handLm] = await Promise.all([
          FaceLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
            outputFacialTransformationMatrixes: false,
            runningMode: 'VIDEO',
            numFaces: 1,
          }),
          HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: 'CPU' },
            runningMode: 'VIDEO',
            numHands: 2,
          }),
        ]);
        if (cancelled) { lm.close(); handLm.close(); return; }
        landmarkerRef.current = lm;
        handLandmarkerRef.current = handLm;
        console.log('[OCCLUSION] Both landmarkers loaded:', { face: !!lm, hand: !!handLm });
      } catch (_) {}
    })();
    return () => {
      cancelled = true;
      if (landmarkerRef.current) { landmarkerRef.current.close(); landmarkerRef.current = null; }
      if (handLandmarkerRef.current) { handLandmarkerRef.current.close(); handLandmarkerRef.current = null; }
    };
  }, []);

  // ── Effect 3: Detection RAF loop ──
  useEffect(() => {
    let rafId;
    let frameCount = 0;
    const loop = () => {
      const video = videoRef.current;
      const lm    = landmarkerRef.current;
      if (video && lm && video.readyState >= 2) {
        const now = performance.now();
        if (now - lastDetectRef.current >= DETECT_INTERVAL_MS) {
          lastDetectRef.current = now;
          try {
            const res = lm.detectForVideo(video, now);
            if (res.faceLandmarks?.length > 0) {
              const lms    = res.faceLandmarks[0];
              const xs     = lms.map(l => Math.min(1, Math.max(0, l.x)));
              const ys     = lms.map(l => Math.min(1, Math.max(0, l.y)));
              const faceCX = (Math.min(...xs) + Math.max(...xs)) / 2;
              const faceCY = (Math.min(...ys) + Math.max(...ys)) / 2;
              const faceH  = Math.max(...ys) - Math.min(...ys);
              const inside = ((faceCX - OVAL.cx) ** 2 / OVAL.rx ** 2
                            + (faceCY - OVAL.cy) ** 2 / OVAL.ry ** 2) <= 1.0;
              let next;
              if      (!inside)            next = 'out';
              else if (faceH < MIN_FACE_H) next = 'small';
              else if (faceH > MAX_FACE_H) next = 'large';
              else                         next = 'ok';
              // ── Occluded + EAR (priority: occluded > eyes_closed) ──
              frameCount++;
              if (next === 'ok') {
                const handLm = handLandmarkerRef.current;
                if (handLm) {
                  try {
                    const handRes = handLm.detectForVideo(video, now);
                    const fxs = lms.map(l => l.x), fys = lms.map(l => l.y);
                    const faceBbox = { xMin: Math.min(...fxs), xMax: Math.max(...fxs), yMin: Math.min(...fys), yMax: Math.max(...fys) };
                    let handBbox = null, ratio = null;
                    if (handRes.landmarks?.length > 0) {
                      const h0 = handRes.landmarks[0];
                      const hxs = h0.map(l => l.x), hys = h0.map(l => l.y);
                      handBbox = { xMin: Math.min(...hxs), xMax: Math.max(...hxs), yMin: Math.min(...hys), yMax: Math.max(...hys) };
                      const faceArea = (faceBbox.xMax - faceBbox.xMin) * (faceBbox.yMax - faceBbox.yMin);
                      const ix = Math.max(0, Math.min(faceBbox.xMax, handBbox.xMax) - Math.max(faceBbox.xMin, handBbox.xMin));
                      const iy = Math.max(0, Math.min(faceBbox.yMax, handBbox.yMax) - Math.max(faceBbox.yMin, handBbox.yMin));
                      ratio = faceArea > 0 ? (ix * iy) / faceArea : 0;
                    }
                    if (frameCount % 30 === 0) {
                      console.log('[OCCLUSION]', {
                        handDetected: handRes.landmarks?.length ?? 0,
                        faceBbox,
                        handBbox,
                        overlapRatio: ratio,
                        faceStatus: next,
                      });
                    }
                    if (checkHandOcclusion(handRes.landmarks, lms)) {
                      console.log('[OCCLUSION] TRIGGERED', ratio);
                      next = 'occluded';
                    }
                  } catch (_) {}
                }
              }
              if (next === 'ok') {
                const avgEAR = (calcEAR(lms, RIGHT_EYE_IDX) + calcEAR(lms, LEFT_EYE_IDX)) / 2;
                if (avgEAR < EAR_THRESHOLD) {
                  if (eyesClosedStartRef.current === null) eyesClosedStartRef.current = now;
                  else if (now - eyesClosedStartRef.current >= EAR_CLOSED_MS) next = 'eyes_closed';
                } else {
                  eyesClosedStartRef.current = null;
                }
              } else {
                eyesClosedStartRef.current = null;
              }
              if (next !== 'ok') cooldownUntilRef.current = 0;
              faceStatusRef.current = next;
              setFaceStatus(next);
            } else {
              eyesClosedStartRef.current = null;
              cooldownUntilRef.current = 0;
              faceStatusRef.current = 'lost';
              setFaceStatus('lost');
            }
          } catch (_) {}
        }
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // ── Effect 4: Notify parent + clear stale overlay when faceStatus changes ──
  useEffect(() => {
    onFaceStatusChange?.(faceStatus);
    if (faceStatus !== 'ok') {
      const canvas = overlayCanvasRef.current;
      if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [faceStatus, onFaceStatusChange]);

  function stopCaptureLoop() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function sendCurrentFrame() {
    if (faceStatusRef.current !== 'ok') return;
    if (Date.now() < cooldownUntilRef.current) return;
    const video  = videoRef.current;
    const socket = socketRef.current;
    const canvas = captureCanvasRef.current;
    if (!video || !socket || socket.readyState !== WebSocket.OPEN) return;
    if (video.videoWidth === 0 || video.videoHeight === 0 || isSendingRef.current) return;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    socket.send(JSON.stringify({ frame: canvas.toDataURL("image/jpeg", 0.7) }));
    isSendingRef.current = true;
  }

  function drawOverlay(faces, checkinStatus) {
    const canvas = overlayCanvasRef.current;
    const video  = videoRef.current;
    if (!canvas || !video) return;
    if (faceStatusRef.current !== 'ok') {
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    canvas.width  = video.clientWidth;
    canvas.height = video.clientHeight;
    const scaleX = canvas.width  / video.videoWidth;
    const scaleY = canvas.height / video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    faces.forEach((face) => {
      let color, label;
      if (checkinStatus === 'spoof') {
        color = '#dc2626';
        label = 'Giả mạo';
      } else if (checkinStatus === 'pending') {
        color = '#f59e0b';
        label = 'Đang xác nhận...';
      } else if (checkinStatus === 'success' || checkinStatus === 'new_checkin' || checkinStatus === 'already_checked_in' || checkinStatus === 'already_checked_out') {
        color = '#10b981';
        label = `${face.name} (${((face.confidence || 0) * 100).toFixed(1)}%)`;
      } else if (checkinStatus === 'unknown') {
        color = '#ef4444';
        label = `Unknown (${((face.confidence || 0) * 100).toFixed(1)}%)`;
      } else {
        color = 'rgba(148,163,184,0.7)';
        label = null;
      }

      const x = face.x * scaleX;
      const y = face.y * scaleY;
      const w = face.w * scaleX;
      const h = face.h * scaleY;
      ctx.strokeStyle = color;
      ctx.lineWidth   = 3;
      ctx.strokeRect(x, y, w, h);

      if (label) {
        // Un-flip text: the canvas element is CSS scaleX(-1) via parent, so apply a
        // mirror transform on the context to keep labels readable.
        ctx.save();
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.fillStyle = color;
        ctx.font      = "500 14px Inter, sans-serif";
        ctx.fillText(label, canvas.width - x - w, Math.max(18, y - 8));
        ctx.restore();
      }
    });
  }

  const badgeClass =
    status.includes("WebSocket đã kết nối")
      ? "badge--connected"
      : status.includes("lỗi") || status.includes("không thể")
        ? "badge--error"
        : "badge--connecting";

  const ovalStyle =
    faceStatus === 'lost'
      ? { borderColor: 'rgba(150,150,150,0.5)', boxShadow: 'none' }
      : faceStatus === 'out' || faceStatus === 'small' || faceStatus === 'large' || faceStatus === 'occluded' || faceStatus === 'eyes_closed'
        ? { borderColor: '#ff6b6b',
            boxShadow: '0 0 18px rgba(255,107,107,0.30), 0 0 6px rgba(255,107,107,0.20)' }
        : {};

  const hintText =
    faceStatus === 'lost'        ? 'Không thấy mặt — vui lòng nhìn vào camera'
    : faceStatus === 'out'         ? 'Đưa mặt vào khung'
    : faceStatus === 'small'       ? 'Lại gần hơn'
    : faceStatus === 'large'       ? 'Lùi ra xa hơn'
    : faceStatus === 'occluded'    ? 'Vui lòng bỏ tay khỏi mặt'
    : faceStatus === 'eyes_closed' ? 'Vui lòng mở mắt nhìn vào camera'
    : null;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {headerSlot}
        <div className={`status-badge ${badgeClass}`}>{status}</div>
      </div>
      <div className="video-stage" style={{ transform: 'scaleX(-1)' }}>
        <video ref={videoRef} className="video-layer" muted playsInline />
        <canvas ref={overlayCanvasRef} className="overlay-layer" />
        <div className="face-oval-guide" style={ovalStyle} />
      </div>
      {hintText && (
        <div className="zone-hint">{hintText}</div>
      )}
    </>
  );
}
