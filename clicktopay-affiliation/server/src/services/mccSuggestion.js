import { catalogueActif, getSecteur, normalize } from './mccCatalog.js';
import { tokenize } from './motsCles.js';
import { config } from '../config.js';

/**
 * Moteur de proposition de MCC.
 *
 * Objectif : à partir de l'activité déclarée du e-commerçant, remonter les MCC
 * les plus proches, avec un score et les termes qui ont déclenché la
 * correspondance, pour que le banquier puisse arbitrer en connaissance de cause.
 *
 * Les MCC de niveau de risque INTERDIT ne sont jamais proposés automatiquement :
 * ils restent consultables via la recherche manuelle du catalogue.
 */

const RELEVANCE_BONUS = { HIGH: 8, MEDIUM: 3, LOW: -6 };

// MCC dédiés aux biens et services livrés par voie électronique.
const DIGITAL_MCCS = new Set(['5815', '5816', '5817', '5818', '5734', '4816', '4899', '7372']);
const SUBSCRIPTION_MCCS = new Set(['5968', '4899', '5817', '4816']);
const REMOTE_SALE_MCCS = new Set(['5964', '5965', '5969', '5968', '5960', '5962']);

/**
 * Score brut -> score de confiance borné 1..99.
 * Courbe saturante : 22 points bruts ≈ 50, 60 ≈ 73, 200 ≈ 90.
 * Elle évite qu'un premier résultat affiche mécaniquement 100 %.
 */
const toConfidence = (raw) => (raw <= 0 ? 0 : Math.max(1, Math.min(99, Math.round((100 * raw) / (raw + 22)))));

/**
 * @param {object} profile activité déclarée du e-commerçant
 * @param {object} [options]
 * @returns {Array<{code, label, description, score, matchedTerms, ...}>}
 */
export function suggestMcc(profile = {}, options = {}) {
  const limit = options.limit ?? config.suggestionLimit;
  const {
    activityDescription = '',
    productTypes = '',
    siteName = '',
    siteUrl = '',
    companyName = '',
    activitySector = null,
    deliveryMode = 'PHYSIQUE',
    hasSubscription = false,
    isMarketplace = false,
  } = profile;

  // Le descriptif d'activité pèse plus lourd que le nom du site ou de la société,
  // qui sont souvent des noms propres sans valeur sémantique.
  const weightedText = [
    { text: activityDescription, weight: 3 },
    { text: productTypes, weight: 3 },
    { text: siteName, weight: 1 },
    { text: siteUrl.replace(/https?:\/\//, '').replace(/\.[a-z.]+$/, ''), weight: 1 },
    { text: companyName, weight: 1 },
  ];

  const tokenWeights = new Map();
  for (const { text, weight } of weightedText) {
    for (const token of tokenize(text)) {
      tokenWeights.set(token, Math.max(tokenWeights.get(token) ?? 0, weight));
    }
  }
  const fullText = normalize(weightedText.map((w) => w.text).join(' '));
  const sector = getSecteur(activitySector);
  const sectorMccs = new Map((sector?.mccs ?? []).map((code, index) => [code, index]));

  const scored = catalogueActif()
    .filter((mcc) => mcc.riskLevel !== 'INTERDIT')
    .map((mcc) => {
      let raw = 0;
      const matched = new Set();
      const { tokens, tokensForts, phrases } = mcc.index;

      // 1. Expressions métier complètes présentes telles quelles dans le texte saisi.
      for (const phrase of phrases) {
        if (fullText.includes(phrase.normalise)) {
          raw += 14;
          matched.add(phrase.libelle);
        }
      }

      // 2. Correspondances mot à mot. Le poids de chaque jeton est déjà la somme
      // des pondérations de champ, calculée une fois au chargement du catalogue.
      for (const [token, tokenWeight] of tokenWeights) {
        const poidsChamp = tokens.get(token);
        if (poidsChamp === undefined) continue;
        raw += poidsChamp * tokenWeight * 0.5;
        // Tout jeton qui crédite le score est montré à l'agent, y compris s'il
        // ne correspond qu'à la description ou à la définition anglaise. Ne
        // retenir que les champs « forts » laissait sortir des propositions sans
        // aucune justification affichée : le terme est celui que l'agent a
        // lui-même saisi, il lui parle donc toujours.
        matched.add(token);
      }

      // 3. Amorçage par le secteur déclaré : le premier MCC du secteur prime.
      if (sectorMccs.has(mcc.code)) {
        raw += 38 - sectorMccs.get(mcc.code) * 4;
        matched.add(`secteur : ${sector.label}`);
      }

      // 4. Ajustements liés au modèle de vente.
      //
      // Ils MODULENT une pertinence, ils ne la créent pas. Appliqués à un code
      // sans la moindre correspondance, le bonus de pertinence e-commerce (+8
      // pour « forte ») suffisait à lui donner un score : le moteur renvoyait
      // alors des propositions sans aucun terme justificatif, et le filet de
      // sécurité plus bas devenait inatteignable.
      if (raw <= 0) {
        return { ...mcc, score: 0, rawScore: 0, matchedTerms: [] };
      }

      raw += RELEVANCE_BONUS[mcc.ecommerceRelevance] ?? 0;

      if (deliveryMode === 'NUMERIQUE') {
        if (DIGITAL_MCCS.has(mcc.code)) {
          raw += 12;
          matched.add('livraison numérique');
        } else raw -= 5;
      }
      if (hasSubscription && SUBSCRIPTION_MCCS.has(mcc.code)) {
        raw += 10;
        matched.add('vente par abonnement');
      }
      if (isMarketplace && mcc.code === '5262') {
        raw += 45;
        matched.add('place de marché');
      }
      if (!isMarketplace && mcc.code === '5262') raw -= 25;
      if (REMOTE_SALE_MCCS.has(mcc.code)) raw += 2;

      return {
        ...mcc,
        score: toConfidence(raw),
        rawScore: Math.round(raw * 10) / 10,
        matchedTerms: [...matched].slice(0, 8),
      };
    })
    // Invariant du produit : une proposition que le banquier ne peut pas
    // justifier n'a pas sa place dans la liste.
    .filter((mcc) => mcc.rawScore > 0 && mcc.matchedTerms.length > 0)
    .sort((a, b) => b.rawScore - a.rawScore || a.code.localeCompare(b.code));

  // Filet de sécurité : jamais de liste vide renvoyée à l'agent.
  if (scored.length === 0) {
    const fallback = catalogueActif().find((m) => m.code === '5999');
    return [{ ...fallback, score: 10, rawScore: 0, matchedTerms: ['aucune correspondance : code de repli'] }];
  }

  return scored.slice(0, limit);
}

/** Propose les MCC pour les deux réseaux. Les codes ISO 18245 sont communs :
 *  les listes sont identiques, mais restent modifiables indépendamment par le
 *  banquier (certains acquéreurs paramètrent des valeurs distinctes). */
export function suggestForNetworks(profile, options) {
  const suggestions = suggestMcc(profile, options);
  return {
    VISA: suggestions,
    MASTERCARD: suggestions.map((s) => ({ ...s })),
  };
}
