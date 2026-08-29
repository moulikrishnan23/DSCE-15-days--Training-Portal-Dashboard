import { useState, useEffect, useMemo, useCallback } from "react";
import { callServer } from "../services/appsScript";
import { LoadingSpinner, ErrorState, ReadOnlyNotice, Pagination, SkeletonTable } from "../components/Common";

function downloadExcel(tableId, filename) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const html = table.outerHTML;
  const blob = new Blob(["\ufeff" + html], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (filename || "MockInterview") + ".xls";
  a.click();
  URL.revokeObjectURL(url);
}

function downloadPdf(title, tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const win = window.open("", "_blank");
  win.document.write("<html><head><title>" + title + "</title>");
  win.document.write(
    "<style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:12px}th{background:#0B3D5C;color:#fff}@media print{button,input{display:none}}</style>"
  );
  win.document.write("</head><body><h2>" + title + "</h2>");
  win.document.write(table.outerHTML);
  win.document.write("</body></html>");
  win.document.close();
  win.onload = function () {
    win.print();
  };
}

export default function MockInterview({ token, user, selectedDepartment, onMessage }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState("Score");
  const [sortDirection, setSortDirection] = useState("desc");
  const [studentCount, setStudentCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const role = (user?.role || "").toLowerCase();
  const isReadOnly = role.includes("college");
  const currentDep = selectedDepartment === "All" ? null : selectedDepartment;

  // Single unified API call returning evaluations and student count
  const loadMockInterview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await callServer("getMockInterviewPageData", token, currentDep || "");
      if (res?.success) {
        setData(res.students || []);
        setStudentCount(res.totalStudents || res.students?.length || 0);
      } else {
        setError(res?.message || "Failed to load mock interview scores.");
      }
    } catch (err) {
      setError(err.message || "Failed to load interview records.");
    } finally {
      setLoading(false);
    }
  }, [token, currentDep]);

  useEffect(() => {
    loadMockInterview();
  }, [loadMockInterview]);

  function handleScoreChange(rowIdx, val) {
    if (isReadOnly) return;
    setData((prev) =>
      prev.map((st) => {
        if (st.rowIdx === rowIdx) {
          const num = parseFloat(val) || 0;
          return {
            ...st,
            score: num,
            percentage: ((num / 100) * 100).toFixed(1),
          };
        }
        return st;
      })
    );
  }

  function handleRemarksChange(rowIdx, val) {
    if (isReadOnly) return;
    setData((prev) =>
      prev.map((st) => {
        if (st.rowIdx === rowIdx) {
          return { ...st, remarks: val };
        }
        return st;
      })
    );
  }

  async function handleSave() {
    if (isReadOnly) return;
    setSaving(true);
    try {
      const res = await callServer("saveMockInterviewData", token, currentDep || "", data);
      if (res?.success) {
        onMessage(`Mock Interview evaluations saved for ${currentDep || "department"}!`, "success");
      } else {
        onMessage(res?.message || "Failed to save interview evaluations.", "error");
      }
    } catch (err) {
      onMessage(err.message || "Error saving interview data.", "error");
    } finally {
      setSaving(false);
    }
  }

  const filteredData = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return data
      .filter((s) => !q || (s.name || "").toLowerCase().includes(q) || String(s.regNo || "").toLowerCase().includes(q))
      .sort((a, b) => {
        let valA = a[sortField.toLowerCase()];
        let valB = b[sortField.toLowerCase()];
        if (sortField === "Name") {
          valA = (a.name || "").toLowerCase();
          valB = (b.name || "").toLowerCase();
          return sortDirection === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        valA = parseFloat(valA) || 0;
        valB = parseFloat(valB) || 0;
        return sortDirection === "asc" ? valA - valB : valB - valA;
      });
  }, [data, searchTerm, sortField, sortDirection]);

  // Paginated slice
  const paginatedData = useMemo(() => {
    if (pageSize === "All") return filteredData;
    const start = (page - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, page, pageSize]);

  const { top10, least10 } = useMemo(() => {
    const sorted = [...data].sort((a, b) => (parseFloat(b.percentage) || 0) - (parseFloat(a.percentage) || 0));
    return {
      top10: sorted.slice(0, 10),
      least10: [...data].sort((a, b) => (parseFloat(a.percentage) || 0) - (parseFloat(b.percentage) || 0)).slice(0, 10),
    };
  }, [data]);

  if (loading && !data.length) {
    return (
      <div>
        <ReadOnlyNotice user={user} />
        <div className="panel">
          <div className="skeleton-box" style={{ height: 24, width: "250px", marginBottom: 16 }} />
          <SkeletonTable rows={10} cols={6} />
        </div>
      </div>
    );
  }
  if (error && !data.length) return <ErrorState message={error} onRetry={loadMockInterview} />;

  return (
    <div>
      <ReadOnlyNotice user={user} />

      <div className="toolbar" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
        <h3 style={{ margin: 0, color: "var(--primary)", display: "flex", alignItems: "center", gap: 10 }}>
          Mock Interview Report ({currentDep || "All"})
          <span style={{ fontSize: "12px", background: "var(--primary)", color: "#fff", padding: "2px 10px", borderRadius: "12px" }}>
            {studentCount} Students
          </span>
        </h3>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div className="field search-box" style={{ margin: 0 }}>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              placeholder="🔍 Search by name or reg no..."
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", minWidth: 200 }}
            />
          </div>

          <div className="field" style={{ margin: 0, display: "flex", alignItems: "center", gap: 5 }}>
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)" }}
            >
              <option value="Name">Sort: Name</option>
              <option value="Score">Sort: Score</option>
              <option value="Percentage">Sort: Percentage</option>
            </select>
            <button className="btn btn-outline" style={{ padding: "6px 10px" }} onClick={() => setSortDirection((d) => (d === "asc" ? "desc" : "asc"))}>
              {sortDirection === "asc" ? "↑" : "↓"}
            </button>
          </div>

          <button className="btn btn-outline" onClick={() => downloadExcel("mockinterview-table", `MockInterview_${currentDep || "All"}`)}>
            📥 Excel
          </button>
          <button className="btn btn-outline" onClick={() => downloadPdf(`Mock Interview Report - ${currentDep || "All"}`, "mockinterview-table")}>
            📄 PDF
          </button>

          {!isReadOnly && (
            <button className="btn btn-save" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "💾 Save Evaluation"}
            </button>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table className="data-table" id="mockinterview-table">
            <thead>
              <tr>
                <th style={{ width: "6%" }}>S.No</th>
                <th style={{ width: "20%" }}>Reg. Number</th>
                <th style={{ width: "30%" }}>Student Name</th>
                <th style={{ width: "16%" }}>Interview Score (/100)</th>
                <th style={{ width: "14%" }}>Percentage</th>
                <th style={{ width: "14%" }}>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((st) => (
                <tr key={st.rowIdx}>
                  <td>{st.sNo}</td>
                  <td>{st.regNo || "N/A"}</td>
                  <td style={{ fontWeight: 600 }}>{st.name}</td>
                  <td>
                    {isReadOnly ? (
                      st.score
                    ) : (
                      <input
                        type="number"
                        className="mark-input"
                        value={st.score}
                        onChange={(e) => handleScoreChange(st.rowIdx, e.target.value)}
                      />
                    )}
                  </td>
                  <td style={{ fontWeight: 700, color: "var(--success)" }}>{st.percentage}%</td>
                  <td>
                    {isReadOnly ? (
                      <span style={{ fontSize: "12px", color: "#555" }}>{st.remarks || "-"}</span>
                    ) : (
                      <input
                        type="text"
                        style={{ padding: "5px 8px", border: "1px solid var(--border)", borderRadius: "5px", width: "180px", fontSize: "12.5px" }}
                        placeholder="Evaluation remarks..."
                        value={st.remarks || ""}
                        onChange={(e) => handleRemarksChange(st.rowIdx, e.target.value)}
                      />
                    )}
                  </td>
                </tr>
              ))}
              {paginatedData.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty-state">
                    No mock interview records found for {currentDep || "any department"}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={page}
          totalItems={filteredData.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(sz) => {
            setPageSize(sz);
            setPage(1);
          }}
        />
      </div>

      <div className="chart-grid" style={{ marginTop: 20 }}>
        <div className="panel">
          <h4 style={{ margin: "0 0 10px 0", color: "var(--success)" }}>🏆 Top 10 Students</h4>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>#</th><th>Name</th><th>Reg No</th><th>Score</th><th>%</th></tr>
              </thead>
              <tbody>
                {top10.map((st, i) => (
                  <tr key={i}>
                    <td><strong>{i + 1}</strong></td>
                    <td style={{ fontWeight: 600 }}>{st.name}</td>
                    <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{st.regNo}</td>
                    <td>{st.score}</td>
                    <td style={{ fontWeight: "bold", color: "var(--success)" }}>{st.percentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <h4 style={{ margin: "0 0 10px 0", color: "var(--danger)" }}>📉 Least 10 Students</h4>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>#</th><th>Name</th><th>Reg No</th><th>Score</th><th>%</th></tr>
              </thead>
              <tbody>
                {least10.map((st, i) => (
                  <tr key={i}>
                    <td><strong>{i + 1}</strong></td>
                    <td style={{ fontWeight: 600 }}>{st.name}</td>
                    <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{st.regNo}</td>
                    <td>{st.score}</td>
                    <td style={{ fontWeight: "bold", color: "var(--danger)" }}>{st.percentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
