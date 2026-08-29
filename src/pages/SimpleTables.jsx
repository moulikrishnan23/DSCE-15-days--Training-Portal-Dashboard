import { useState, useEffect } from "react";
import { callServer } from "../services/appsScript";
import { LoadingSpinner, ErrorState } from "../components/Common";

export function PrePost({ token, user }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hideForCollegeAdmin, setHideForCollegeAdmin] = useState(false);

  const role = (user?.role || "").toLowerCase();
  const isCollegeAdmin = role.includes("college");

  useEffect(() => {
    loadComparison();
  }, [token, user]);

  async function loadComparison() {
    setLoading(true);
    setError(null);
    setHideForCollegeAdmin(false);
    try {
      if (isCollegeAdmin) {
        const dayRes = await callServer("getTrainingDayStatus", token);
        if (dayRes?.success && (dayRes.completedDays || 0) < 14) {
          setHideForCollegeAdmin(true);
          setLoading(false);
          return;
        }
      }

      const res = await callServer("getPrePostComparison", token);
      if (res?.success) {
        setData(res.report || []);
      } else {
        if (res?.locked) {
          setHideForCollegeAdmin(true);
        } else {
          setError(res?.message || "Failed to load comparative analytics.");
        }
      }
    } catch (err) {
      if (err?.locked) {
        setHideForCollegeAdmin(true);
      } else {
        setError(err.message || "Failed to fetch comparison report.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} onRetry={loadComparison} />;

  if (hideForCollegeAdmin) {
    return (
      <div className="panel" style={{ textAlign: "center", padding: "50px 20px" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
        <h3 style={{ color: "var(--primary)", marginBottom: 8 }}>Pre vs Post Analytics — Available on Day 15</h3>
        <p style={{ color: "var(--text-muted)", fontSize: 13.5, maxWidth: 500, margin: "0 auto" }}>
          Comparative analytics evaluating student learning growth across all 15 days will unlock automatically for College Admin on Day 15.
        </p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h3>📈 Pre-Test vs Post-Test Comparative Analytics</h3>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
        Department-level summary evaluating student learning progress and attendance over the 15-day training program.
      </p>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Department</th>
              <th>Pre-Test Avg (%)</th>
              <th>Post-Test Avg (%)</th>
              <th>Improvement (%)</th>
              <th>Avg Attendance (%)</th>
              <th>Students Evaluated</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item, idx) => (
              <tr key={idx}>
                <td style={{ fontWeight: 700, color: "var(--primary)" }}>{item.department}</td>
                <td>{item.preAvg || "0.00"}%</td>
                <td>{item.postAvg || "0.00"}%</td>
                <td
                  style={{
                    fontWeight: 700,
                    color: (item.improvement || 0) >= 0 ? "var(--success)" : "var(--danger)",
                  }}
                >
                  {item.improvement || "0.00"}%
                </td>
                <td>{item.avgAttendance || "0.00"}%</td>
                <td>{item.studentsCompared || 0}</td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-state">
                  No comparative data generated yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
