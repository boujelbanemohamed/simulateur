import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { ErreurApi, Tableau, formaterDate, libelleChamp } from '../components/ui.jsx';

const LIBELLES = {
  CREATION: 'Création',
  MODIFICATION: 'Modification',
  REINITIALISATION_MOT_DE_PASSE: 'Réinitialisation de mot de passe',
  IMPORT_REFERENTIEL: 'Import du référentiel MCC',
};

const ENTITES = { USER: 'Compte', BANK: 'Banque', MCC: 'Référentiel' };

const ROLES = { AGENT: 'agent', BANQUIER: 'banquier', ADMIN: 'administrateur' };

/** Le journal est lu par des humains : le JSON brut n'y a pas sa place. */
function detailLisible(payload) {
  const donnees = payload ?? {};
  const cles = Object.keys(donnees);
  if (cles.length === 0) return '—';

  if (Array.isArray(donnees.champs)) {
    return `champs modifiés : ${donnees.champs.map(libelleChamp).join(', ')}`;
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

export default function AdminEventsPage() {
  const [evenements, setEvenements] = useState([]);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    api.admin.events(200).then((r) => setEvenements(r.items)).catch(setErreur);
  }, []);

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
    </>
  );
}
