// Test cards (well-known test PANs) + reference data for the terminal.

export const TEST_CARDS = [
  { id: "visa1", scheme: "Visa", pan: "4111111111111111", expiry: "2812", label: "Visa •••• 1111" },
  { id: "visa2", scheme: "Visa", pan: "4532015112830366", expiry: "2705", label: "Visa •••• 0366" },
  { id: "mc1", scheme: "Mastercard", pan: "5413330089020011", expiry: "2903", label: "Mastercard •••• 0011" },
  { id: "mc2", scheme: "Mastercard", pan: "2223000048400011", expiry: "2711", label: "Mastercard (2-series) •••• 0011" },
];

export const CURRENCIES = [
  { code: "788", label: "TND — Dinar tunisien", symbol: "DT" },
  { code: "840", label: "USD — Dollar US", symbol: "$" },
  { code: "978", label: "EUR — Euro", symbol: "€" },
  { code: "826", label: "GBP — Livre sterling", symbol: "£" },
];

export const POS_ENTRY_MODES = [
  { code: "051", label: "Puce avec contact (PIN)" },
  { code: "071", label: "Sans contact" },
  { code: "901", label: "Bande magnétique" },
  { code: "011", label: "Saisie manuelle" },
  { code: "810", label: "E-commerce (en ligne)" },
];

export const UCAF_LEVELS = {
  "0": "Non authentifié (SecureCode non entrepris)",
  "1": "Merchant UCAF (tentative)",
  "2": "Full UCAF (marchand + émetteur)",
};

// Human labels for the decoded-field table (subset we care about).
export const FIELD_LABELS = {
  2: "PAN", 3: "Code traitement", 4: "Montant", 5: "Montant règlement",
  6: "Montant facturation", 7: "Date/heure transmission",
  11: "STAN", 12: "Heure locale", 13: "Date locale", 14: "Expiration",
  18: "MCC", 19: "Pays acquéreur", 22: "Mode saisie POS", 32: "ID acquéreur",
  48: "UCAF (e-commerce)",
  37: "RRN", 38: "Code autorisation", 39: "Code réponse", 41: "ID terminal",
  42: "ID accepteur", 43: "Nom/lieu accepteur", 49: "Devise",
  61: "Ville accepteur (DE-43 sf3)",
  "2_PAN_tokenized": "PAN (tokenisé)", "52_CVV_tokenized": "CVV (tokenisé)",
};

export const RESPONSE_LABELS = {
  "00": "Approuvée",
  "05": "Refusée (ne pas honorer)",
  "14": "Carte invalide",
  "51": "Provision insuffisante",
};

// Codes supplémentaires pertinents pour le DAB (indicatifs — spec réseau).
export const DAB_RESPONSE_LABELS = {
  "54": "Carte expirée",
  "55": "PIN incorrect",
  "61": "Dépasse limite de retrait",
  "75": "Tentatives PIN dépassées",
  "91": "Émetteur indisponible",
};
