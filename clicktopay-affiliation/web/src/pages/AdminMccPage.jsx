import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { Champ, ErreurApi, Message, Tableau, formaterDate } from '../components/ui.jsx';

const PERTINENCES = [
  { valeur: 'HIGH', libelle: 'Forte' },
  { valeur: 'MEDIUM', libelle: 'Moyenne' },
  { valeur: 'LOW', libelle: 'Faible' },
];

const VIGILANCES = [
  { valeur: 'STANDARD', libelle: 'Standard', aide: 'Aucune restriction.' },
  { valeur: 'SENSIBLE', libelle: 'Vigilance renforcée', aide: 'Proposé, mais signalé au banquier.' },
  { valeur: 'INTERDIT', libelle: 'Non éligible', aide: 'Jamais proposé et refusé par l’API.' },
];

const MCC_VIDE = {
  code: '', label: '', description: '', labelEn: '', descriptionEn: '',
  keywords: '', ecommerceRelevance: 'MEDIUM', riskLevel: 'STANDARD', note: '', comment: '',
};

/** Les mots-clés circulent en tableau côté API, en texte séparé par des virgules côté écran. */
const versFormulaire = (mcc) => ({
  ...MCC_VIDE,
  ...mcc,
  labelEn: mcc.labelEn ?? '',
  descriptionEn: mcc.descriptionEn ?? '',
  note: mcc.note ?? '',
  keywords: (mcc.keywords ?? []).join(', '),
  comment: '',
});

const versPayload = (formulaire) => ({
  label: formulaire.label,
  description: formulaire.description,
  labelEn: formulaire.labelEn || null,
  descriptionEn: formulaire.descriptionEn || null,
  keywords: formulaire.keywords.split(',').map((k) => k.trim()).filter(Boolean),
  ecommerceRelevance: formulaire.ecommerceRelevance,
  riskLevel: formulaire.riskLevel,
  note: formulaire.note || null,
  comment: formulaire.comment || null,
});

