import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Chart } from "chart.js/auto";
import { callServer } from "../services/appsScript";
import { ErrorState, SkeletonCards, SkeletonCharts, ReadOnlyNotice, Modal } from "../components/Common";

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
  winHtml(w, title, table.outerHTML);
}

function winHtml(w, title, htmlContent) {
  w.document.write("<html><head><title>" + title + "</title>");
  w.document.write("<style>body{font-family:Arial,sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:12px}th{background:#0B3D5C;color:#fff}@media print{button{display:none}}</style>");
  w.document.write("</head><body><h2>" + title + "</h2>");
  w.document.write(htmlContent);
  w.document.write("</body></html>");
  w.document.close();
  w.onload = function () { w.print(); };
}

/* ─── KPI Breakdown Table (used inside drill-down card modals) ─── */
function KpiBreakdownTable({ rows, metric, label }) {
  if (!rows?.length) return <div className="empty-state">No data available.</div>;
  return (
    <div className="table-wrap" style={{ maxHeight: "50vh" }}>
      <table className="data-table" id="kpi-breakdown-table">
        <thead>
          <tr>
            <th>Department</th>
            <th>Total Students</th>
            <th>{label || "Students Count (Present)"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const val = r[metric];
            let displayVal = val;
            if (typeof val === "number") {
              if (metric.includes("Pct") || metric.includes("Average") || metric.includes("Avg") || metric.includes("improvement")) {
                displayVal = pct(val);
              } else {
                displayVal = val;
              }
            } else if (val === undefined || val === null) {
              displayVal = 0;
            }
            return (
              <tr key={r.department}>
                <td><strong>{r.department}</strong></td>
                <td>{r.students ?? r.count ?? 0}</td>
                <td style={{ fontWeight: 700, color: "var(--primary)" }}>{displayVal}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Department Table (Full summary with Day 15 column filtering) ─── */
function DepartmentTable({ rows, hidePostTest }) {
  if (!rows?.length) return <div className="empty-state">No department data available.</div>;
  return (
    <div className="table-wrap" style={{ maxHeight: "50vh" }}>
      <table className="data-table" id="dept-summary-table">
        <thead>
          <tr>
            <th>Department</th>
            <th>Students</th>
            <th>Attendance</th>
            <th>Pre-Test</th>
            {!hidePostTest && <th>Post-Test</th>}
            {!hidePostTest && <th>Improvement</th>}
            <th>Mock Avg</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.department}>
              <td><strong>{row.department}</strong></td>
              <td>{row.count}</td>
              <td>{pct(row.attendancePct)}</td>
              <td>{pct(row.preTestAverage)}</td>
              {!hidePostTest && <td>{pct(row.postTestAverage)}</td>}
              {!hidePostTest && <td>{pct(row.improvement)}</td>}
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

/* ─── Compact Student Profile Modal ─── */
function StudentProfileModal({ token, regNo, hidePostTest, onClose }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  useEffect(() => {
    let active = true;
    callServer("getStudentProfile", token, regNo)
      .then((res) => {
        if (!active) return;
        if (res?.success) setProfile(res);
        else setError(res?.message || "Failed to load student profile.");
      })
      .catch((err) => {
        if (active) setError(err.message || "Error loading profile.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [token, regNo]);

  useEffect(() => {
    if (!profile || !chartRef.current) return;
    if (chartInstance.current) chartInstance.current.destroy();

    const labels = [];
    const scores = [];

    (profile.testScores || []).forEach((t) => {
      labels.push(t.testName);
      scores.push(Number(t.percentage) || 0);
    });

    if (profile.postTest && !hidePostTest) {
      labels.push("Post Test");
      scores.push(Number(profile.postTest.percentage) || 0);
    }
    if (profile.mockInterview) {
      labels.push("Mock Interview");
      scores.push(Number(profile.mockInterview.percentage) || 0);
    }

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
            tension: 0.3,
            fill: true,
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
  }, [profile, hidePostTest]);

  if (loading) {
    return (
      <Modal title="Student Profile" onClose={onClose}>
        <div style={{ padding: "40px 20px", textAlign: "center" }}>
          <div className="spinner" style={{ margin: "0 auto 12px auto" }} />
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading student profile...</div>
        </div>
      </Modal>
    );
  }

  if (error || !profile) {
    return (
      <Modal title="Student Profile" onClose={onClose}>
        <div className="panel empty-state">
          <p style={{ color: "var(--danger)" }}>⚠️ {error || "Student record not found."}</p>
        </div>
      </Modal>
    );
  }

  const p = profile.profile || {};
  const att = profile.attendance || {};

  return (
    <Modal title={p.name || "Student Profile"} onClose={onClose}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid var(--border)", fontSize: 13 }}>
        <div><strong>Reg No:</strong> {p.regNo || regNo}</div>
        <div><strong>Dept:</strong> <span className="pill pill-upcoming">{p.department}</span></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
        <div style={{ background: "var(--background)", borderRadius: 6, padding: "8px 10px", textAlign: "center", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Present</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--success)", marginTop: 2 }}>{att.present ?? "-"}</div>
        </div>
        <div style={{ background: "var(--background)", borderRadius: 6, padding: "8px 10px", textAlign: "center", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Absent</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--danger)", marginTop: 2 }}>{att.absent ?? "-"}</div>
        </div>
        <div style={{ background: "var(--background)", borderRadius: 6, padding: "8px 10px", textAlign: "center", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Half Day</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--warning)", marginTop: 2 }}>{att.halfDay ?? "-"}</div>
        </div>
        <div style={{ background: "var(--background)", borderRadius: 6, padding: "8px 10px", textAlign: "center", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>Attendance</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--primary)", marginTop: 2 }}>{att.percentage ?? 0}%</div>
        </div>
      </div>

      {(profile.testScores?.length > 0 || (profile.postTest && !hidePostTest) || profile.mockInterview) && (
        <div style={{ marginBottom: 14, background: "var(--background)", borderRadius: 6, padding: 10, border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--primary)", marginBottom: 6 }}>Performance Progression Graph</div>
          <div style={{ height: 130 }}>
            <canvas ref={chartRef} />
          </div>
        </div>
      )}

      <div className="table-wrap" style={{ maxHeight: "160px" }}>
        <table className="data-table" style={{ fontSize: 12 }}>
          <thead><tr><th style={{ padding: "6px 8px" }}>Assessment</th><th style={{ padding: "6px 8px" }}>Score</th><th style={{ padding: "6px 8px" }}>Percentage</th></tr></thead>
          <tbody>
            {(profile.testScores || []).map((t, i) => (
              <tr key={i}><td style={{ padding: "5px 8px" }}>{t.testName}</td><td style={{ padding: "5px 8px" }}>{t.total}</td><td style={{ padding: "5px 8px", fontWeight: 700, color: "var(--primary)" }}>{t.percentage}%</td></tr>
            ))}
            {profile.postTest && !hidePostTest && <tr><td style={{ padding: "5px 8px" }}>Post Test</td><td style={{ padding: "5px 8px" }}>{profile.postTest.total}</td><td style={{ padding: "5px 8px", fontWeight: 700, color: "var(--primary)" }}>{profile.postTest.percentage}%</td></tr>}
            {profile.mockInterview && <tr><td style={{ padding: "5px 8px" }}>Mock Interview</td><td style={{ padding: "5px 8px" }}>{profile.mockInterview.score}</td><td style={{ padding: "5px 8px", fontWeight: 700, color: "var(--primary)" }}>{profile.mockInterview.percentage}%</td></tr>}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

/* ─── Main Dashboard Component ─── */
export default function Dashboard({ token, user, selectedDepartment, trainingDayStatus, onMessage }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null);
  const deptChartRef = useRef(null);
  const attendanceChartRef = useRef(null);
  const charts = useRef([]);

  const role = (user?.role || "").toLowerCase();
  const isCollegeAdmin = role.includes("college");
  const postTestVisible = Boolean(trainingDayStatus?.postTestVisible);
  const hidePostTest = isCollegeAdmin && !postTestVisible && !data?.kpis?.postTestUnlocked;

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setData(null); // Show loading state immediately on department switch
    setError(null);
    try {
      const result = await callServer("getDashboardData", token, selectedDepartment);
      if (!result?.success) throw new Error(result?.message || "Unable to load dashboard.");
      setData(result);
    } catch (err) {
      setError(err.message || "Unable to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, [token, selectedDepartment]);

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

  /* Modern KPI Cards with Total Students present count drilldown */
  const cards = useMemo(() => {
    if (!k) return [];
    const hasAttendanceStarted = (Number(k.presentToday) > 0 || Number(k.completedDays) > 0 || Number(k.halfDayToday) > 0 || Number(k.absentToday) > 0);
    const displayDay = hasAttendanceStarted ? (k.trainingDay || 1) : 0;

    const list = [
      {
        key: "totalStudents",
        title: "Total Students",
        value: k.totalStudents,
        sub: selectedDepartment === "All" ? `${k.totalDepartments || 1} Departments` : selectedDepartment,
        pill: "Total Strength",
        pillClass: "pill-active",
        metric: "presentCount",
        label: "Students Count (Present)",
        hasModal: true
      },
      {
        key: "overallAttendance",
        title: "Overall Attendance",
        value: pct(k.overallAttendancePct),
        sub: "All recorded days",
        pill: "Cumulative",
        pillClass: "pill-completed",
        metric: "attendancePct",
        label: "Attendance Rate",
        hasModal: true
      },
      {
        key: "presentToday",
        title: "Present — Latest Entry",
        value: k.presentToday,
        sub: k.attendanceDateLabel || "Latest Day",
        pill: "Present",
        pillClass: "pill-active"
      },
      {
        key: "absentToday",
        title: "Absent — Latest Entry",
        value: k.absentToday,
        sub: k.attendanceDateLabel || "Latest Day",
        pill: "Absent",
        pillClass: "pill-danger"
      },
      {
        key: "halfDayToday",
        title: "Half Day — Latest Entry",
        value: k.halfDayToday,
        sub: k.attendanceDateLabel || "Latest Day",
        pill: "Half Day",
        pillClass: "pill-warning"
      },
      {
        key: "trainingDay",
        title: "Training Day",
        value: `${displayDay} / ${k.totalTrainingDays || 15}`,
        sub: displayDay > 0 ? `Progress: ${Math.round(((k.completedDays || displayDay) / (k.totalTrainingDays || 1)) * 100)}%` : "Not Started",
        pill: displayDay > 0 ? `Day ${displayDay}` : "Day 0",
        pillClass: displayDay > 0 ? "pill-active" : "pill-upcoming"
      },
      {
        key: "completedDays",
        title: "Completed Days",
        value: k.completedDays,
        sub: `${k.completedDays} of ${k.totalTrainingDays} days`,
        pill: "Completed",
        pillClass: "pill-completed"
      },
      {
        key: "remainingDays",
        title: "Remaining Days",
        value: k.remainingDays,
        sub: `${k.remainingDays} days left`,
        pill: "Remaining",
        pillClass: "pill-upcoming"
      },
      {
        key: "preTest",
        title: "Avg Pre-Test",
        value: pct(k.preTestAverage),
        sub: `${k.preTestConducted || 0} evaluated`,
        pill: "Initial",
        pillClass: "pill-active",
        metric: "preTestAverage",
        label: "Pre-Test Avg",
        hasModal: true
      },
    ];

    if (!hidePostTest) {
      list.push(
        {
          key: "postTest",
          title: "Avg Post-Test",
          value: pct(k.postTestAverage),
          sub: `${k.postTestConducted || 0} evaluated`,
          pill: "Final",
          pillClass: "pill-completed",
          metric: "postTestAverage",
          label: "Post-Test Avg",
          hasModal: true
        },
        {
          key: "improvement",
          title: "Avg Improvement",
          value: pct(k.averageImprovement),
          sub: "Post vs Pre",
          pill: (k.averageImprovement || 0) >= 0 ? "Positive" : "Negative",
          pillClass: (k.averageImprovement || 0) >= 0 ? "pill-active" : "pill-danger",
          metric: "improvement",
          label: "Improvement",
          hasModal: true
        }
      );
    }

    list.push(
      {
        key: "mock",
        title: "Mock Interview Avg",
        value: `${(k.mockInterviewAvgScore || 0).toFixed(1)} / 100`,
        sub: `${k.mockInterviewAttended || 0} evaluated`,
        pill: "Interview",
        pillClass: "pill-upcoming",
        metric: "mockInterviewAvg",
        label: "Mock Interview Avg",
        hasModal: true
      }
    );

    return list;
  }, [k, selectedDepartment, hidePostTest]);

  if (loading && !data) {
    return (
      <div>
        <ReadOnlyNotice user={user} />
        <SkeletonCards count={8} />
        <SkeletonCharts />
      </div>
    );
  }

  if (error && !data) return <ErrorState message={error} onRetry={loadDashboard} />;

  return (
    <div>
      <ReadOnlyNotice user={user} />

      {/* KPI Cards Grid */}
      <div className="kpi-grid">
        {cards.map((card) => (
          <div
            key={card.key}
            className={`kpi-card ${card.hasModal ? "hoverable" : ""}`}
            onClick={() => card.hasModal && setModal({ type: "kpi", card })}
            title={card.hasModal ? "Click to view department breakdown" : undefined}
          >
            <div className="header">
              <div className="title">{card.title}</div>
              <span className={`pill ${card.pillClass}`}>{card.pill}</span>
            </div>
            <div className="value">{card.value}</div>
            <div className="sub">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="chart-grid">
        <div className="panel chart-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Attendance Status</h3>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{k?.attendanceDateLabel || "Latest Training Day"}</span>
          </div>
          <div style={{ height: 260 }}><canvas ref={attendanceChartRef} /></div>
        </div>

        <div className="panel chart-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Department Strength Breakdown</h3>
            <button className="btn btn-outline" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => setModal({ type: "dept-table" })}>🔍 Full Table</button>
          </div>
          <div style={{ height: 260 }}><canvas ref={deptChartRef} /></div>
        </div>
      </div>

      {/* Rankings Grid */}
      <div className="chart-grid" style={{ marginTop: 20 }}>
        <div className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0, color: "var(--success)" }}>🏆 Top 10 Performers</h3>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Assessment Rankings</span>
          </div>
          <RankingTable rows={data?.topStudents || []} onStudentClick={(regNo) => setModal({ type: "student", regNo })} />
        </div>

        <div className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0, color: "var(--danger)" }}>📉 Least 10 Performers</h3>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Needs Mentoring</span>
          </div>
          <RankingTable rows={data?.leastStudents || []} onStudentClick={(regNo) => setModal({ type: "student", regNo })} />
        </div>
      </div>

      {/* Modals */}
      {modal?.type === "student" && (
        <StudentProfileModal token={token} regNo={modal.regNo} hidePostTest={hidePostTest} onClose={() => setModal(null)} />
      )}
      {modal?.type === "kpi" && (
        <Modal title={`${modal.card.title} Breakdown`} onClose={() => setModal(null)}>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 10 }}>
            <button className="btn btn-outline" onClick={() => downloadExcel("kpi-breakdown-table", `${modal.card.key}_breakdown`)}>📥 Excel</button>
            <button className="btn btn-outline" onClick={() => downloadPdf(`${modal.card.title} Breakdown`, "kpi-breakdown-table")}>📄 PDF</button>
          </div>
          <KpiBreakdownTable rows={departmentRows} metric={modal.card.metric} label={modal.card.label} />
        </Modal>
      )}
      {modal?.type === "dept-table" && (
        <Modal title="All Department Summary Report" onClose={() => setModal(null)} wide>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 10 }}>
            <button className="btn btn-outline" onClick={() => downloadExcel("dept-summary-table", "department_summary")}>📥 Excel</button>
            <button className="btn btn-outline" onClick={() => downloadPdf("Department Summary Report", "dept-summary-table")}>📄 PDF</button>
          </div>
          <DepartmentTable rows={departmentRows} hidePostTest={hidePostTest} />
        </Modal>
      )}
    </div>
  );
}
