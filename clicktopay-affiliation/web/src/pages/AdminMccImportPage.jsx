import { useState } from 'react';
import { api } from '../api/client.js';
import { Case, Champ, ErreurApi, Message } from '../components/ui.jsx';

/**
 * Import d'une nouvelle édition du référentiel.
 * Le rapport d'écart est toujours produit avant toute écriture : l'administrateur
 * voit ce qui va changer, puis confirme.
 */
export default function AdminMccImportPage() {
  const [contenu, setContenu] = useState('');
  const [nomFichier, setNomFichier] = useState('');
  const [rapport, setRapport] = useState(null);
  const [applique, setApplique] = useState(false);
  const [desactiverAbsents, setDesactiverAbsents] = useState(false);
  const [commentaire, setCommentaire] = useState('');
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const lireFichier = (event) => {
    const fichier = event.target.files?.[0];
    if (!fichier) return;
    setNomFichier(fichier.name);
    setRapport(null);
    setApplique(false);
    const lecteur = new FileReader();
    lecteur.onload = () => setContenu(String(lecteur.result));
    lecteur.readAsText(fichier);
  };

  /** Accepte un tableau JSON, ou un objet contenant un tableau sous une clé unique. */
  const analyser = () => {
    const donnees = JSON.parse(contenu);
    if (Array.isArray(donnees)) return donnees;
    if (Array.isArray(donnees.entrees)) return donnees.entrees;
    if (Array.isArray(donnees.items)) return donnees.items;
    throw new Error('Le fichier doit contenir un tableau de codes MCC.');
  };

  const envoyer = async (appliquer) => {
    setErreur(null);
    setEnvoi(true);
    try {
      const entrees = analyser();
      const res = await api.admin.importMcc({
        entrees,
        apply: appliquer,
        deactivateMissing: appliquer && desactiverAbsents,
        comment: commentaire || null,
      });
      setRapport(res);
      setApplique(appliquer);
    } catch (err) {
      setErreur(err instanceof SyntaxError ? new Error('Fichier JSON illisible : ' + err.message) : err);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <>
      <div className="entete">
        <div>
          <h1>Import d'une édition du référentiel</h1>
          <p>
            Chargez le référentiel au format JSON. Un rapport d'écart est produit avant
            toute écriture : rien n'est modifié tant que vous n'avez pas confirmé.
          </p>
        </div>
      </div>

      <ErreurApi erreur={erreur} />

      <div className="carte">
        <h2>Fichier</h2>
        <Champ label="Fichier JSON" name="fichier" type="file" accept=".json,application/json"
          onChange={lireFichier}
          aide="Tableau d'objets : code, label, description, keywords, ecommerceRelevance, riskLevel." />
        {nomFichier && (
          <p className="champ__aide">
            {nomFichier} — {contenu.length.toLocaleString('fr-FR')} caractères chargés.
          </p>
        )}

        <Champ label="Motif de l'import" name="commentaire" value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
          placeholder="Édition avril 2027 du Visa Merchant Data Standards Manual"
          aide="Conservé dans l'historique de chaque code touché." />

        <div className="barre-actions">
          <button type="button" className="bouton" disabled={!contenu || envoi}
            onClick={() => envoyer(false)}>
            Analyser les écarts
          </button>
        </div>
      </div>

      {rapport && (
        <>
          <div className="carte">
            <h2>Rapport d'écart</h2>
            {applique ? (
              <Message type="succes" titre="Import appliqué">
                {rapport.resume.ajoutes} code(s) ajouté(s), {rapport.resume.modifies} modifié(s)
                {rapport.resume.desactivationDesRetires
                  ? `, ${rapport.resume.retires} désactivé(s)`
                  : ''}
                . Chaque code touché a été historisé.
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
                <Case label="Désactiver les codes absents du fichier" name="desactiverAbsents"
                  checked={desactiverAbsents} onChange={(e) => setDesactiverAbsents(e.target.checked)} />
                <p className="champ__aide">
                  Un code n'est jamais supprimé : des demandes déjà validées y font référence.
                  Sans cette option, les codes absents du fichier restent actifs.
                </p>
                <div className="barre-actions barre-actions--fin">
                  <button type="button" className="bouton bouton--valider" disabled={envoi}
                    onClick={() => envoyer(true)}>
                    Appliquer l'import
                  </button>
                </div>
              </>
            )}
          </div>

          {rapport.ajoutes.length > 0 && (
            <div className="carte">
              <h2>Codes ajoutés ({rapport.ajoutes.length})</h2>
              <table>
                <thead><tr><th>Code</th><th>Libellé</th></tr></thead>
                <tbody>
                  {rapport.ajoutes.map((a) => (
                    <tr key={a.code}><td className="mono">{a.code}</td><td>{a.label}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {rapport.modifies.length > 0 && (
            <div className="carte">
              <h2>Codes modifiés ({rapport.modifies.length})</h2>
              <table>
                <thead><tr><th>Code</th><th>Champ</th><th>Avant</th><th>Après</th></tr></thead>
                <tbody>
                  {rapport.modifies.flatMap((m) =>
                    m.champs.map((c) => (
                      <tr key={`${m.code}-${c.champ}`}>
                        <td className="mono">{m.code}</td>
                        <td>{c.champ}</td>
                        <td style={{ color: 'var(--gris-500)' }}>{JSON.stringify(c.avant)}</td>
                        <td>{JSON.stringify(c.apres)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {rapport.retires.length > 0 && (
            <div className="carte">
              <h2>Codes absents du fichier ({rapport.retires.length})</h2>
              <p className="champ__aide">
                Ces codes actifs n'apparaissent pas dans le fichier importé.
              </p>
              <table>
                <thead><tr><th>Code</th><th>Libellé</th></tr></thead>
                <tbody>
                  {rapport.retires.slice(0, 50).map((r) => (
                    <tr key={r.code}><td className="mono">{r.code}</td><td>{r.label}</td></tr>
                  ))}
                </tbody>
              </table>
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
