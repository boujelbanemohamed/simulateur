import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { Case, Champ, CarteMcc, ErreurApi, Message } from '../components/ui.jsx';

const ETAPES = [
  { titre: 'Site et société', detail: 'Identité du e-commerçant' },
  { titre: 'Contact et adresse', detail: 'Coordonnées légales' },
  { titre: 'Activité', detail: 'Ce que vend le site' },
  { titre: 'Codes MCC', detail: 'Visa et Mastercard' },
  { titre: 'Récapitulatif', detail: 'Contrôle et envoi' },
];

const FORMULAIRE_VIDE = {
  siteName: '', siteUrl: '', siteLanguages: '',
  companyName: '', legalForm: '', rne: '', taxId: '', companyCreatedOn: '', shareCapital: '',
  contactFirstName: '', contactLastName: '', contactEmail: '', contactPhone: '',
  addressLine1: '', addressLine2: '', city: '', postalCode: '', governorate: '', country: 'Tunisie',
  activitySector: '', activityDescription: '', productTypes: '',
  deliveryMode: 'PHYSIQUE', hasSubscription: false, isMarketplace: false, sellsAbroad: false,
  averageBasket: '', monthlyVolume: '', currency: 'TND',
  rib: '', accountHolder: '', bankAgency: '',
  proposedVisaMcc: '', proposedMastercardMcc: '', proposedJustification: '',
};

/** Les champs numériques et dates vides doivent partir à null, pas en chaîne vide. */
const nettoyer = (formulaire) => {
  const payload = { ...formulaire };
  for (const cle of ['shareCapital', 'averageBasket', 'monthlyVolume', 'companyCreatedOn',
                     'activitySector', 'proposedVisaMcc', 'proposedMastercardMcc']) {
    if (payload[cle] === '') payload[cle] = null;
  }
  return payload;
};

