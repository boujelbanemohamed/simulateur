import { useMemo, useState } from "react";
import { encode, encodeSegments, MTI_INFO } from "./iso8583.js";
import { TEST_CARDS, CURRENCIES, FIELD_LABELS, RESPONSE_LABELS } from "./cards.js";
import Decoder from "./Decoder.jsx";

const pad = (n, w) => String(n).padStart(w, "0");
const MTI = "1200";
const mtiInfo = MTI_INFO(MTI);
function nowParts() {
  const d = new Date();
  const MM = pad(d.getUTCMonth() + 1, 2), DD = pad(d.getUTCDate(), 2);
  const hh = pad(d.getUTCHours(), 2), mm = pad(d.getUTCMinutes(), 2), ss = pad(d.getUTCSeconds(), 2);
  return { de7: MM + DD + hh + mm + ss, de12: hh + mm + ss, de13: MM + DD };
}
const randomDigits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
const formatAmount = (minor) => (Number(minor || "0") / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MERCHANT_DEFAULTS = {
  mcc: "5812", acquirerId: "40010001234", acquirerCountry: "788",
  terminalId: "10000001", acceptorId: "000000000012345",
  acceptorName: "CAFE DE PARIS TUNIS", posEntry: "051",
};

export default function Terminal() {
  const [amount, setAmount] = useState("1550");
  const [card, setCard] = useState(TEST_CARDS[0]);
  const [currency, setCurrency] = useState(CURRENCIES[0]);
  const [approved, setApproved] = useState(true);
  const [merchant, setMerchant] = useState(MERCHANT_DEFAULTS);
  const [showMerchant, setShowMerchant] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [stan, setStan] = useState(() => randomDigits(6));

  const fields = useMemo(() => {
    const t = nowParts();
    return {
      2: card.pan, 3: "000000", 4: pad(amount || "0", 12), 7: t.de7, 11: stan,
      12: t.de12, 13: t.de13, 14: card.expiry, 18: merchant.mcc, 19: merchant.acquirerCountry,
      22: merchant.posEntry, 32: merchant.acquirerId,
      37: (t.de13 + stan).padEnd(12, "0").slice(0, 12),
      39: approved ? "00" : "05", 41: merchant.terminalId, 42: merchant.acceptorId,
      43: merchant.acceptorName, 49: currency.code,
    };
  }, [amount, card, currency, approved, merchant, stan]);

  const segments = useMemo(() => {
    try { return { segs: encodeSegments({ mti: MTI, fields }), error: null }; }
    catch (e) { return { segs: [], error: e.message }; }
  }, [fields]);
  const wire = useMemo(() => { try { return encode({ mti: MTI, fields }); } catch { return ""; } }, [fields]);

  const press = (d) => setAmount((a) => (a + d).replace(/^0+(?=\d)/, "").slice(0, 10));
  const back = () => setAmount((a) => a.slice(0, -1));
  const clear = () => setAmount("");

  async function send() {
    setSending(true); setResult(null);
    try {
      const res = await fetch("/api/iso8583", { method: "POST", headers: { "Content-Type": "text/plain" }, body: wire });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setResult({ ok: true, mti: data.mti, captured: data.captured, fields: data.fields || {} });
        setStan(randomDigits(6)); // fresh STAN so the next sale is unique
      } else setResult({ error: data.error || `HTTP ${res.status}` });
    } catch {
      setResult({ error: "Switch injoignable sur le port 8080. Est-il démarré (mvn spring-boot:run) ?" });
    } finally { setSending(false); }
  }

  return (
    <>
      <main className="grid">
        <section className="panel terminal" aria-label="Terminal">
          <div className="screen">
            <div className="screen-row"><span className="screen-label">MONTANT</span><span className="screen-scheme">{card.scheme}</span></div>
            <div className="amount"><span className="amount-val">{formatAmount(amount)}</span><span className="amount-cur">{currency.symbol}</span></div>
            <div className="screen-foot"><span>{card.label}</span><span className={approved ? "tag tag-ok" : "tag tag-no"}>{approved ? "Sera approuvée" : "Sera refusée"}</span></div>
          </div>
          <div className="keypad">
            {["1","2","3","4","5","6","7","8","9"].map((d) => <button key={d} className="key" onClick={() => press(d)}>{d}</button>)}
            <button className="key key-fn" onClick={clear}>C</button>
            <button className="key" onClick={() => press("0")}>0</button>
            <button className="key key-fn" onClick={back}>⌫</button>
          </div>
          <label className="field"><span>Carte de test</span>
            <select value={card.id} onChange={(e) => setCard(TEST_CARDS.find((c) => c.id === e.target.value))}>
              {TEST_CARDS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label className="field"><span>Devise</span>
            <select value={currency.code} onChange={(e) => setCurrency(CURRENCIES.find((c) => c.code === e.target.value))}>
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </label>
          <label className="toggle"><input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} /><span>Simuler une autorisation approuvée (DE-39 = 00)</span></label>
          <button className="merchant-toggle" onClick={() => setShowMerchant((s) => !s)}>{showMerchant ? "▾" : "▸"} Paramètres marchand</button>
          {showMerchant && (
            <div className="merchant">
              {[["acquirerId","ID acquéreur (DE-32)"],["acquirerCountry","Pays acquéreur (DE-19)"],["mcc","MCC (DE-18)"],["terminalId","ID terminal (DE-41)"],["acceptorId","ID accepteur (DE-42)"],["acceptorName","Nom/lieu (DE-43)"],["posEntry","Mode saisie (DE-22)"]].map(([k, label]) => (
                <label key={k} className="field"><span>{label}</span><input value={merchant[k]} onChange={(e) => setMerchant((m) => ({ ...m, [k]: e.target.value }))} /></label>
              ))}
            </div>
          )}
          <button className="send" onClick={send} disabled={sending || !!segments.error || !amount}>{sending ? "Envoi…" : `Payer ${formatAmount(amount)} ${currency.symbol}`}</button>
        </section>

        <section className="panel wire" aria-label="Message ISO 8583">
          <h2 className="wire-title">Message ISO 8583 <span className="iso-version-badge">ISO 8583:{mtiInfo.version}</span> <span className="wire-sub">tel qu'envoyé au switch</span></h2>
          {segments.error ? (
            <p className="encode-error">Encodage impossible : {segments.error}</p>
          ) : (
            <div className="wire-string">{segments.segs.map((s, i) => <span key={i} className={`seg seg-${s.kind}`} title={s.label}>{s.text}</span>)}</div>
          )}
          <div className="wire-meta"><span>{wire.length} caractères</span><span>MTI {MTI} · {segments.segs.filter((s) => s.kind === "field").length} champs</span></div>
          <div className="mti-breakdown">{mtiInfo.version} · {mtiInfo.classe} · {mtiInfo.fonction} · {mtiInfo.origine}</div>
          <table className="fieldtable"><tbody>
            {segments.segs.filter((s) => s.kind === "field").map((s) => (
              <tr key={s.field}><td className="ft-num">DE{s.field}</td><td className="ft-label">{FIELD_LABELS[s.field] || ""}</td><td className="ft-val">{s.field === 2 ? maskPan(fields[2]) : s.text.trim()}</td></tr>
            ))}
          </tbody></table>
          {result && (
            <div className={`response ${result.ok ? "response-ok" : "response-err"}`}>
              {result.ok ? (
                <>
                  <div className="response-head">
                    <span className="response-badge">Switch ✓</span>
                    <span>MTI {result.mti}</span>
                    <span className={result.captured ? "tag tag-ok" : "tag tag-no"}>{result.captured ? "capturée pour clearing" : "non capturée"}</span>
                  </div>
                  <table className="fieldtable"><tbody>
                    {Object.entries(result.fields).map(([k, v]) => (
                      <tr key={k}><td className="ft-num">{k.includes("_") ? k.split("_")[0] : "DE" + k}</td><td className="ft-label">{FIELD_LABELS[k] || ""}</td><td className="ft-val">{k === "39" ? `${v} — ${RESPONSE_LABELS[v] || "?"}` : String(v)}</td></tr>
                    ))}
                  </tbody></table>
                </>
              ) : (<div className="response-head"><span className="response-badge">Erreur</span><span>{result.error}</span></div>)}
            </div>
          )}
        </section>
      </main>
      <Decoder />
    </>
  );
}

function maskPan(pan) {
  if (!pan || pan.length < 4) return pan;
  return pan.slice(0, 6) + "•".repeat(Math.max(0, pan.length - 10)) + pan.slice(-4);
}
