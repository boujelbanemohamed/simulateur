import { useMemo, useState, Fragment } from "react";
import { FIELD_DEFS, formatInfo, MTI_INFO, ISO_DE_REFERENCE } from "./iso8583.js";
import { FIELD_LABELS } from "./cards.js";
import { REQUIRED_DES } from "./Terminal.jsx";

const MTI = "1200";
const mtiInfo = MTI_INFO(MTI);

const ALL_DE = Array.from({ length: 191 }, (_, i) => i + 2);
const CORE_MAX = 128;

export default function IsoIndex() {
  const [filterText, setFilterText] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const definedSet = useMemo(() => new Set(Object.keys(FIELD_DEFS).map(Number)), []);
  const requiredSet = useMemo(() => new Set(REQUIRED_DES), []);
  const refSet = useMemo(() => new Set(Object.keys(ISO_DE_REFERENCE).map(Number)), []);

  const visible = useMemo(() => {
    let list = ALL_DE.map((f) => {
      const def = definedSet.has(f);
      const req = requiredSet.has(f);
      const inRef = refSet.has(f);
      const info = def ? formatInfo(f) : null;
      let status;
      if (def) {
        status = req ? "required" : "optional";
      } else if (inRef) {
        status = "documentary";
      } else {
        status = "unhandled";
      }
      let label;
      if (def && FIELD_LABELS[f]) {
        label = FIELD_LABELS[f];
      } else if (inRef) {
        label = ISO_DE_REFERENCE[f];
      } else {
        label = "Réservé / non documenté";
      }
      return {
        field: f,
        label,
        format: info ? info.code : "—",
        longueur: info ? info.longueur : "—",
        status,
        isCore: f <= CORE_MAX,
      };
    });

    if (filterText) {
      const q = filterText.toLowerCase();
      list = list.filter(
        (r) => String(r.field).includes(q) || r.label.toLowerCase().includes(q)
      );
    }
    if (filterStatus !== "all") {
      list = list.filter((r) => r.status === filterStatus);
    }
    return list;
  }, [filterText, filterStatus, definedSet, requiredSet, refSet]);

  const counts = useMemo(() => {
    const total = ALL_DE.length;
    const defined = definedSet.size;
    const required = REQUIRED_DES.length;
    const documentary = ALL_DE.filter((f) => !definedSet.has(f) && refSet.has(f)).length;
    const unhandled = total - defined - documentary;
    return { total, defined, required, documentary, unhandled };
  }, [definedSet, refSet]);

  return (
    <div className="iso-index">
      <h2>
        Index des Data Elements ISO 8583
        <span className="iso-version-badge">ISO 8583:{mtiInfo.version}</span>
      </h2>

      <p className="iso-index-note">
        Cet index couvre les 192 positions de data elements de la norme
        ISO 8583:1993 (MTI 1200 : {mtiInfo.version} · {mtiInfo.classe} ·{" "}
        {mtiInfo.fonction} · {mtiInfo.origine}).
      </p>
      <p className="iso-index-note">
        <strong>Libellés de référence indicatifs</strong> — jeu ISO 8583 classique,
        &agrave; recouper avec la norme officielle ISO 8583-1 pour un usage strict.
        Le format (type, longueur) provient de <code>FIELD_DEFS</code> uniquement pour
        les champs gérés par le simulateur. Les positions marquées « Documentaire »
        ont un libellé indicatif mais ne sont pas définies dans le simulateur.
      </p>
      <p className="iso-index-note">
        Le statut Requis / Optionnel reflète la convention du terminal pour un message
        1200 — ce n&apos;est <strong>pas</strong> une règle normative
        universelle (l&apos;obligation réelle dépend du MTI, du réseau et du
        contexte d&apos;échange).
      </p>
      <p className="iso-index-note">
        <strong>Note :</strong> DE-1 n&apos;est pas un champ de données mais
        l&apos;indicateur de bitmap secondaire (bit 1 du bitmap primaire). Il
        n&apos;apparaît pas dans le tableau ci-dessous.
      </p>
      <p className="iso-index-note" style={{ fontSize: 12 }}>
        Plages communes : 105–111 réservé ISO, 112–119 réservé national, 120–127
        réservé privé, 129–192 extensions 1993 (non documentées ici, non gérées par
        le moteur).
      </p>

      <div className="filter-bar">
        <input
          className="filter-input"
          type="text"
          placeholder="Filtrer par numéro ou libellé…"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
        <select
          className="filter-select"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="all">Tous ({counts.total})</option>
          <option value="required">Requis ({counts.required})</option>
          <option value="optional">Optionnels ({counts.defined - counts.required})</option>
          <option value="documentary">Documentaires ({counts.documentary})</option>
          <option value="unhandled">Réservés ({counts.unhandled})</option>
        </select>
      </div>

      <div className="filter-counts">
        <span>{counts.total} positions</span>
        <span>{counts.defined} gérés</span>
        <span>{counts.required} requis</span>
        <span>{counts.documentary} documentaires</span>
        <span>{counts.unhandled} réservés</span>
      </div>

      <table className="fieldtable">
        <thead>
          <tr>
            <td>DE</td>
            <td>Libellé</td>
            <td>Format</td>
            <td>Longueur</td>
            <td>Statut</td>
          </tr>
        </thead>
        <tbody>
          {visible.map((r, i) => {
            const prev = i > 0 ? visible[i - 1].field : null;
            const showSep = prev !== null && prev <= CORE_MAX && r.field > CORE_MAX;
            return (
              <Fragment key={r.field}>
                {showSep && (
                  <tr className="sep-row">
                    <td colSpan={5}>
                      <div className="sep-line">
                        <span className="sep-label">129 – 192 : extensions ISO 8583:1993</span>
                      </div>
                      <p className="iso-index-note" style={{ margin: "6px 0 0", fontSize: 12 }}>
                        Au-delà de 128 : non géré par le moteur (bitmaps primaire+secondaire
                        = 128 max). La norme ISO 8583:1993 définit ces positions sans que
                        le parseur du simulateur ne puisse les lire.
                      </p>
                    </td>
                  </tr>
                )}
                <tr
                  className={
                    r.status === "unhandled"
                      ? "row-unhandled"
                      : r.status === "documentary"
                        ? "row-doc"
                        : ""
                  }
                >
                  <td className="ft-num">{r.field}</td>
                  <td className="ft-label">{r.label}</td>
                  <td className="ft-val">{r.format}</td>
                  <td className="ft-val">{r.longueur}</td>
                  <td>
                    {r.status === "required" && <span className="tag tag-ok">Requis</span>}
                    {r.status === "optional" && <span className="tag tag-opt">Optionnel</span>}
                    {r.status === "documentary" && <span className="tag tag-doc">Documentaire</span>}
                    {r.status === "unhandled" && <span className="tag tag-unhandled">Réservé</span>}
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
