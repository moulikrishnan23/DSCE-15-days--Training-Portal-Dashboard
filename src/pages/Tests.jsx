import { useState, useEffect, useMemo, useCallback } from "react";
import { callServer } from "../services/appsScript";
import { LoadingSpinner, ErrorState, ReadOnlyNotice } from "../components/Common";

/* ─── Download helpers ─── */
function downloadExcel(tableId, filename) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const blob = new Blob(["\ufeff" + table.outerHTML], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = (filename || "report") + ".xls"; a.click();
  URL.revokeObjectURL(url);
}

function downloadPdf(title, tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const w = window.open("", "_blank");
  w.document.write("<html><head><title>" + title + "</title>");
  w.document.write("<style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:12px}th{background:#0B3D5C;color:#fff}@media print{button,input{display:none}}</style>");
  w.document.write("</head><body><h2>" + title + "</h2>");
  w.document.write(table.outerHTML);
  w.document.write("</body></html>");
  w.document.close();
  w.onload = function () { w.print(); };
}

export default function Tests({ token, user, selectedDepartment, onMessage }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Search & Filter state
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("sNo");
  const [sortDir, setSortDir] = useState("asc");
  const [testBlocks, setTestBlocks] = useState([]);
  const [selectedTest, setSelectedTest] = useState(0);
  const [totalStudents, setTotalStudents] = useState(0);
  const [addingTest, setAddingTest] = useState(false);

  const role = (user?.role || "").toLowerCase();
  const isReadOnly = role.includes("college");
  const canAddTest = role.includes("lesuccess") || role.includes("trainer");
  const currentDep = selectedDepartment === "All" ? null : selectedDepartment;

  const loadTestScores = useCallback(async (testIdx = selectedTest) => {
    setLoading(true);
    setError(null);
    try {
      const res = await callServer("getTestData", token, currentDep || "", testIdx);
      if (res?.success) {
        setData(res.students || []);
        if (res.testBlocks?.length) setTestBlocks(res.testBlocks);
      } else {
        setError(res?.message || "Failed to load assessment scores.");
      }
    } catch (err) {
      setError(err.message || "Failed to load assessment data.");
    } finally {
      setLoading(false);
    }
  }, [token, currentDep, selectedTest]);

  const loadTestBlocks = useCallback(async () => {
    try {
      const res = await callServer("getTestBlocks", token, currentDep || "");
      if (res?.success && res.testBlocks?.length) {
        setTestBlocks(res.testBlocks);
      }
    } catch {}
  }, [token, currentDep]);

  const loadStudentCount = useCallback(async () => {
    try {
      const res = await callServer("getAllStudentsCount", token, selectedDepartment);
      if (res?.success) setTotalStudents(res.totalStudents);
    } catch {}
  }, [token, selectedDepartment]);

  useEffect(() => {
    loadTestBlocks();
    loadStudentCount();
    loadTestScores(selectedTest);
  }, [loadTestBlocks, loadStudentCount, loadTestScores, selectedTest]);

  function handleTestChange(newIdx) {
    setSelectedTest(newIdx);
    loadTestScores(newIdx);
  }

  function handleScoreChange(rowIdx, field, val) {
    if (isReadOnly) return;
    setData((prev) =>
      prev.map((st) => {
        if (st.rowIdx === rowIdx) {
          const num = parseFloat(val) || 0;
          const updated = { ...st, [field]: num };
          const marks2 = field === "marks2" ? num : parseFloat(st.marks2) || 0;
          const mcq = field === "mcq" ? num : parseFloat(st.mcq) || 0;
          updated.total = marks2 + mcq;
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
      const res = await callServer("saveTestBlock", token, currentDep || "", data, selectedTest);
      if (res?.success) {
        onMessage(res.message || `Scores saved for ${currentDep || "department"}!`, "success");
      } else {
        onMessage(res?.message || "Failed to save scores.", "error");
      }
    } catch (err) {
      onMessage(err.message || "Error saving scores.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddNextTest() {
    const label = prompt("Enter the new test name (e.g., Test 5):");
    if (!label || !label.trim()) return;
    setAddingTest(true);
    try {
      const res = await callServer("addNextTest", token, label.trim());
      if (res?.success) {
        onMessage(res.message || "New test added successfully!", "success");
        await loadTestBlocks();
      } else {
        onMessage(res?.message || "Failed to add test.", "error");
      }
    } catch (err) {
      onMessage(err.message || "Failed to add test.", "error");
    } finally {
      setAddingTest(false);
    }
  }

  /* Memoized Filter & Sort for high speed with large datasets */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data
      .filter((st) => {
        if (!q) return true;
        return (st.name || "").toLowerCase().includes(q) || String(st.regNo || "").toLowerCase().includes(q);
      })
      .sort((a, b) => {
        let va = a[sortBy], vb = b[sortBy];
        if (typeof va === "string") { va = va.toLowerCase(); vb = (vb || "").toLowerCase(); }
        else { va = Number(va) || 0; vb = Number(vb) || 0; }
        return sortDir === "asc" ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
      });
  }, [data, search, sortBy, sortDir]);

  /* Test-wise Top 10 / Least 10 */
  const { top10, least10 } = useMemo(() => {
    const sorted = [...data].sort((a, b) => (Number(b.percentage) || 0) - (Number(a.percentage) || 0));
    return {
      top10: sorted.slice(0, 10),
      least10: [...data].sort((a, b) => (Number(a.percentage) || 0) - (Number(b.percentage) || 0)).slice(0, 10)
    };
  }, [data]);

  const testLabel = testBlocks[selectedTest]?.label || "Pre Test 1";

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} onRetry={() => loadTestScores(selectedTest)} />;

  return (
    <div>
      <ReadOnlyNotice user={user} />

      <div className="toolbar" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, color: "var(--primary)" }}>
            Pre-Test / Assessment ({currentDep || "All"})
          </h3>
          <span style={{ background: "var(--primary)", color: "#fff", padding: "2px 10px", borderRadius: 12, fontSize: 13 }}>
            {totalStudents} Students
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canAddTest && (
            <button className="btn btn-primary" onClick={handleAddNextTest} disabled={addingTest}>
              {addingTest ? "Adding..." : "➕ Add Next Test"}
            </button>
          )}
          {!isReadOnly && (
            <button className="btn btn-save" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : `💾 Save ${testLabel} Scores`}
            </button>
          )}
          <button className="btn btn-outline" onClick={() => downloadExcel("test-table", `${testLabel}-${currentDep || "All"}`)}>📥 Excel</button>
          <button className="btn btn-outline" onClick={() => downloadPdf(`${testLabel} — ${currentDep || "All"}`, "test-table")}>📄 PDF</button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="panel" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 0 }}>
        <input
          type="text"
          placeholder="🔍 Search by name or register number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, minWidth: 220 }}
        />
        <select
          value={selectedTest}
          onChange={(e) => handleTestChange(Number(e.target.value))}
          style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, fontWeight: 600, color: "var(--primary)" }}
        >
          {testBlocks.map((tb) => (
            <option key={tb.id} value={tb.id}>{tb.label}</option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6 }}
        >
          <option value="sNo">Sort: S.No</option>
          <option value="name">Sort: Name</option>
          <option value="total">Sort: Total</option>
          <option value="percentage">Sort: Percentage</option>
        </select>
        <select
          value={sortDir}
          onChange={(e) => setSortDir(e.target.value)}
          style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6 }}
        >
          <option value="asc">↑ Ascending</option>
          <option value="desc">↓ Descending</option>
        </select>
      </div>

      {/* Main Test Data Table */}
      <div className="panel">
        <div className="table-wrap">
          <table className="data-table" id="test-table">
            <thead>
              <tr>
                <th>S.No</th>
                <th>Reg. Number</th>
                <th>Student Name</th>
                <th>2 Marks (/50)</th>
                <th>MCQ (/50)</th>
                <th>Total Marks (/100)</th>
                <th>Percentage</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((st) => (
                <tr key={st.rowIdx}>
                  <td>{st.sNo}</td>
                  <td>{st.regNo || "N/A"}</td>
                  <td style={{ fontWeight: 600 }}>{st.name}</td>
                  <td>
                    {isReadOnly ? st.marks2 : (
                      <input
                        type="number"
                        className="mark-input"
                        value={st.marks2}
                        onChange={(e) => handleScoreChange(st.rowIdx, "marks2", e.target.value)}
                      />
                    )}
                  </td>
                  <td>
                    {isReadOnly ? st.mcq : (
                      <input
                        type="number"
                        className="mark-input"
                        value={st.mcq}
                        onChange={(e) => handleScoreChange(st.rowIdx, "mcq", e.target.value)}
                      />
                    )}
                  </td>
                  <td style={{ fontWeight: 700, color: "var(--primary)" }}>{st.total}</td>
                  <td style={{ fontWeight: 700, color: "var(--success)" }}>{st.percentage}%</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="empty-state">No student records found for {testLabel}.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Test-wise Top 10 / Least 10 */}
      {data.length > 0 && (
        <div className="chart-grid">
          <div className="panel">
            <h3>🏆 Top 10 Students — {testLabel}</h3>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>#</th><th>Student Name</th><th>Reg. No</th><th>Total</th><th>%</th></tr></thead>
                <tbody>
                  {top10.map((st, i) => (
                    <tr key={st.rowIdx}>
                      <td><strong>{i + 1}</strong></td>
                      <td>{st.name}</td>
                      <td>{st.regNo}</td>
                      <td>{st.total}</td>
                      <td style={{ color: "var(--success)", fontWeight: 700 }}>{st.percentage}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="panel">
            <h3>📉 Least 10 Students — {testLabel}</h3>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>#</th><th>Student Name</th><th>Reg. No</th><th>Total</th><th>%</th></tr></thead>
                <tbody>
                  {least10.map((st, i) => (
                    <tr key={st.rowIdx}>
                      <td><strong>{i + 1}</strong></td>
                      <td>{st.name}</td>
                      <td>{st.regNo}</td>
                      <td>{st.total}</td>
                      <td style={{ color: "var(--danger)", fontWeight: 700 }}>{st.percentage}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