export default function AdminMccPage() {
  const [recherche, setRecherche] = useState('');
  const [codes, setCodes] = useState([]);
  const [totaux, setTotaux] = useState({ total: 0, actifs: 0, count: 0 });
  const [limite, setLimite] = useState(60);
  const [formulaire, setFormulaire] = useState(null);
  const [creation, setCreation] = useState(false);
  const [historique, setHistorique] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [info, setInfo] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    try {
      const res = await api.admin.listMcc({ search: recherche, limit: limite });
      setCodes(res.items);
      setTotaux({ total: res.total, actifs: res.actifs, count: res.count });
      setErreur(null);
    } catch (err) {
      setErreur(err);
    }
  }, [recherche, limite]);

  useEffect(() => {
    const timer = setTimeout(charger, recherche ? 250 : 0);
    return () => clearTimeout(timer);
  }, [charger, recherche]);

  const maj = (cle) => (e) => setFormulaire((f) => ({ ...f, [cle]: e.target.value }));

  const ouvrir = async (code, { conserverMessage = false } = {}) => {
    setErreur(null);
    setCreation(false);
    if (!conserverMessage) setInfo(null);
    try {
      const [mcc, histo] = await Promise.all([api.admin.getMcc(code), api.admin.mccHistory(code)]);
      setFormulaire(versFormulaire(mcc));
      setHistorique(histo);
    } catch (err) {
      setErreur(err);
    }
  };

  const enregistrer = async (event) => {
    event.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      if (creation) {
        await api.admin.createMcc({ code: formulaire.code, ...versPayload(formulaire) });
        setInfo(`MCC ${formulaire.code} créé.`);
      } else {
        await api.admin.updateMcc(formulaire.code, versPayload(formulaire));
        setInfo(`MCC ${formulaire.code} mis à jour. La modification s'applique immédiatement aux propositions.`);
      }
      const code = formulaire.code;
      setFormulaire(null);
      setCreation(false);
      await charger();
      // `ouvrir` réinitialise le bandeau : ici on veut que la confirmation reste.
      if (!creation) await ouvrir(code, { conserverMessage: true });
    } catch (err) {
      setErreur(err);
    } finally {
      setEnvoi(false);
    }
  };

  const basculerActivation = async (mcc) => {
    setErreur(null);
    try {
      await api.admin.updateMcc(mcc.code, {
        active: !mcc.active,
        comment: mcc.active ? 'Désactivation depuis l’écran d’administration' : 'Réactivation',
      });
      setInfo(`MCC ${mcc.code} ${mcc.active ? 'désactivé' : 'réactivé'}.`);
      await charger();
      if (formulaire?.code === mcc.code) await ouvrir(mcc.code, { conserverMessage: true });
    } catch (err) {
      setErreur(err);
    }
  };

  const erreursChamps = erreur?.fieldErrors ?? {};

  return (
    <>
      <div className="entete">
        <div>
          <h1>Référentiel MCC</h1>
          <p>
            {totaux.actifs} codes actifs sur {totaux.total}. Toute modification s'applique
            immédiatement aux propositions faites aux agents, et reste historisée.
          </p>
        </div>
        <button type="button" className="bouton"
          onClick={() => { setFormulaire({ ...MCC_VIDE }); setCreation(true); setHistorique(null); setErreur(null); }}>
          + Ajouter un code
        </button>
      </div>

      <ErreurApi erreur={erreur} />
      {info && <Message type="succes">{info}</Message>}

      {formulaire && (
        <form className="carte" onSubmit={enregistrer}>
          <h2>{creation ? 'Nouveau code MCC' : `MCC ${formulaire.code} — ${formulaire.label}`}</h2>

          {creation && (
            <Champ label="Code" name="code" requis value={formulaire.code} onChange={maj('code')}
              erreur={erreursChamps.code} placeholder="6555" aide="4 chiffres, absent du référentiel" />
          )}

          <Champ label="Libellé français" name="label" requis value={formulaire.label}
            onChange={maj('label')} erreur={erreursChamps.label} />
          <Champ label="Description française" name="description" requis erreur={erreursChamps.description}
            aide="C'est ce texte que le banquier lit pour choisir le code.">
            <textarea id="champ-description" value={formulaire.description} onChange={maj('description')} />
          </Champ>

          <Champ label="Mots-clés du moteur de proposition" name="keywords" erreur={erreursChamps.keywords}
            value={formulaire.keywords} onChange={maj('keywords')}
            aide="Séparés par des virgules. Ce sont eux qui font remonter le code à partir du descriptif d'activité." />

          <div className="grille grille--2">
            <Champ label="Pertinence e-commerce" name="ecommerceRelevance">
              <select id="champ-ecommerceRelevance" value={formulaire.ecommerceRelevance}
                onChange={maj('ecommerceRelevance')}>
                {PERTINENCES.map((p) => (
                  <option key={p.valeur} value={p.valeur}>{p.libelle}</option>
                ))}
              </select>
            </Champ>
            <Champ label="Niveau de vigilance" name="riskLevel"
              aide={VIGILANCES.find((v) => v.valeur === formulaire.riskLevel)?.aide}>
              <select id="champ-riskLevel" value={formulaire.riskLevel} onChange={maj('riskLevel')}>
                {VIGILANCES.map((v) => (
                  <option key={v.valeur} value={v.valeur}>{v.libelle}</option>
                ))}
              </select>
            </Champ>
          </div>

          <Champ label="Note affichée au banquier" name="note" value={formulaire.note} onChange={maj('note')} />

          <details>
            <summary style={{ cursor: 'pointer', margin: '0.5rem 0', color: 'var(--gris-700)' }}>
              Libellés officiels du réseau (anglais)
            </summary>
            <Champ label="Libellé Visa" name="labelEn" value={formulaire.labelEn} onChange={maj('labelEn')} />
            <Champ label="Définition Visa" name="descriptionEn">
              <textarea id="champ-descriptionEn" value={formulaire.descriptionEn} onChange={maj('descriptionEn')} />
            </Champ>
          </details>

          <Champ label="Motif de la modification" name="comment" value={formulaire.comment}
            onChange={maj('comment')} aide="Conservé dans l'historique du code." />

          <div className="barre-actions barre-actions--fin">
            <button type="button" className="bouton bouton--secondaire"
              onClick={() => { setFormulaire(null); setCreation(false); }}>
              Fermer
            </button>
            <button type="submit" className="bouton" disabled={envoi}>
              {creation ? 'Créer le code' : 'Enregistrer'}
            </button>
          </div>
        </form>
      )}

      {formulaire && !creation && historique && (
        <div className="carte">
          <h2>Historique du code {formulaire.code}</h2>
          {historique.length === 0 ? (
            <p className="champ__aide">Aucune modification depuis le chargement initial du référentiel.</p>
          ) : (
            <ul className="journal">
              {historique.map((h) => (
                <li key={h.id}>
                  <div className="journal__titre">{h.action}</div>
                  <div className="journal__meta">
                    {formaterDate(h.createdAt)} — {h.userName ?? 'Système'}
                    {h.champsModifies?.length > 0 && ` · champs : ${h.champsModifies.join(', ')}`}
                  </div>
                  {h.comment && <div className="journal__commentaire">« {h.comment} »</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="carte">
        <div className="carte__entete">
          <h2>
            {codes.length} code(s) affiché(s)
            {codes.length >= limite && limite < totaux.total && ` sur ${totaux.total}`}
          </h2>
          <div className="filtres">
            <Champ label="Recherche" name="recherche" value={recherche}
              onChange={(e) => setRecherche(e.target.value)} placeholder="Code ou activité…" />
          </div>
        </div>

        <Tableau>
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Libellé</th>
              <th>Pertinence</th>
              <th>Vigilance</th>
              <th>Statut</th>
              <th>Mise à jour</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {codes.map((m) => (
              <tr key={m.code}>
                <td className="mono">{m.code}</td>
                <td>{m.label}</td>
                <td>{PERTINENCES.find((p) => p.valeur === m.ecommerceRelevance)?.libelle}</td>
                <td>
                  {m.riskLevel === 'STANDARD' && <span className="jeton">Standard</span>}
                  {m.riskLevel === 'SENSIBLE' && <span className="jeton jeton--risque">Renforcée</span>}
                  {m.riskLevel === 'INTERDIT' && <span className="jeton jeton--interdit">Non éligible</span>}
                </td>
                <td>
                  <span className={`etiquette etiquette--${m.active ? 'validee' : 'rejetee'}`}>
                    {m.active ? 'Actif' : 'Désactivé'}
                  </span>
                </td>
                <td>{formaterDate(m.updatedAt)}</td>
                <td>
                  <div className="barre-actions">
                    <button type="button" className="bouton bouton--secondaire bouton--petit"
                      onClick={() => ouvrir(m.code)}>
                      Ouvrir
                    </button>
                    <button type="button" className="bouton bouton--secondaire bouton--petit"
                      onClick={() => basculerActivation(m)}>
                      {m.active ? 'Désactiver' : 'Réactiver'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </Tableau>

        {codes.length >= limite && limite < totaux.total && (
          <div className="barre-actions" style={{ marginTop: '0.9rem' }}>
            <span className="champ__aide">
              La liste est tronquée : {totaux.total - codes.length} code(s) ne sont pas affichés.
            </span>
            <button type="button" className="bouton bouton--secondaire bouton--petit"
              onClick={() => setLimite((l) => l + 120)}>
              Afficher 120 codes de plus
            </button>
            <button type="button" className="bouton bouton--secondaire bouton--petit"
              onClick={() => setLimite(300)}>
              Tout afficher
            </button>
          </div>
        )}
      </div>
    </>
  );
}
