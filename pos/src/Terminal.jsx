import { useMemo, useState } from "react";
import { encode, encodeSegments, MTI_INFO } from "./iso8583.js";
import { TEST_CARDS, CURRENCIES, FIELD_LABELS, RESPONSE_LABELS, DAB_RESPONSE_LABELS } from "./cards.js";
import Decoder from "./Decoder.jsx";

const pad = (n, w) => String(n).padStart(w, "0");
function nowParts() {
  const d = new Date();
  const MM = pad(d.getUTCMonth() + 1, 2), DD = pad(d.getUTCDate(), 2);
  const hh = pad(d.getUTCHours(), 2), mm = pad(d.getUTCMinutes(), 2), ss = pad(d.getUTCSeconds(), 2);
  return { de7: MM + DD + hh + mm + ss, de12: hh + mm + ss, de13: MM + DD };
}
const randomDigits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
const formatAmount = (minor) => (Number(minor || "0") / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const makeRrn = (d13, stan) => (d13 + stan).padEnd(12, "0").slice(0, 12);

export const REQUIRED_DES = [2, 3, 4, 7, 11, 12, 13, 14, 18, 19, 22, 32, 37, 39, 41, 42, 43, 49];

const OP_TYPES = {
  purchase:   { label: "Achat",            mti: "1200", de3: "000000", clr: "Présenté en DÉBIT au clearing",                                       clrTag: "debit" },
  withdrawal: { label: "Retrait DAB",      mti: "1200", de3: "010000", clr: "Présenté en DÉBIT au clearing (cash disbursement)",                   clrTag: "debit" },
  cashAdvance:{ label: "Avance espèces",   mti: "1200", de3: "120000", clr: "Présenté en DÉBIT au clearing (cash disbursement)",                    clrTag: "debit" },
  cashback:   { label: "Achat + cashback", mti: "1200", de3: "090000", clr: "DÉBIT — montant principal + cashback (DE-54)",                       clrTag: "debit" },
  refund:     { label: "Remboursement",    mti: "1200", de3: "200000", clr: "CRÉDIT (sens inverse) — non distingué par le moteur actuel",         clrTag: "credit" },
  fullReversal:{label: "Extourne totale",  mti: "1420", de3: null,     clr: "Full reversal — extourne la totalité de la transaction originale",     clrTag: "neutral" },
  partialReversal:{label:"Extourne partielle", mti:"1420", de3: null,  clr: "Partial reversal — extourne une partie du montant original",           clrTag: "neutral" },
};

const MERCHANT_DEFAULTS = {
  mcc: "5812", acquirerId: "40010001234", acquirerCountry: "788",
  terminalId: "10000001", acceptorId: "000000000012345",
  acceptorName: "CAFE DE PARIS TUNIS", posEntry: "051",
};

const MERCHANT_FIELDS = [
  ["acquirerId","ID acquéreur (DE-32)","ID exploitant DAB (DE-32)"],
  ["acquirerCountry","Pays acquéreur (DE-19)","Pays exploitant DAB (DE-19)"],
  ["mcc","MCC (DE-18)","MCC (DE-18)"],
  ["terminalId","ID terminal (DE-41)","ID terminal DAB (DE-41)"],
  ["acceptorId","ID accepteur (DE-42)","ID exploitant DAB (DE-42)"],
  ["acceptorName","Nom/lieu (DE-43)","Nom/lieu DAB (DE-43)"],
  ["posEntry","Mode saisie (DE-22)","Mode saisie DAB (DE-22)"],
];

export default function Terminal() {
  const [operationType, setOperationType] = useState("purchase");
  const [amount, setAmount] = useState("1550");
  const [card, setCard] = useState(TEST_CARDS[0]);
  const [currency, setCurrency] = useState(CURRENCIES[0]);
  const [approved, setApproved] = useState(true);
  const [merchant, setMerchant] = useState(MERCHANT_DEFAULTS);
  const [showMerchant, setShowMerchant] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [stan, setStan] = useState(() => randomDigits(6));
  const [history, setHistory] = useState([]);
  const [voidTargetIdx, setVoidTargetIdx] = useState(null);
  const [de5Amount, setDe5Amount] = useState("");
  const [de6Amount, setDe6Amount] = useState("");
  const [de54Amount, setDe54Amount] = useState("");
  const [reversalAmount, setReversalAmount] = useState("");

  const opConfig = OP_TYPES[operationType];
  const mti = opConfig.mti;
  const mtiInfo = MTI_INFO(mti);
  const isReversal = operationType === "fullReversal" || operationType === "partialReversal";
  const isPartial = operationType === "partialReversal";
  const voidTarget = voidTargetIdx !== null ? history[voidTargetIdx] : null;
  const isDab = operationType === "withdrawal";
  const isCashback = operationType === "cashback";

  const responseLabels = useMemo(() => ({
    ...RESPONSE_LABELS,
    ...(isDab ? DAB_RESPONSE_LABELS : {}),
  }), [isDab]);

  const partialNum = Number(reversalAmount || "0");
  const partialValid = isPartial && voidTarget
    ? (partialNum > 0 && partialNum <= Number(voidTarget.amount))
    : true;
  const partialError = isPartial && voidTarget && !partialValid
    ? (partialNum <= 0
       ? "Le montant partiel doit être supérieur à 0"
       : `Le montant partiel (${formatAmount(reversalAmount || "0")}) ne peut pas dépasser le total (${formatAmount(voidTarget.amount)})`)
    : null;

  const fields = useMemo(() => {
    const t = nowParts();
    const base = {
      2: card.pan, 4: pad(amount || "0", 12), 7: t.de7,
      12: t.de12, 13: t.de13, 14: card.expiry,
      18: merchant.mcc, 19: merchant.acquirerCountry,
      22: merchant.posEntry, 32: merchant.acquirerId,
      37: makeRrn(t.de13, stan),
      39: approved ? "00" : "05",
      41: merchant.terminalId, 42: merchant.acceptorId,
      43: merchant.acceptorName, 49: currency.code,
    };

    if (isReversal) {
      if (!voidTarget) return {};
      const revAmt = pad(isPartial ? (reversalAmount || "0") : voidTarget.amount, 12);
      return {
        ...base,
        3: voidTarget.de3,
        4: revAmt,
        11: voidTarget.stan,
        37: voidTarget.rrn,
      };
    }

    return {
      ...base,
      3: opConfig.de3,
      11: stan,
      ...(isDab ? { 5: pad(de5Amount || amount || "0", 12), 6: pad(de6Amount || amount || "0", 12) } : {}),
      ...(isCashback ? { 54: pad(de54Amount || "0", 12) } : {}),
    };
  }, [operationType, card, amount, currency, approved, merchant, stan, voidTarget, isDab, isReversal, isPartial, isCashback, reversalAmount, de5Amount, de6Amount, de54Amount, opConfig.de3]);

  const segments = useMemo(() => {
    if (isReversal && !voidTarget) return { segs: [], error: null };
    try { return { segs: encodeSegments({ mti, fields }), error: null }; }
    catch (e) { return { segs: [], error: e.message }; }
  }, [mti, fields, isReversal, voidTarget]);

  const wire = useMemo(() => {
    if (isReversal && !voidTarget) return "";
    try { return encode({ mti, fields }); } catch { return ""; }
  }, [mti, fields, isReversal, voidTarget]);

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
        if (!isReversal) {
          const t = nowParts();
          setHistory((prev) => [{ type: operationType, mti, de3: opConfig.de3 || "000000", stan, rrn: makeRrn(t.de13, stan), pan: card.pan, amount: pad(amount || "0", 12), currency: currency.code, date: new Date().toISOString() }, ...prev]);
        }
        setStan(randomDigits(6));
      } else setResult({ error: data.error || `HTTP ${res.status}` });
    } catch {
      setResult({ error: "Switch injoignable sur le port 8080. Est-il démarré (mvn spring-boot:run) ?" });
    } finally { setSending(false); }
  }

  const canSend = !isReversal || (voidTarget && history.length > 0 && partialValid);

  const revLabel = isReversal && voidTarget
    ? (isPartial ? `Extourner ${formatAmount(reversalAmount || "0")} sur ${formatAmount(voidTarget.amount)} (STAN ${voidTarget.stan})`
       : `Extourner totalité ${formatAmount(voidTarget.amount)} (STAN ${voidTarget.stan})`)
    : "Sélectionner une transaction";

  const sendLabel = isReversal
    ? revLabel
    : (isDab ? `Retirer ${formatAmount(amount)} ${currency.symbol}`
       : operationType === "refund" ? `Rembourser ${formatAmount(amount)} ${currency.symbol}`
       : operationType === "cashAdvance" ? `Avancer ${formatAmount(amount)} ${currency.symbol}`
       : operationType === "cashback" ? `Payer ${formatAmount(amount)} + cashback ${formatAmount(de54Amount || "0")} ${currency.symbol}`
       : `Payer ${formatAmount(amount)} ${currency.symbol}`);

  return (
    <>
      <main className="grid">
        <section className="panel terminal" aria-label="Terminal">
          <label className="field"><span>Type d&apos;opération
            <span className="tag tag-opt" style={{ marginLeft: 8, fontSize: 10 }}>convention simulateur</span>
          </span>
            <select value={operationType} onChange={(e) => { setOperationType(e.target.value); setResult(null); }}>
              {Object.entries(OP_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v.label} — MTI {v.mti} · DE-3 {v.de3 || "(=original)"}</option>
              ))}
            </select>
          </label>
          <div className="screen">
            <div className="screen-row">
              <span className="screen-label">
                {isReversal ? "EXTORNE" : isDab ? "RETRAIT DAB" : "MONTANT"}
              </span>
              <span className="screen-scheme">{card.scheme}</span>
            </div>
            <div className="amount"><span className="amount-val">{formatAmount(amount)}</span><span className="amount-cur">{currency.symbol}</span></div>
            <div className="screen-foot">
              <span>{card.label}</span>
              <span className={approved ? "tag tag-ok" : "tag tag-no"}>
                {approved ? (isReversal ? "Sera extournée" : "Sera approuvée") : "Sera refusée"}
              </span>
            </div>
            {isReversal && voidTarget && (
              <div className="mti-breakdown" style={{ marginTop: 6 }}>
                Extourne la transaction STAN <strong>{voidTarget.stan}</strong> du {new Date(voidTarget.date).toLocaleString("fr-FR")}
                {isPartial && <span> — montant partiel <strong>{formatAmount(reversalAmount || "0")}</strong> / {formatAmount(voidTarget.amount)}</span>}
              </div>
            )}
          </div>
          <div className="keypad">
            {["1","2","3","4","5","6","7","8","9"].map((d) => <button key={d} className="key" onClick={() => press(d)}>{d}</button>)}
            <button className="key key-fn" onClick={clear}>C</button>
            <button className="key" onClick={() => press("0")}>0</button>
            <button className="key key-fn" onClick={back}>⌫</button>
          </div>
          {isDab && (
            <div className="dab-amounts">
              <label className="field"><span>DE-5 Montant règlement (défaut = montant)</span><input value={de5Amount} onChange={(e) => setDe5Amount(e.target.value.slice(0, 12))} placeholder={amount} /></label>
              <label className="field"><span>DE-6 Montant facturation (défaut = montant)</span><input value={de6Amount} onChange={(e) => setDe6Amount(e.target.value.slice(0, 12))} placeholder={amount} /></label>
            </div>
          )}
          {isCashback && (
            <div className="dab-amounts">
              <label className="field"><span>DE-54 Montant cashback</span><input value={de54Amount} onChange={(e) => setDe54Amount(e.target.value.slice(0, 12))} placeholder="ex. 500" /></label>
            </div>
          )}
          {isPartial && voidTarget && (
            <div className="dab-amounts">
              <label className="field"><span>Montant à extourner (max {formatAmount(voidTarget.amount)})</span>
                <input value={reversalAmount} onChange={(e) => setReversalAmount(e.target.value.slice(0, 12))} placeholder={voidTarget.amount} />
              </label>
              {partialError && <p className="encode-error" style={{ margin: "4px 0 0" }}>{partialError}</p>}
            </div>
          )}
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
          <label className="toggle"><input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} /><span>Simuler une réponse {isDab ? "DAB " : ""}{approved ? "approuvée" : "refusée"} (DE-39 = {approved ? "00" : "05"})</span></label>
          <button className="merchant-toggle" onClick={() => setShowMerchant((s) => !s)}>{showMerchant ? "▾" : "▸"} {isDab ? "Paramètres DAB" : "Paramètres marchand"}</button>
          {showMerchant && (
            <div className="merchant">
              {MERCHANT_FIELDS.map(([k, labelDefault, labelDab]) => (
                <label key={k} className="field"><span>{isDab ? labelDab : labelDefault}</span><input value={merchant[k]} onChange={(e) => setMerchant((m) => ({ ...m, [k]: e.target.value }))} /></label>
              ))}
            </div>
          )}
          {isReversal && (
            <div className="void-history">
              <p className="void-history-note">
                Historique local (session uniquement, vidé au rechargement). L&apos;effet réel
                d&apos;une extourne dépend du clearing (étape 2, non encore géré).
              </p>
              {history.length === 0 ? (
                <p className="encode-error">Aucune transaction à extourner dans cette session.</p>
              ) : (
                <div className="void-list">
                  {history.map((h, i) => (
                    <button key={i} className={`void-item ${voidTargetIdx === i ? "void-item-on" : ""}`} onClick={() => setVoidTargetIdx(i)}>
                      <span className="tag tag-ok">STAN {h.stan}</span>
                      <span>{formatAmount(h.amount)} {h.currency}</span>
                      <span className="void-item-meta">{h.type === "purchase" ? "Achat" : h.type === "withdrawal" ? "Retrait" : h.type === "cashAdvance" ? "Avance" : h.type === "cashback" ? "Cashback" : "Rembours."} · {new Date(h.date).toLocaleString("fr-FR")}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button className="send" onClick={send} disabled={sending || !!segments.error || !amount || !canSend || (isReversal && !voidTarget) || !!partialError}>
            {sending ? "Envoi…" : sendLabel}
          </button>
        </section>

        <section className="panel wire" aria-label="Message ISO 8583">
          <h2 className="wire-title">Message ISO 8583 <span className="iso-version-badge">ISO 8583:{mtiInfo.version}</span> <span className="wire-sub">{opConfig.label} · {mti}</span></h2>
          <p className="iso-index-note" style={{ fontSize: 12, marginBottom: 12 }}>
            <strong>Convention simulateur :</strong> les valeurs MTI et DE-3 ci-dessous sont
            réseau-spécifiques (Visa, Mastercard…). Se référer à la spec du réseau acquéreur
            pour les valeurs exactes.
          </p>
          {segments.error ? (
            <p className="encode-error">Encodage impossible : {segments.error}</p>
          ) : (isReversal && !voidTarget) ? (
            <p className="encode-error">Sélectionnez une transaction à extourner dans l&apos;historique.</p>
          ) : (
            <div className="wire-string">{segments.segs.map((s, i) => <span key={i} className={`seg seg-${s.kind}`} title={s.label}>{s.text}</span>)}</div>
          )}
          {!isReversal || voidTarget ? (
            <>
              <div className="wire-meta"><span>{wire.length} caractères</span><span>MTI {mti} · {segments.segs.filter((s) => s.kind === "field").length} champs</span></div>
              <div className="mti-breakdown">{mtiInfo.version} · {mtiInfo.classe} · {mtiInfo.fonction} · {mtiInfo.origine}</div>
              <table className="fieldtable"><tbody>
                {segments.segs.filter((s) => s.kind === "field").map((s) => (
                  <tr key={s.field}><td className="ft-num">DE{s.field}</td><td className="ft-label">{FIELD_LABELS[s.field] || ""}</td><td className="ft-val">{s.field === 2 ? maskPan(fields[2]) : s.text.trim()}</td></tr>
                ))}
              </tbody></table>
            </>
          ) : null}
          <div className="clearing-impact">
            <span className={`clr-badge clr-${opConfig.clrTag}`}>{opConfig.clrTag === "debit" ? "DÉBIT" : opConfig.clrTag === "credit" ? "CRÉDIT" : "NEUTRE"}</span>
            <span>{opConfig.clr}</span>
            <br />
            <span className="clr-note">Le moteur de clearing actuel ne gère pas encore ces cas (étape 2).</span>
          </div>
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
                      <tr key={k}><td className="ft-num">{k.includes("_") ? k.split("_")[0] : "DE" + k}</td><td className="ft-label">{FIELD_LABELS[k] || ""}</td><td className="ft-val">{k === "39" ? `${v} — ${responseLabels[v] || "?"}` : String(v)}</td></tr>
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
