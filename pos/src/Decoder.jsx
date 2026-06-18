import { useState, useCallback } from "react";
import { decodeMessage, encode } from "./iso8583.js";
import { FIELD_LABELS } from "./cards.js";

function maskPan(pan) {
  if (!pan || pan.length < 4) return pan;
  return pan.slice(0, 6) + "\u2022".repeat(Math.max(0, pan.length - 10)) + pan.slice(-4);
}

export default function Decoder() {
  const [raw, setRaw] = useState("");
  const [decoded, setDecoded] = useState(null);

  const handleDecode = useCallback(() => {
    setDecoded(decodeMessage(raw));
  }, [raw]);

  const loadExample = useCallback(() => {
    const msg = encode({
      mti: "0200",
      fields: {
        2: "4111111111111111",
        3: "000000",
        4: "000000001550",
        7: "0618112859",
        11: "123456",
        12: "112859",
        13: "0618",
        14: "2812",
        18: "5812",
        19: "788",
        22: "051",
        32: "40010001234",
        37: "0618123456",
        39: "00",
        41: "10000001",
        42: "000000000012345",
        43: "CAFE DE PARIS TUNIS",
        49: "788",
      },
    });
    setRaw(msg);
    setDecoded(decodeMessage(msg));
  }, []);

  return (
    <section className="panel" style={{ marginTop: 24 }}>
      <h2 className="wire-title">Décodeur ISO 8583</h2>
      <textarea
        className="decode-input"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder="Collez ou saisissez un message ISO 8583 (ASCII)..."
        spellCheck={false}
      />
      <div className="decode-actions">
        <button className="send" style={{ width: "auto", padding: "10px 20px" }} onClick={handleDecode}>Décoder</button>
        <button className="link-btn" onClick={loadExample}>Exemple</button>
        {raw && <button className="link-btn" onClick={() => { setRaw(""); setDecoded(null); }}>Effacer</button>}
      </div>

      {decoded && decoded.errors.length > 0 && (
        <div className="response response-err">
          <div className="response-head"><span className="response-badge">Erreurs</span></div>
          {decoded.errors.map((err, i) => (
            <p key={i} className="decode-err-line">{err}</p>
          ))}
        </div>
      )}

      {decoded && decoded.mti && (
        <>
          <div className="wire-string" style={{ marginTop: 14 }}>
            {decoded.segments.map((s, i) => (
              <span key={i} className={`seg seg-${s.kind}`} title={s.label}>{s.text}</span>
            ))}
          </div>
          <div className="wire-meta">
            <span>{raw.length} caractères</span>
            <span>MTI {decoded.mti} &middot; {decoded.presentFields.length} champs</span>
          </div>

          <table className="fieldtable" style={{ marginTop: 10 }}>
            <thead>
              <tr><td>DE</td><td>Libellé</td><td>Long.</td><td>Valeur</td></tr>
            </thead>
            <tbody>
              {decoded.fields.map((f) => (
                <tr key={f.field}>
                  <td className="ft-num">DE{f.field}</td>
                  <td className="ft-label">{FIELD_LABELS[f.field] || ""}</td>
                  <td className="muted" style={{ fontFamily: "inherit", fontSize: 12 }}>
                    {f.error ? "-" : `${f.declaredLength}${f.variable ? "v" : ""}`}
                  </td>
                  <td className="ft-val">
                    {f.error ? <span style={{ color: "var(--red)" }}>{f.error}</span>
                     : f.field === 2 ? maskPan(f.value) : f.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
