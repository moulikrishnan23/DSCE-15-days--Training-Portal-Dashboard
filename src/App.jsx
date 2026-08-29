import { useEffect, useState, useCallback } from "react";
import { callServer } from "./services/appsScript";
import Layout from "./components/Layout";
import Login from "./components/Login";
import Dashboard from "./pages/Dashboard";
import Attendance from "./pages/Attendance";
import Syllabus from "./pages/Syllabus";
import Tests from "./pages/Tests";
import PostTest from "./pages/PostTest";
import MockInterview from "./pages/MockInterview";
import Performance from "./pages/Performance";
import { PrePost } from "./pages/SimpleTables";

const SESSION_KEY = "dsce_training_portal_session_v1";

export default function App() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [departments, setDepartments] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState("All");
  const [trainingDayStatus, setTrainingDayStatus] = useState(null);
  const [toast, setToast] = useState({ message: "", type: "" });
  const [restoring, setRestoring] = useState(true);

  // Restore session
  useEffect(() => {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) {
      setRestoring(false);
      return;
    }

    try {
      const data = JSON.parse(raw);
      if (data?.token && data?.user) {
        callServer("validateSession", data.token)
          .then((res) => {
            if (res?.success && res?.user) {
              setToken(data.token);
              setUser(res.user);
            } else {
              localStorage.removeItem(SESSION_KEY);
              setToken(null);
              setUser(null);
            }
          })
          .catch(() => {
            setToken(data.token);
            setUser(data.user);
          })
          .finally(() => setRestoring(false));
      } else {
        localStorage.removeItem(SESSION_KEY);
        setRestoring(false);
      }
    } catch {
      localStorage.removeItem(SESSION_KEY);
      setRestoring(false);
    }
  }, []);

  // Sync token to window for legacy helpers
  useEffect(() => {
    if (token) {
      window.__DSCE_SESSION_TOKEN__ = token;
      window.SESSION_TOKEN = token;
    } else {
      delete window.__DSCE_SESSION_TOKEN__;
      delete window.SESSION_TOKEN;
    }
  }, [token]);

  // Load departments & day status once authenticated
  useEffect(() => {
    if (!token) return;

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

  const role = (user?.role || "").toLowerCase();
  const isCollegeAdmin = role.includes("college");
  const postTestVisible = Boolean(trainingDayStatus?.postTestVisible);

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
      content = isCollegeAdmin && !postTestVisible ? <Dashboard {...propsCommon} /> : <PostTest {...propsCommon} />;
      break;
    case "mock":
      content = <MockInterview {...propsCommon} />;
      break;
    case "performance":
      content = <Performance {...propsCommon} />;
      break;
    case "prepost":
      content = isCollegeAdmin && !postTestVisible ? <Dashboard {...propsCommon} /> : <PrePost {...propsCommon} />;
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
        postTestVisible={postTestVisible}
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
