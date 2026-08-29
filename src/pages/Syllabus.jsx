import { useState, useEffect } from "react";
import { callServer } from "../services/appsScript";
import { LoadingSpinner, ErrorState, ReadOnlyNotice } from "../components/Common";

/* ─── Download helpers ─── */
function downloadExcel(tableId, filename) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const blob = new Blob(["\ufeff" + table.outerHTML], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = (filename || "syllabus") + ".xls"; a.click();
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

export default function Syllabus({ token, user, selectedDepartment, onMessage }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingRow, setEditingRow] = useState(null);
  const [syllabusDepts, setSyllabusDepts] = useState([]);
  const [currentSyllabusDep, setCurrentSyllabusDep] = useState("");
  const [addingDept, setAddingDept] = useState(false);

  const role = (user?.role || "").toLowerCase();
  const isReadOnly = role.includes("college");
  const canAddDept = role.includes("lesuccess") || role.includes("trainer");

  // Determine which department to request syllabus for
  const targetDep = selectedDepartment === "All" ? null : selectedDepartment;

  useEffect(() => {
    loadSyllabus(targetDep);
  }, [token, targetDep]);

  async function loadSyllabus(dep) {
    setLoading(true);
    setError(null);
    try {
      const res = await callServer("getSyllabus", token, dep || "");
      if (res?.success) {
        setList(res.syllabus || []);
        if (res.departments) {
          setSyllabusDepts(res.departments);
        }
        if (res.currentDepartment) {
          setCurrentSyllabusDep(res.currentDepartment);
        }
      } else {
        setError(res?.message || "Failed to load syllabus tracker.");
      }
    } catch (err) {
      setError(err.message || "Failed to load syllabus data.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveRow(row) {
    if (isReadOnly) return;
    try {
      const res = await callServer("saveSyllabus", token, row);
      if (res?.success) {
        onMessage(`Saved syllabus for ${row.day}!`, "success");
        setEditingRow(null);
        loadSyllabus(currentSyllabusDep || targetDep);
      } else {
        onMessage(res?.message || "Failed to save syllabus.", "error");
      }
    } catch (err) {
      onMessage(err.message || "Failed to update syllabus.", "error");
    }
  }

  async function handleAddDepartment() {
    const deptName = prompt("Enter new Department name to add to Syllabus Tracker:");
    if (!deptName || !deptName.trim()) return;

    setAddingDept(true);
    try {
      const res = await callServer("addSyllabusDepartment", token, deptName.trim());
      if (res?.success) {
        onMessage(res.message || `Department ${deptName} added successfully!`, "success");
        loadSyllabus(deptName.trim());
      } else {
        onMessage(res?.message || "Failed to add department to syllabus.", "error");
      }
    } catch (err) {
      onMessage(err.message || "Failed to add department.", "error");
    } finally {
      setAddingDept(false);
    }
  }

  function handleDepartmentSwitch(dep) {
    setCurrentSyllabusDep(dep);
    loadSyllabus(dep);
  }

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} onRetry={() => loadSyllabus(targetDep)} />;

  return (
    <div>
      <ReadOnlyNotice user={user} />

      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>
            15-Day Aptitude & Soft Skills Training Syllabus
            {currentSyllabusDep && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> — {currentSyllabusDep}</span>}
          </h3>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {/* Department selector within syllabus */}
            {syllabusDepts.length > 1 && (
              <div className="field" style={{ margin: 0 }}>
                <select
                  value={currentSyllabusDep}
                  onChange={(e) => handleDepartmentSwitch(e.target.value)}
                  style={{ minWidth: 140, padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)" }}
                >
                  {syllabusDepts.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            )}

            {canAddDept && (
              <button
                className="btn btn-primary"
                onClick={handleAddDepartment}
                disabled={addingDept}
                style={{ fontSize: 13, padding: "6px 12px" }}
              >
                {addingDept ? "Adding..." : "➕ Add Department"}
              </button>
            )}

            <button
              className="btn btn-outline"
              onClick={() => downloadExcel("syllabus-table", `Syllabus-${currentSyllabusDep || "All"}`)}
              style={{ fontSize: 13, padding: "6px 12px" }}
            >
              📥 Excel
            </button>
            <button
              className="btn btn-outline"
              onClick={() => downloadPdf(`Syllabus — ${currentSyllabusDep || "All"}`, "syllabus-table")}
              style={{ fontSize: 13, padding: "6px 12px" }}
            >
              📄 PDF
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table" id="syllabus-table">
            <thead>
              <tr>
                <th style={{ width: "10%" }}>Day</th>
                <th style={{ width: "15%" }}>Date</th>
                <th style={{ width: "45%" }}>Topic & Curriculum (Supports Multi-Topic)</th>
                <th style={{ width: "20%" }}>Trainer Name (Supports Multi-Trainer)</th>
                {!isReadOnly && <th style={{ width: "10%" }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {list.map((item) => {
                const isEditing = editingRow?.rowIdx === item.rowIdx && editingRow?.colOffset === item.colOffset;

                return (
                  <tr key={`${item.rowIdx}-${item.colOffset}`}>
                    <td style={{ fontWeight: 700 }}>{item.day}</td>
                    <td>{item.date || "Scheduled"}</td>
                    <td>
                      {isEditing ? (
                        <textarea
                          value={editingRow.topic}
                          onChange={(e) =>
                            setEditingRow({ ...editingRow, topic: e.target.value })
                          }
                          style={{ width: "100%", padding: 6, minHeight: 48, borderRadius: 4, border: "1px solid var(--border)" }}
                          placeholder="e.g. Topic 1, Topic 2, Topic 3"
                        />
                      ) : (
                        <div style={{ whiteSpace: "pre-wrap" }}>{item.topic || "Topic TBD"}</div>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <textarea
                          value={editingRow.trainer}
                          onChange={(e) =>
                            setEditingRow({ ...editingRow, trainer: e.target.value })
                          }
                          style={{ width: "100%", padding: 6, minHeight: 48, borderRadius: 4, border: "1px solid var(--border)" }}
                          placeholder="e.g. Trainer 1, Trainer 2, Trainer 3"
                        />
                      ) : (
                        <div style={{ whiteSpace: "pre-wrap" }}>{item.trainer || "Assigned Trainer"}</div>
                      )}
                    </td>
                    {!isReadOnly && (
                      <td>
                        {isEditing ? (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              className="btn btn-save"
                              style={{ padding: "4px 8px", fontSize: 11 }}
                              onClick={() => handleSaveRow(editingRow)}
                            >
                              Save
                            </button>
                            <button
                              className="btn btn-outline"
                              style={{ padding: "4px 8px", fontSize: 11 }}
                              onClick={() => setEditingRow(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            className="btn btn-outline"
                            style={{ padding: "4px 8px", fontSize: 11 }}
                            onClick={() => setEditingRow({ ...item })}
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              {list.length === 0 && (
                <tr>
                  <td colSpan={isReadOnly ? 4 : 5} className="empty-state">
                    No syllabus entries found for {currentSyllabusDep || "this department"}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
