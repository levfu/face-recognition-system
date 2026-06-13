import { useCallback, useEffect, useRef, useState } from "react";

const DAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

function fmt2(n) { return String(n).padStart(2, '0'); }
function getTimeStr(d) { return `${fmt2(d.getHours())}:${fmt2(d.getMinutes())}:${fmt2(d.getSeconds())}`; }
function getDateStr(d) {
  return `${DAYS[d.getDay()]}, ${fmt2(d.getDate())}/${fmt2(d.getMonth() + 1)}/${d.getFullYear()}`;
}
import CameraStream from "./components/CameraStream";
import RecognitionResult from "./components/RecognitionResult";
import AccessLog from "./components/AccessLog";

// Statuses that represent a "final" result (not pending) — trigger auto-reset
const FINAL_STATUSES = new Set(['success', 'new_checkin', 'already_checked_in', 'already_checked_out', 'no_checkin_yet', 'employee_inactive']);

export default function App() {
  const [latestResult, setLatestResult] = useState(null);
  const [logs, setLogs] = useState([]);
  const [now, setNow] = useState(() => new Date());
  const [action, setAction] = useState('check_in');
  const actionResetTimerRef = useRef(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Cancel auto-reset when user manually changes action
  const handleSetAction = useCallback((newAction) => {
    clearTimeout(actionResetTimerRef.current);
    setAction(newAction);
  }, []);

  const handleRecognition = useCallback((payload) => {
    if (payload.checkin_status === 'spoof') {
      setLatestResult({ spoof: true });
      setTimeout(() => setLatestResult(null), 3000);
      return;
    }
    if (payload.checkin_status === 'pending') {
      setLatestResult({ pending: true, pending_count: payload.pending_count || 0 });
      return;
    }
    if (payload.checkin_status === 'unknown') {
      setLatestResult({ unknown: true });
      return;
    }

    const knownFace = payload.faces?.find((face) => face.name && face.name !== "Unknown");
    if (knownFace) {
      const checkinStatus = payload.checkin_status || 'new_checkin';
      const event = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: knownFace.name,
        confidence: Number(knownFace.confidence || 0),
        timestamp: payload.timestamp || new Date().toISOString(),
        status: checkinStatus,
        action: payload.action || action,
        checkin_message: payload.checkin_message || null,
        checkin_time: payload.checkin_time || null,
      };
      setLatestResult(event);

      if (checkinStatus === 'success' || checkinStatus === 'new_checkin') {
        setLogs((previous) => [event, ...previous].slice(0, 20));
      }

      // Auto-clear notification after 4 s on any final status
      if (FINAL_STATUSES.has(checkinStatus)) {
        clearTimeout(actionResetTimerRef.current);
        actionResetTimerRef.current = setTimeout(() => setLatestResult(null), 4000);
      }
    } else if (payload.faces?.some((f) => f.name === "Unknown")) {
      setLatestResult({ unknown: true });
    }
  }, [action]);

  const handleFaceStatusChange = useCallback((status) => {
    if (status !== 'ok') setLatestResult(null);
  }, []);

  return (
    <main className="app-layout">
      <section className="camera-section">
        <div className="camera-header">
          <h1>Kiosk Nhận Diện Khuôn Mặt</h1>
          <div className="clock-display">
            <div className="clock-time">{getTimeStr(now)}</div>
            <div className="clock-date">{getDateStr(now)}</div>
          </div>
        </div>
        <CameraStream
          fps={5}
          action={action}
          onRecognition={handleRecognition}
          onFaceStatusChange={handleFaceStatusChange}
          headerSlot={
            <div className="action-toggle-wrap">
              <button
                onClick={() => handleSetAction('check_in')}
                className={`action-btn${action === 'check_in' ? ' action-btn--active' : ''}`}
              >
                Check-in
              </button>
              <button
                onClick={() => handleSetAction('check_out')}
                className={`action-btn${action === 'check_out' ? ' action-btn--active' : ''}`}
              >
                Check-out
              </button>
            </div>
          }
        />
        <RecognitionResult result={latestResult} />
      </section>
      <aside className="log-section">
        <AccessLog logs={logs} />
      </aside>
    </main>
  );
}
