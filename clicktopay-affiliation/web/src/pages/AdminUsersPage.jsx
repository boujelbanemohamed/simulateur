import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Champ, ErreurApi, Message, formaterDate } from '../components/ui.jsx';

const ROLES = [
  { valeur: 'AGENT', libelle: 'Agent' },
  { valeur: 'BANQUIER', libelle: 'Banquier' },
  { valeur: 'ADMIN', libelle: 'Administrateur' },
];

const libelleRole = (role) => ROLES.find((r) => r.valeur === role)?.libelle ?? role;

const COMPTE_VIDE = { email: '', firstName: '', lastName: '', role: 'AGENT', bankId: '', password: '' };

export default function AdminUsersPage() {
  const { user } = useAuth();
  const [utilisateurs, setUtilisateurs] = useState([]);
  const [banques, setBanques] = useState([]);
  const [recherche, setRecherche] = useState('');
  const [erreur, setErreur] = useState(null);
  const [info, setInfo] = useState(null);
  const [formulaire, setFormulaire] = useState(null); // null | COMPTE_VIDE | compte existant
  const [envoi, setEnvoi] = useState(false);
  const [reinitialisation, setReinitialisation] = useState(null);

  const charger = useCallback(async () => {
    try {
      const [liste, listeBanques] = await Promise.all([
        api.admin.listUsers({ search: recherche }),
        api.admin.listBanks(),
      ]);
      setUtilisateurs(liste.items);
      setBanques(listeBanques.items);
      setErreur(null);
    } catch (err) {
      setErreur(err);
    }
  }, [recherche]);

  useEffect(() => {
    const timer = setTimeout(charger, recherche ? 250 : 0);
    return () => clearTimeout(timer);
  }, [charger, recherche]);

  const maj = (cle) => (e) =>
    setFormulaire((f) => ({ ...f, [cle]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const enregistrer = async (event) => {
    event.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      if (formulaire.id) {
        const { id, email, firstName, lastName, role, bankId, active } = formulaire;
        await api.admin.updateUser(id, { email, firstName, lastName, role, bankId: Number(bankId), active });
        setInfo(`Compte ${email} mis à jour.`);
      } else {
        await api.admin.createUser({ ...formulaire, bankId: Number(formulaire.bankId) });
        setInfo(
          `Compte ${formulaire.email} créé. Le mot de passe provisoire devra être changé à la première connexion.`
        );
      }
      setFormulaire(null);
      await charger();
    } catch (err) {
      setErreur(err);
    } finally {
      setEnvoi(false);
    }
  };

  const basculerActivation = async (compte) => {
    setErreur(null);
    try {
      await api.admin.updateUser(compte.id, { active: !compte.active });
      await charger();
    } catch (err) {
      setErreur(err);
    }
  };

  const reinitialiser = async (event) => {
    event.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      await api.admin.resetPassword(reinitialisation.compte.id, reinitialisation.password);
      setInfo(
        `Mot de passe de ${reinitialisation.compte.email} réinitialisé. Communiquez-le par un canal sûr : il devra être changé à la connexion.`
      );
      setReinitialisation(null);
      await charger();
    } catch (err) {
      setErreur(err);
    } finally {
      setEnvoi(false);
    }
  };

  const erreursChamps = erreur?.fieldErrors ?? {};

  return (
    <>
      <div className="entete">
        <div>
          <h1>Comptes utilisateurs</h1>
          <p>Création, habilitation et désactivation des agents, banquiers et administrateurs.</p>
        </div>
        <button type="button" className="bouton" onClick={() => { setFormulaire({ ...COMPTE_VIDE }); setErreur(null); }}>
          + Nouveau compte
        </button>
      </div>

      <ErreurApi erreur={erreur} />
      {info && <Message type="succes">{info}</Message>}

      {formulaire && (
        <form className="carte" onSubmit={enregistrer}>
          <h2>{formulaire.id ? `Modifier ${formulaire.email}` : 'Nouveau compte'}</h2>
          <div className="grille">
            <Champ label="Prénom" name="firstName" requis value={formulaire.firstName}
              onChange={maj('firstName')} erreur={erreursChamps.firstName} />
            <Champ label="Nom" name="lastName" requis value={formulaire.lastName}
              onChange={maj('lastName')} erreur={erreursChamps.lastName} />
            <Champ label="Adresse e-mail" name="email" type="email" requis value={formulaire.email}
              onChange={maj('email')} erreur={erreursChamps.email} />
            <Champ label="Rôle" name="role" erreur={erreursChamps.role}>
              <select id="champ-role" value={formulaire.role} onChange={maj('role')}>
                {ROLES.map((r) => (
                  <option key={r.valeur} value={r.valeur}>{r.libelle}</option>
                ))}
              </select>
            </Champ>
            <Champ label="Banque" name="bankId" requis erreur={erreursChamps.bankId}>
              <select id="champ-bankId" value={formulaire.bankId} onChange={maj('bankId')} required>
                <option value="">— Sélectionner —</option>
                {banques.filter((b) => b.active || Number(formulaire.bankId) === b.id).map((b) => (
                  <option key={b.id} value={b.id}>{b.code} — {b.name}</option>
                ))}
              </select>
            </Champ>
            {!formulaire.id && (
              <Champ label="Mot de passe provisoire" name="password" type="text" requis
                value={formulaire.password} onChange={maj('password')} erreur={erreursChamps.password}
                aide="10 caractères minimum, une minuscule, une majuscule et un chiffre" />
            )}
          </div>
          <div className="barre-actions barre-actions--fin">
            <button type="button" className="bouton bouton--secondaire" onClick={() => setFormulaire(null)}>
              Annuler
            </button>
            <button type="submit" className="bouton" disabled={envoi}>
              {formulaire.id ? 'Enregistrer' : 'Créer le compte'}
            </button>
          </div>
        </form>
      )}

      {reinitialisation && (
        <form className="carte" onSubmit={reinitialiser}>
          <h2>Réinitialiser le mot de passe de {reinitialisation.compte.email}</h2>
          <Message type="attention">
            L'utilisateur devra définir un nouveau mot de passe à sa prochaine connexion.
          </Message>
          <Champ label="Mot de passe provisoire" name="password" type="text" requis
            value={reinitialisation.password} erreur={erreursChamps.password}
            onChange={(e) => setReinitialisation((r) => ({ ...r, password: e.target.value }))} />
          <div className="barre-actions barre-actions--fin">
            <button type="button" className="bouton bouton--secondaire" onClick={() => setReinitialisation(null)}>
              Annuler
            </button>
            <button type="submit" className="bouton bouton--danger" disabled={envoi}>
              Réinitialiser
            </button>
          </div>
        </form>
      )}

      <div className="carte">
        <div className="carte__entete">
          <h2>{utilisateurs.length} compte(s)</h2>
          <div className="filtres">
            <Champ label="Recherche" name="recherche" value={recherche}
              onChange={(e) => setRecherche(e.target.value)} placeholder="Nom ou adresse e-mail…" />
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Adresse e-mail</th>
              <th>Rôle</th>
              <th>Banque</th>
              <th>Statut</th>
              <th>Dernière connexion</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {utilisateurs.map((u) => (
              <tr key={u.id}>
                <td>
                  {u.firstName} {u.lastName}
                  {u.id === user.id && <span className="jeton" style={{ marginLeft: '0.4rem' }}>vous</span>}
                </td>
                <td>{u.email}</td>
                <td>{libelleRole(u.role)}</td>
                <td>{u.bankCode}</td>
                <td>
                  <span className={`etiquette etiquette--${u.active ? 'validee' : 'rejetee'}`}>
                    {u.active ? 'Actif' : 'Désactivé'}
                  </span>
                  {u.mustChangePassword && (
                    <span className="jeton jeton--risque" style={{ marginLeft: '0.35rem' }}>
                      mot de passe à changer
                    </span>
                  )}
                </td>
                <td>{u.lastLoginAt ? formaterDate(u.lastLoginAt) : 'jamais'}</td>
                <td>
                  <div className="barre-actions">
                    <button type="button" className="bouton bouton--secondaire bouton--petit"
                      onClick={() => { setFormulaire({ ...u, bankId: String(u.bankId), password: '' }); setErreur(null); }}>
                      Modifier
                    </button>
                    <button type="button" className="bouton bouton--secondaire bouton--petit"
                      onClick={() => { setReinitialisation({ compte: u, password: '' }); setErreur(null); }}>
                      Mot de passe
                    </button>
                    <button type="button" className="bouton bouton--secondaire bouton--petit"
                      disabled={u.id === user.id} onClick={() => basculerActivation(u)}>
                      {u.active ? 'Désactiver' : 'Réactiver'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