export default function RequestFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const modeEdition = Boolean(id);

  const [formulaire, setFormulaire] = useState(FORMULAIRE_VIDE);
  const [etape, setEtape] = useState(0);
  const [secteurs, setSecteurs] = useState([]);
  const [suggestions, setSuggestions] = useState(null);
  const [rechercheMcc, setRechercheMcc] = useState('');
  const [resultatsMcc, setResultatsMcc] = useState([]);
  const [erreur, setErreur] = useState(null);
  const [info, setInfo] = useState(null);
  const [enregistrement, setEnregistrement] = useState(false);
  const [demandeId, setDemandeId] = useState(id ? Number(id) : null);
  const [statut, setStatut] = useState('BROUILLON');
  const abort = useRef(null);

  const majChamp = (cle) => (e) =>
    setFormulaire((f) => ({
      ...f,
      [cle]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }));

  useEffect(() => {
    api.sectors().then(setSecteurs).catch(() => setSecteurs([]));
  }, []);

  useEffect(() => {
    if (!modeEdition) return;
    api
      .getRequest(id)
      .then((demande) => {
        const charge = { ...FORMULAIRE_VIDE };
        for (const cle of Object.keys(FORMULAIRE_VIDE)) {
          const valeur = demande[cle];
          charge[cle] = valeur === null || valeur === undefined ? FORMULAIRE_VIDE[cle] : valeur;
        }
        if (charge.companyCreatedOn) charge.companyCreatedOn = charge.companyCreatedOn.slice(0, 10);
        setFormulaire(charge);
        setStatut(demande.status);
      })
      .catch(setErreur);
  }, [id, modeEdition]);

  const profil = useMemo(
    () => ({
      activityDescription: formulaire.activityDescription,
      productTypes: formulaire.productTypes,
      siteName: formulaire.siteName,
      siteUrl: formulaire.siteUrl,
      companyName: formulaire.companyName,
      activitySector: formulaire.activitySector || null,
      deliveryMode: formulaire.deliveryMode,
      hasSubscription: formulaire.hasSubscription,
      isMarketplace: formulaire.isMarketplace,
    }),
    [
      formulaire.activityDescription, formulaire.productTypes, formulaire.siteName,
      formulaire.siteUrl, formulaire.companyName, formulaire.activitySector,
      formulaire.deliveryMode, formulaire.hasSubscription, formulaire.isMarketplace,
    ]
  );

  // Les propositions se recalculent à la volée dès que l'activité est décrite.
  useEffect(() => {
    if (profil.activityDescription.trim().length < 10 && !profil.activitySector) {
      setSuggestions(null);
      return undefined;
    }
    const timer = setTimeout(() => {
      abort.current?.abort();
      abort.current = new AbortController();
      api
        .suggest(profil, abort.current.signal)
        .then(setSuggestions)
        .catch((err) => {
          if (err.name !== 'AbortError') setSuggestions(null);
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [profil]);

  useEffect(() => {
    if (rechercheMcc.trim().length < 2) {
      setResultatsMcc([]);
      return undefined;
    }
    const timer = setTimeout(() => {
      api
        .searchMcc(rechercheMcc, { eligibleOnly: true, limit: 12 })
        .then((r) => setResultatsMcc(r.items))
        .catch(() => setResultatsMcc([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [rechercheMcc]);

  const enregistrer = useCallback(
    async ({ silencieux = false } = {}) => {
      setEnregistrement(true);
      setErreur(null);
      try {
        const payload = nettoyer(formulaire);
        const demande = demandeId
          ? await api.updateRequest(demandeId, payload)
          : await api.createRequest(payload);
        setDemandeId(demande.id);
        setStatut(demande.status);
        if (!silencieux) setInfo(`Demande ${demande.reference} enregistrée en brouillon.`);
        return demande;
      } catch (err) {
        setErreur(err);
        return null; // l'erreur est publiée dans le bandeau et sous les champs
      } finally {
        setEnregistrement(false);
      }
    },
    [formulaire, demandeId]
  );

  const soumettre = async () => {
    setInfo(null);
    const demande = await enregistrer({ silencieux: true });
    if (!demande) return; // erreur de validation déjà publiée

    setEnregistrement(true);
    try {
      await api.submitRequest(demande.id);
      navigate(`/demandes/${demande.id}`, { replace: true });
    } catch (err) {
      // Règles propres à la soumission (MCC manquant, statut incompatible).
      setErreur(err);
      setEtape(ETAPES.length - 1);
    } finally {
      setEnregistrement(false);
    }
  };

  const erreursChamps = erreur?.fieldErrors ?? {};
  const choisirMcc = (reseau) => (code) =>
    setFormulaire((f) => ({ ...f, [reseau]: f[reseau] === code ? '' : code }));

  const appliquerAuxDeux = (code) =>
    setFormulaire((f) => ({ ...f, proposedVisaMcc: code, proposedMastercardMcc: code }));

  return (
    <>
      <div className="entete">
        <div>
          <h1>{modeEdition ? 'Modifier la demande' : "Nouvelle demande d'affiliation"}</h1>
          <p>
            Les informations saisies alimentent la proposition automatique de MCC, que le
            banquier pourra valider ou modifier.
          </p>
        </div>
      </div>

      {statut === 'COMPLEMENT_REQUIS' && (
        <Message type="attention" titre="Demande renvoyée par le banquier">
          Corrigez les points signalés puis soumettez à nouveau la demande.
        </Message>
      )}

      <div className="etapes">
        {ETAPES.map((e, index) => (
          <button
            key={e.titre}
            type="button"
            className={`etape${index === etape ? ' etape--active' : index < etape ? ' etape--faite' : ''}`}
            onClick={() => setEtape(index)}
          >
            <strong>
              {index + 1}. {e.titre}
            </strong>
            {e.detail}
          </button>
        ))}
      </div>

      <ErreurApi erreur={erreur} />
      {info && <Message type="succes">{info}</Message>}

      <form className="carte" onSubmit={(e) => e.preventDefault()}>
        {etape === 0 && (
          <>
            <fieldset>
              <legend>Site marchand</legend>
              <div className="grille">
                <Champ label="Nom du site" name="siteName" requis value={formulaire.siteName}
                  onChange={majChamp('siteName')} erreur={erreursChamps.siteName}
                  placeholder="Beldi Cosmetics" />
                <Champ label="Adresse du site" name="siteUrl" requis value={formulaire.siteUrl}
                  onChange={majChamp('siteUrl')} erreur={erreursChamps.siteUrl}
                  placeholder="https://www.monsite.tn" />
                <Champ label="Langues du site" name="siteLanguages" value={formulaire.siteLanguages}
                  onChange={majChamp('siteLanguages')} placeholder="Français, arabe, anglais" />
              </div>
            </fieldset>

            <fieldset>
              <legend>Société</legend>
              <div className="grille">
                <Champ label="Raison sociale" name="companyName" requis value={formulaire.companyName}
                  onChange={majChamp('companyName')} erreur={erreursChamps.companyName} />
                <Champ label="Forme juridique" name="legalForm">
                  <select id="champ-legalForm" value={formulaire.legalForm} onChange={majChamp('legalForm')}>
                    <option value="">—</option>
                    {['SARL', 'SUARL', 'SA', 'SAS', 'Personne physique', 'Association', 'Autre'].map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </Champ>
                <Champ label="RNE" name="rne" requis value={formulaire.rne} onChange={majChamp('rne')}
                  erreur={erreursChamps.rne} aide="Registre National des Entreprises" />
                <Champ label="Matricule fiscal" name="taxId" value={formulaire.taxId}
                  onChange={majChamp('taxId')} erreur={erreursChamps.taxId} />
                <Champ label="Date de création" name="companyCreatedOn" type="date"
                  value={formulaire.companyCreatedOn} onChange={majChamp('companyCreatedOn')}
                  erreur={erreursChamps.companyCreatedOn} />
                <Champ label="Capital social (TND)" name="shareCapital" type="number" min="0" step="0.001"
                  value={formulaire.shareCapital} onChange={majChamp('shareCapital')} />
              </div>
            </fieldset>
          </>
        )}

        {etape === 1 && (
          <>
            <fieldset>
              <legend>Contact du e-commerçant</legend>
              <div className="grille">
                <Champ label="Prénom" name="contactFirstName" requis value={formulaire.contactFirstName}
                  onChange={majChamp('contactFirstName')} erreur={erreursChamps.contactFirstName} />
                <Champ label="Nom" name="contactLastName" requis value={formulaire.contactLastName}
                  onChange={majChamp('contactLastName')} erreur={erreursChamps.contactLastName} />
                <Champ label="Adresse e-mail" name="contactEmail" type="email" requis
                  value={formulaire.contactEmail} onChange={majChamp('contactEmail')}
                  erreur={erreursChamps.contactEmail} />
                <Champ label="Téléphone" name="contactPhone" requis value={formulaire.contactPhone}
                  onChange={majChamp('contactPhone')} erreur={erreursChamps.contactPhone}
                  placeholder="+216 71 123 456" />
              </div>
            </fieldset>

            <fieldset>
              <legend>Adresse physique</legend>
              <div className="grille">
                <Champ label="Adresse" name="addressLine1" requis value={formulaire.addressLine1}
                  onChange={majChamp('addressLine1')} erreur={erreursChamps.addressLine1} />
                <Champ label="Complément d'adresse" name="addressLine2" value={formulaire.addressLine2}
                  onChange={majChamp('addressLine2')} />
                <Champ label="Ville" name="city" requis value={formulaire.city}
                  onChange={majChamp('city')} erreur={erreursChamps.city} />
                <Champ label="Code postal" name="postalCode" value={formulaire.postalCode}
                  onChange={majChamp('postalCode')} />
                <Champ label="Gouvernorat" name="governorate" value={formulaire.governorate}
                  onChange={majChamp('governorate')} />
                <Champ label="Pays" name="country" value={formulaire.country} onChange={majChamp('country')} />
              </div>
            </fieldset>

            <fieldset>
              <legend>Coordonnées bancaires</legend>
              <div className="grille">
                <Champ label="RIB" name="rib" value={formulaire.rib} onChange={majChamp('rib')}
                  aide="20 chiffres" />
                <Champ label="Titulaire du compte" name="accountHolder" value={formulaire.accountHolder}
                  onChange={majChamp('accountHolder')} />
                <Champ label="Agence domiciliataire" name="bankAgency" value={formulaire.bankAgency}
                  onChange={majChamp('bankAgency')} />
              </div>
            </fieldset>
          </>
        )}

        {etape === 2 && (
          <fieldset>
            <legend>Activité du e-commerçant</legend>
            <Message type="info">
              Ce descriptif est la principale source de la proposition de MCC : soyez précis sur
              les produits ou services réellement vendus en ligne.
            </Message>
            <div className="grille grille--2">
              <Champ label="Secteur d'activité" name="activitySector" erreur={erreursChamps.activitySector}>
                <select id="champ-activitySector" value={formulaire.activitySector}
                  onChange={majChamp('activitySector')}>
                  <option value="">— Sélectionner —</option>
                  {secteurs.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </Champ>
              <Champ label="Mode de livraison" name="deliveryMode">
                <select id="champ-deliveryMode" value={formulaire.deliveryMode} onChange={majChamp('deliveryMode')}>
                  <option value="PHYSIQUE">Biens physiques livrés</option>
                  <option value="NUMERIQUE">Biens numériques téléchargés</option>
                  <option value="SERVICE">Prestation de service</option>
                  <option value="MIXTE">Mixte</option>
                </select>
              </Champ>
            </div>
            <Champ label="Description de l'activité" name="activityDescription" requis
              erreur={erreursChamps.activityDescription}
              aide={`${formulaire.activityDescription.length} caractères (20 minimum)`}>
              <textarea id="champ-activityDescription" value={formulaire.activityDescription}
                onChange={majChamp('activityDescription')}
                placeholder="Exemple : vente en ligne de cosmétiques naturels, huiles essentielles et savons artisanaux fabriqués en Tunisie." />
            </Champ>
            <Champ label="Types de produits ou services vendus" name="productTypes">
              <textarea id="champ-productTypes" value={formulaire.productTypes}
                onChange={majChamp('productTypes')}
                placeholder="Crèmes, huiles d'argan, savons, coffrets cadeaux…" />
            </Champ>

            <div className="grille">
              <Case label="Vente par abonnement / paiement récurrent" name="hasSubscription"
                checked={formulaire.hasSubscription} onChange={majChamp('hasSubscription')} />
              <Case label="Place de marché (vendeurs tiers)" name="isMarketplace"
                checked={formulaire.isMarketplace} onChange={majChamp('isMarketplace')} />
              <Case label="Vente à l'international" name="sellsAbroad"
                checked={formulaire.sellsAbroad} onChange={majChamp('sellsAbroad')} />
            </div>

            <div className="grille">
              <Champ label="Panier moyen" name="averageBasket" type="number" min="0" step="0.001"
                value={formulaire.averageBasket} onChange={majChamp('averageBasket')} />
              <Champ label="Volume mensuel estimé" name="monthlyVolume" type="number" min="0" step="0.001"
                value={formulaire.monthlyVolume} onChange={majChamp('monthlyVolume')} />
              <Champ label="Devise" name="currency" value={formulaire.currency} onChange={majChamp('currency')} />
            </div>
          </fieldset>
        )}

        {etape === 3 && (
          <SelectionMcc
            suggestions={suggestions}
            formulaire={formulaire}
            erreursChamps={erreursChamps}
            choisirMcc={choisirMcc}
            appliquerAuxDeux={appliquerAuxDeux}
            rechercheMcc={rechercheMcc}
            setRechercheMcc={setRechercheMcc}
            resultatsMcc={resultatsMcc}
            onJustification={majChamp('proposedJustification')}
          />
        )}

        {etape === 4 && (
          <Recapitulatif formulaire={formulaire} secteurs={secteurs} suggestions={suggestions} />
        )}

        <div className="barre-actions barre-actions--fin" style={{ marginTop: '1.25rem' }}>
          {etape > 0 && (
            <button type="button" className="bouton bouton--secondaire" onClick={() => setEtape((e) => e - 1)}>
              Précédent
            </button>
          )}
          <button type="button" className="bouton bouton--secondaire" onClick={() => { enregistrer(); }}
            disabled={enregistrement}>
            Enregistrer le brouillon
          </button>
          {etape < ETAPES.length - 1 ? (
            <button type="button" className="bouton" onClick={() => setEtape((e) => e + 1)}>
              Suivant
            </button>
          ) : (
            <button type="button" className="bouton bouton--valider" onClick={soumettre}
              disabled={enregistrement}>
              Soumettre au banquier
            </button>
          )}
        </div>
      </form>
    </>
  );
}

/** Étape 4 : propositions du moteur, arbitrage réseau par réseau, recherche manuelle. */
function SelectionMcc({
  suggestions, formulaire, erreursChamps, choisirMcc, appliquerAuxDeux,
  rechercheMcc, setRechercheMcc, resultatsMcc, onJustification,
}) {
  const [reseau, setReseau] = useState('proposedVisaMcc');
  const propositions = suggestions?.VISA ?? [];

  return (
    <>
      <fieldset>
        <legend>Codes MCC proposés</legend>
        {propositions.length === 0 ? (
          <Message type="attention">
            Complétez la description de l'activité à l'étape précédente pour obtenir des
            propositions de MCC.
          </Message>
        ) : (
          <Message type="info">
            Propositions classées par pertinence à partir de l'activité déclarée. Les codes
            sont identiques pour Visa et Mastercard (norme ISO 18245) mais restent modifiables
            réseau par réseau.
          </Message>
        )}

        <div className="grille grille--2" style={{ marginBottom: '1rem' }}>
          <Champ label="MCC Visa retenu" name="proposedVisaMcc" erreur={erreursChamps.proposedVisaMcc}>
            <input id="champ-proposedVisaMcc" value={formulaire.proposedVisaMcc} readOnly
              placeholder="Aucun code sélectionné" className="mono" />
          </Champ>
          <Champ label="MCC Mastercard retenu" name="proposedMastercardMcc"
            erreur={erreursChamps.proposedMastercardMcc}>
            <input id="champ-proposedMastercardMcc" value={formulaire.proposedMastercardMcc} readOnly
              placeholder="Aucun code sélectionné" className="mono" />
          </Champ>
        </div>

        <div className="barre-actions" style={{ marginBottom: '1rem' }}>
          <span className="champ__aide">Le clic sur une proposition affecte :</span>
          <button type="button"
            className={`bouton bouton--petit ${reseau === 'proposedVisaMcc' ? '' : 'bouton--secondaire'}`}
            onClick={() => setReseau('proposedVisaMcc')}>
            Visa
          </button>
          <button type="button"
            className={`bouton bouton--petit ${reseau === 'proposedMastercardMcc' ? '' : 'bouton--secondaire'}`}
            onClick={() => setReseau('proposedMastercardMcc')}>
            Mastercard
          </button>
          <button type="button"
            className={`bouton bouton--petit ${reseau === 'les-deux' ? '' : 'bouton--secondaire'}`}
            onClick={() => setReseau('les-deux')}>
            Les deux réseaux
          </button>
        </div>

        <div className="mcc-liste">
          {propositions.map((mcc) => (
            <CarteMcc key={mcc.code} mcc={mcc}
              choisi={formulaire.proposedVisaMcc === mcc.code || formulaire.proposedMastercardMcc === mcc.code}
              onChoisir={reseau === 'les-deux' ? appliquerAuxDeux : choisirMcc(reseau)} />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Rechercher un autre code dans le référentiel</legend>
        <Champ label="Recherche" name="rechercheMcc" value={rechercheMcc}
          onChange={(e) => setRechercheMcc(e.target.value)}
          placeholder="Mot-clé ou code à 4 chiffres (ex. « librairie » ou « 5942 »)" />
        <div className="mcc-liste">
          {resultatsMcc.map((mcc) => (
            <CarteMcc key={mcc.code} mcc={mcc} montrerVo={false}
              choisi={formulaire.proposedVisaMcc === mcc.code || formulaire.proposedMastercardMcc === mcc.code}
              onChoisir={reseau === 'les-deux' ? appliquerAuxDeux : choisirMcc(reseau)} />
          ))}
        </div>
      </fieldset>

      <Champ label="Justification du choix (visible par le banquier)" name="proposedJustification">
        <textarea id="champ-proposedJustification" value={formulaire.proposedJustification}
          onChange={onJustification}
          placeholder="Expliquez pourquoi ce code correspond le mieux à l'activité réelle du e-commerçant." />
      </Champ>
    </>
  );
}

function Recapitulatif({ formulaire, secteurs, suggestions }) {
  const secteur = secteurs.find((s) => s.key === formulaire.activitySector);
  const mccRetenu = (code) => suggestions?.VISA?.find((m) => m.code === code);

  const lignes = [
    ['Nom du site', formulaire.siteName],
    ['Adresse du site', formulaire.siteUrl],
    ['Raison sociale', formulaire.companyName],
    ['Forme juridique', formulaire.legalForm],
    ['RNE', formulaire.rne],
    ['Matricule fiscal', formulaire.taxId],
    ['Contact', `${formulaire.contactFirstName} ${formulaire.contactLastName}`.trim()],
    ['E-mail', formulaire.contactEmail],
    ['Téléphone', formulaire.contactPhone],
    ['Adresse', [formulaire.addressLine1, formulaire.postalCode, formulaire.city, formulaire.country]
      .filter(Boolean).join(', ')],
    ["Secteur d'activité", secteur?.label],
    ['Mode de livraison', formulaire.deliveryMode],
    ['MCC Visa proposé', formulaire.proposedVisaMcc],
    ['MCC Mastercard proposé', formulaire.proposedMastercardMcc],
  ];

  const manquants = [
    !formulaire.proposedVisaMcc && 'MCC Visa',
    !formulaire.proposedMastercardMcc && 'MCC Mastercard',
  ].filter(Boolean);

  return (
    <>
      <h2>Récapitulatif avant soumission</h2>
      {manquants.length > 0 && (
        <Message type="attention" titre="Éléments manquants">
          La soumission exige : {manquants.join(' et ')}.
        </Message>
      )}
      <div className="grille grille--2">
        <dl>
          {lignes.map(([libelle, valeur]) => (
            <div className="paire" key={libelle}>
              <dt>{libelle}</dt>
              <dd>{valeur || '—'}</dd>
            </div>
          ))}
        </dl>
        <div>
          <h3>Codes retenus</h3>
          <div className="mcc-liste">
            {mccRetenu(formulaire.proposedVisaMcc) && (
              <CarteMcc mcc={mccRetenu(formulaire.proposedVisaMcc)} choisi />
            )}
            {formulaire.proposedMastercardMcc !== formulaire.proposedVisaMcc &&
              mccRetenu(formulaire.proposedMastercardMcc) && (
                <CarteMcc mcc={mccRetenu(formulaire.proposedMastercardMcc)} choisi />
              )}
          </div>
          <p className="champ__aide" style={{ marginTop: '0.75rem' }}>
            Description de l'activité transmise au banquier :
          </p>
          <p className="mcc__description">{formulaire.activityDescription || '—'}</p>
        </div>
      </div>
    </>
  );
}
