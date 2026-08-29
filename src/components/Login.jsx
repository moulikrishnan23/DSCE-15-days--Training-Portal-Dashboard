import { useState } from "react";
import { callServer } from "../services/appsScript";

export default function Login({ onLogin }) {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!userId || !password) {
      setError("Please enter User ID and Password.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await callServer("login", userId, password);
      if (res?.success) {
        onLogin(res);
      } else {
        setError(res?.message || "Invalid credentials.");
      }
    } catch (err) {
      setError(
        err.message || "Failed to log in. Please check network connection.",
      );
    } finally {
      setLoading(false);
    }
  }

  function applyPreset(u, p) {
    setUserId(u);
    setPassword(p);
    setError("");
  }

  return (
    <div id="loginScreen">
      <div className="login-card">
        <div className="brand-header">
          <span className="">
            <img
              src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSI1shkPCjPeepEgAVgD9sYwiNaYlB5N-XTLZOTA-z2StUwdFcLMSswouU&s=10"
              alt=""
              width={100}
              height={100}
            />
          </span>
        </div>
        <h1>DSCE Training Management</h1>
        <p className="sub">15-Day Training & Assessment Portal</p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>User ID / Employee ID</label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="e.g. 1001, LES01, DSCE01"
              required
            />
          </div>

          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        {error && <div id="loginError">{error}</div>}

        {/* <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px dashed var(--border)", textAlign: "left" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase" }}>
            Demo Quick Credentials
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button
              type="button"
              className="btn btn-outline"
              style={{ fontSize: 11.5, justifyContent: "space-between" }}
              onClick={() => applyPreset("1001", "admin@lesuccess")}
            >
              <span>🔑 <strong>LeSuccess Admin</strong> (Full + Portal)</span>
              <small>1001</small>
            </button>
            <button
              type="button"
              className="btn btn-outline"
              style={{ fontSize: 11.5, justifyContent: "space-between" }}
              onClick={() => applyPreset("1002", "admin@dsce")}
            >
              <span>👁️ <strong>College Admin</strong> (Read-Only)</span>
              <small>1002</small>
            </button>
            <button
              type="button"
              className="btn btn-outline"
              style={{ fontSize: 11.5, justifyContent: "space-between" }}
              onClick={() => applyPreset("1003", "trainer@123")}
            >
              <span>✎ <strong>Trainer</strong> (Operational Edit)</span>
              <small>1003</small>
            </button>
          </div>
        </div> */}

        <div className="login-footer">
          Dhanalakshmi Srinivasan College of Engineering & LeSuccess Portal
        </div>
      </div>
    </div>
  );
}
