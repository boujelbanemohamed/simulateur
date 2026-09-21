import { useState } from 'react';
import { api } from '../api/client.js';
import { Case, Champ, ErreurApi, Message, Tableau } from '../components/ui.jsx';

/**
 * Mise à jour en masse du référentiel, au format des équipes métier : Excel ou CSV.
 *
 * Le cycle prévu est « télécharger → corriger dans Excel → réimporter ». L'import
 * se fait toujours en deux temps : une lecture qui ne modifie rien et produit un
 * rapport d'écart, puis l'application après confirmation explicite.
 */
export default function AdminMccImportPage() {
  const [fichier, setFichier] = useState(null);
  const [lecture, setLecture] = useState(null);
  const [applique, setApplique] = useState(null);
  const [desactiverAbsents, setDesactiverAbsents] = useState(false);
  const [commentaire, setCommentaire] = useState('');
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [confirmation, setConfirmation] = useState(false);

  const choisirFichier = async (event) => {
    const choisi = event.target.files?.[0];
    if (!choisi) return;
    setFichier(choisi);
    setLecture(null);
    setApplique(null);
    setConfirmation(false);
    setErreur(null);
    setEnvoi(true);
    try {
      setLecture(await api.admin.lireFichierMcc(choisi));
    } catch (err) {
      setErreur(err);
    } finally {
      setEnvoi(false);
    }
  };

  const telecharger = async (format) => {
    setErreur(null);
    try {
      await api.admin.exporterMcc(format);
    } catch (err) {
      setErreur(err);
    }
  };

  const appliquer = async () => {
    setErreur(null);
    setEnvoi(true);
    try {
      const resultat = await api.admin.importMcc({
        entrees: lecture.entrees,
        apply: true,
        deactivateMissing: desactiverAbsents,
        comment: commentaire || null,
      });
      setApplique(resultat);
      setConfirmation(false);
    } catch (err) {
      setErreur(err);
    } finally {
      setEnvoi(false);
    }
  };

  const rapport = applique ?? lecture?.rapport;

  return (
    <>
      <div className="entete">
        <div>
          <h1>Import du référentiel</h1>
          <p>
            Mettez à jour plusieurs centaines de codes d'un coup à partir d'un fichier Excel
            ou CSV. Pour modifier un code isolé, passez par l'onglet <strong>Référentiel MCC</strong> :
            aucun fichier n'est nécessaire.
          </p>
        </div>
      </div>

      <ErreurApi erreur={erreur} />

      <div className="carte">
        <h2>1. Partir du référentiel actuel</h2>
        <p className="champ__aide">
          Téléchargez le référentiel, corrigez-le dans Excel, puis réimportez le même fichier.
          Les colonnes attendues sont celles de l'export ; leur ordre est libre et les colonnes
          supplémentaires sont ignorées.
        </p>
        <div className="barre-actions">
          <button type="button" className="bouton bouton--secondaire" onClick={() => telecharger('xlsx')}>
            Télécharger en Excel (.xlsx)
          </button>
          <button type="button" className="bouton bouton--secondaire" onClick={() => telecharger('csv')}>
            Télécharger en CSV
          </button>
        </div>
      </div>

      <div className="carte">
        <h2>2. Charger le fichier corrigé</h2>
        <Champ label="Fichier Excel ou CSV" name="fichier" type="file"
          accept=".xlsx,.csv,.json" onChange={choisirFichier}
          aide="Colonnes reconnues : Code, Libellé, Description, Mots-clés, Pertinence, Vigilance, Note." />
        {fichier && (
          <p className="champ__aide">
            {fichier.name} — {(fichier.size / 1024).toFixed(0)} Ko
            {envoi && ' · lecture en cours…'}
          </p>
        )}
      </div>

      {lecture && (
        <div className="carte">
          <h2>3. Ce qui a été lu</h2>
          <dl>
            <div className="paire">
              <dt>Lignes exploitées</dt>
              <dd>{lecture.entrees.length} sur {lecture.lignesLues} lue(s)</dd>
            </div>
            <div className="paire">
              <dt>Colonnes reconnues</dt>
              <dd>{lecture.colonnesDetectees.join(', ')}</dd>
            </div>
            {lecture.colonnesIgnorees?.length > 0 && (
              <div className="paire">
                <dt>Colonnes ignorées</dt>
                <dd>{lecture.colonnesIgnorees.join(', ')}</dd>
              </div>
            )}
          </dl>

          {lecture.anomalies?.length > 0 && (
            <>
              <Message type="attention" titre={`${lecture.anomalies.length} ligne(s) écartée(s)`}>
                Ces lignes ne seront pas importées. Corrigez-les dans le fichier et rechargez-le
                si elles doivent l'être.
              </Message>
              <Tableau>
                <table>
                  <thead>
                    <tr><th>Ligne du fichier</th><th>Motif</th><th>Valeur lue</th></tr>
                  </thead>
                  <tbody>
                    {lecture.anomalies.map((a, i) => (
                      <tr key={i}>
                        <td className="mono">{a.ligne}</td>
                        <td>{a.motif}</td>
                        <td className="mono">{a.valeur ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Tableau>
            </>
          )}
        </div>
      )}

      {rapport && (
        <>
          <div className="carte">
            <h2>{applique ? '4. Import appliqué' : "4. Rapport d'écart"}</h2>
            {applique ? (
              <Message type="succes" titre="Référentiel mis à jour">
                {applique.resume.ajoutes} code(s) ajouté(s), {applique.resume.modifies} modifié(s)
                {applique.resume.desactivationDesRetires
                  ? `, ${applique.resume.retires} désactivé(s)`
                  : ''}
                . Chaque code touché est tracé dans son historique.
              </Message>
            ) : (
              <Message type="info" titre="Simulation — aucune donnée modifiée">
                Vérifiez les écarts ci-dessous avant d'appliquer.
              </Message>
            )}

            <div className="compteurs">
              <div className="compteur compteur--validee">
                <div className="compteur__valeur">{rapport.resume.ajoutes}</div>
                <div className="compteur__libelle">Ajoutés</div>
              </div>
              <div className="compteur compteur--soumise">
                <div className="compteur__valeur">{rapport.resume.modifies}</div>
                <div className="compteur__libelle">Modifiés</div>
              </div>
              <div className="compteur compteur--brouillon">
                <div className="compteur__valeur">{rapport.resume.inchanges}</div>
                <div className="compteur__libelle">Inchangés</div>
              </div>
              <div className="compteur compteur--complement">
                <div className="compteur__valeur">{rapport.resume.retires}</div>
                <div className="compteur__libelle">Absents du fichier</div>
              </div>
            </div>

            {!applique && (
              <>
                <Champ label="Motif de l'import" name="commentaire" value={commentaire}
                  onChange={(e) => setCommentaire(e.target.value)}
                  placeholder="Édition avril 2027 du manuel Visa"
                  aide="Conservé dans l'historique de chaque code touché." />

                <Case label={`Désactiver les ${rapport.resume.retires} code(s) absent(s) du fichier`}
                  name="desactiverAbsents" checked={desactiverAbsents}
                  onChange={(e) => { setDesactiverAbsents(e.target.checked); setConfirmation(false); }} />
                <p className="champ__aide">
                  Un code n'est jamais supprimé : des demandes déjà validées y font référence.
                  Sans cette option, les codes absents du fichier restent actifs.
                </p>

                {confirmation ? (
                  <Message type="attention" titre="Confirmer l'application">
                    {rapport.resume.ajoutes} ajout(s), {rapport.resume.modifies} modification(s)
                    {desactiverAbsents ? `, ${rapport.resume.retires} désactivation(s)` : ''} vont
                    être écrits dans le référentiel, avec effet immédiat sur les propositions
                    faites aux agents.
                    <div className="barre-actions" style={{ marginTop: '0.75rem' }}>
                      <button type="button" className="bouton bouton--secondaire"
                        onClick={() => setConfirmation(false)}>
                        Annuler
                      </button>
                      <button type="button" className="bouton bouton--valider" disabled={envoi}
                        onClick={appliquer}>
                        {envoi ? 'Application…' : "Oui, appliquer l'import"}
                      </button>
                    </div>
                  </Message>
                ) : (
                  <div className="barre-actions barre-actions--fin">
                    <button type="button" className="bouton bouton--valider" disabled={envoi}
                      onClick={() => setConfirmation(true)}>
                      Appliquer l'import
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {rapport.ajoutes.length > 0 && (
            <div className="carte">
              <h2>Codes ajoutés ({rapport.ajoutes.length})</h2>
              <Tableau>
                <table>
                  <thead><tr><th>Code</th><th>Libellé</th></tr></thead>
                  <tbody>
                    {rapport.ajoutes.map((a) => (
                      <tr key={a.code}><td className="mono">{a.code}</td><td>{a.label}</td></tr>
                    ))}
                  </tbody>
                </table>
              </Tableau>
            </div>
          )}

          {rapport.modifies.length > 0 && (
            <div className="carte">
              <h2>Codes modifiés ({rapport.modifies.length})</h2>
              <Tableau>
                <table>
                  <thead><tr><th>Code</th><th>Champ</th><th>Avant</th><th>Après</th></tr></thead>
                  <tbody>
                    {rapport.modifies.flatMap((m) =>
                      m.champs.map((c) => (
                        <tr key={`${m.code}-${c.champ}`}>
                          <td className="mono">{m.code}</td>
                          <td>{c.champ}</td>
                          <td style={{ color: 'var(--gris-700)' }}>{formaterValeur(c.avant)}</td>
                          <td>{formaterValeur(c.apres)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </Tableau>
            </div>
          )}

          {rapport.retires.length > 0 && !applique && (
            <div className="carte">
              <h2>Codes absents du fichier ({rapport.retires.length})</h2>
              <p className="champ__aide">
                Ces codes actifs n'apparaissent pas dans le fichier importé.
              </p>
              <Tableau>
                <table>
                  <thead><tr><th>Code</th><th>Libellé</th></tr></thead>
                  <tbody>
                    {rapport.retires.slice(0, 50).map((r) => (
                      <tr key={r.code}><td className="mono">{r.code}</td><td>{r.label}</td></tr>
                    ))}
                  </tbody>
                </table>
              </Tableau>
              {rapport.retires.length > 50 && (
                <p className="champ__aide">… et {rapport.retires.length - 50} autre(s).</p>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}

/** Une liste de mots-clés se lit mieux séparée par des virgules qu'en JSON brut. */
function formaterValeur(valeur) {
  if (valeur === null || valeur === undefined || valeur === '') return '—';
  return Array.isArray(valeur) ? valeur.join(', ') : String(valeur);
}
