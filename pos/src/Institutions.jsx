import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "./api.js";

export default function Institutions({ onLogout }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(null);
  const [form, setForm] = useState({ bin: "", name: "", country: "788", network: "VISA", role: "ISSUER", acquirerId: "" });
  const [editingId, setEditingId] = useState(null);

  const bounce = useCallback((e) => { if (e.message === "UNAUTH") onLogout(); else setErr(e.message); }, [onLogout]);

  const load = useCallback(async () => {
    try {
      const r = await authedFetch("/api/admin/institutions");
      setList(await r.json());
    } catch (e) { bounce(e); }
  }, [bounce]);

  useEffect(() => { load(); }, [load]);

  function resetForm() {
    setForm({ bin: "", name: "", country: "788", network: "VISA", role: "ISSUER", acquirerId: "" });
    setEditingId(null);
  }

  function fillForm(fi) {
    setForm({ bin: fi.bin || "", name: fi.name || "", country: fi.country || "788", network: fi.network || "VISA", role: fi.role || "ISSUER", acquirerId: fi.acquirer_id || "" });
    setEditingId(fi.id);
  }

  async function submit() {
    setErr(null); setOk(null); setLoading(true);
    try {
      const isEdit = editingId != null;
      const body = isEdit
        ? { name: form.name, country: form.country, network: form.network, role: form.role, acquirer_id: form.acquirerId || null }
        : { bin: form.bin, name: form.name, country: form.country, network: form.network, role: form.role, acquirer_id: form.acquirerId || null };
      const url = isEdit ? `/api/admin/institutions/${editingId}` : "/api/admin/institutions";
      const r = await authedFetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        setOk(isEdit ? "Institution modifiée." : "Institution créée.");
        resetForm();
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
          <div className="panel-head"><h2 className="wire-title">{editingId ? "Modifier l'institution" : "Nouvelle institution"}</h2></div>

          <div className="field">
            <span>BIN / IIN</span>
            <input value={form.bin} onChange={(e) => setForm({ ...form, bin: e.target.value })} placeholder="ex: 400100" disabled={editingId != null} />
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
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="send" onClick={submit} disabled={loading}>
              {loading ? "Enregistrement…" : editingId ? "Enregistrer les modifications" : "Créer l'institution"}
            </button>
            {editingId && <button className="link-btn" onClick={resetForm}>Annuler</button>}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head"><h2 className="wire-title">Liste des institutions</h2></div>
          <table className="fieldtable">
            <thead><tr><td className="ft-num">ID</td><td>BIN</td><td>Nom</td><td>Réseau</td><td>Rôle</td><td>DE-32</td><td></td></tr></thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan={7} className="muted">Aucune institution.</td></tr>}
              {list.map((fi) => (
                <tr key={fi.id}>
                  <td className="ft-num">{fi.id}</td>
                  <td className="ft-val">{fi.bin}</td>
                  <td>{fi.name}</td>
                  <td><span className="tag tag-ok" style={fi.network === "MASTERCARD" ? { color: "var(--amber)", background: "rgba(242,182,90,.14)" } : {}}>{fi.network}</span></td>
                  <td><span className="tag" style={fi.role === "ISSUER" ? { color: "var(--cyan)", background: "rgba(91,192,235,.12)" } : fi.role === "BOTH" ? { color: "var(--green)", background: "rgba(61,214,140,.12)" } : {}}>{fi.role}</span></td>
                  <td className="ft-val">{fi.acquirer_id || "—"}</td>
                  <td><button className="link-btn" onClick={() => fillForm(fi)}>Modifier</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
