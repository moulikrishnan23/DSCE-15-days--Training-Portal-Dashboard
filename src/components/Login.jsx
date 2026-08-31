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
          <img
            src="/logo.png"
            alt="Dhanalakshmi Srinivasan College of Engineering"
            width={85}
            height={85}
            className="login-logo"
          />
          <div className="brand-badge" style={{ marginTop: 12 }}>
            Official Training Portal
          </div>
        </div>

        <h1>DSCE Training Management</h1>
        <p className="sub">15-Day Placement Training & Assessment Portal</p>
        <p className="login-affiliation">
          Dhanalakshmi Srinivasan College of Engineering & LeSuccess
        </p>

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

        <div className="login-disclaimer">
          🔒 <strong>Authorized Staff Only:</strong> This internal portal is restricted
          to authorized DSCE faculty, trainers, and LeSuccess administrators.
        </div>

        <div className="login-footer">
          <div>Dhanalakshmi Srinivasan College of Engineering, Coimbatore</div>
          <div style={{ marginTop: 4, opacity: 0.8 }}>
            © DSCE & LeSuccess Training Management Portal. All rights reserved.
          </div>
        </div>
      </div>
    </div>
  );
}
