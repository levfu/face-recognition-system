import { useState, useEffect, useRef } from 'react';

function formatTimeShort(isoString) {
  return new Date(isoString).toLocaleTimeString("en-US", { hour: '2-digit', minute: '2-digit' });
}

function capitalizeName(name) {
  return name
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export default function RecognitionResult({ result }) {
  const [displayResult, setDisplayResult] = useState(result);
  const [animClass, setAnimClass]         = useState('');
  const prevRef  = useRef(result);
  const timerRef = useRef(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = result;

    if (!result && prev) {
      setAnimClass('anim-fade-out');
      timerRef.current = setTimeout(() => {
        setDisplayResult(null);
        setAnimClass('');
      }, 200);
    } else if (result && !result.unknown && !result.pending && !result.spoof) {
      setDisplayResult(result);
      setAnimClass('anim-enter-success');
      timerRef.current = setTimeout(() => setAnimClass(''), 400);
    } else if (result && (result.unknown || result.spoof)) {
      setDisplayResult(result);
      setAnimClass('anim-shake');
      timerRef.current = setTimeout(() => setAnimClass(''), 400);
    } else {
      setDisplayResult(result);
      setAnimClass('');
    }

    return () => clearTimeout(timerRef.current);
  }, [result]);

  if (!displayResult) {
    return (
      <div className={`recognition-card recognition-idle ${animClass}`}>
        <p>Waiting for recognition...</p>
      </div>
    );
  }

  if (displayResult.spoof) {
    return (
      <div className={`recognition-card recognition-spoof ${animClass}`}>
        <div className="result-label" style={{ color: '#b91c1c' }}>Spoof detected.</div>
        <div className="result-meta"><span>Please look directly at the camera.</span></div>
      </div>
    );
  }

  if (displayResult.unknown) {
    return (
      <div className={`recognition-card recognition-unknown ${animClass}`}>
        <p>Unable to recognize this employee.</p>
      </div>
    );
  }

  if (displayResult.pending) {
    const count = displayResult.pending_count || 0;
    const dots = [0, 1, 2].map(i => i < count ? '●' : '○').join(' ');
    return (
      <div className={`recognition-card recognition-pending ${animClass}`}>
        <div className="result-label" style={{ color: '#92400e' }}>Verifying your identity...</div>
        <div className="result-meta"><span>Please remain still.</span></div>
        <div style={{ fontSize: 22, letterSpacing: 6, marginTop: 10, color: '#b45309' }}>{dots}</div>
      </div>
    );
  }

  const { status, action, name, confidence, checkin_message, checkin_time, timestamp } = displayResult;

  // Check-out success
  if (status === 'success' && action === 'check_out') {
    const timeStr = checkin_time ? formatTimeShort(checkin_time) : formatTimeShort(timestamp);
    return (
      <div className={`recognition-card recognition-checkout-success ${animClass}`}>
        <div className="result-label">Successfully checked out.</div>
        <div className="result-name">{capitalizeName(name || '')}!</div>
        <div className="result-meta">
          <span>Successfully checked out at {timeStr} • Confidence: {(confidence * 100).toFixed(1)}%</span>
        </div>
      </div>
    );
  }

  // Check-in success (also handles legacy 'new_checkin')
  if (status === 'success' || status === 'new_checkin') {
    const timeStr = checkin_time ? formatTimeShort(checkin_time) : formatTimeShort(timestamp);
    return (
      <div className={`recognition-card recognition-success ${animClass}`}>
        <div className="result-label">Recognition successful.</div>
        <div className="result-name">Hello, {capitalizeName(name || '')}!</div>
        <div className="result-meta">
          <span>Successfully checked in at {timeStr} • Confidence: {(confidence * 100).toFixed(1)}%</span>
        </div>
      </div>
    );
  }

  // Already checked in today
  if (status === 'already_checked_in') {
    return (
      <div className={`recognition-card recognition-checkedin ${animClass}`}>
        <div className="result-label" style={{ color: '#0ea5e9', opacity: 1 }}>Already checked in today.</div>
        <div className="result-name" style={{ color: '#0369a1' }}>
          Hello, {capitalizeName(name || '')}!
        </div>
        <div className="result-meta">
          <span>{checkin_message || 'Already checked in today.'}</span>
        </div>
      </div>
    );
  }

  // Already checked out today — same blue/info style as already_checked_in
  if (status === 'already_checked_out') {
    return (
      <div className={`recognition-card recognition-checkedin ${animClass}`}>
        <div className="result-label" style={{ color: '#0ea5e9', opacity: 1 }}>Already checked out today.</div>
        <div className="result-name" style={{ color: '#0369a1' }}>
          {capitalizeName(name || '')}
        </div>
        <div className="result-meta">
          <span>{checkin_message || 'Already checked out today.'}</span>
        </div>
      </div>
    );
  }

  // No check-in yet (trying to check-out without check-in)
  if (status === 'no_checkin_yet') {
    return (
      <div className={`recognition-card recognition-no-checkin ${animClass}`}>
        <div className="result-label" style={{ color: '#b91c1c' }}>Not checked in yet.</div>
        <div style={{ fontWeight: 600, marginTop: 4 }}>{capitalizeName(name || '')}</div>
        <div className="result-meta">
          <span>{checkin_message || 'Not checked in yet.'}</span>
        </div>
      </div>
    );
  }

  // Fallback for any other status
  return (
    <div className={`recognition-card recognition-checkedin ${animClass}`}>
      <div className="result-label" style={{ color: '#0ea5e9', opacity: 1 }}>Already checked in today.</div>
      <div className="result-name" style={{ color: '#0369a1' }}>
        Hello, {capitalizeName(name || '')}!
      </div>
      <div className="result-meta">
        <span>{checkin_message || 'Already checked in today.'}</span>
      </div>
    </div>
  );
}