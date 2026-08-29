import { useEffect, useState, useCallback } from "react";
import { callServer } from "./services/appsScript";
import Login from "./components/Login";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Attendance from "./pages/Attendance";
import Syllabus from "./pages/Syllabus";
import Tests from "./pages/Tests";
import PostTest from "./pages/PostTest";
import MockInterview from "./pages/MockInterview";
import { PrePost } from "./pages/SimpleTables";
import AdminSheetManager from "./pages/AdminSheetManager";
import Performance from "./pages/Performance";

const SESSION_KEY = "dsce_portal_session";

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      return saved ? JSON.parse(saved).user || null : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      return saved ? JSON.parse(saved).token || null : null;
    } catch {
      return null;
    }
  });

  const [page, setPage] = useState("dashboard");
  const [departments, setDepartments] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState("All");
  const [trainingDayStatus, setTrainingDayStatus] = useState({ postTestVisible: false, completedDays: 0 });
  const [restoring, setRestoring] = useState(Boolean(token));
  const [toast, setToast] = useState({ message: "", type: "" });

  useEffect(() => {
    if (!token) {
      setRestoring(false);
      return;
    }

    let active = true;

    async function restoreSession() {
      try {
        const result = await callServer("validateSession", token);

        if (!active) return;

        if (result?.success && result?.user) {
          setUser(result.user);
        } else {
          console.warn("Session validation failed:", result);
        }
      } catch (error) {
        console.warn("Session validation error:", error);
      } finally {
        if (active) {
          setRestoring(false);
        }
      }
    }

    restoreSession();

    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;

    // Load initial metadata in parallel with caching
    Promise.all([
      callServer("getDepartmentList", token),
      callServer("getTrainingDayStatus", token)
    ])
      .then(([deptRes, dayRes]) => {
        if (deptRes?.success) {
          if (deptRes.departmentDetails && deptRes.departmentDetails.length > 0) {
            setDepartments(deptRes.departmentDetails);
          } else if (deptRes.departments) {
            setDepartments(deptRes.departments);
          }
        }
        if (dayRes?.success) {
          setTrainingDayStatus(dayRes);
        }
      })
      .catch(() => {});
  }, [token]);

  function login(result) {
    if (!result?.success || !result?.sessionToken || !result?.user) {
      console.error("Invalid login response:", result);
      return;
    }

    const session = {
      token: result.sessionToken,
      user: result.user,
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(session));

    setToken(result.sessionToken);
    setUser(result.user);
    setPage("dashboard");
  }

  async function logout() {
    try {
      if (token) {
        await callServer("logout", token);
      }
    } catch {
    } finally {
      localStorage.removeItem(SESSION_KEY);
      setToken(null);
      setUser(null);
      setPage("dashboard");
    }
  }

  const onMessage = useCallback((message, type = "") => {
    setToast({ message, type });
    window.clearTimeout(window.__dsceToast);
    window.__dsceToast = window.setTimeout(
      () => setToast({ message: "", type: "" }),
      3500,
    );
  }, []);

  if (restoring) {
    return (
      <div className="loading-overlay">
        <div className="spinner" />
      </div>
    );
  }

  if (!user || !token) return <Login onLogin={login} />;

  const propsCommon = {
    token,
    user,
    selectedDepartment,
    trainingDayStatus,
    onMessage,
  };

  let content;
  switch (page) {
    case "attendance":
      content = <Attendance {...propsCommon} />;
      break;
    case "syllabus":
      content = <Syllabus {...propsCommon} />;
      break;
    case "tests":
      content = <Tests {...propsCommon} />;
      break;
    case "posttest":
      content = <PostTest {...propsCommon} />;
      break;
    case "mock":
      content = <MockInterview {...propsCommon} />;
      break;
    case "performance":
      content = <Performance {...propsCommon} />;
      break;
    case "prepost":
      content = <PrePost {...propsCommon} />;
      break;
    case "sheetmanager":
      content = <AdminSheetManager {...propsCommon} />;
      break;
    default:
      content = <Dashboard {...propsCommon} />;
      break;
  }

  return (
    <>
      <Layout
        user={user}
        page={page}
        setPage={setPage}
        departments={departments}
        selectedDepartment={selectedDepartment}
        onDepartmentChange={setSelectedDepartment}
        postTestVisible={trainingDayStatus?.postTestVisible}
        onLogout={logout}
      >
        {content}
      </Layout>

      {toast.message && (
        <div className={`toast ${toast.type}`} style={{ display: "block" }}>
          {toast.message}
        </div>
      )}
    </>
  );
}
