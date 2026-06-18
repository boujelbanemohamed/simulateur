import { useCallback, useEffect, useState } from "react";
import { authedFetch, logout } from "./api.js";

const fmt = (minor, ccy) => `${(Number(minor || 0) / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} (${ccy || ""})`;
const fmtSize = (b) => (b < 1024 ? `${b} o` : `${(b / 1024).toFixed(1)} Ko`);
const fmtTime = (ts) => { const d = new Date(ts); return d.toLocaleDateString("fr-FR") + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); };

export default function Dashboard({ onLogout }) {
  const [totals, setTotals] = useState([]);
  const [rows, setRows] = useState([]);
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState("");
  const [network, setNetwork] = useState("");
  const [running, setRunning] = useState(false);
  const [runLog, setRunLog] = useState(null);
  const [err, setErr] = useState(null);

  const bounce = useCallback((e) => { if (e.message === "UNAUTH") onLogout(); else setErr(e.message); }, [onLogout]);

  const loadTotals = useCallback(async () => {
    try { const r = await authedFetch("/api/admin/totals"); const d = await r.json(); setTotals(d.byNetwork || []); }
    catch (e) { bounce(e); }
  }, [bounce]);

  const loadFiles = useCallback(async () => {
    try { const r = await authedFetch("/api/admin/files"); setFiles(await r.json()); } catch (e) { bounce(e); }
  }, [bounce]);

  const loadRows = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (status) qs.set("status", status);
      if (network) qs.set("network", network);
      const r = await authedFetch("/api/admin/transactions?" + qs.toString());
      setRows(await r.json());
    } catch (e) { bounce(e); }
  }, [status, network, bounce]);

  useEffect(() => { loadTotals(); loadFiles(); }, [loadTotals, loadFiles]);
  useEffect(() => { loadRows(); }, [loadRows]);

  async function runClearing() {
    setRunning(true); setRunLog(null); setErr(null);
    try {
      const r = await authedFetch("/api/admin/clearing/run", { method: "POST" });
      const d = await r.json();
      setRunLog(d);
      setFiles(d.files || []);
      loadTotals(); loadRows();
    } catch (e) { bounce(e); }
    finally { setRunning(false); }
  }

  async function download(path) {
    try {
      const r = await authedFetch("/api/admin/files/download?path=" + encodeURIComponent(path));
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = path.split("/").pop(); a.click();
      URL.revokeObjectURL(url);
    } catch (e) { bounce(e); }
  }

  return (
    <div className="dash">
      <div className="dash-bar">
        <div className="totals">
          {totals.length === 0 && <span className="muted">Aucune transaction.</span>}
          {totals.map((t) => (
            <div key={t.network} className="total-card">
              <span className="total-net">{t.network}</span>
              <span className="total-amt">{(Number(t.amount_minor) / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2 })}</span>
              <span className="total-meta">{t.count} txn · {t.pending} en attente</span>
            </div>
          ))}
        </div>
        <div className="dash-actions">
          <button className="send run-btn" onClick={runClearing} disabled={running}>
            {running ? "Génération…" : "Générer les fichiers de clearing"}
          </button>
          <button className="link-btn" onClick={() => { logout(); onLogout(); }}>Déconnexion</button>
        </div>
      </div>

      {err && <p className="login-error">{err}</p>}

      {runLog && (
        <div className={`response ${runLog.ok ? "response-ok" : "response-err"}`}>
          <div className="response-head">
            <span className="response-badge">{runLog.ok ? "Batch ✓" : "Batch ✗"}</span>
            <span>code {runLog.exitCode}</span>
          </div>
          <pre className="runlog">{runLog.output}</pre>
        </div>
      )}

      <div className="dash-grid">
        <section className="panel">
          <div className="panel-head">
            <h2 className="wire-title">Transactions</h2>
            <div className="filters">
              <select value={network} onChange={(e) => setNetwork(e.target.value)}>
                <option value="">Tous réseaux</option><option>VISA</option><option>MASTERCARD</option>
              </select>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Tous statuts</option><option>APPROVED</option><option>EXPORTING</option><option>EXPORTED</option>
              </select>
              <button className="link-btn" onClick={loadRows}>↻</button>
            </div>
          </div>
          <table className="fieldtable">
            <thead><tr><td className="ft-num">ID</td><td>Réseau</td><td>STAN</td><td>Montant</td><td>Statut</td></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={5} className="muted">Aucune ligne.</td></tr>}
              {rows.map((t) => (
                <tr key={t.id}>
                  <td className="ft-num">{t.id}</td>
                  <td>{t.network}</td>
                  <td className="ft-val">{t.stan}</td>
                  <td className="ft-val">{fmt(t.amount_minor, t.currency)}</td>
                  <td><span className={`tag ${t.status === "APPROVED" ? "tag-ok" : t.status === "EXPORTED" ? "tag-exp" : "tag-no"}`}>{t.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel">
          <div className="panel-head"><h2 className="wire-title">Fichiers générés</h2><button className="link-btn" onClick={loadFiles}>↻</button></div>
          <table className="fieldtable">
            <thead><tr><td>Fichier</td><td>Date</td><td>Taille</td><td></td></tr></thead>
            <tbody>
              {files.length === 0 && <tr><td colSpan={4} className="muted">Aucun fichier. Cliquez « Générer ».</td></tr>}
              {files.map((f) => (
                <tr key={f.path}>
                  <td className="ft-val file-name">{f.path}</td>
                  <td className="muted">{fmtTime(f.modified)}</td>
                  <td className="muted">{fmtSize(f.size)}</td>
                  <td><button className="link-btn" onClick={() => download(f.path)}>Télécharger</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
