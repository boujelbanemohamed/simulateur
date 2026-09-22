import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { CarteMcc, Champ, ErreurApi, Message, Statut, formaterDate, libelleLivraison } from '../components/ui.jsx';

const LIBELLES_EVENEMENT = {
  CREATION: 'Demande créée',
  MODIFICATION: 'Demande modifiée',
  SOUMISSION: 'Soumise au banquier',
  VALIDATION: 'Validée sans modification des MCC',
  VALIDATION_AVEC_MODIFICATION: 'Validée avec modification des MCC',
  REJETEE: 'Rejetée',
  COMPLEMENT_REQUIS: 'Complément demandé à l’agent',
};

export default function RequestDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAgent, isBanquier } = useAuth();

  const [demande, setDemande] = useState(null);
  const [propositions, setPropositions] = useState(null);
  const [evenements, setEvenements] = useState([]);
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [arbitrage, setArbitrage] = useState({ visaMcc: '', mastercardMcc: '', comment: '' });

  const charger = useCallback(async () => {
    try {
      const [d, p, e] = await Promise.all([
        api.getRequest(id),
        api.suggestionsSnapshot(id).catch(() => null),
        api.events(id).catch(() => []),
      ]);
      setDemande(d);
      setPropositions(p);
      setEvenements(e);
      setArbitrage((a) => ({
        ...a,
        visaMcc: d.finalVisaMcc ?? d.proposedVisaMcc ?? '',
        mastercardMcc: d.finalMastercardMcc ?? d.proposedMastercardMcc ?? '',
      }));
      setErreur(null);
    } catch (err) {
      setErreur(err);
    }
  }, [id]);

  useEffect(() => {
    charger();
  }, [charger]);

  const decider = async (decision) => {
    setEnvoi(true);
    setErreur(null);
    try {
      await api.decide(id, {
        decision,
        visaMcc: arbitrage.visaMcc || null,
        mastercardMcc: arbitrage.mastercardMcc || null,
        comment: arbitrage.comment || null,
      });
      await charger();
    } catch (err) {
      setErreur(err);
      // Un 409 signifie que la demande a changé d'état ailleurs : rester sur
      // l'ancien affichage laisserait le banquier réessayer indéfiniment.
      if (err.status === 409) await charger();
    } finally {
      setEnvoi(false);
    }
  };

  const soumettre = async () => {
    setEnvoi(true);
    try {
      await api.submitRequest(id);
      await charger();
    } catch (err) {
      setErreur(err);
      if (err.status === 409) await charger();
    } finally {
      setEnvoi(false);
    }
  };

  if (erreur && !demande) return <ErreurApi erreur={erreur} />;
  if (!demande) return <p className="vide">Chargement…</p>;

  const modifiable =
    isAgent && ['BROUILLON', 'COMPLEMENT_REQUIS'].includes(demande.status) &&
    (demande.createdBy === user.id || user.role === 'ADMIN');
  const arbitrable = isBanquier && demande.status === 'SOUMISE';
  const erreursChamps = erreur?.fieldErrors ?? {};
  /**
   * Libellé d'un code retenu ou proposé, lu dans la photographie de la
   * soumission : c'est l'intitulé qui a été servi, pas celui du référentiel
   * d'aujourd'hui, et il porte la même mention si le code a été désactivé depuis.
   */
  const libelleDuCode = (code) => {
    if (!code) return code;
    const photographie = propositions?.VISA?.find((m) => m.code === code);
    if (!photographie?.label) return code;
    return `${code} — ${photographie.label}${
      photographie.plusAuReferentiel ? ' (désactivé du référentiel depuis la soumission)' : ''
    }`;
  };

  const mccModifie =
    demande.status === 'VALIDEE' &&
    (demande.finalVisaMcc !== demande.proposedVisaMcc ||
      demande.finalMastercardMcc !== demande.proposedMastercardMcc);

  return (
    <>
      <div className="entete">
        <div>
          <h1>
            {demande.siteName} <Statut valeur={demande.status} />
          </h1>
          <p>
            <span className="mono">{demande.reference}</span> — {demande.companyName} · saisie par{' '}
            {demande.createdByName} le {formaterDate(demande.createdAt)}
          </p>
        </div>
        <div className="barre-actions">
          <button type="button" className="bouton bouton--secondaire" onClick={() => navigate('/demandes')}>
            Retour
          </button>
          {modifiable && (
            <>
              <button type="button" className="bouton bouton--secondaire"
                onClick={() => navigate(`/demandes/${demande.id}/modifier`)}>
                Modifier
              </button>
              <button type="button" className="bouton" onClick={soumettre} disabled={envoi}>
                Soumettre au banquier
              </button>
            </>
          )}
        </div>
      </div>

      {/* Hors arbitrage seulement : la carte d'arbitrage affiche déjà l'erreur à
          l'endroit où l'action a lieu, et la doubler ici la faisait apparaître
          deux fois à l'écran. */}
      {!arbitrable && <ErreurApi erreur={erreur} />}

      {demande.status === 'COMPLEMENT_REQUIS' && demande.decisionComment && (
        <Message type="attention" titre="Complément demandé par le banquier">
          {demande.decisionComment}
        </Message>
      )}
      {demande.status === 'REJETEE' && (
        <Message type="erreur" titre="Demande rejetée">
          {demande.decisionComment}
        </Message>
      )}
      {demande.status === 'VALIDEE' && (
        <Message type="succes" titre="Affiliation validée">
          MCC retenus — Visa : <strong>{demande.finalVisaMcc}</strong>, Mastercard :{' '}
          <strong>{demande.finalMastercardMcc}</strong>
          {mccModifie && ' (modifiés par rapport à la proposition de l’agent)'}
          {demande.decisionComment ? ` · ${demande.decisionComment}` : ''}
        </Message>
      )}

      <div className="grille grille--2">
        <div>
          <div className="carte">
            <h2>Identité du e-commerçant</h2>
            <dl>
              <Ligne libelle="Nom du site" valeur={demande.siteName} />
              <Ligne libelle="Adresse du site" valeur={demande.siteUrl} />
              <Ligne libelle="Langues" valeur={demande.siteLanguages} />
              <Ligne libelle="Raison sociale" valeur={demande.companyName} />
              <Ligne libelle="Forme juridique" valeur={demande.legalForm} />
              <Ligne libelle="RNE" valeur={demande.rne} />
              <Ligne libelle="Matricule fiscal" valeur={demande.taxId} />
              <Ligne libelle="Date de création"
                valeur={demande.companyCreatedOn ? String(demande.companyCreatedOn).slice(0, 10) : null} />
              <Ligne libelle="Capital social" valeur={demande.shareCapital} />
            </dl>
          </div>

          <div className="carte">
            <h2>Contact et adresse</h2>
            <dl>
              <Ligne libelle="Contact"
                valeur={`${demande.contactFirstName} ${demande.contactLastName}`} />
              <Ligne libelle="E-mail" valeur={demande.contactEmail} />
              <Ligne libelle="Téléphone" valeur={demande.contactPhone} />
              <Ligne libelle="Adresse"
                valeur={[demande.addressLine1, demande.addressLine2, demande.postalCode, demande.city,
                         demande.governorate, demande.country].filter(Boolean).join(', ')} />
              <Ligne libelle="RIB" valeur={demande.rib} />
              <Ligne libelle="Titulaire du compte" valeur={demande.accountHolder} />
              <Ligne libelle="Agence" valeur={demande.bankAgency} />
            </dl>
          </div>

          <div className="carte">
            <h2>Activité déclarée</h2>
            <p className="mcc__description">{demande.activityDescription}</p>
            {demande.productTypes && <p className="mcc__description">{demande.productTypes}</p>}
            <dl>
              <Ligne libelle="Mode de livraison" valeur={libelleLivraison(demande.deliveryMode)} />
              <Ligne libelle="Paiement récurrent" valeur={demande.hasSubscription ? 'Oui' : 'Non'} />
              <Ligne libelle="Place de marché" valeur={demande.isMarketplace ? 'Oui' : 'Non'} />
              <Ligne libelle="Vente à l'international" valeur={demande.sellsAbroad ? 'Oui' : 'Non'} />
              <Ligne libelle="Panier moyen" valeur={demande.averageBasket} />
              <Ligne libelle="Volume mensuel" valeur={demande.monthlyVolume} />
            </dl>
          </div>
        </div>

        <div>
          <div className="carte">
            <h2>Codes MCC</h2>
            <dl>
              <Ligne libelle="Proposé par l'agent — Visa" valeur={libelleDuCode(demande.proposedVisaMcc)} />
              <Ligne libelle="Proposé par l'agent — Mastercard" valeur={libelleDuCode(demande.proposedMastercardMcc)} />
              <Ligne libelle="Retenu — Visa" valeur={libelleDuCode(demande.finalVisaMcc)} />
              <Ligne libelle="Retenu — Mastercard" valeur={libelleDuCode(demande.finalMastercardMcc)} />
            </dl>
            {demande.proposedJustification && (
              <Message type="info" titre="Justification de l'agent">
                {demande.proposedJustification}
              </Message>
            )}
          </div>

          {arbitrable && (
            <div className="carte">
              <h2>Arbitrage du banquier</h2>
              <p className="champ__aide">
                Validez les codes proposés, ou saisissez un code différent pour l'un ou l'autre
                réseau. Un commentaire est obligatoire pour un rejet ou une demande de complément.
              </p>
              <div className="grille grille--2">
                <Champ label="MCC Visa retenu" name="visaMcc" className="mono" value={arbitrage.visaMcc}
                  erreur={erreursChamps.visaMcc}
                  onChange={(e) => setArbitrage((a) => ({ ...a, visaMcc: e.target.value }))}
                  placeholder="5977" />
                <Champ label="MCC Mastercard retenu" name="mastercardMcc" value={arbitrage.mastercardMcc}
                  erreur={erreursChamps.mastercardMcc}
                  onChange={(e) => setArbitrage((a) => ({ ...a, mastercardMcc: e.target.value }))}
                  placeholder="5977" />
              </div>
              <Champ label="Commentaire" name="comment" erreur={erreursChamps.comment}>
                <textarea id="champ-comment" value={arbitrage.comment}
                  onChange={(e) => setArbitrage((a) => ({ ...a, comment: e.target.value }))}
                  placeholder="Motif de la décision, code substitué, pièce manquante…" />
              </Champ>
              {erreur && (
                <Message type="erreur" titre={erreur.message}>
                  {erreur.details?.length > 0 &&
                    erreur.details.map((d) => d.message).join(' ; ')}
                </Message>
              )}
              <div className="barre-actions">
                <button type="button" className="bouton bouton--valider" disabled={envoi}
                  onClick={() => decider('VALIDEE')}>
                  Valider l'affiliation
                </button>
                <button type="button" className="bouton bouton--secondaire" disabled={envoi}
                  onClick={() => decider('COMPLEMENT_REQUIS')}>
                  Demander un complément
                </button>
                <button type="button" className="bouton bouton--danger" disabled={envoi}
                  onClick={() => decider('REJETEE')}>
                  Rejeter
                </button>
              </div>
            </div>
          )}

          {propositions?.VISA?.length > 0 && (
            <div className="carte">
              <h2>Propositions du moteur</h2>
              <p className="champ__aide">
                Codes proposés au moment de la soumission, classés par pertinence.
                {arbitrable && ' Cliquez sur un code pour le reporter dans l’arbitrage.'}
              </p>
              <div className="mcc-liste">
                {propositions.VISA.map((mcc) => (
                  <CarteMcc key={mcc.code} mcc={mcc}
                    choisi={arbitrage.visaMcc === mcc.code || arbitrage.mastercardMcc === mcc.code}
                    onChoisir={
                      arbitrable
                        ? (code) => setArbitrage((a) => ({ ...a, visaMcc: code, mastercardMcc: code }))
                        : undefined
                    } />
                ))}
              </div>
            </div>
          )}

          <div className="carte">
            <h2>Journal de la demande</h2>
            <ul className="journal">
              {evenements.map((e) => (
                <li key={e.id}>
                  <div className="journal__titre">{LIBELLES_EVENEMENT[e.type] ?? e.type}</div>
                  <div className="journal__meta">
                    {formaterDate(e.createdAt)} — {e.userName ?? 'Système'}
                    {e.userRole ? ` (${e.userRole.toLowerCase()})` : ''}
                  </div>
                  {e.comment && <div className="journal__commentaire">« {e.comment} »</div>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}

function Ligne({ libelle, valeur }) {
  return (
    <div className="paire">
      <dt>{libelle}</dt>
      <dd>{valeur === null || valeur === undefined || valeur === '' ? '—' : String(valeur)}</dd>
    </div>
  );
}
