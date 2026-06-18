import { useState } from "react";
import Terminal from "./Terminal.jsx";
import Login from "./Login.jsx";
import Dashboard from "./Dashboard.jsx";
import { getToken } from "./api.js";

export default function App() {
  const [tab, setTab] = useState("terminal");
  const [authed, setAuthed] = useState(!!getToken());

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="dot" /> Flossx83</div>
        <nav className="tabs">
          <button className={tab === "terminal" ? "tab tab-on" : "tab"} onClick={() => setTab("terminal")}>Terminal</button>
          <button className={tab === "admin" ? "tab tab-on" : "tab"} onClick={() => setTab("admin")}>Supervision</button>
        </nav>
        <div className="endpoint">{tab === "terminal" ? "→ POST /api/iso8583" : "clearing"}</div>
      </header>

      {tab === "terminal"
        ? <Terminal />
        : authed
          ? <Dashboard onLogout={() => setAuthed(false)} />
          : <Login onLogin={() => setAuthed(true)} />}
    </div>
  );
}
