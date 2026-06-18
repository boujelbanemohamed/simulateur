import { useState, useCallback } from "react";
import { decodeMessage, decodeFramed, encode, MTI_INFO, formatInfo } from "./iso8583.js";
import { FIELD_LABELS } from "./cards.js";

function maskPan(pan) {
  if (!pan || pan.length < 4) return pan;
  return pan.slice(0, 6) + "\u2022".repeat(Math.max(0, pan.length - 10)) + pan.slice(-4);
}

function MtiInfo({ mti }) {
  const info = MTI_INFO(mti);
  if (!info) return null;
  return (
    <div className="mti-breakdown">
      <span>{info.version}</span><span className="muted"> · </span>
      <span>{info.classe}</span><span className="muted"> · </span>
      <span>{info.fonction}</span><span className="muted"> · </span>
      <span>{info.origine}</span>
    </div>
  );
}

function FieldTable({ fields }) {
  return (
    <table className="fieldtable" style={{ marginTop: 10 }}>
      <thead>
        <tr><td>DE</td><td>Libellé</td><td>Format</td><td>Longueur</td><td>Valeur</td></tr>
      </thead>
      <tbody>
        {fields.map((f) => {
          const fmt = formatInfo(f.field);
          return (
            <tr key={f.field}>
              <td className="ft-num">DE{f.field}</td>
              <td className="ft-label">{FIELD_LABELS[f.field] || ""}</td>
              <td className="muted" style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{fmt ? fmt.code : "?"}</td>
              <td className="muted" style={{ fontSize: 12 }}>
                {f.error ? "-" : fmt ? fmt.longueur : `${f.declaredLength}${f.variable ? "v" : ""}`}
              </td>
              <td className="ft-val">
                {f.error ? <span style={{ color: "var(--red)" }}>{f.error}</span>
                 : f.field === 2 ? maskPan(f.value) : f.value}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SegmentsView({ segments, rawLength, mti, fieldCount }) {
  return (
    <>
      <div className="wire-string" style={{ marginTop: 14 }}>
        {segments.map((s, i) => (
          <span key={i} className={`seg seg-${s.kind}`} title={s.label}>{s.text}</span>
        ))}
      </div>
      <div className="wire-meta">
        <span>{rawLength} caractères</span>
        <span>MTI {mti} · {fieldCount} champs</span>
      </div>
    </>
  );
}

export default function Decoder() {
  const [raw, setRaw] = useState("");
  const [decoded, setDecoded] = useState(null);
  const [framedResult, setFramedResult] = useState(null);
  const [mode, setMode] = useState("raw");

  const handleDecode = useCallback(() => {
    if (mode === "raw") {
      setDecoded(decodeMessage(raw));
      setFramedResult(null);
    } else {
      setFramedResult(decodeFramed(raw));
      setDecoded(null);
    }
  }, [raw, mode]);

  const loadExample = useCallback(() => {
    if (mode === "raw") {
      const msg = encode({
        mti: "1200",
        fields: {
          2: "4111111111111111", 3: "000000", 4: "000000001550",
          7: "0618112859", 11: "123456", 12: "112859", 13: "0618",
          14: "2812", 18: "5812", 19: "788", 22: "051",
          32: "40010001234", 37: "0618123456", 39: "00",
          41: "10000001", 42: "000000000012345",
          43: "CAFE DE PARIS TUNIS", 49: "788",
        },
      });
      setRaw(msg);
      setDecoded(decodeMessage(msg));
      setFramedResult(null);
    } else {
      const payloads = [
        encode({ mti: "1200", fields: {
          2: "4111111111111111", 3: "000000", 4: "000000003500",
          7: "0618112859", 11: "111111", 12: "112859", 13: "0618",
          14: "2812", 18: "5812", 19: "788", 22: "051",
          32: "40010001234", 37: "0618111111", 39: "00",
          41: "10000001", 42: "000000000012345",
          43: "CAFE DE PARIS TUNIS", 49: "788",
        } }),
        encode({ mti: "1200", fields: {
          2: "4532015112830366", 3: "000000", 4: "000000008200",
          7: "0618112900", 11: "222222", 12: "112900", 13: "0618",
          14: "2705", 18: "5411", 19: "788", 22: "051",
          32: "40010001234", 37: "0618222222", 39: "00",
          41: "10000002", 42: "000000000012345",
          43: "MARCHE TUNIS CENTRE", 49: "788",
        } }),
        encode({ mti: "1200", fields: {
          2: "5413330089020011", 3: "000000", 4: "000000012000",
          7: "0618112915", 11: "333333", 12: "112915", 13: "0618",
          14: "2903", 18: "5999", 19: "788", 22: "051",
          32: "40010001234", 37: "0618333333", 39: "00",
          41: "10000003", 42: "000000000012345",
          43: "SUPERMARCHE TUNIS", 49: "788",
        } }),
      ];
      const framed = payloads.map((m) => String(m.length).padStart(4, "0") + m).join("");
      setRaw(framed);
      setFramedResult(decodeFramed(framed));
      setDecoded(null);
    }
  }, [mode]);

  return (
    <section className="panel" style={{ marginTop: 24 }}>
      <h2 className="wire-title">Décodeur ISO 8583</h2>

      <div className="decode-mode-tabs">
        <button className={`tab ${mode === "raw" ? "tab-on" : ""}`} onClick={() => { setMode("raw"); setDecoded(null); setFramedResult(null); setRaw(""); }}>Message brut (1)</button>
        <button className={`tab ${mode === "framed" ? "tab-on" : ""}`} onClick={() => { setMode("framed"); setDecoded(null); setFramedResult(null); setRaw(""); }}>Flux préfixé (N)</button>
      </div>

      <textarea
        className="decode-input"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder={mode === "raw" ? "Collez ou saisissez un message ISO 8583 (ASCII)..." : "Collez un flux de transactions cadrées par préfixe longueur (4 chiffres)..."}
        spellCheck={false}
      />
      <div className="decode-actions">
        <button className="send" style={{ width: "auto", padding: "10px 20px" }} onClick={handleDecode}>Décoder</button>
        <button className="link-btn" onClick={loadExample}>Exemple</button>
        {raw && <button className="link-btn" onClick={() => { setRaw(""); setDecoded(null); setFramedResult(null); }}>Effacer</button>}
      </div>

      {/* === MODE BRUT === */}
      {mode === "raw" && decoded && (
        <>
          {decoded.errors.length > 0 && (
            <div className="response response-err">
              <div className="response-head"><span className="response-badge">Erreurs</span></div>
              {decoded.errors.map((err, i) => (<p key={i} className="decode-err-line">{err}</p>))}
            </div>
          )}

          {decoded.mti && (
            <>
              <MtiInfo mti={decoded.mti} />
              <SegmentsView segments={decoded.segments} rawLength={raw.length} mti={decoded.mti} fieldCount={decoded.presentFields.length} />
              <FieldTable fields={decoded.fields} />
            </>
          )}
        </>
      )}

      {/* === MODE PRÉFIXÉ === */}
      {mode === "framed" && framedResult && (
        <>
          {framedResult.errors.length > 0 && (
            <div className="response response-err">
              <div className="response-head"><span className="response-badge">Erreurs de flux</span></div>
              {framedResult.errors.map((err, i) => (<p key={i} className="decode-err-line">{err}</p>))}
            </div>
          )}

          <p style={{ margin: "10px 0 14px" }}>{framedResult.count} transaction(s) décodée(s)</p>

          {framedResult.messages.map((m) => (
            <div key={m.index} className="msg-card">
              <div className="msg-card-head">
                <span className="response-badge" style={{ color: m.decoded.ok ? "var(--green)" : "var(--red)" }}>Transaction {m.index}</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 13 }}>MTI {m.decoded.mti || "?"}</span>
                <span className="muted" style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                  {m.truncated ? `flux:${m.raw.length}/${m.declaredLength}` : `${m.declaredLength} car.`}
                </span>
              </div>

              {m.decoded.mti && <MtiInfo mti={m.decoded.mti} />}

              {m.decoded.mti && (
                <SegmentsView segments={m.decoded.segments} rawLength={m.raw.length} mti={m.decoded.mti} fieldCount={m.decoded.presentFields.length} />
              )}

              {m.decoded.errors.length > 0 && (
                <div className="response response-err" style={{ marginTop: 10 }}>
                  <div className="response-head"><span className="response-badge">Erreurs message</span></div>
                  {m.decoded.errors.map((err, i) => (<p key={i} className="decode-err-line">{err}</p>))}
                </div>
              )}

              <FieldTable fields={m.decoded.fields} />
            </div>
          ))}
        </>
      )}
    </section>
  );
}
