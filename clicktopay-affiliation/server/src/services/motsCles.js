import { normalize } from './texte.js';

/**
 * Lexique et dérivation des mots-clés du moteur de suggestion.
 *
 * Un code arrivant d'un import ne porte que son libellé et sa description : le
 * manuel Visa ne fournit pas de mots-clés métier. Sans dérivation, il n'est
 * trouvable que si l'agent emploie par hasard les mots exacts du libellé.
 */

export const MOTS_VIDES = new Set([
  'les', 'des', 'une', 'aux', 'par', 'pour', 'avec', 'dans', 'sur', 'sous', 'que', 'qui',
  'nos', 'notre', 'vos', 'votre', 'ses', 'son', 'sa', 'est', 'sont', 'ont', 'plus', 'tout',
  'tous', 'toute', 'toutes', 'ainsi', 'entre', 'chez', 'cette', 'ces', 'leur', 'leurs',
  'vente', 'ventes', 'vend', 'vendre', 'site', 'ligne', 'client', 'clients', 'produit',
  'produits', 'service', 'services', 'societe', 'entreprise', 'commerce', 'boutique',
  'the', 'and', 'for', 'with', 'this', 'that', 'are', 'not', 'mcc', 'merchants', 'classified',
  'include', 'included', 'including', 'other', 'elsewhere',
  // Tournures récurrentes des descriptions du référentiel : elles n'apportent
  // aucune discrimination entre deux codes.
  'code', 'codes', 'detail', 'gros', 'divers', 'autres', 'type', 'types', 'activite',
  'activites', 'classe', 'classes', 'relevant', 'couverte', 'couvert', 'precis', 'plus',
  'ailleurs', 'notamment', 'exemple', 'compris', 'destines', 'destine',
]);

/** Découpe un texte en jetons signifiants (mots de 3 lettres et plus). */
export function tokenize(text) {
  return normalize(text)
    .split(' ')
    .filter((token) => token.length >= 3 && !MOTS_VIDES.has(token));
}

/**
 * Variantes d'un jeton, pour que « trottinette » retrouve « trottinettes ».
 * Volontairement rudimentaire : pas de racinisation linguistique, seulement les
 * marques de pluriel françaises les plus courantes.
 */
export function variantes(token) {
  const formes = new Set([token]);
  if (token.length > 4) {
    if (token.endsWith('aux')) formes.add(`${token.slice(0, -3)}al`);
    else if (token.endsWith('eaux')) formes.add(token.slice(0, -1));
    else if (token.endsWith('s') || token.endsWith('x')) formes.add(token.slice(0, -1));
    else {
      formes.add(`${token}s`);
      if (token.endsWith('al')) formes.add(`${token.slice(0, -2)}aux`);
    }
  }
  return [...formes];
}

const MAX_MOTS_DERIVES = 30;

/**
 * Dérive des mots-clés à partir du libellé et de la description d'un MCC.
 *
 * Le libellé pèse davantage : il nomme l'activité, là où la description la
 * commente. Les bigrammes du libellé sont conservés car le moteur valorise les
 * expressions complètes (« bornes recharge » plutôt que « bornes » seul).
 */
export function deriverMotsCles({ label = '', description = '', labelEn = '' } = {}) {
  const jetonsLibelle = tokenize(label);
  const jetonsDescription = tokenize(description);
  const jetonsAnglais = tokenize(labelEn);

  const derives = new Set();

  // Bigrammes du libellé : les expressions valent mieux que les mots isolés.
  for (let i = 0; i < jetonsLibelle.length - 1; i += 1) {
    derives.add(`${jetonsLibelle[i]} ${jetonsLibelle[i + 1]}`);
  }

  for (const jeton of [...jetonsLibelle, ...jetonsAnglais]) {
    for (const forme of variantes(jeton)) derives.add(forme);
  }
  for (const jeton of jetonsDescription) {
    if (derives.size >= MAX_MOTS_DERIVES) break;
    for (const forme of variantes(jeton)) derives.add(forme);
  }

  return [...derives].slice(0, MAX_MOTS_DERIVES);
}
