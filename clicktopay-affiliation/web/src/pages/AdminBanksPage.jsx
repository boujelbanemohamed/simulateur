import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { Champ, ErreurApi, Message, Tableau, formaterDate } from '../components/ui.jsx';

export default function AdminBanksPage() {
  const [banques, setBanques] = useState([]);
  const [formulaire, setFormulaire] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [info, setInfo] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    try {
      const res = await api.admin.listBanks();
      setBanques(res.items);
      setErreur(null);
    } catch (err) {
      setErreur(err);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const enregistrer = async (event) => {
    event.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      if (formulaire.id) {
        await api.admin.updateBank(formulaire.id, { name: formulaire.name });
        setInfo(`Banque ${formulaire.code} mise à jour.`);
      } else {
        await api.admin.createBank({ code: formulaire.code, name: formulaire.name });
        setInfo(`Banque ${formulaire.code.toUpperCase()} créée.`);
      }
      setFormulaire(null);
      await charger();
    } catch (err) {
      setErreur(err);
    } finally {
      setEnvoi(false);
    }
  };

  const basculerActivation = async (banque) => {
    setErreur(null);
    setInfo(null);
    try {
      await api.admin.updateBank(banque.id, { active: !banque.active });
      await charger();
    } catch (err) {
      setErreur(err);
    }
  };

  const erreursChamps = erreur?.fieldErrors ?? {};

  return (
    <>
      <div className="entete">
        <div>
          <h1>Banques affiliées</h1>
          <p>
            Chaque demande d'affiliation est rattachée à une banque, et les comptes ne voient
            que les demandes de la leur.
          </p>
        </div>
        <button type="button" className="bouton"
          onClick={() => { setFormulaire({ code: '', name: '' }); setErreur(null); }}>
          + Nouvelle banque
        </button>
      </div>

      <ErreurApi erreur={erreur} />
      {info && <Message type="succes">{info}</Message>}

      {formulaire && (
        <form className="carte" onSubmit={enregistrer}>
          <h2>{formulaire.id ? `Modifier ${formulaire.code}` : 'Nouvelle banque'}</h2>
          <div className="grille">
            <Champ label="Code banque" name="code" requis value={formulaire.code}
              onChange={(e) => setFormulaire((f) => ({ ...f, code: e.target.value }))}
              erreur={erreursChamps.code ?? (erreur?.status === 409 ? erreur.message : undefined)}
              disabled={Boolean(formulaire.id)}
              aide="2 à 16 caractères, normalisé en majuscules" />
            <Champ label="Raison sociale" name="name" requis value={formulaire.name}
              onChange={(e) => setFormulaire((f) => ({ ...f, name: e.target.value }))}
              erreur={erreursChamps.name} />
          </div>
          <div className="barre-actions barre-actions--fin">
            <button type="button" className="bouton bouton--secondaire" onClick={() => setFormulaire(null)}>
              Annuler
            </button>
            <button type="submit" className="bouton" disabled={envoi}>
              {formulaire.id ? 'Enregistrer' : 'Créer la banque'}
            </button>
          </div>
        </form>
      )}

      <div className="carte">
        <Tableau>
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Raison sociale</th>
              <th>Comptes</th>
              <th>Demandes</th>
              <th>Statut</th>
              <th>Créée le</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {banques.map((b) => (
              <tr key={b.id}>
                <td className="mono">{b.code}</td>
                <td>{b.name}</td>
                <td>{b.userCount}</td>
                <td>{b.requestCount}</td>
                <td>
                  <span className={`etiquette etiquette--${b.active ? 'validee' : 'rejetee'}`}>
                    {b.active ? 'Active' : 'Désactivée'}
                  </span>
                </td>
                <td>{formaterDate(b.createdAt)}</td>
                <td>
                  <div className="barre-actions">
                    <button type="button" className="bouton bouton--secondaire bouton--petit"
                      onClick={() => { setFormulaire({ ...b }); setErreur(null); }}>
                      Modifier
                    </button>
                    <button type="button" className="bouton bouton--secondaire bouton--petit"
                      onClick={() => basculerActivation(b)}>
                      {b.active ? 'Désactiver' : 'Réactiver'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </Tableau>
        <p className="champ__aide" style={{ marginTop: '0.75rem' }}>
          Une banque ne peut être désactivée que si elle ne compte plus aucun compte actif.
          Ses demandes déjà enregistrées sont conservées.
        </p>
      </div>
    </>
  );
}
