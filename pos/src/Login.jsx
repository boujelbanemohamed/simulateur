import { useState } from "react";
import { login } from "./api.js";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true); setError(null);
    try { await login(username, password); onLogin(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="login">
      <div className="login-card">
        <h2 className="login-title">Supervision du clearing</h2>
        <p className="login-sub">Connexion administrateur</p>
        <label className="field"><span>Identifiant</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </label>
        <label className="field"><span>Mot de passe</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                 onKeyDown={(e) => e.key === "Enter" && submit()} />
        </label>
        {error && <p className="login-error">{error}</p>}
        <button className="send" onClick={submit} disabled={busy || !password}>
          {busy ? "Connexion…" : "Se connecter"}
        </button>
        <p className="login-hint">Lab uniquement — identifiants par défaut admin / flossx83.</p>
      </div>
    </div>
  );
}
