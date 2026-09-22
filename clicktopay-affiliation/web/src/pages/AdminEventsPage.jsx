import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { ErreurApi, Tableau, formaterDate, libelleChamp } from '../components/ui.jsx';

const LIBELLES = {
  CREATION: 'Création',
  MODIFICATION: 'Modification',
  REINITIALISATION_MOT_DE_PASSE: 'Réinitialisation de mot de passe',
  CHANGEMENT_MOT_DE_PASSE: 'Changement de mot de passe',
  IMPORT_REFERENTIEL: 'Import du référentiel MCC',
};

const ENTITES = { USER: 'Compte', BANK: 'Banque', MCC: 'Référentiel' };

const ROLES = { AGENT: 'agent', BANQUIER: 'banquier', ADMIN: 'administrateur' };

/** Une valeur de journal telle qu'un contrôleur la lit, et non telle qu'elle est stockée. */
function valeurLisible(cle, valeur) {
  if (valeur === null || valeur === undefined) return '—';
  // La banque est journalisée par son identifiant ET son code : seul le code parle.
  if (typeof valeur === 'object') return valeur.code ?? JSON.stringify(valeur);
  if (cle === 'role') return ROLES[valeur] ?? valeur;
  if (cle === 'active') return valeur ? 'actif' : 'désactivé';
  if (typeof valeur === 'boolean') return valeur ? 'oui' : 'non';
  return String(valeur);
}

/** Le journal est lu par des humains : le JSON brut n'y a pas sa place. */
function detailLisible(payload) {
  const donnees = payload ?? {};
  const cles = Object.keys(donnees);
  if (cles.length === 0) return '—';

  // Changement de mot de passe : seule la circonstance est journalisée.
  if (donnees.impose !== undefined) {
    return donnees.impose
      ? 'changement imposé après réinitialisation'
      : "changement à l'initiative de l'utilisateur";
  }
  if (Array.isArray(donnees.champs)) {
    return `champs modifiés : ${donnees.champs.map(libelleChamp).join(', ')}`;
  }
  // Modification de compte ou de banque : le couple avant / après est ce qui
  // fait la valeur d'audit de la ligne, il doit se lire d'un coup d'œil.
  if (donnees.champs && typeof donnees.champs === 'object') {
    const modifications = Object.entries(donnees.champs);
    if (modifications.length === 0) return 'appel sans effet : aucune valeur modifiée';
    return modifications
      .map(([cle, { avant, apres }]) =>
        `${libelleChamp(cle)} : ${valeurLisible(cle, avant)} → ${valeurLisible(cle, apres)}`)
      .join(' · ');
  }
  return cles
    .map((cle) => {
      const valeur = donnees[cle];
      const lisible = cle === 'role' ? (ROLES[valeur] ?? valeur)
        : typeof valeur === 'object' && valeur !== null ? JSON.stringify(valeur)
        : String(valeur);
      return `${libelleChamp(cle)} : ${lisible}`;
    })
    .join(' · ');
}

const PAR_PAGE = 100;

export default function AdminEventsPage() {
  const [evenements, setEvenements] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    api.admin
      .events({ limit: PAR_PAGE, offset })
      .then((r) => {
        setEvenements(r.items);
        setTotal(r.total);
        setErreur(null);
      })
      .catch(setErreur);
  }, [offset]);

  const premier = total === 0 ? 0 : offset + 1;
  const dernier = offset + evenements.length;

  return (
    <>
      <div className="entete">
        <div>
          <h1>Journal d'administration</h1>
          <p>Actions sur les comptes, les banques et le référentiel MCC.</p>
        </div>
      </div>

      <ErreurApi erreur={erreur} />

      <div className="carte">
        {evenements.length === 0 ? (
          <p className="vide">Aucune action enregistrée.</p>
        ) : (
          <Tableau>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Auteur</th>
                <th>Objet</th>
                <th>Action</th>
                <th>Détail</th>
              </tr>
            </thead>
            <tbody>
              {evenements.map((e) => (
                <tr key={e.id}>
                  <td>{formaterDate(e.createdAt)}</td>
                  <td>{e.userName ?? 'Système'}</td>
                  <td>
                    {ENTITES[e.entity] ?? e.entity}
                    {e.entityId ? ` #${e.entityId}` : ''}
                  </td>
                  <td>{LIBELLES[e.action] ?? e.action}</td>
                  <td className="champ__aide">{detailLisible(e.payload)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </Tableau>
        )}
      </div>

      {total > 0 && (
        <div className="barre-actions" style={{ marginTop: '1rem' }}>
          <button type="button" className="bouton bouton--secondaire bouton--petit"
            onClick={() => setOffset((o) => Math.max(0, o - PAR_PAGE))} disabled={offset === 0}>
            Précédent
          </button>
          <span className="champ__aide">
            {`entrées ${premier} à ${dernier} sur ${total}`}
          </span>
          <button type="button" className="bouton bouton--secondaire bouton--petit"
            onClick={() => setOffset((o) => o + PAR_PAGE)} disabled={dernier >= total}>
            Suivant
          </button>
        </div>
      )}
    </>
  );
}
