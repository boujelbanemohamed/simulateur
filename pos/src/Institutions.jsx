import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "./api.js";

export default function Institutions({ onLogout }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(null);
  const [form, setForm] = useState({ bin: "", name: "", country: "788", network: "VISA", role: "ISSUER", acquirerId: "" });

  const bounce = useCallback((e) => { if (e.message === "UNAUTH") onLogout(); else setErr(e.message); }, [onLogout]);

  const load = useCallback(async () => {
    try {
      const r = await authedFetch("/api/admin/institutions");
      setList(await r.json());
    } catch (e) { bounce(e); }
  }, [bounce]);

  useEffect(() => { load(); }, [load]);

  async function submit() {
    setErr(null); setOk(null); setLoading(true);
    try {
      const body = {
        bin: form.bin,
        name: form.name,
        country: form.country,
        network: form.network,
        role: form.role,
        acquirer_id: form.acquirerId || null,
      };
      const r = await authedFetch("/api/admin/institutions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        setOk("Institution créée.");
        setForm({ bin: "", name: "", country: "788", network: "VISA", role: "ISSUER", acquirerId: "" });
        load();
      } else {
        const d = await r.json().catch(() => ({}));
        setErr(d.error || "Erreur inconnue");
      }
    } catch (e) { bounce(e); }
    finally { setLoading(false); }
  }

  return (
    <div className="dash">
      <div className="dash-bar">
        <div><strong style={{ fontSize: 18 }}>Institutions financières</strong></div>
        <button className="link-btn" onClick={load}>↻</button>
      </div>

      {err && <p className="login-error">{err}</p>}
      {ok && <div className="response response-ok"><div className="response-head"><span className="response-badge">✓</span> {ok}</div></div>}

      <div className="dash-grid">
        <section className="panel">
          <div className="panel-head"><h2 className="wire-title">Nouvelle institution</h2></div>

          <div className="field">
            <span>BIN / IIN</span>
            <input value={form.bin} onChange={(e) => setForm({ ...form, bin: e.target.value })} placeholder="ex: 400100" />
          </div>
          <div className="field">
            <span>Nom</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ex: Acquirer Bank" />
          </div>
          <div className="field">
            <span>Pays (ISO numérique)</span>
            <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="788" />
          </div>
          <div className="field">
            <span>Réseau</span>
            <select value={form.network} onChange={(e) => setForm({ ...form, network: e.target.value })}>
              <option>VISA</option><option>MASTERCARD</option>
            </select>
          </div>
          <div className="field">
            <span>Rôle</span>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option>ISSUER</option><option>ACQUIRER</option><option>BOTH</option>
            </select>
          </div>
          <div className="field">
            <span>Acquirer ID (DE-32)</span>
            <input value={form.acquirerId} onChange={(e) => setForm({ ...form, acquirerId: e.target.value })} placeholder="requis si ACQUIRER/BOTH" />
          </div>
          <button className="send" onClick={submit} disabled={loading}>
            {loading ? "Création…" : "Créer l'institution"}
          </button>
        </section>

        <section className="panel">
          <div className="panel-head"><h2 className="wire-title">Liste des institutions</h2></div>
          <table className="fieldtable">
            <thead><tr><td className="ft-num">ID</td><td>BIN</td><td>Nom</td><td>Réseau</td><td>Rôle</td><td>DE-32</td></tr></thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan={6} className="muted">Aucune institution.</td></tr>}
              {list.map((fi) => (
                <tr key={fi.id}>
                  <td className="ft-num">{fi.id}</td>
                  <td className="ft-val">{fi.bin}</td>
                  <td>{fi.name}</td>
                  <td><span className="tag tag-ok" style={fi.network === "MASTERCARD" ? { color: "var(--amber)", background: "rgba(242,182,90,.14)" } : {}}>{fi.network}</span></td>
                  <td><span className="tag" style={fi.role === "ISSUER" ? { color: "var(--cyan)", background: "rgba(91,192,235,.12)" } : fi.role === "BOTH" ? { color: "var(--green)", background: "rgba(61,214,140,.12)" } : {}}>{fi.role}</span></td>
                  <td className="ft-val">{fi.acquirer_id || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
