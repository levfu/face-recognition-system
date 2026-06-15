import React, { useEffect, useRef, useState } from 'react';
import { FaceLandmarker, HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const WASM_CDN  = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const HAND_MODEL_URL      = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task';
const OCCLUSION_THRESHOLD = 0.15;
const RAD_TO_DEG          = 180 / Math.PI;
const DETECT_INTERVAL_MS = 1000 / 30;
const HOLD_DURATION_MS   = 200;
const SMOOTHING          = 0.7;

const OVAL       = { cx: 0.5, cy: 0.5, rx: 0.20, ry: 0.36 };
const MIN_FACE_H = 0.45;
const MAX_FACE_H = 0.72;

// Ellipse geometry — viewBox 0-100, center (50,50)
// RX=20 ↔ 40% parent width, RY=36 ↔ 72% parent height (matches OVAL gate)
const RX = 20;
const RY = 36;
const HALF_SPAN = 18;  // each arc 36° (gap 9° on both sides)

const FRONTAL_MAG_THRESHOLD = 8;
const DIR_MAG_MIN   = 15;
const DIR_MAG_MAX   = 42;
const DIR_ANGLE_TOL = 22.5;

const TARGETS = [
  { label: 'Look straight at the camera',    frontal: true, theta: null },
  { label: 'Right',           yaw:  24, pitch:   0, theta:   0 },
  { label: 'Top-Right', yaw:  18, pitch:  14, theta:  45 },
  { label: 'Top',           yaw:   0, pitch:  18, theta:  90 },
  { label: 'Top-Left', yaw: -18, pitch:  14, theta: 135 },
  { label: 'Left',           yaw: -24, pitch:   0, theta: 180 },
  { label: 'Bottom-Left', yaw: -18, pitch: -12, theta: 225 },
  { label: 'Bottom',           yaw:   0, pitch: -14, theta: 270 },
  { label: 'Bottom-Right', yaw:  18, pitch: -12, theta: 315 },
];

const DIR_THETAS = [0, 45, 90, 135, 180, 225, 270, 315];

// Point on ellipse at angle theta (degrees). Used for <ellipse>, arc, marker.
function ellipsePoint(thetaDeg) {
  const rad = thetaDeg * Math.PI / 180;
  return { x: 50 + RX * Math.cos(rad), y: 50 - RY * Math.sin(rad) };
}

// Signed angle difference, normalized to [-180, 180]
function angleDiff(a, b) {
  let d = ((a - b) % 360 + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

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

export default function MultiAngleCapture({ onCapturesComplete, onReset, disabled }) {
  // ── Refs ──
  const videoRef      = useRef(null);
  const canvasRef     = useRef(null);
  const landmarkerRef    = useRef(null);
  const handLandmarkerRef = useRef(null);
  const lastDetectRef    = useRef(0);

  const smoothedAnglesRef    = useRef({ yaw: 0, pitch: 0, roll: 0 });
  const handleCaptureRef     = useRef(null);
  const captureInProgressRef = useRef(false);
  const latestLandmarksRef   = useRef(null);
  const startedRef           = useRef(false);

  const frontalDoneRef       = useRef(false);
  const capturedDirsRef      = useRef(new Set());
  const capturedImagesRef    = useRef(Array(9).fill(null));
  const capturedLandmarksRef = useRef(Array(9).fill(null));
  const holdStartRef         = useRef(null);
  const activeDirRef         = useRef(null);
  const pendingSlotRef       = useRef(null);
  const captureHistoryRef    = useRef([]);
  const eyesClosedStartRef   = useRef(null);

  // ── State ──
  const [frontalDone, setFrontalDone]         = useState(false);
  const [capturedDirs, setCapturedDirs]       = useState(new Set());
  const [capturedImages, setCapturedImages]   = useState(Array(9).fill(null));
  const [capturedLandmarks, setCapturedLandmarks] = useState(Array(9).fill(null));
  const [allDone, setAllDone]         = useState(false);
  const [activeDir, setActiveDir]     = useState(null);
  const [currentMag, setCurrentMag]   = useState(0);
  const [currentTheta, setCurrentTheta] = useState(0);
  const [currentAngles, setCurrentAngles] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [modelLoading, setModelLoading] = useState(true);
  const [modelError, setModelError]   = useState(null);
  const [faceStatus, setFaceStatus]   = useState(null);
  const [started, setStarted]         = useState(false);

  // ── Effect 1: Camera ──
  useEffect(() => {
    let active = null;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } })
      .then((s) => {
        active = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.onloadedmetadata = () => setCameraReady(true);
        }
      })
      .catch(() => setCameraError(
        'Camera access is required. Please allow camera permissions in your browser settings and reload the page.'
      ));
    return () => { if (active) active.getTracks().forEach((t) => t.stop()); };
  }, []);

  // ── Effect 2: Load MediaPipe ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
        const [lm, handLm] = await Promise.all([
          FaceLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
            outputFacialTransformationMatrixes: true,
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
        setModelLoading(false);
      } catch {
        if (!cancelled) {
          setModelLoading(false);
          setModelError('Failed to load MediaPipe. Please check your network connection and reload.');
        }
      }
    })();
    return () => {
      cancelled = true;
      if (landmarkerRef.current) { landmarkerRef.current.close(); landmarkerRef.current = null; }
      if (handLandmarkerRef.current) { handLandmarkerRef.current.close(); handLandmarkerRef.current = null; }
    };
  }, []);

  // ── Effect 3: Detection RAF loop ──
  useEffect(() => {
    if (!cameraReady || modelLoading || modelError) return;
    let rafId;
    const loop = () => {
      const video = videoRef.current;
      const lm    = landmarkerRef.current;
      if (video && lm && video.readyState >= 2) {
        const now = performance.now();
        if (now - lastDetectRef.current >= DETECT_INTERVAL_MS) {
          lastDetectRef.current = now;
          try {
            const res = lm.detectForVideo(video, now);
            if (res.facialTransformationMatrixes?.length > 0) {
              if (res.faceLandmarks?.length > 0) {
                latestLandmarksRef.current = res.faceLandmarks[0];
              }

              // ── Oval gate ──
              let faceOk = false, fStatus = null;
              if (res.faceLandmarks?.length > 0) {
                const lms = res.faceLandmarks[0];
                const xs  = lms.map(l => Math.min(1, Math.max(0, l.x)));
                const ys  = lms.map(l => Math.min(1, Math.max(0, l.y)));
                const faceCX = (Math.min(...xs) + Math.max(...xs)) / 2;
                const faceCY = (Math.min(...ys) + Math.max(...ys)) / 2;
                const faceH  = Math.max(...ys) - Math.min(...ys);
                const inside = ((faceCX - OVAL.cx) ** 2 / OVAL.rx ** 2
                              + (faceCY - OVAL.cy) ** 2 / OVAL.ry ** 2) <= 1.0;
                if      (!inside)            fStatus = 'out';
                else if (faceH < MIN_FACE_H) fStatus = 'small';
                else if (faceH > MAX_FACE_H) fStatus = 'large';
                else                         fStatus = 'ok';
                // ── Occluded + EAR (priority: occluded > eyes_closed) ──
                if (fStatus === 'ok') {
                  const handLm = handLandmarkerRef.current;
                  if (handLm) {
                    try {
                      const handRes = handLm.detectForVideo(video, now);
                      if (checkHandOcclusion(handRes.landmarks, lms)) fStatus = 'occluded';
                    } catch (_) {}
                  }
                }
                if (fStatus === 'ok') {
                  const avgEAR = (calcEAR(lms, RIGHT_EYE_IDX) + calcEAR(lms, LEFT_EYE_IDX)) / 2;
                  if (avgEAR < EAR_THRESHOLD) {
                    if (eyesClosedStartRef.current === null) eyesClosedStartRef.current = now;
                  else if (now - eyesClosedStartRef.current >= EAR_CLOSED_MS) fStatus = 'eyes_closed';
                  } else {
                    eyesClosedStartRef.current = null;
                  }
                } else {
                  eyesClosedStartRef.current = null;
                }
                faceOk = fStatus === 'ok';
              }
              setFaceStatus(fStatus);

              const d = res.facialTransformationMatrixes[0].data;

              const rawYaw   = Math.atan2(-d[8],  d[10]) * RAD_TO_DEG;
              const rawPitch = Math.asin( d[9])           * RAD_TO_DEG;
              const rawRoll  = Math.atan2(-d[1],  d[5])   * RAD_TO_DEG;
              const sm = smoothedAnglesRef.current;
              sm.yaw   = SMOOTHING * sm.yaw   + (1 - SMOOTHING) * rawYaw;
              sm.pitch = SMOOTHING * sm.pitch + (1 - SMOOTHING) * rawPitch;
              sm.roll  = SMOOTHING * sm.roll  + (1 - SMOOTHING) * rawRoll;
              setCurrentAngles({ yaw: sm.yaw, pitch: sm.pitch, roll: sm.roll });

              const mag   = Math.sqrt(sm.yaw ** 2 + sm.pitch ** 2);
              const theta = Math.atan2(sm.pitch, sm.yaw) * RAD_TO_DEG;
              setCurrentMag(mag);
              setCurrentTheta(theta);

              if (!startedRef.current || captureInProgressRef.current) {
                // skip — not started or mid-capture
              } else if (!frontalDoneRef.current) {
                // ── Frontal ──
                if (faceOk && mag < FRONTAL_MAG_THRESHOLD) {
                  if (holdStartRef.current === null) holdStartRef.current = now;
                  else if (now - holdStartRef.current >= HOLD_DURATION_MS) {
                    captureInProgressRef.current = true;
                    pendingSlotRef.current = 0;
                    handleCaptureRef.current?.();
                  }
                } else {
                  holdStartRef.current = null;
                }
                if (activeDirRef.current !== null) { activeDirRef.current = null; setActiveDir(null); }
              } else {
                // ── 8 Directions ──
                let matched = null;
                for (let i = 0; i < 8; i++) {
                  if (capturedDirsRef.current.has(i)) continue;
                  const dTheta = angleDiff(theta, TARGETS[i + 1].theta);
                  if (faceOk && mag >= DIR_MAG_MIN && mag <= DIR_MAG_MAX
                      && Math.abs(dTheta) <= DIR_ANGLE_TOL) {
                    matched = i; break;
                  }
                }
                if (matched !== null) {
                  if (activeDirRef.current !== matched) {
                    activeDirRef.current = matched; setActiveDir(matched);
                    holdStartRef.current = now;
                  } else if (now - holdStartRef.current >= HOLD_DURATION_MS) {
                    captureInProgressRef.current = true;
                    pendingSlotRef.current = matched + 1;
                    handleCaptureRef.current?.();
                  }
                } else {
                  if (activeDirRef.current !== null) { activeDirRef.current = null; setActiveDir(null); }
                  holdStartRef.current = null;
                }
              }
            } else {
              // CASE A: no landmarks → face is truly not visible
              // CASE B: has landmarks but missing pose matrix → tilted too much
              if (res.faceLandmarks?.length > 0) {
                latestLandmarksRef.current = res.faceLandmarks[0];
                const lms = res.faceLandmarks[0];
                const xs  = lms.map(l => Math.min(1, Math.max(0, l.x)));
                const ys  = lms.map(l => Math.min(1, Math.max(0, l.y)));
                const faceCX = (Math.min(...xs) + Math.max(...xs)) / 2;
                const faceCY = (Math.min(...ys) + Math.max(...ys)) / 2;
                const faceH  = Math.max(...ys) - Math.min(...ys);
                const inside = ((faceCX - OVAL.cx) ** 2 / OVAL.rx ** 2
                              + (faceCY - OVAL.cy) ** 2 / OVAL.ry ** 2) <= 1.0;
                if      (!inside)            setFaceStatus('out');
                else if (faceH < MIN_FACE_H) setFaceStatus('small');
                else if (faceH > MAX_FACE_H) setFaceStatus('large');
                else                         setFaceStatus('angle_lost');
              } else {
                setFaceStatus('lost');
              }
              setCurrentAngles(null);
              setCurrentMag(0);
              if (activeDirRef.current !== null) { activeDirRef.current = null; setActiveDir(null); }
              holdStartRef.current = null;
              eyesClosedStartRef.current = null;
            }
          } catch (_) { /* skip frame */ }
        }
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [cameraReady, modelLoading, modelError]);

  // ── Handlers ──
  const handleCapture = () => {
    const slot = pendingSlotRef.current;
    if (slot === null) return;
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !cameraReady) return;
    const snappedLms = latestLandmarksRef.current
      ? latestLandmarksRef.current.map(lm => ({ x: lm.x, y: lm.y, z: lm.z }))
      : null;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        capturedImagesRef.current[slot] = blob;
        setCapturedImages([...capturedImagesRef.current]);
        capturedLandmarksRef.current[slot] = snappedLms;
        setCapturedLandmarks([...capturedLandmarksRef.current]);

        if (slot === 0) { frontalDoneRef.current = true; setFrontalDone(true); }
        else { capturedDirsRef.current.add(slot - 1); setCapturedDirs(new Set(capturedDirsRef.current)); }

        captureHistoryRef.current.push(slot);
        if (capturedImagesRef.current.every(b => b !== null)) setAllDone(true);

        captureInProgressRef.current = false;
        pendingSlotRef.current = null;
        holdStartRef.current = null;
        activeDirRef.current = null; setActiveDir(null);
      },
      'image/jpeg',
      0.9
    );
  };

  useEffect(() => { handleCaptureRef.current = handleCapture; });

  const handleReset = () => {
    capturedImagesRef.current = Array(9).fill(null);
    capturedLandmarksRef.current = Array(9).fill(null);
    capturedDirsRef.current = new Set();
    captureHistoryRef.current = [];
    frontalDoneRef.current = false;
    activeDirRef.current = null;
    holdStartRef.current = null;
    captureInProgressRef.current = false;
    setCapturedImages(Array(9).fill(null));
    setCapturedLandmarks(Array(9).fill(null));
    setCapturedDirs(new Set());
    setFrontalDone(false);
    setAllDone(false);
    setStarted(false); startedRef.current = false;
    setActiveDir(null);
    onReset();
  };

  if (cameraError) {
    return (
      <div style={{ color: '#dc3545', padding: '12px', background: '#fff5f5', borderRadius: '4px' }}>
        ❌ {cameraError}
      </div>
    );
  }

  const ovalStroke =
    activeDir !== null
      ? '#ffc107'
      : started && !frontalDone && currentMag < FRONTAL_MAG_THRESHOLD && faceStatus === 'ok'
        ? '#ffc107'
        : faceStatus === 'out' || faceStatus === 'small' || faceStatus === 'large' || faceStatus === 'occluded' || faceStatus === 'eyes_closed'
          ? '#ff6b6b'
          : faceStatus === 'ok'
            ? 'rgba(255,255,255,0.85)'
            : faceStatus === 'angle_lost'
              ? 'rgba(255,180,50,0.55)'
              : faceStatus === 'lost'
                ? 'rgba(150,150,150,0.5)'
                : 'rgba(255,255,255,0.35)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <style>{`
        @keyframes markerPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
      `}</style>

      {/* Video + single SVG overlay */}
      <div style={{ position: 'relative', width: '100%', maxWidth: '480px' }}>
        <video
          ref={videoRef}
          autoPlay muted playsInline
          style={{ width: '100%', display: 'block', borderRadius: '8px', transform: 'scaleX(-1)', background: '#000' }}
        />

        {/* ── SINGLE SVG: ellipse border + 8 arcs + center dot + marker ── */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          {/* Ellipse border (single shape) */}
          <ellipse cx="50" cy="50" rx={RX} ry={RY}
            fill="none"
            stroke={ovalStroke}
            strokeWidth="0.6"
            style={{ transition: 'stroke 0.25s' }}
          />

          {/* 8 arcs on ellipse border — same RX/RY → perfectly aligned */}
          {DIR_THETAS.map((theta, i) => {
            const done   = capturedDirs.has(i);
            const active = activeDir === i;
            const p1 = ellipsePoint(theta - HALF_SPAN);
            const p2 = ellipsePoint(theta + HALF_SPAN);
            // sweep-flag=0 (CCW on screen) → short arc in direction of increasing theta
            return (
              <path key={i}
                d={`M ${p1.x.toFixed(3)} ${p1.y.toFixed(3)} A ${RX} ${RY} 0 0 0 ${p2.x.toFixed(3)} ${p2.y.toFixed(3)}`}
                fill="none"
                stroke={done ? '#51cf66' : active ? '#ffc107' : 'rgba(255,255,255,0.28)'}
                strokeWidth={active ? 3.5 : 2.5}
                strokeLinecap="round"
                style={active ? { animation: 'markerPulse 0.8s ease-in-out infinite' } : {}}
              />
            );
          })}

          {/* Center dot — frontal */}
          {!allDone && (
            <circle cx="50" cy="50" r="2.5"
              fill={frontalDone ? '#51cf66' : 'rgba(255,255,255,0.4)'}
              style={
                started && !frontalDone && faceStatus === 'ok' && currentMag < FRONTAL_MAG_THRESHOLD
                  ? { animation: 'markerPulse 0.8s ease-in-out infinite' }
                  : {}
              }
            />
          )}

          {/* Current head position marker — moves on ellipse border */}
          {started && currentMag > 10 && (() => {
            const p = ellipsePoint(currentTheta);
            return (
              <circle
                cx={p.x.toFixed(3)} cy={p.y.toFixed(3)} r="2.2"
                fill={activeDir !== null ? '#ffd43b' : 'rgba(255,255,255,0.55)'}
              />
            );
          })()}

          {/* All-done */}
          {allDone && (
            <>
              <circle cx="50" cy="50" r="10" fill="rgba(81,207,102,0.15)" />
              <text x="50" y="50" textAnchor="middle" dominantBaseline="middle"
                fontSize="14" fill="#51cf66" style={{ userSelect: 'none' }}>✓</text>
            </>
          )}
        </svg>

      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Action area */}
      {!allDone ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {!started ? (
            <div style={{
              background: '#e8f4fd', border: '2px solid #007bff',
              borderRadius: '8px', padding: '20px 24px', textAlign: 'center',
            }}>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#004085', marginBottom: '8px' }}>
                Ready to capture 9 face angles?
              </div>
              <div style={{ fontSize: '13px', color: '#ffffff', marginBottom: '16px', lineHeight: 1.6,
                background: 'rgba(0,0,0,0.55)', padding: '8px 14px', borderRadius: '8px',
                textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                Look straight ahead, then slowly rotate your head in all directions.<br />
                The system will automatically capture when the correct angle is detected.
              </div>
              <button
                onClick={() => { setStarted(true); startedRef.current = true; }}
                disabled={!cameraReady || !!modelLoading || !!modelError}
                style={{
                  padding: '12px 32px', fontSize: '16px', fontWeight: 'bold',
                  border: 'none', borderRadius: '6px',
                  background: (!cameraReady || modelLoading || modelError) ? '#ccc' : '#007bff',
                  color: 'white',
                  cursor: (!cameraReady || modelLoading || modelError) ? 'not-allowed' : 'pointer',
                }}
              >
                ▶ Start Capture
              </button>
              {(modelLoading || !cameraReady) && (
                <div style={{ marginTop: '10px', fontSize: '12px', color: '#888' }}>
                  🔄 {modelLoading ? 'Loading MediaPipe...' : 'Starting camera...'}
                </div>
              )}
              {modelError && (
                <div style={{ marginTop: '10px', fontSize: '12px', color: '#dc3545' }}>❌ {modelError}</div>
              )}
            </div>
          ) : (
            <>
              {/* Instruction text */}
              <div style={{
                alignSelf: 'center', fontSize: '14px', color: '#ffffff',
                background: 'rgba(0,0,0,0.6)', padding: '6px 14px',
                borderRadius: '999px', textShadow: '0 1px 2px rgba(0,0,0,0.5)',
              }}>
                {!frontalDone
                  ? 'Look straight at the camera'
                  : capturedDirs.size < 8
                    ? `Slowly rotate your head in a circle to scan all angles (${capturedDirs.size + 1}/8)`
                    : 'Completed! Ready to save'}
              </div>

              {/* Face status hint */}
              {faceStatus && faceStatus !== 'ok' && (
                <div style={{
                  alignSelf: 'center', fontSize: '13px',
                  color: '#ffc107',
                  background: 'rgba(0,0,0,0.6)', padding: '6px 14px',
                  borderRadius: '999px', textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                }}>
                  {faceStatus === 'small'        ? 'Move closer'
                  : faceStatus === 'large'       ? 'Move further away'
                  : faceStatus === 'angle_lost'  ? 'Face is tilted too much — turn your head slightly back'
                  : faceStatus === 'lost'        ? 'Face not detected — please look straight at the camera'
                  : faceStatus === 'occluded'    ? 'Please remove hands from your face'
                  : faceStatus === 'eyes_closed' ? 'Please open your eyes and look at the camera'
                  : 'Position your face in the frame'}
                </div>
              )}

            </>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {capturedImages.map((blob, i) => blob && (
              <img key={i} src={URL.createObjectURL(blob)} alt={`Angle ${i + 1}`}
                style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: '4px', border: '2px solid #28a745' }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => onCapturesComplete(capturedImages, capturedLandmarks)}
              disabled={disabled}
              style={{
                padding: '10px 20px', fontSize: '16px',
                border: 'none', borderRadius: '4px',
                background: disabled ? '#ccc' : '#28a745',
                color: 'white', cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              ✅ Ready to Save
            </button>
            <button
              onClick={handleReset}
              disabled={disabled}
              style={{
                padding: '10px 16px', border: 'none', borderRadius: '4px',
                background: disabled ? '#ccc' : '#dc3545',
                color: 'white', cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              ↺ Restart
            </button>
          </div>
        </div>
      )}
    </div>
  );
}