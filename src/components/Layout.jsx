import { useState } from "react";

export const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "📊" },
  { id: "attendance", label: "Attendance", icon: "✓" },
  // { id: "syllabus", label: "Syllabus Tracker", icon: "📅" },
  { id: "tests", label: "Pre-Test / Assessment", icon: "✎" },
  { id: "posttest", label: "Post-Test Report", icon: "📋", day15Only: true },
  { id: "mock", label: "Mock Interview", icon: "🗣️" },
  { id: "performance", label: "Student Performance", icon: "★" },
  { id: "prepost", label: "Pre vs Post Analytics", icon: "📈", day15Only: true },
  // { id: "sheetmanager", label: "Sheet Manager (Portal)", icon: "⚙️", adminOnly: true }
];

export default function Layout({
  user,
  page,
  setPage,
  departments = [],
  selectedDepartment,
  onDepartmentChange,
  postTestVisible = false,
  onLogout,
  children
}) {
  const [open, setOpen] = useState(false);

  const role = (user?.role || "").toLowerCase();
  const isLeSuccessAdmin = role.includes("lesuccess");
  const isCollegeAdmin = role.includes("college");

  const navigate = (id) => {
    setPage(id);
    setOpen(false);
  };

  const roleClass = isLeSuccessAdmin
    ? "role-lesuccess"
    : isCollegeAdmin
    ? "role-college"
    : "role-trainer";

  return (
    <div id="app">
      <div className="shell">
        <aside className={`sidebar ${open ? "open" : ""}`}>
          <div className="sidebar-brand">
            <div className="logo-icon" style={{ marginRight: "10px", background: "transparent" }}>
              <img src="/logo.png" alt="DSCE" width={38} height={38} style={{ borderRadius: "50%", background: "#fff", padding: "2px" }} />
            </div>
            <div className="name">
              DSCE Training
              <small>Management Portal</small>
            </div>
          </div>

          <div className="nav">
            {NAV_ITEMS.map((item) => {
              if (item.adminOnly && !isLeSuccessAdmin) return null;
              // Strict Day 15 visibility restriction for College Admin
              if (item.day15Only && isCollegeAdmin && !postTestVisible) return null;

              return (
                <div
                  key={item.id}
                  className={`nav-item ${page === item.id ? "active" : ""} ${
                    item.adminOnly ? "admin-only" : ""
                  }`}
                  onClick={() => navigate(item.id)}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </div>
              );
            })}
          </div>

          <div className="sidebar-footer">
            <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 10 }}>
              Welcome, <strong>{user.name}</strong>
              <br />
              <span style={{ fontSize: 11, opacity: 0.75 }}>
                {user.role} · {user.employeeId}
              </span>
            </div>
            <button onClick={onLogout}>Logout</button>
          </div>
        </aside>

        <main className="main">
          <div className="topbar">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                className="mobile-nav-toggle"
                onClick={() => setOpen((v) => !v)}
              >
                ☰
              </button>
              <h2>
                {NAV_ITEMS.find((item) => item.id === page)?.label || "Dashboard"}
              </h2>
            </div>

            {/* Department Filter Selector */}
            <div className="department-selector">
              <span>Department:</span>
              <select
                value={selectedDepartment}
                onChange={(e) => onDepartmentChange(e.target.value)}
              >
                <option value="All">All Departments</option>
                {departments.map((d) => {
                  const deptName = typeof d === "object" ? d.name : d;
                  const displayLabel = typeof d === "object"
                    ? (d.displayName || (d.room ? `${d.name} - ${d.room}` : d.name))
                    : d;
                  return (
                    <option key={deptName} value={deptName}>
                      {displayLabel}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="user-chip">
              <span className={`role-badge ${roleClass}`}>{user.role}</span>
              <div className="avatar">
                {(user.name || "?").charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>{user.name}</div>
                <div style={{ color: "var(--text-muted)", fontSize: 11.5 }}>
                  ID: {user.employeeId}
                </div>
              </div>
            </div>
          </div>

          <div className="content">{children}</div>
        </main>
      </div>
    </div>
  );
}
