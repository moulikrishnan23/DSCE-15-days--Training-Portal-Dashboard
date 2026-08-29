import { useState, useEffect, useRef, useMemo } from "react";
import { callServer } from "../services/appsScript";
import { LoadingSpinner, ErrorState, ReadOnlyNotice, Modal } from "../components/Common";
import Chart from "chart.js/auto";

export default function Performance({ token, user, selectedDepartment, onMessage }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(null);

  const currentDep = selectedDepartment === "All" ? null : selectedDepartment;

  useEffect(() => {
    loadStudents();
  }, [token, currentDep]);

  async function loadStudents() {
    setLoading(true);
    setError(null);
    try {
      const res = await callServer("getAttendance", token, currentDep || "");
      if (res?.success) {
        setData(res);
      } else {
        setError(res?.message || "Failed to fetch student directory.");
      }
    } catch (err) {
      setError(err.message || "Failed to load student directory.");
    } finally {
      setLoading(false);
    }
  }

  async function openProfile(student) {
    setSelectedStudent(student);
    setProfileLoading(true);
    setProfileError(null);
    setProfileData(null);
    try {
      const res = await callServer("getStudentProfile", token, student.regNo);
      if (res?.success) {
        setProfileData(res);
      } else {
        setProfileError(res?.message || "Failed to load profile.");
      }
    } catch (err) {
      setProfileError(err.message || "Error loading profile.");
    } finally {
      setProfileLoading(false);
    }
  }

  const students = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return (data?.students || []).filter((s) =>
      !q || (s.name || "").toLowerCase().includes(q) || String(s.regNo || "").toLowerCase().includes(q)
    );
  }, [data, searchTerm]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} onRetry={loadStudents} />;

  return (
    <div>
      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <h3 style={{ margin: 0 }}>🎓 Student Directory ({currentDep || "All Departments"})</h3>
          <div className="field search-box" style={{ margin: 0, minWidth: 260 }}>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="🔍 Search by name or register number..."
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", width: "100%" }}
            />
          </div>
        </div>

        <div className="table-wrap" style={{ maxHeight: "65vh" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: "10%" }}>S.No</th>
                <th style={{ width: "25%" }}>Reg. Number</th>
                <th style={{ width: "40%" }}>Student Name</th>
                <th style={{ width: "25%" }}>Department</th>
              </tr>
            </thead>
            <tbody>
              {students.map((st) => (
                <tr
                  key={st.rowIdx}
                  onClick={() => openProfile(st)}
                  style={{ cursor: "pointer" }}
                  className="hover-row"
                  title="Click to view student profile & test graph"
                >
                  <td>{st.sNo}</td>
                  <td style={{ fontWeight: 600, color: "var(--text-muted)" }}>{st.regNo || "N/A"}</td>
                  <td style={{ fontWeight: 600, color: "var(--primary)" }}>{st.name}</td>
                  <td><span className="pill pill-upcoming">{st.dept || data?.department || currentDep || "Department"}</span></td>
                </tr>
              ))}
              {students.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty-state">No students found matching "{searchTerm}".</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedStudent && (
        <Modal title={selectedStudent.name} onClose={() => setSelectedStudent(null)}>
          {profileLoading ? (
            <LoadingSpinner />
          ) : profileError ? (
            <ErrorState message={profileError} />
          ) : profileData ? (
            <StudentProfileView res={profileData} student={selectedStudent} />
          ) : null}
        </Modal>
      )}
    </div>
  );
}

function StudentProfileView({ res, student }) {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  const profile = res.profile || {};
  const att = res.attendance || {};
  const testScores = res.testScores || [];
  const postTest = res.postTest;
  const mockInterview = res.mockInterview;

  useEffect(() => {
    if (!chartRef.current) return;
    if (chartInstance.current) chartInstance.current.destroy();

    const labels = [];
    const scores = [];

    testScores.forEach((t) => {
      labels.push(t.testName);
      scores.push(Number(t.percentage) || 0);
    });

    if (postTest) {
      labels.push("Post Test");
      scores.push(Number(postTest.percentage) || 0);
    }
    if (mockInterview) {
      labels.push("Mock Interview");
      scores.push(Number(mockInterview.percentage) || 0);
    }

    if (labels.length > 0) {
      chartInstance.current = new Chart(chartRef.current, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Score %",
              data: scores,
              borderColor: "#1A365D",
              backgroundColor: "rgba(26,54,93,0.1)",
              tension: 0.3,
              fill: true,
              pointRadius: 4,
              pointBackgroundColor: "#1A365D",
            },
          ],
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

    return () => {
      if (chartInstance.current) chartInstance.current.destroy();
    };
  }, [testScores, postTest, mockInterview]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid var(--border)", fontSize: 13 }}>
        <div><strong>Reg No:</strong> {profile.regNo || student.regNo}</div>
        <div><strong>Dept:</strong> <span className="pill pill-upcoming">{profile.department || student.dept}</span></div>
      </div>

      {/* Compact 4-Card Attendance Grid */}
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

      {/* Performance Progression Graph */}
      {(testScores.length > 0 || postTest || mockInterview) && (
        <div style={{ marginBottom: 14, background: "var(--background)", borderRadius: 6, padding: 10, border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--primary)", marginBottom: 6 }}>Performance Progression Graph</div>
          <div style={{ height: 130 }}>
            <canvas ref={chartRef} />
          </div>
        </div>
      )}

      {/* Assessment Scores Table */}
      <div className="table-wrap" style={{ maxHeight: "160px" }}>
        <table className="data-table" style={{ fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ padding: "6px 8px" }}>Assessment</th>
              <th style={{ padding: "6px 8px" }}>Score</th>
              <th style={{ padding: "6px 8px" }}>Percentage</th>
            </tr>
          </thead>
          <tbody>
            {testScores.map((t, i) => (
              <tr key={i}>
                <td style={{ padding: "5px 8px" }}>{t.testName}</td>
                <td style={{ padding: "5px 8px" }}>{t.total}</td>
                <td style={{ padding: "5px 8px", fontWeight: 700, color: "var(--primary)" }}>{t.percentage}%</td>
              </tr>
            ))}
            {postTest && (
              <tr>
                <td style={{ padding: "5px 8px" }}>Post Test</td>
                <td style={{ padding: "5px 8px" }}>{postTest.total}</td>
                <td style={{ padding: "5px 8px", fontWeight: 700, color: "var(--primary)" }}>{postTest.percentage}%</td>
              </tr>
            )}
            {mockInterview && (
              <tr>
                <td style={{ padding: "5px 8px" }}>Mock Interview</td>
                <td style={{ padding: "5px 8px" }}>{mockInterview.score}</td>
                <td style={{ padding: "5px 8px", fontWeight: 700, color: "var(--primary)" }}>{mockInterview.percentage}%</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
