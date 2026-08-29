export function ReadOnlyNotice({ user }) {
  const role = (user?.role || "").toLowerCase();
  if (!role.includes("college")) return null;

  return (
    <div className="readonly-note">
      👁️ <strong>Read-Only Access:</strong> You are logged in as College Admin. View permissions only. Editing is disabled.
    </div>
  );
}

export function LoadingSpinner() {
  return (
    <div className="loading-overlay">
      <div className="spinner" />
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="panel empty-state">
      <p style={{ color: "var(--danger)", fontWeight: 600 }}>⚠️ {message}</p>
      {onRetry && (
        <button className="btn btn-save" onClick={onRetry}>
          🔄 Retry Loading
        </button>
      )}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal-card" style={{ maxWidth: wide ? 950 : 850 }} onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="btn btn-outline" onClick={onClose} style={{ padding: "4px 8px" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

