import { useState, useEffect } from "react";
import { callServer } from "../services/appsScript";
import { LoadingSpinner, ErrorState, ReadOnlyNotice } from "../components/Common";

function downloadExcel(tableId, filename) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const html = table.outerHTML;
  const blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename + '.xls'; a.click();
  URL.revokeObjectURL(url);
}

function downloadPdf(title, tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const win = window.open('', '_blank');
  win.document.write('<html><head><title>' + title + '</title>');
  win.document.write('<style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:12px}th{background:#0B3D5C;color:#fff}@media print{button{display:none}}</style>');
  win.document.write('</head><body><h2>' + title + '</h2>');
  win.document.write(table.outerHTML);
  win.document.write('</body></html>');
  win.document.close();
  win.onload = function() { win.print(); };
}

export default function Attendance({ token, user, selectedDepartment, onMessage }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const role = (user?.role || "").toLowerCase();
  const isReadOnly = role.includes("college");
  // Use real department name; default to first available instead of hardcoded "Dep1"
  const currentDep = selectedDepartment === "All" ? null : selectedDepartment;

  useEffect(() => {
    loadAttendance();
  }, [token, currentDep]);

  async function loadAttendance() {
    setLoading(true);
    setError(null);
    try {
      const res = await callServer("getAttendance", token, currentDep || "");
      if (res?.success) {
        setData(res);
      } else {
        setError(res?.message || "Failed to fetch attendance records.");
      }
    } catch (err) {
      setError(err.message || "Failed to load attendance.");
    } finally {
      setLoading(false);
    }
  }

  function handleStatusChange(studentRowIdx, status) {
    if (isReadOnly) return;
    setData((prev) => {
      if (!prev) return prev;
      const updated = prev.students.map((st) => {
        if (st.rowIdx === studentRowIdx) {
          return {
            ...st,
            attendance: {
              ...st.attendance,
              [selectedDayIdx]: status,
            },
          };
        }
        return st;
      });
      return { ...prev, students: updated };
    });
  }

  async function handleSave() {
    if (isReadOnly) return;
    setSaving(true);
    try {
      const records = data.students.map((st) => ({
        rowIdx: st.rowIdx,
        status: st.attendance[selectedDayIdx] || "",
      }));

      const res = await callServer(
        "saveAttendance",
        token,
        data.department,
        selectedDayIdx,
        records
      );

      if (res?.success) {
        onMessage(`Attendance saved for Day ${selectedDayIdx + 1} (${data.department})!`, "success");
      } else {
        onMessage(res?.message || "Failed to save attendance.", "error");
      }
    } catch (err) {
      onMessage(err.message || "Error saving attendance.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} onRetry={loadAttendance} />;

  const trainingDays = data?.trainingDays || [];
  const dates = data?.dates || [];
  const depName = data?.department || currentDep || "Department";
  const meta = data?.metadata || {};

  const students = (data?.students || []).filter((s) => {
    const matchesSearch = (s.name || "").toLowerCase().includes(searchTerm.toLowerCase()) || String(s.regNo || "").toLowerCase().includes(searchTerm.toLowerCase());
    const sStatus = (s.attendance[selectedDayIdx] || "").trim();
    const matchesFilter = statusFilter === "All" || (statusFilter === "Present" && sStatus === "Present") || (statusFilter === "Absent" && sStatus === "Absent") || (statusFilter === "Half Day" && sStatus === "Half Day");
    return matchesSearch && matchesFilter;
  });

  return (
    <div>
      <ReadOnlyNotice user={user} />

      {/* Department metadata panel */}
      {meta.collegeName && (
        <div className="panel" style={{ marginBottom: 12, padding: "10px 16px", background: "#f0f4ff" }}>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13 }}>
            <span><strong>Department:</strong> {meta.department || depName}</span>
            {meta.section && <span><strong>Section:</strong> {meta.section}</span>}
            {meta.roomNumber && <span><strong>Room:</strong> {meta.roomNumber}</span>}
            {meta.totalStrength > 0 && <span><strong>Strength:</strong> {meta.totalStrength}</span>}
          </div>
        </div>
      )}

      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Select Training Day</label>
            <select
              value={selectedDayIdx}
              onChange={(e) => setSelectedDayIdx(Number(e.target.value))}
            >
              {trainingDays.map((dayLabel, idx) => (
                <option key={idx} value={idx}>
                  {dayLabel} {dates[idx] ? `(${dates[idx]})` : ""}
                </option>
              ))}
              {trainingDays.length === 0 && <option value={0}>Day 1</option>}
            </select>
          </div>

          <div className="field search-box" style={{ margin: 0 }}>
            <label>Search Student</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name or reg. number..."
            />
          </div>

          <div className="field" style={{ margin: 0 }}>
            <label>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="All">All</option>
              <option value="Present">Present</option>
              <option value="Absent">Absent</option>
              <option value="Half Day">Half Day</option>
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn btn-outline" onClick={() => downloadExcel("attendance-table", `Attendance_${depName}_Day${selectedDayIdx+1}`)}>
            📥 XLSX
          </button>
          <button className="btn btn-outline" onClick={() => downloadPdf(`Attendance - ${depName} - Day ${selectedDayIdx+1}`, "attendance-table")}>
            📥 PDF
          </button>
          {!isReadOnly && (
            <button className="btn btn-save" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : `💾 Save ${trainingDays[selectedDayIdx] || "Day"} Attendance`}
            </button>
          )}
        </div>
      </div>

      <div className="panel">
        <h3>
          Daily Attendance Sheet ({depName}) — {trainingDays[selectedDayIdx] || `Day ${selectedDayIdx + 1}`}
        </h3>

        <div className="table-wrap">
          <table className="data-table" id="attendance-table">
            <thead>
              <tr>
                <th>S.No</th>
                <th>Reg. Number</th>
                <th>Student Name</th>
                <th>Department</th>
                <th>Status ({trainingDays[selectedDayIdx] || `Day ${selectedDayIdx + 1}`})</th>
              </tr>
            </thead>
            <tbody>
              {students.map((st) => {
                const currentStatus = st.attendance[selectedDayIdx] || "";
                return (
                  <tr key={st.rowIdx}>
                    <td>{st.sNo}</td>
                    <td>{st.regNo || "N/A"}</td>
                    <td style={{ fontWeight: 600 }}>{st.name}</td>
                    <td>{st.dept || ""}</td>
                    <td>
                      {isReadOnly ? (
                        <span className={`status-${(currentStatus || "").replace(/\s+/g, "")}`}>
                          {currentStatus || "-"}
                        </span>
                      ) : (
                        <select
                          className={`status-select status-${(currentStatus || "").replace(/\s+/g, "")}`}
                          value={currentStatus}
                          onChange={(e) => handleStatusChange(st.rowIdx, e.target.value)}
                        >
                          <option value="">--</option>
                          <option value="Present">Present</option>
                          <option value="Absent">Absent</option>
                          <option value="Half Day">Half Day</option>
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
              {students.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-state">
                    No student records found for {depName}.
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
