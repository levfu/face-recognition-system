function formatTime(isoString) {
  const date = new Date(isoString);
  return `${date.toLocaleDateString("vi-VN")} ${date.toLocaleTimeString("vi-VN")}`;
}

export default function AccessLog({ logs }) {
  return (
    <div className="access-log-card">
      <h2>Lịch sử theo thời gian thực</h2>
      {logs.length === 0 ? (
        <p className="log-empty">Chưa có bản ghi.</p>
      ) : (
        <ul className="log-list">
          {logs.map((log) => (
            <li key={log.id}>
              <span className="log-dot" />
              <div className="log-info">
                <span className="log-name">{log.name}</span>
                <span className="log-time">{formatTime(log.timestamp)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
