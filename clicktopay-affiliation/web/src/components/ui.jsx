import { useEffect, useRef } from 'react';

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

/** Libellés métier des champs, pour que les erreurs parlent à l'utilisateur. */
const LIBELLES_CHAMPS = {
  siteName: 'Nom du site', siteUrl: 'Adresse du site', siteLanguages: 'Langues du site',
  companyName: 'Raison sociale', legalForm: 'Forme juridique', rne: 'RNE',
  taxId: 'Matricule fiscal', companyCreatedOn: 'Date de création', shareCapital: 'Capital social',
  contactFirstName: 'Prénom du contact', contactLastName: 'Nom du contact',
  contactEmail: 'Adresse e-mail', contactPhone: 'Téléphone',
  addressLine1: 'Adresse', addressLine2: "Complément d'adresse", city: 'Ville',
  postalCode: 'Code postal', governorate: 'Gouvernorat', country: 'Pays',
  activitySector: "Secteur d'activité", activityDescription: "Description de l'activité",
  productTypes: 'Types de produits', deliveryMode: 'Mode de livraison',
  hasSubscription: 'Paiement récurrent', isMarketplace: 'Place de marché',
  sellsAbroad: "Vente à l'international", averageBasket: 'Panier moyen',
  monthlyVolume: 'Volume mensuel', currency: 'Devise',
  rib: 'RIB', accountHolder: 'Titulaire du compte', bankAgency: 'Agence',
  proposedVisaMcc: 'MCC Visa', proposedMastercardMcc: 'MCC Mastercard',
  proposedJustification: 'Justification', visaMcc: 'MCC Visa', mastercardMcc: 'MCC Mastercard',
  comment: 'Commentaire', decision: 'Décision',
  email: 'Adresse e-mail', firstName: 'Prénom', lastName: 'Nom', role: 'Rôle',
  bankId: 'Banque', password: 'Mot de passe', currentPassword: 'Mot de passe actuel',
  newPassword: 'Nouveau mot de passe', active: 'Statut', name: 'Raison sociale', code: 'Code',
  label: 'Libellé', description: 'Description', keywords: 'Mots-clés',
  ecommerceRelevance: 'Pertinence', riskLevel: 'Niveau de vigilance', note: 'Note',
};

export const libelleChamp = (champ) => {
  // Les erreurs d'import sont indexées « entrees.12.riskLevel ».
  const segments = String(champ ?? '').split('.');
  const dernier = segments[segments.length - 1];
  const libelle = LIBELLES_CHAMPS[dernier] ?? dernier;
  const ligne = segments.length === 3 ? ` (ligne ${Number(segments[1]) + 1})` : '';
  return `${libelle}${ligne}`;
};

export function Message({ type = 'info', titre, children }) {
  if (!children && !titre) return null;
  return (
    <div className={`message message--${type}`} role={type === 'erreur' ? 'alert' : 'status'}>
      {titre && <strong style={{ display: 'block', marginBottom: children ? '0.3rem' : 0 }}>{titre}</strong>}
      {children}
    </div>
  );
}

/**
 * Restitue une ApiError : message principal + détail champ par champ.
 *
 * Le bandeau s'amène dans le champ de vision : sur les écrans longs (arbitrage
 * du banquier, formulaire en 5 étapes), il s'insérait en haut de page, hors de
 * l'écran, et l'utilisateur ne voyait tout simplement rien se passer.
 */
export function ErreurApi({ erreur }) {
  const bandeau = useRef(null);

  useEffect(() => {
    if (erreur && bandeau.current) {
      bandeau.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      bandeau.current.focus({ preventScroll: true });
    }
  }, [erreur]);

  if (!erreur) return null;
  return (
    <div ref={bandeau} tabIndex={-1} style={{ outline: 'none' }}>
      <Message type="erreur" titre={erreur.message}>
        {erreur.details?.length > 0 && (
          <ul>
            {erreur.details.map((d, i) => (
              <li key={i}>
                <strong>{libelleChamp(d.champ)}</strong> : {d.message}
              </li>
            ))}
          </ul>
        )}
      </Message>
    </div>
  );
}

/** Enveloppe un tableau pour qu'il défile seul sur petit écran. */
export function Tableau({ children }) {
  return <div className="tableau">{children}</div>;
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
        {/* Écarts entre la photographie relue et le référentiel d'aujourd'hui :
            le banquier doit savoir que ce qu'il lit n'est plus l'état courant. */}
        {mcc.plusAuReferentiel && (
          <p className="mcc__vo">Ce code a été désactivé du référentiel depuis la soumission.</p>
        )}
        {mcc.libelleActuel && (
          <p className="mcc__vo">Libellé au référentiel aujourd'hui : {mcc.libelleActuel}.</p>
        )}
      </span>
      {action}
    </Balise>
  );
}

export const MODES_LIVRAISON = {
  PHYSIQUE: 'Biens physiques livrés',
  NUMERIQUE: 'Biens numériques téléchargés',
  SERVICE: 'Prestation de service',
  MIXTE: 'Mixte',
};

export const libelleLivraison = (mode) => MODES_LIVRAISON[mode] ?? mode;

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
