import { useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../App.jsx";

export default function AuthPage({ mode }) {
  const { login, register } = useApp();
  const isLogin = mode === "login";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (isLogin) await login(email, password);
      else await register(name, email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth-panel">
        <p className="mark">Keel</p>
        <h1>Keep the work in one place, and the conversation on the card.</h1>
        <ul>
          <li>Group projects with a shared board</li>
          <li>Assign cards, set a due date, drag them across</li>
          <li>Comment where the work actually lives</li>
        </ul>
        <div className="auth-sample">
          <article>
            <span className="pri high">High</span>
            <strong>Write the launch announcement</strong>
            <em>Amira · 2 comments</em>
          </article>
          <article>
            <span className="pri urgent">Urgent</span>
            <strong>Review pricing copy</strong>
            <em>Hashim · due tomorrow</em>
          </article>
        </div>
      </section>
      <section className="auth-form">
        <form onSubmit={onSubmit}>
          <h2>{isLogin ? "Sign in" : "Create an account"}</h2>
          <p className="lede">
            {isLogin
              ? "Use a demo account or one you registered."
              : "You’ll land on an empty workspace and can start a project immediately."}
          </p>
          {!isLogin && (
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={isLogin ? "current-password" : "new-password"}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="btn solid" type="submit" disabled={busy}>
            {busy ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
          </button>
          <p className="switch">
            {isLogin ? (
              <>
                New here? <Link to="/register">Create an account</Link>
              </>
            ) : (
              <>
                Already have an account? <Link to="/login">Sign in</Link>
              </>
            )}
          </p>
          {isLogin && (
            <p className="hint">
              Demo: <code>hashim@keel.app</code> / <code>keel123</code>
              <br />
              Also <code>amira@keel.app</code> and <code>leo@keel.app</code>
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
