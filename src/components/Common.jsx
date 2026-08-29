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

export function SkeletonCards({ count = 8 }) {
  return (
    <div className="kpi-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="kpi-card">
          <div className="skeleton-box" style={{ height: 14, width: "50%", marginBottom: 10 }} />
          <div className="skeleton-box" style={{ height: 28, width: "40%", marginBottom: 8 }} />
          <div className="skeleton-box" style={{ height: 12, width: "65%" }} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 6, cols = 5 }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i}>
                <div className="skeleton-box" style={{ height: 12, width: "80%" }} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c}>
                  <div className="skeleton-box" style={{ height: 16, width: c === 2 ? "90%" : "60%" }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SkeletonCharts() {
  return (
    <div className="chart-grid">
      <div className="panel chart-panel">
        <div className="skeleton-box" style={{ height: 18, width: "40%", marginBottom: 16 }} />
        <div className="skeleton-box" style={{ height: 240, width: "100%" }} />
      </div>
      <div className="panel chart-panel">
        <div className="skeleton-box" style={{ height: 18, width: "45%", marginBottom: 16 }} />
        <div className="skeleton-box" style={{ height: 240, width: "100%" }} />
      </div>
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

export function Pagination({ currentPage, totalItems, pageSize, onPageChange, onPageSizeChange }) {
  if (totalItems <= 0) return null;
  const totalPages = pageSize === "All" ? 1 : Math.ceil(totalItems / pageSize);

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, flexWrap: "wrap", gap: 10, fontSize: 13, color: "var(--text-muted)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span>
          Showing {pageSize === "All" ? `1 - ${totalItems}` : `${(currentPage - 1) * pageSize + 1} - ${Math.min(currentPage * pageSize, totalItems)}`} of {totalItems}
        </span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(e.target.value === "All" ? "All" : Number(e.target.value))}
          style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid var(--border)", fontSize: 12 }}
        >
          <option value={25}>25 / page</option>
          <option value={50}>50 / page</option>
          <option value={100}>100 / page</option>
          <option value="All">All</option>
        </select>
      </div>

      {pageSize !== "All" && totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            className="btn btn-outline"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
            style={{ padding: "4px 8px", fontSize: 12 }}
          >
            ◀ Prev
          </button>
          <span style={{ padding: "0 6px", fontWeight: 600 }}>{currentPage} / {totalPages}</span>
          <button
            className="btn btn-outline"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
            style={{ padding: "4px 8px", fontSize: 12 }}
          >
            Next ▶
          </button>
        </div>
      )}
    </div>
  );
}
