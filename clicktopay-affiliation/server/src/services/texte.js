/**
 * Normalisation partagée : minuscules, sans accents ni ponctuation.
 * Isolée dans son propre module pour que le catalogue et la dérivation des
 * mots-clés puissent l'utiliser sans dépendre l'un de l'autre.
 */
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
