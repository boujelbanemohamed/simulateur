import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { ErreurApi, formaterDate } from '../components/ui.jsx';

const LIBELLES = {
  CREATION: 'Création',
  MODIFICATION: 'Modification',
  REINITIALISATION_MOT_DE_PASSE: 'Réinitialisation de mot de passe',
  IMPORT_REFERENTIEL: 'Import du référentiel MCC',
};

const ENTITES = { USER: 'Compte', BANK: 'Banque', MCC: 'Référentiel' };

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
                  <td className="champ__aide">
                    {Object.keys(e.payload ?? {}).length > 0 ? JSON.stringify(e.payload) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
