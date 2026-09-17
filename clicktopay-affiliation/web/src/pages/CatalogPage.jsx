import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { CarteMcc, Champ, ErreurApi, Message } from '../components/ui.jsx';

/**
 * Consultation du référentiel MCC, hors contexte d'une demande : le banquier
 * peut vérifier la définition exacte d'un code avant de l'attribuer.
 */
export default function CatalogPage() {
  const [recherche, setRecherche] = useState('');
  const [inclureInterdits, setInclureInterdits] = useState(true);
  const [resultats, setResultats] = useState([]);
  const [total, setTotal] = useState(0);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      api
        .searchMcc(recherche, { eligibleOnly: !inclureInterdits, limit: 60 })
        .then((r) => {
          setResultats(r.items);
          setTotal(r.total);
          setErreur(null);
        })
        .catch(setErreur);
    }, 250);
    return () => clearTimeout(timer);
  }, [recherche, inclureInterdits]);

  return (
    <>
      <div className="entete">
        <div>
          <h1>Référentiel MCC</h1>
          <p>
            {total} codes marchands issus du Visa Merchant Data Standards Manual (codes ISO 18245,
            partagés avec Mastercard). Chaque fiche porte la description française et la
            définition officielle du réseau.
          </p>
        </div>
      </div>

      <ErreurApi erreur={erreur} />

      <div className="carte">
        <div className="filtres">
          <Champ label="Rechercher un code ou une activité" name="recherche" value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="« pharmacie », « 5912 », « billetterie »…" />
          <div className="champ champ--case">
            <input id="case-interdits" type="checkbox" checked={inclureInterdits}
              onChange={(e) => setInclureInterdits(e.target.checked)} />
            <label htmlFor="case-interdits">Afficher aussi les codes non éligibles</label>
          </div>
        </div>
      </div>

      {resultats.length === 0 ? (
        <Message type="info">Aucun code ne correspond à cette recherche.</Message>
      ) : (
        <div className="mcc-liste">
          {resultats.map((mcc) => (
            <CarteMcc key={mcc.code} mcc={mcc} />
          ))}
        </div>
      )}
    </>
  );
}
