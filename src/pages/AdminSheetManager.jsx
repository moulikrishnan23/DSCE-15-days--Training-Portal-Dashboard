import { useState, useEffect } from "react";
import { callServer } from "../services/appsScript";
import { LoadingSpinner, ErrorState } from "../components/Common";

export default function AdminSheetManager({ token, user, onMessage }) {
  const [sheets, setSheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Add Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSheetName, setNewSheetName] = useState("");
  const [newSheetType, setNewSheetType] = useState("Attendance");
  const [newDepartment, setNewDepartment] = useState("Dep20");
  const [adding, setAdding] = useState(false);

  // Remove Modal State
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [sheetToRemove, setSheetToRemove] = useState("");
  const [removing, setRemoving] = useState(false);

  const role = (user?.role || "").toLowerCase();
  const isLeSuccessAdmin = role.includes("lesuccess");

  useEffect(() => {
    loadSheets();
  }, [token]);

  async function loadSheets() {
    setLoading(true);
    setError(null);
    try {
      const res = await callServer("getAdminSheetConfig", token);
      if (res?.success) {
        setSheets(res.sheets || []);
      } else {
        setError(res?.message || "Failed to load sheet configurations.");
      }
    } catch (err) {
      setError(err.message || "Failed to fetch sheet configuration.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddSheet(e) {
    e.preventDefault();
    setAdding(true);
    try {
      const name = newSheetType === "Custom" ? newSheetName : `${newSheetType}_${newDepartment}`;
      const res = await callServer("addSheet", token, name, newSheetType, newDepartment);
      if (res?.success) {
        onMessage(`Sheet "${name}" created successfully!`, "success");
        setShowAddModal(false);
        setNewSheetName("");
        loadSheets();
      } else {
        onMessage(res?.message || "Failed to create sheet.", "error");
      }
    } catch (err) {
      onMessage(err.message || "Failed to add sheet.", "error");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveSheet() {
    if (!sheetToRemove) return;
    setRemoving(true);
    try {
      const res = await callServer("removeSheet", token, sheetToRemove);
      if (res?.success) {
        onMessage(`Sheet "${sheetToRemove}" deleted successfully!`, "success");
        setShowRemoveModal(false);
        setSheetToRemove("");
        loadSheets();
      } else {
        onMessage(res?.message || "Failed to delete sheet.", "error");
      }
    } catch (err) {
      onMessage(err.message || "Failed to remove sheet.", "error");
    } finally {
      setRemoving(false);
    }
  }

  if (!isLeSuccessAdmin) {
    return (
      <div className="panel empty-state">
        <h3 style={{ color: "var(--danger)" }}>⛔ Access Denied</h3>
        <p>This Sheet Management Portal is exclusively accessible to <strong>LeSuccess Admin</strong>.</p>
      </div>
    );
  }

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} onRetry={loadSheets} />;

  return (
    <div>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0, color: "var(--primary)" }}>⚙️ Sheet Management Portal</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
            LeSuccess Admin control center for managing Google Sheet tabs & department structures dynamically.
          </p>
        </div>

        <button className="btn btn-save" onClick={() => setShowAddModal(true)}>
          ➕ Add New Sheet
        </button>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="label">Total Managed Sheets</div>
          <div className="value">{sheets.length}</div>
        </div>
        <div className="kpi-card">
          <div className="label">Department Sheets</div>
          <div className="value accent">
            {sheets.filter((s) => s.name.includes("_Dep")).length}
          </div>
        </div>
        <div className="kpi-card">
          <div className="label">Global System Sheets</div>
          <div className="value">
            {sheets.filter((s) => !s.name.includes("_Dep")).length}
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>Connected Google Spreadsheet Worksheets</h3>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Sheet Name</th>
                <th>Category / Type</th>
                <th>Rows</th>
                <th>Columns</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sheets.map((s, idx) => {
                const isGlobal = !s.name.includes("_Dep");
                let category = "Global Overview";
                if (s.name.startsWith("Attendance_")) category = "Attendance";
                else if (s.name.startsWith("PreTest_")) category = "Pre-Test";
                else if (s.name.startsWith("PostTest_")) category = "Post-Test";
                else if (s.name.startsWith("MockInterview_")) category = "Mock Interview";

                return (
                  <tr key={s.name}>
                    <td>{idx + 1}</td>
                    <td style={{ fontWeight: 600, color: "var(--primary)" }}>{s.name}</td>
                    <td>
                      <span className={`pill ${isGlobal ? "pill-planned" : "pill-completed"}`}>
                        {category}
                      </span>
                    </td>
                    <td>{s.rowCount} rows</td>
                    <td>{s.colCount} cols</td>
                    <td>
                      <span style={{ color: "var(--success)", fontWeight: 600 }}>Active</span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {!isGlobal && (
                        <button
                          className="btn btn-danger"
                          style={{ padding: "4px 10px", fontSize: 11.5 }}
                          onClick={() => {
                            setSheetToRemove(s.name);
                            setShowRemoveModal(true);
                          }}
                        >
                          🗑️ Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Sheet Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3>➕ Add New Worksheet</h3>
            <form onSubmit={handleAddSheet}>
              <div className="field">
                <label>Sheet Category / Type</label>
                <select
                  value={newSheetType}
                  onChange={(e) => setNewSheetType(e.target.value)}
                >
                  <option value="Attendance">Attendance (Attendance_DepX)</option>
                  <option value="PreTest_Report">Pre-Test (PreTest_Report_DepX)</option>
                  <option value="PostTest_Report">Post-Test (PostTest_Report_DepX)</option>
                  <option value="MockInterview">Mock Interview (MockInterview_DepX)</option>
                  <option value="Custom">Custom Sheet</option>
                </select>
              </div>

              {newSheetType !== "Custom" ? (
                <div className="field">
                  <label>Department Code (e.g. Dep20, Dep21)</label>
                  <input
                    type="text"
                    value={newDepartment}
                    onChange={(e) => setNewDepartment(e.target.value)}
                    placeholder="Dep20"
                    required
                  />
                </div>
              ) : (
                <div className="field">
                  <label>Custom Sheet Name</label>
                  <input
                    type="text"
                    value={newSheetName}
                    onChange={(e) => setNewSheetName(e.target.value)}
                    placeholder="e.g. Special_Project_Report"
                    required
                  />
                </div>
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-save" disabled={adding}>
                  {adding ? "Creating..." : "Create Sheet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Remove Sheet Modal */}
      {showRemoveModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3 style={{ color: "var(--danger)" }}>⚠️ Delete Worksheet</h3>
            <p>
              Are you sure you want to delete <strong>"{sheetToRemove}"</strong> from the Google Spreadsheet?
              This action cannot be undone.
            </p>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setShowRemoveModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleRemoveSheet}
                disabled={removing}
              >
                {removing ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
