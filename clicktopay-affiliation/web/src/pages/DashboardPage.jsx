import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Champ, ErreurApi, Statut, Tableau, formaterDate } from '../components/ui.jsx';

const COMPTEURS = [
  { cle: 'SOUMISE', libelle: 'À traiter', classe: 'soumise' },
  { cle: 'BROUILLON', libelle: 'Brouillons', classe: 'brouillon' },
  { cle: 'COMPLEMENT_REQUIS', libelle: 'Compléments', classe: 'complement' },
  { cle: 'VALIDEE', libelle: 'Validées', classe: 'validee' },
  { cle: 'REJETEE', libelle: 'Rejetées', classe: 'rejetee' },
];

export default function DashboardPage() {
  const { user, isAgent, isBanquier } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [demandes, setDemandes] = useState([]);
  const [erreur, setErreur] = useState(null);
  const [chargement, setChargement] = useState(true);
  // Le banquier arrive sur la file des demandes à arbitrer, l'agent sur tout son portefeuille.
  const [filtres, setFiltres] = useState({
    status: isBanquier && !isAgent ? 'SOUMISE' : '',
    search: '',
  });

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const [statistiques, liste] = await Promise.all([
        api.stats(),
        api.listRequests({ status: filtres.status, search: filtres.search }),
      ]);
      setStats(statistiques);
      setDemandes(liste.items);
      setErreur(null);
    } catch (err) {
      setErreur(err);
    } finally {
      setChargement(false);
    }
  }, [filtres.status, filtres.search]);

  useEffect(() => {
    const timer = setTimeout(charger, filtres.search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [charger, filtres.search]);

  return (
    <>
      <div className="entete">
        <div>
          <h1>Demandes d'affiliation</h1>
          <p>
            {user.bankName} — {isBanquier && !isAgent
              ? 'Arbitrage des MCC proposés par les agents.'
              : 'Saisie et suivi de vos demandes d’affiliation ClickToPay.'}
          </p>
        </div>
        {isAgent && (
          <button className="bouton" type="button" onClick={() => navigate('/demandes/nouvelle')}>
            + Nouvelle demande
          </button>
        )}
      </div>

      <ErreurApi erreur={erreur} />

      {stats && (
        <div className="compteurs">
          {COMPTEURS.map((c) => (
            <button
              key={c.cle}
              type="button"
              className={`compteur compteur--${c.classe}`}
              onClick={() => setFiltres((f) => ({ ...f, status: f.status === c.cle ? '' : c.cle }))}
              style={{ cursor: 'pointer', textAlign: 'left', font: 'inherit' }}
            >
              <div className="compteur__valeur">{stats[c.cle]}</div>
              <div className="compteur__libelle">{c.libelle}</div>
            </button>
          ))}
        </div>
      )}

      <div className="carte">
        <div className="carte__entete">
          <h2>
            {filtres.status ? `Demandes : ${filtres.status.toLowerCase().replace('_', ' ')}` : 'Toutes les demandes'}
          </h2>
          <div className="filtres">
            <Champ
              label="Recherche"
              name="search"
              placeholder="Référence, site, société, RNE…"
              value={filtres.search}
              onChange={(e) => setFiltres((f) => ({ ...f, search: e.target.value }))}
            />
            <Champ label="Statut" name="status">
              <select
                id="champ-status"
                value={filtres.status}
                onChange={(e) => setFiltres((f) => ({ ...f, status: e.target.value }))}
              >
                <option value="">Tous les statuts</option>
                <option value="BROUILLON">Brouillon</option>
                <option value="SOUMISE">Soumise</option>
                <option value="COMPLEMENT_REQUIS">Complément requis</option>
                <option value="VALIDEE">Validée</option>
                <option value="REJETEE">Rejetée</option>
              </select>
            </Champ>
          </div>
        </div>

        {chargement && <p className="vide">Chargement…</p>}

        {!chargement && demandes.length === 0 && (
          <p className="vide">
            Aucune demande ne correspond à ces critères.
            {isAgent && (
              <>
                {' '}
                <Link to="/demandes/nouvelle">Saisir une première demande</Link>.
              </>
            )}
          </p>
        )}

        {!chargement && demandes.length > 0 && (
          <Tableau>
          <table>
            <thead>
              <tr>
                <th>Référence</th>
                <th>Site marchand</th>
                <th>Société</th>
                <th>MCC Visa</th>
                <th>MCC Mastercard</th>
                <th>Statut</th>
                <th>Mise à jour</th>
              </tr>
            </thead>
            <tbody>
              {demandes.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => navigate(`/demandes/${d.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="mono">{d.reference}</td>
                  <td>
                    <strong>{d.siteName}</strong>
                    <br />
                    <span className="champ__aide">{d.siteUrl}</span>
                  </td>
                  <td>{d.companyName}</td>
                  <td className="mono">{d.finalVisaMcc ?? d.proposedVisaMcc ?? '—'}</td>
                  <td className="mono">{d.finalMastercardMcc ?? d.proposedMastercardMcc ?? '—'}</td>
                  <td>
                    <Statut valeur={d.status} />
                  </td>
                  <td>{formaterDate(d.updatedAt)}</td>
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
