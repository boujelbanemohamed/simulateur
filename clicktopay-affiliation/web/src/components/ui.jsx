/** Briques d'interface partagées par les écrans agent et banquier. */

const STATUTS = {
  BROUILLON: { libelle: 'Brouillon', classe: 'brouillon' },
  SOUMISE: { libelle: 'Soumise', classe: 'soumise' },
  COMPLEMENT_REQUIS: { libelle: 'Complément requis', classe: 'complement' },
  VALIDEE: { libelle: 'Validée', classe: 'validee' },
  REJETEE: { libelle: 'Rejetée', classe: 'rejetee' },
};

export const libelleStatut = (statut) => STATUTS[statut]?.libelle ?? statut;

export function Statut({ valeur }) {
  const statut = STATUTS[valeur] ?? { libelle: valeur, classe: 'brouillon' };
  return <span className={`etiquette etiquette--${statut.classe}`}>{statut.libelle}</span>;
}

export function Champ({ label, name, erreur, aide, requis, children, ...props }) {
  const id = `champ-${name}`;
  return (
    <div className={`champ${erreur ? ' champ--erreur' : ''}`}>
      <label htmlFor={id}>
        {label}
        {requis && <span className="requis" aria-hidden="true">*</span>}
      </label>
      {children ?? <input id={id} name={name} {...props} />}
      {aide && !erreur && <span className="champ__aide">{aide}</span>}
      {erreur && <span className="champ__erreur">{erreur}</span>}
    </div>
  );
}

export function Case({ label, name, checked, onChange }) {
  const id = `case-${name}`;
  return (
    <div className="champ champ--case">
      <input id={id} name={name} type="checkbox" checked={checked} onChange={onChange} />
      <label htmlFor={id}>{label}</label>
    </div>
  );
}

export function Message({ type = 'info', titre, children }) {
  if (!children && !titre) return null;
  return (
    <div className={`message message--${type}`} role={type === 'erreur' ? 'alert' : 'status'}>
      {titre && <strong style={{ display: 'block', marginBottom: children ? '0.3rem' : 0 }}>{titre}</strong>}
      {children}
    </div>
  );
}

/** Restitue une ApiError : message principal + détail champ par champ. */
export function ErreurApi({ erreur }) {
  if (!erreur) return null;
  return (
    <Message type="erreur" titre={erreur.message}>
      {erreur.details?.length > 0 && (
        <ul>
          {erreur.details.map((d, i) => (
            <li key={i}>
              <strong>{d.champ}</strong> : {d.message}
            </li>
          ))}
        </ul>
      )}
    </Message>
  );
}

const classeScore = (score) =>
  score >= 65 ? '' : score >= 40 ? ' mcc__score--moyen' : ' mcc__score--faible';

/**
 * Carte d'un MCC : code, libellé et description en français, définition
 * officielle Visa, plus le score et les termes qui ont motivé la proposition.
 * C'est l'élément sur lequel le banquier fonde son choix.
 */
export function CarteMcc({ mcc, choisi, onChoisir, montrerVo = true, action }) {
  if (!mcc) return null;
  const Balise = onChoisir ? 'button' : 'div';
  return (
    <Balise
      type={onChoisir ? 'button' : undefined}
      className={`mcc${choisi ? ' mcc--choisi' : ''}`}
      onClick={onChoisir ? () => onChoisir(mcc.code) : undefined}
      aria-pressed={onChoisir ? Boolean(choisi) : undefined}
    >
      <span className="mcc__code">{mcc.code}</span>
      <span className="mcc__corps">
        <span className="mcc__titre">{mcc.label}</span>
        <p className="mcc__description">{mcc.description}</p>
        {montrerVo && mcc.descriptionEn && (
          <p className="mcc__vo">
            Définition Visa : {mcc.labelEn} — {mcc.descriptionEn}
          </p>
        )}
        <span className="mcc__meta">
          {typeof mcc.score === 'number' && (
            <span className={`mcc__score${classeScore(mcc.score)}`}>
              Pertinence {mcc.score} %
            </span>
          )}
          {mcc.riskLevel === 'SENSIBLE' && <span className="jeton jeton--risque">Vigilance renforcée</span>}
          {mcc.riskLevel === 'INTERDIT' && <span className="jeton jeton--interdit">Non éligible</span>}
          {mcc.matchedTerms?.map((terme) => (
            <span key={terme} className="jeton">
              {terme}
            </span>
          ))}
        </span>
        {mcc.note && <p className="mcc__vo">Note : {mcc.note}</p>}
      </span>
      {action}
    </Balise>
  );
}

export const formaterDate = (valeur) =>
  valeur
    ? new Date(valeur).toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
