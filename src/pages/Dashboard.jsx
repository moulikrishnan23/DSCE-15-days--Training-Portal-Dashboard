import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Chart } from "chart.js/auto";
import { callServer } from "../services/appsScript";
import { ErrorState, LoadingSpinner, ReadOnlyNotice, Modal } from "../components/Common";

function pct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0.00%";
  const normalized = Math.abs(n) <= 1.000001 ? n * 100 : n;
  return `${normalized.toFixed(2)}%`;
}

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
  w.document.write("<style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:12px}th{background:#0B3D5C;color:#fff}@media print{button{display:none}}</style>");
  w.document.write("</head><body><h2>" + title + "</h2>");
  w.document.write(table.outerHTML);
  w.document.write("</body></html>");
  w.document.close();
  w.onload = function () { w.print(); };
}

/* ─── KPI Breakdown Table (used inside card modals) ─── */
function KpiBreakdownTable({ rows, metric, label }) {
  if (!rows?.length) return <div className="empty-state">No data available.</div>;
  return (
    <div className="table-wrap" style={{ maxHeight: "50vh" }}>
      <table className="data-table" id="kpi-breakdown-table">
        <thead>
          <tr><th>Department</th><th>Students</th><th>{label}</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.department}>
              <td><strong>{r.department}</strong></td>
              <td>{r.count}</td>
              <td>{typeof r[metric] === "number" ? (metric.includes("Pct") || metric.includes("Average") || metric.includes("Avg") || metric.includes("improvement") ? pct(r[metric]) : r[metric]) : r[metric]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Department Table (full dashboard summary) ─── */
function DepartmentTable({ rows }) {
  if (!rows?.length) return <div className="empty-state">No department data available.</div>;
  return (
    <div className="table-wrap" style={{ maxHeight: "50vh" }}>
      <table className="data-table" id="dept-summary-table">
        <thead>
          <tr>
            <th>Department</th><th>Students</th><th>Attendance</th>
            <th>Pre-Test</th><th>Post-Test</th><th>Improvement</th><th>Mock Avg</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.department}>
              <td><strong>{row.department}</strong></td>
              <td>{row.count}</td>
              <td>{pct(row.attendancePct)}</td>
              <td>{pct(row.preTestAverage)}</td>
              <td>{pct(row.postTestAverage)}</td>
              <td>{pct(row.improvement)}</td>
              <td>{pct(row.mockInterviewAvg)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Ranking Table (Top / Least students) ─── */
function RankingTable({ rows, onStudentClick }) {
  if (!rows?.length) return <div className="empty-state">No student ranking data available.</div>;
  return (
    <div className="table-wrap" style={{ maxHeight: "350px" }}>
      <table className="data-table">
        <thead>
          <tr><th>Rank</th><th>Student</th><th>Reg. No</th><th>Dept</th><th>Score %</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.department}-${row.regNo}-${row.rank}`}
                style={{ cursor: "pointer" }}
                onClick={() => onStudentClick?.(row.regNo)}
                title="Click to view detailed student profile">
              <td><strong>#{row.rank}</strong></td>
              <td style={{ fontWeight: 600 }}>{row.name}</td>
              <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{row.regNo}</td>
              <td><span className="pill pill-upcoming" style={{ fontSize: 10 }}>{row.department}</span></td>
              <td style={{ fontWeight: 700, color: "var(--primary)" }}>{pct(row.percentage)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Compact & Responsive Student Profile Modal ─── */
function StudentProfileModal({ token, regNo, onClose }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    if (!regNo) return;
    setLoading(true);
    callServer("getStudentProfile", token, regNo)
      .then((res) => { if (res?.success) setProfile(res); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, regNo]);

  useEffect(() => {
    if (chartInstance.current) chartInstance.current.destroy();
    if (!profile || !chartRef.current) return;

    const labels = [];
    const scores = [];

    (profile.testScores || []).forEach((t) => {
      labels.push(t.testName);
      scores.push(Number(t.percentage) || 0);
    });

    if (profile.postTest) { labels.push("Post Test"); scores.push(Number(profile.postTest.percentage) || 0); }
    if (profile.mockInterview) { labels.push("Mock Interview"); scores.push(Number(profile.mockInterview.percentage) || 0); }

    if (labels.length > 0) {
      chartInstance.current = new Chart(chartRef.current, {
        type: "line",
        data: {
          labels,
          datasets: [{
            label: "Score %",
            data: scores,
            borderColor: "#1A365D",
            backgroundColor: "rgba(26,54,93,0.1)",
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: "#1A365D",
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, max: 100, ticks: { font: { size: 10 } } },
            x: { ticks: { font: { size: 10 }, maxRotation: 45 } }
          },
        },
      });
    }

    return () => { if (chartInstance.current) chartInstance.current.destroy(); };
  }, [profile]);

  if (loading) return <Modal title="Student Profile" onClose={onClose}><LoadingSpinner /></Modal>;
  if (!profile?.profile) return <Modal title="Student Profile" onClose={onClose}><div className="empty-state">Student not found.</div></Modal>;

  const p = profile.profile;
  const att = profile.attendance || {};

  return (
    <Modal title={p.name} onClose={onClose}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid var(--border)", fontSize: 13 }}>
        <div><strong>Reg No:</strong> {p.regNo}</div>
        <div><strong>Dept:</strong> <span className="pill pill-upcoming">{p.department}</span></div>
      </div>

      {/* Compact 4-Card Attendance Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
        <div style={{ background: "var(--background)", borderRadius: 6, padding: "8px 10px", textAlign: "center", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Present</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--success)", marginTop: 2 }}>{att.present}</div>
        </div>
        <div style={{ background: "var(--background)", borderRadius: 6, padding: "8px 10px", textAlign: "center", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Absent</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--danger)", marginTop: 2 }}>{att.absent}</div>
        </div>
        <div style={{ background: "var(--background)", borderRadius: 6, padding: "8px 10px", textAlign: "center", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Half Day</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--warning)", marginTop: 2 }}>{att.halfDay}</div>
        </div>
        <div style={{ background: "var(--background)", borderRadius: 6, padding: "8px 10px", textAlign: "center", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Attendance</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--primary)", marginTop: 2 }}>{att.percentage}%</div>
        </div>
      </div>

      {/* Compact Chart */}
      {(profile.testScores?.length > 0 || profile.postTest || profile.mockInterview) && (
        <div style={{ marginBottom: 14, background: "var(--background)", borderRadius: 6, padding: 10, border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--primary)", marginBottom: 6 }}>Performance Progression Graph</div>
          <div style={{ height: 130 }}>
            <canvas ref={chartRef} />
          </div>
        </div>
      )}

      {/* Compact Test Scores Table */}
      <div className="table-wrap" style={{ maxHeight: "160px" }}>
        <table className="data-table" style={{ fontSize: 12 }}>
          <thead><tr><th style={{ padding: "6px 8px" }}>Assessment</th><th style={{ padding: "6px 8px" }}>Score</th><th style={{ padding: "6px 8px" }}>Percentage</th></tr></thead>
          <tbody>
            {(profile.testScores || []).map((t, i) => (
              <tr key={i}><td style={{ padding: "5px 8px" }}>{t.testName}</td><td style={{ padding: "5px 8px" }}>{t.total}</td><td style={{ padding: "5px 8px", fontWeight: 700, color: "var(--primary)" }}>{t.percentage}%</td></tr>
            ))}
            {profile.postTest && <tr><td style={{ padding: "5px 8px" }}>Post Test</td><td style={{ padding: "5px 8px" }}>{profile.postTest.total}</td><td style={{ padding: "5px 8px", fontWeight: 700, color: "var(--primary)" }}>{profile.postTest.percentage}%</td></tr>}
            {profile.mockInterview && <tr><td style={{ padding: "5px 8px" }}>Mock Interview</td><td style={{ padding: "5px 8px" }}>{profile.mockInterview.score}</td><td style={{ padding: "5px 8px", fontWeight: 700, color: "var(--primary)" }}>{profile.mockInterview.percentage}%</td></tr>}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

/* ─── Main Dashboard Component ─── */
export default function Dashboard({ token, user, selectedDepartment, onMessage }) {
  const [data, setData] = useState(null);
  const [ranking, setRanking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rankingLoading, setRankingLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null);
  const deptChartRef = useRef(null);
  const attendanceChartRef = useRef(null);
  const charts = useRef([]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await callServer("getDashboardData", token, selectedDepartment);
      if (!result?.success) throw new Error(result?.message || "Unable to load dashboard.");
      setData(result);

      setRankingLoading(true);
      callServer("getDashboardStudentRankings", token, 10, selectedDepartment)
        .then((rankResult) => { if (rankResult?.success) setRanking(rankResult); })
        .catch((err) => onMessage?.(err.message || "Unable to load rankings.", "error"))
        .finally(() => setRankingLoading(false));
    } catch (err) {
      setError(err.message || "Unable to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, [token, selectedDepartment, onMessage]);

  useEffect(() => {
    if (token) loadDashboard();
  }, [token, selectedDepartment, loadDashboard]);

  useEffect(() => {
    charts.current.forEach((c) => c?.destroy());
    charts.current = [];
    if (!data) return;

    if (attendanceChartRef.current) {
      charts.current.push(new Chart(attendanceChartRef.current, {
        type: "doughnut",
        data: {
          labels: ["Present", "Absent", "Half Day"],
          datasets: [{ data: [data.kpis.presentToday, data.kpis.absentToday, data.kpis.halfDayToday], backgroundColor: ["#38A169", "#E53E3E", "#DD6B20"] }],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } } },
      }));
    }

    if (deptChartRef.current) {
      charts.current.push(new Chart(deptChartRef.current, {
        type: "bar",
        data: {
          labels: data.departmentSummary.map((x) => x.department),
          datasets: [{ label: "Students", data: data.departmentSummary.map((x) => x.count), backgroundColor: "#1A365D", borderRadius: 4 }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, ticks: { font: { size: 10 } } },
            x: { ticks: { font: { size: 10 }, maxRotation: 45 } }
          }
        },
      }));
    }

    return () => charts.current.forEach((c) => c?.destroy());
  }, [data]);

  const k = data?.kpis;
  const departmentRows = data?.departmentSummary || [];
  const selectedLabel = selectedDepartment === "All" ? `All ${departmentRows.length} Departments` : selectedDepartment;

  /* Cards configuration with click drill-downs */
  const cards = useMemo(() => {
    if (!k) return [];
    return [
      { label: "Total Students", value: k.totalStudents, metric: "count", breakdownLabel: "Students" },
      { label: "Present — Latest Entry", value: k.presentToday, metric: "presentToday", breakdownLabel: "Present" },
      { label: "Absent — Latest Entry", value: k.absentToday, metric: "absentToday", breakdownLabel: "Absent" },
      { label: "Half Day — Latest Entry", value: k.halfDayToday, metric: "halfDayToday", breakdownLabel: "Half Day" },
      { label: "Overall Attendance", value: pct(k.overallAttendancePct), metric: "attendancePct", breakdownLabel: "Attendance %" },
      { label: "Training Day", value: `${k.trainingDay} / ${k.totalTrainingDays}` },
      { label: "Completed Days", value: k.completedDays },
      { label: "Remaining Days", value: k.remainingDays },
      { label: "Avg Pre-Test", value: pct(k.preTestAverage), metric: "preTestAverage", breakdownLabel: "Pre-Test Avg" },
      { label: "Avg Post-Test", value: pct(k.postTestAverage), metric: "postTestAverage", breakdownLabel: "Post-Test Avg" },
      { label: "Avg Improvement", value: pct(k.averageImprovement), metric: "improvement", breakdownLabel: "Improvement" },
      { label: "Mock Interview Avg", value: pct(k.mockInterviewAvgScore), metric: "mockInterviewAvg", breakdownLabel: "Mock Avg" },
    ];
  }, [k]);

  if (loading) return <LoadingSpinner />;
  if (error && !data) return <ErrorState message={error} onRetry={loadDashboard} />;
  if (!data) return null;

  return (
    <div>
      <ReadOnlyNotice user={user} />

      {/* KPI Cards Grid */}
      <div className="kpi-grid">
        {cards.map((card) => (
          <div className="kpi-card" key={card.label}
               style={card.metric ? { cursor: "pointer" } : undefined}
               onClick={() => card.metric && setModal({ type: "kpi", metric: card.metric, label: card.breakdownLabel })}
               title={card.metric ? "Click for department-wise breakdown" : undefined}>
            <div className="label">{card.label}</div>
            <div className="value">{card.value}</div>
          </div>
        ))}
      </div>

      {/* Overview Toolbar */}
      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h3 style={{ marginBottom: 4 }}>15-Day Training Program Overview</h3>
            <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
              Showing: <strong>{selectedLabel}</strong>
              {k.attendanceDateLabel ? ` • Latest entry: ${k.attendanceDateLabel}` : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-outline" onClick={loadDashboard}>🔄 Refresh</button>
            <button className="btn btn-outline" onClick={() => downloadExcel("dept-summary-table", "Dashboard-" + selectedDepartment)}>📥 Excel</button>
            <button className="btn btn-outline" onClick={() => downloadPdf("Dashboard Report — " + selectedLabel, "dept-summary-table")}>📄 PDF</button>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="chart-grid">
        <div className="panel">
          <h3>Latest Attendance Distribution</h3>
          <div style={{ height: 210 }}>
            <canvas ref={attendanceChartRef} />
          </div>
        </div>
        <div className="panel">
          <h3>Department-wise Students</h3>
          <div style={{ height: 210 }}>
            <canvas ref={deptChartRef} />
          </div>
        </div>
      </div>

      {/* Department Summary Panel */}
      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0 }}>Department-wise Performance</h3>
          <button className="btn btn-outline" onClick={() => setModal({ type: "departments" })}>View Full Table</button>
        </div>
        <DepartmentTable rows={departmentRows.slice(0, 6)} />
      </div>

      {/* Rankings Grid */}
      <div className="chart-grid">
        <div className="panel">
          <h3>🏆 Top 10 Students</h3>
          {rankingLoading ? <div className="empty-state">Loading rankings…</div> : <RankingTable rows={ranking?.topStudents} onStudentClick={(regNo) => setModal({ type: "student", regNo })} />}
        </div>
        <div className="panel">
          <h3>📉 Least 10 Students</h3>
          {rankingLoading ? <div className="empty-state">Loading rankings…</div> : <RankingTable rows={ranking?.leastStudents} onStudentClick={(regNo) => setModal({ type: "student", regNo })} />}
        </div>
      </div>

      {/* Department Summary Modal */}
      {modal?.type === "departments" && (
        <Modal title="Department-wise Dashboard Summary" onClose={() => setModal(null)} wide>
          <DepartmentTable rows={departmentRows} />
        </Modal>
      )}

      {/* KPI Drill-down Modal */}
      {modal?.type === "kpi" && (
        <Modal title={`${modal.label} — Department Breakdown`} onClose={() => setModal(null)}>
          <KpiBreakdownTable rows={departmentRows} metric={modal.metric} label={modal.label} />
        </Modal>
      )}

      {/* Compact Student Profile Modal */}
      {modal?.type === "student" && (
        <StudentProfileModal token={token} regNo={modal.regNo} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
