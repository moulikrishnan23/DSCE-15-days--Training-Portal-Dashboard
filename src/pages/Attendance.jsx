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
  a.download = (filename || "Attendance") + ".xls";
  a.click();
  URL.revokeObjectURL(url);
}

function downloadPdf(title, tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const win = window.open("", "_blank");
  win.document.write("<html><head><title>" + title + "</title>");
  win.document.write(
    "<style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:12px}th{background:#0B3D5C;color:#fff}@media print{button,select{display:none}}</style>"
  );
  win.document.write("</head><body><h2>" + title + "</h2>");
  win.document.write(table.outerHTML);
  win.document.write("</body></html>");
  win.document.close();
  win.onload = function () {
    win.print();
  };
}

export default function Attendance({ token, user, selectedDepartment, onMessage }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const role = (user?.role || "").toLowerCase();
  const isReadOnly = role.includes("college");
  const currentDep = selectedDepartment === "All" ? null : selectedDepartment;

  const loadAttendance = useCallback(async () => {
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
  }, [token, currentDep]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  function handleStatusChange(studentRowIdx, status) {
    if (isReadOnly) return;
    setData((prev) => {
      if (!prev || !Array.isArray(prev.students)) return prev;
      const updated = prev.students.map((st) => {
        if (st.rowIdx === studentRowIdx) {
          return {
            ...st,
            attendance: {
              ...(st.attendance || {}),
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
    if (isReadOnly || !data || !Array.isArray(data.students)) return;
    setSaving(true);
    try {
      const records = data.students.map((st) => ({
        rowIdx: st.rowIdx,
        status: (st.attendance && st.attendance[selectedDayIdx]) || "",
      }));

      const res = await callServer(
        "saveAttendance",
        token,
        data.department || currentDep || "",
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

  const trainingDays = data?.trainingDays || [];
  const dates = data?.dates || [];
  const depName = data?.department || currentDep || "Department";
  const meta = data?.metadata || {};

  const filteredStudents = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return (data?.students || []).filter((s) => {
      const matchesSearch = !q || (s.name || "").toLowerCase().includes(q) || String(s.regNo || "").toLowerCase().includes(q);
      const sStatus = (s.attendance && s.attendance[selectedDayIdx] !== undefined ? String(s.attendance[selectedDayIdx]) : "").trim();
      const matchesFilter =
        statusFilter === "All" ||
        (statusFilter === "Present" && sStatus === "Present") ||
        (statusFilter === "Absent" && sStatus === "Absent") ||
        (statusFilter === "Half Day" && sStatus === "Half Day");
      return matchesSearch && matchesFilter;
    });
  }, [data, searchTerm, selectedDayIdx, statusFilter]);

  const paginatedStudents = useMemo(() => {
    if (pageSize === "All") return filteredStudents;
    const start = (page - 1) * pageSize;
    return filteredStudents.slice(start, start + pageSize);
  }, [filteredStudents, page, pageSize]);

  if (loading && !data) {
    return (
      <div>
        <ReadOnlyNotice user={user} />
        <div className="panel">
          <div className="skeleton-box" style={{ height: 24, width: "250px", marginBottom: 16 }} />
          <SkeletonTable rows={10} cols={5} />
        </div>
      </div>
    );
  }
  if (error && !data) return <ErrorState message={error} onRetry={loadAttendance} />;

  return (
    <div>
      <ReadOnlyNotice user={user} />

      {meta.collegeName && (
        <div className="panel" style={{ marginBottom: 12, padding: "10px 16px", background: "var(--background)", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13 }}>
            <span><strong>Department:</strong> {meta.department || depName}</span>
            {meta.section && <span><strong>Section:</strong> {meta.section}</span>}
            {meta.roomNumber && <span><strong>Room:</strong> {meta.roomNumber}</span>}
            {meta.totalStrength > 0 && <span><strong>Strength:</strong> {meta.totalStrength}</span>}
          </div>
        </div>
      )}

      <div className="toolbar" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div className="field" style={{ margin: 0, minWidth: 160 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>Training Day</label>
            <select
              value={selectedDayIdx}
              onChange={(e) => {
                setSelectedDayIdx(Number(e.target.value));
                setPage(1);
              }}
              style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", width: "100%" }}
            >
              {trainingDays.map((dayLabel, idx) => (
                <option key={idx} value={idx}>
                  {dayLabel} {dates[idx] ? `(${dates[idx]})` : ""}
                </option>
              ))}
              {trainingDays.length === 0 && <option value={0}>Day 1</option>}
            </select>
          </div>

          <div className="field search-box" style={{ margin: 0, minWidth: 200 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>Search Student</label>
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

          <div className="field" style={{ margin: 0, minWidth: 120 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>Status</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", width: "100%" }}
            >
              <option value="All">All</option>
              <option value="Present">Present</option>
              <option value="Absent">Absent</option>
              <option value="Half Day">Half Day</option>
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn btn-outline" onClick={() => downloadExcel("attendance-table", `Attendance_${depName}_Day${selectedDayIdx + 1}`)}>
            📥 Excel
          </button>
          <button className="btn btn-outline" onClick={() => downloadPdf(`Attendance - ${depName} - Day ${selectedDayIdx + 1}`, "attendance-table")}>
            📄 PDF
          </button>
          {!isReadOnly && (
            <button className="btn btn-save" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : `💾 Save ${trainingDays[selectedDayIdx] || "Day"} Attendance`}
            </button>
          )}
        </div>
      </div>

      <div className="panel">
        <h3 style={{ margin: "0 0 12px 0" }}>
          Daily Attendance Sheet ({depName}) — {trainingDays[selectedDayIdx] || `Day ${selectedDayIdx + 1}`}
        </h3>

        <div className="table-wrap">
          <table className="data-table" id="attendance-table">
            <thead>
              <tr>
                <th style={{ width: "8%" }}>S.No</th>
                <th style={{ width: "24%" }}>Reg. Number</th>
                <th style={{ width: "36%" }}>Student Name</th>
                <th style={{ width: "16%" }}>Department</th>
                <th style={{ width: "16%" }}>Status ({trainingDays[selectedDayIdx] || `Day ${selectedDayIdx + 1}`})</th>
              </tr>
            </thead>
            <tbody>
              {paginatedStudents.map((st) => {
                const currentStatus = (st.attendance && st.attendance[selectedDayIdx]) || "";
                return (
                  <tr key={st.rowIdx}>
                    <td>{st.sNo}</td>
                    <td style={{ fontWeight: 600, color: "var(--text-muted)" }}>{st.regNo || "N/A"}</td>
                    <td style={{ fontWeight: 600 }}>{st.name}</td>
                    <td><span className="pill pill-upcoming">{st.dept || depName}</span></td>
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
              {paginatedStudents.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-state">
                    No student records found matching "{searchTerm}".
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={page}
          totalItems={filteredStudents.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(sz) => {
            setPageSize(sz);
            setPage(1);
          }}
        />
      </div>
    </div>
  );
}
