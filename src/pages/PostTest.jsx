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
  a.download = (filename || "PostTest") + ".xls";
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

export default function PostTest({ token, user, selectedDepartment, onMessage }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState("total");
  const [sortDirection, setSortDirection] = useState("desc");
  const [studentCount, setStudentCount] = useState(0);
  const [postTestVisible, setPostTestVisible] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const role = (user?.role || "").toLowerCase();
  const isReadOnly = role.includes("college");
  const currentDep = selectedDepartment === "All" ? null : selectedDepartment;

  // Single unified API call returning post-test scores, total count & lock status
  const loadPostTestData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await callServer("getPostTestPageData", token, currentDep || "");

      if (res?.success) {
        setData(res.students || []);
        setStudentCount(res.totalStudents || res.students?.length || 0);
        setPostTestVisible(res.postTestVisible !== false);
      } else {
        if (res?.locked) {
          setPostTestVisible(false);
        } else {
          setError(res?.message || "Failed to load post-test scores.");
        }
      }
    } catch (err) {
      if (err?.locked) {
        setPostTestVisible(false);
      } else {
        setError(err.message || "Failed to load post-test evaluation.");
      }
    } finally {
      setLoading(false);
    }
  }, [token, currentDep]);

  useEffect(() => {
    loadPostTestData();
  }, [loadPostTestData]);

  function handleScoreChange(rowIdx, field, val) {
    if (isReadOnly) return;
    setData((prev) =>
      prev.map((st) => {
        if (st.rowIdx === rowIdx) {
          const num = parseFloat(val) || 0;
          const updated = { ...st, [field]: num };
          const mcq = field === "mcq" ? num : parseFloat(st.mcq) || 0;
          const marks2 = field === "marks2" ? num : parseFloat(st.marks2) || 0;
          updated.total = mcq + marks2;
          updated.percentage = ((updated.total / 100) * 100).toFixed(1);
          return updated;
        }
        return st;
      })
    );
  }

  async function handleSave() {
    if (isReadOnly) return;
    setSaving(true);
    try {
      const res = await callServer("savePostTestData", token, currentDep || "", data);
      if (res?.success) {
        onMessage(`Post-Test scores saved for ${currentDep || "department"}!`, "success");
      } else {
        onMessage(res?.message || "Failed to save post-test scores.", "error");
      }
    } catch (err) {
      onMessage(err.message || "Error saving scores.", "error");
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
  if (error && !data.length) return <ErrorState message={error} onRetry={loadPostTestData} />;

  // Day 15 Strict Access Lock for College Admin
  if (isReadOnly && !postTestVisible) {
    return (
      <div className="panel" style={{ textAlign: "center", padding: "50px 20px" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
        <h3 style={{ color: "var(--primary)", marginBottom: 8 }}>Post-Test Report — Available on Day 15</h3>
        <p style={{ color: "var(--text-muted)", fontSize: 13.5, maxWidth: 500, margin: "0 auto" }}>
          Post-Test evaluations will automatically unlock for College Admin on Day 15 (Final Training Day) once assessments are conducted.
        </p>
      </div>
    );
  }

  return (
    <div>
      <ReadOnlyNotice user={user} />

      <div className="toolbar" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
        <h3 style={{ margin: 0, color: "var(--primary)", display: "flex", alignItems: "center", gap: 10 }}>
          Post-Test Evaluation Report ({currentDep || "All"})
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
              <option value="total">Sort: Total</option>
              <option value="percentage">Sort: Percentage</option>
            </select>
            <button className="btn btn-outline" style={{ padding: "6px 10px" }} onClick={() => setSortDirection((d) => (d === "asc" ? "desc" : "asc"))}>
              {sortDirection === "asc" ? "↑" : "↓"}
            </button>
          </div>

          <button className="btn btn-outline" onClick={() => downloadExcel("posttest-table", `PostTest_${currentDep || "All"}`)}>
            📥 Excel
          </button>
          <button className="btn btn-outline" onClick={() => downloadPdf(`Post-Test Report - ${currentDep || "All"}`, "posttest-table")}>
            📄 PDF
          </button>

          {!isReadOnly && (
            <button className="btn btn-save" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "💾 Save Scores"}
            </button>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table className="data-table" id="posttest-table">
            <thead>
              <tr>
                <th style={{ width: "6%" }}>S.No</th>
                <th style={{ width: "20%" }}>Reg. Number</th>
                <th style={{ width: "30%" }}>Student Name</th>
                <th style={{ width: "14%" }}>MCQ Marks (/50)</th>
                <th style={{ width: "14%" }}>2 Marks (/50)</th>
                <th style={{ width: "16%" }}>Total Marks (/100)</th>
                <th style={{ width: "14%" }}>Percentage</th>
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
                      st.mcq
                    ) : (
                      <input
                        type="number"
                        className="mark-input"
                        value={st.mcq}
                        onChange={(e) => handleScoreChange(st.rowIdx, "mcq", e.target.value)}
                      />
                    )}
                  </td>
                  <td>
                    {isReadOnly ? (
                      st.marks2
                    ) : (
                      <input
                        type="number"
                        className="mark-input"
                        value={st.marks2}
                        onChange={(e) => handleScoreChange(st.rowIdx, "marks2", e.target.value)}
                      />
                    )}
                  </td>
                  <td style={{ fontWeight: 700, color: "var(--primary)" }}>{st.total}</td>
                  <td style={{ fontWeight: 700, color: "var(--success)" }}>{st.percentage}%</td>
                </tr>
              ))}
              {paginatedData.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty-state">
                    No post-test records found for {currentDep || "any department"}.
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
                <tr><th>#</th><th>Name</th><th>Reg No</th><th>Total</th><th>%</th></tr>
              </thead>
              <tbody>
                {top10.map((st, i) => (
                  <tr key={i}>
                    <td><strong>{i + 1}</strong></td>
                    <td style={{ fontWeight: 600 }}>{st.name}</td>
                    <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{st.regNo}</td>
                    <td>{st.total}</td>
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
                <tr><th>#</th><th>Name</th><th>Reg No</th><th>Total</th><th>%</th></tr>
              </thead>
              <tbody>
                {least10.map((st, i) => (
                  <tr key={i}>
                    <td><strong>{i + 1}</strong></td>
                    <td style={{ fontWeight: 600 }}>{st.name}</td>
                    <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{st.regNo}</td>
                    <td>{st.total}</td>
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
