import { useState, useEffect, useMemo, useCallback } from "react";
import { callServer } from "../services/appsScript";
import { LoadingSpinner, ErrorState, ReadOnlyNotice, Pagination, SkeletonTable } from "../components/Common";

function downloadExcel(tableId, filename) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const blob = new Blob(["\ufeff" + table.outerHTML], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (filename || "Assessment") + ".xls";
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

export default function Tests({ token, user, selectedDepartment, onMessage }) {
  const [data, setData] = useState([]);
  const [testBlocks, setTestBlocks] = useState([{ id: 0, label: "Pre Test 1", startCol: 4, hasPctCol: true }]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState("total");
  const [sortDirection, setSortDirection] = useState("desc");
  const [selectedTest, setSelectedTest] = useState(0);
  const [totalStudents, setTotalStudents] = useState(0);
  const [addingTest, setAddingTest] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const role = (user?.role || "").toLowerCase();
  const isReadOnly = role.includes("college");
  const canAddTest = role.includes("lesuccess") || role.includes("trainer");
  const currentDep = selectedDepartment === "All" ? null : selectedDepartment;

  // Single unified API endpoint loading test scores, blocks & total count in 1 request
  const loadPageData = useCallback(async (testIdx = selectedTest) => {
    setLoading(true);
    setError(null);
    try {
      const res = await callServer("getTestsPageData", token, currentDep || "", testIdx);
      if (res?.success) {
        setData(res.students || []);
        if (res.testBlocks?.length) setTestBlocks(res.testBlocks);
        setTotalStudents(res.totalStudents || res.students?.length || 0);
      } else {
        setError(res?.message || "Failed to load assessment scores.");
      }
    } catch (err) {
      setError(err.message || "Failed to load assessment data.");
    } finally {
      setLoading(false);
    }
  }, [token, currentDep, selectedTest]);

  useEffect(() => {
    loadPageData(selectedTest);
  }, [loadPageData, selectedTest]);

  function handleTestChange(newIdx) {
    setSelectedTest(newIdx);
    setPage(1);
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
    if (!canAddTest) return;
    const testNum = testBlocks.length + 1;
    const testName = window.prompt(`Enter name for Test ${testNum}:`, `Test ${testNum}`);
    if (!testName) return;

    setAddingTest(true);
    try {
      const res = await callServer("addNextTest", token, testName.trim());
      if (res?.success) {
        onMessage(`Successfully added "${testName}" across all department sheets!`, "success");
        await loadPageData(testBlocks.length);
        setSelectedTest(testBlocks.length);
      } else {
        onMessage(res?.message || "Failed to add test block.", "error");
      }
    } catch (err) {
      onMessage(err.message || "Error adding test block.", "error");
    } finally {
      setAddingTest(false);
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

  const activeTest = testBlocks[selectedTest] || testBlocks[0] || { label: "Pre Test 1", hasPctCol: true };

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
  if (error && !data.length) return <ErrorState message={error} onRetry={() => loadPageData(selectedTest)} />;

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
          <button className="btn btn-outline" onClick={() => downloadExcel("assessment-table", `Assessment_${currentDep || "All"}_${activeTest.label}`)}>
            📥 Excel
          </button>
          <button className="btn btn-outline" onClick={() => downloadPdf(`Assessment - ${activeTest.label} - ${currentDep || "All"}`, "assessment-table")}>
            📄 PDF
          </button>
          {!isReadOnly && (
            <button className="btn btn-save" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : `💾 Save ${activeTest.label}`}
            </button>
          )}
        </div>
      </div>

      {/* Filter / Selector Bar */}
      <div className="toolbar" style={{ gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div className="field" style={{ margin: 0, minWidth: 200 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>
            Selected Assessment
          </label>
          <select
            value={selectedTest}
            onChange={(e) => handleTestChange(Number(e.target.value))}
            style={{ fontWeight: 600, padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", width: "100%" }}
          >
            {testBlocks.map((blk) => (
              <option key={blk.id} value={blk.id}>
                {blk.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field search-box" style={{ margin: 0, flex: 1, minWidth: 220 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>
            Search Student
          </label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            placeholder="🔍 Search name or reg no..."
            style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", width: "100%" }}
          />
        </div>

        <div className="field" style={{ margin: 0, minWidth: 160 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>
            Sort By
          </label>
          <div style={{ display: "flex", gap: 4 }}>
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", flex: 1 }}
            >
              <option value="Name">Name</option>
              <option value="total">Total Marks</option>
              <option value="percentage">Percentage</option>
            </select>
            <button
              className="btn btn-outline"
              style={{ padding: "8px 12px" }}
              onClick={() => setSortDirection((d) => (d === "asc" ? "desc" : "asc"))}
            >
              {sortDirection === "asc" ? "↑" : "↓"}
            </button>
          </div>
        </div>
      </div>

      {/* Main Assessment Scores Table */}
      <div className="panel">
        <div className="table-wrap">
          <table className="data-table" id="assessment-table">
            <thead>
              <tr>
                <th style={{ width: "6%" }}>S.No</th>
                <th style={{ width: "20%" }}>Reg. Number</th>
                <th style={{ width: "30%" }}>Student Name</th>
                <th style={{ width: "14%" }}>2 Marks</th>
                <th style={{ width: "14%" }}>MCQ</th>
                <th style={{ width: "16%" }}>Total (/100)</th>
                {activeTest.hasPctCol && <th style={{ width: "14%" }}>Percentage</th>}
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((st) => (
                <tr key={st.rowIdx}>
                  <td>{st.sNo}</td>
                  <td style={{ fontWeight: 600, color: "var(--text-muted)" }}>{st.regNo || "N/A"}</td>
                  <td style={{ fontWeight: 600 }}>{st.name}</td>
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
                  <td style={{ fontWeight: 700, color: "var(--primary)" }}>{st.total}</td>
                  {activeTest.hasPctCol && (
                    <td style={{ fontWeight: 700, color: "var(--success)" }}>{st.percentage}%</td>
                  )}
                </tr>
              ))}
              {paginatedData.length === 0 && (
                <tr>
                  <td colSpan={activeTest.hasPctCol ? 7 : 6} className="empty-state">
                    No student assessment records found.
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

      {/* Top 10 / Least 10 Performers */}
      <div className="chart-grid" style={{ marginTop: 20 }}>
        <div className="panel">
          <h4 style={{ margin: "0 0 10px 0", color: "var(--success)" }}>🏆 Top 10 Performers — {activeTest.label}</h4>
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
          <h4 style={{ margin: "0 0 10px 0", color: "var(--danger)" }}>📉 Least 10 Performers — {activeTest.label}</h4>
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
