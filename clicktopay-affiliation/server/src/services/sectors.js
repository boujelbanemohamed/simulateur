/**
 * Secteurs d'activité proposés à l'agent dans le formulaire.
 * Chaque secteur amorce le moteur de suggestion avec les MCC les plus
 * fréquemment retenus pour ce type de e-commerçant.
 */
export const SECTORS = [
  { key: 'MODE_HABILLEMENT', label: 'Mode et habillement', mccs: ['5651', '5691', '5621', '5611', '5641', '5661', '5948', '5699'] },
  { key: 'ELECTRONIQUE_HIGHTECH', label: 'Électronique et high-tech', mccs: ['5732', '5722', '4812', '5045', '5946'] },
  { key: 'INFORMATIQUE_LOGICIEL', label: 'Informatique, logiciels et services en ligne', mccs: ['7372', '5734', '4816', '7379', '5817'] },
  { key: 'ALIMENTAIRE', label: 'Alimentaire et produits frais', mccs: ['5411', '5499', '5462', '5441', '5451'] },
  { key: 'RESTAURATION', label: 'Restauration et livraison de repas', mccs: ['5814', '5812', '5811'] },
  { key: 'BEAUTE_COSMETIQUE', label: 'Beauté, cosmétique et parfumerie', mccs: ['5977', '7230', '7298', '5912'] },
  { key: 'SANTE', label: 'Santé et paramédical', mccs: ['8099', '8011', '5912', '5047', '8043'] },
  { key: 'MAISON_DECORATION', label: 'Maison, ameublement et décoration', mccs: ['5712', '5719', '5200', '5714', '5950'] },
  { key: 'BRICOLAGE_JARDIN', label: 'Bricolage, jardinage et matériaux', mccs: ['5200', '5251', '5261', '5211', '5231'] },
  { key: 'SPORT_LOISIRS', label: 'Sport et loisirs', mccs: ['5941', '5940', '7997', '5655', '7999'] },
  { key: 'JOUETS_ENFANTS', label: 'Jouets et univers enfant', mccs: ['5945', '5641', '8351'] },
  { key: 'LIVRES_CULTURE', label: 'Livres, presse et culture', mccs: ['5942', '5994', '5815', '5733', '5971'] },
  { key: 'CONTENUS_NUMERIQUES', label: 'Contenus et biens numériques', mccs: ['5815', '5816', '5817', '5818', '4899'] },
  { key: 'TOURISME_VOYAGE', label: 'Tourisme et voyage', mccs: ['4722', '7011', '4511', '4112', '5962'] },
  { key: 'TRANSPORT_LIVRAISON', label: 'Transport et livraison', mccs: ['4215', '4214', '4121', '4789'] },
  { key: 'BILLETTERIE_EVENEMENT', label: 'Billetterie et événementiel', mccs: ['7922', '7991', '7941', '7832', '7996'] },
  { key: 'TELECOM', label: 'Télécommunications et recharges', mccs: ['4814', '4812', '4899'] },
  { key: 'SERVICES_PROFESSIONNELS', label: 'Services aux entreprises et professions libérales', mccs: ['7392', '8999', '7399', '8931', '8111', '7311'] },
  { key: 'EDUCATION_FORMATION', label: 'Éducation et formation', mccs: ['8299', '8249', '8220', '8211', '8241'] },
  { key: 'ASSURANCE_FINANCE', label: 'Assurance et services financiers', mccs: ['6300', '5960', '6012', '6513'] },
  { key: 'ARTISANAT_CADEAUX', label: 'Artisanat, cadeaux et souvenirs', mccs: ['5947', '5970', '5973', '5937', '5944'] },
  { key: 'ANIMALERIE', label: 'Animalerie', mccs: ['5995'] },
  { key: 'AUTOMOBILE', label: 'Automobile et deux-roues', mccs: ['5533', '5532', '5571', '5511', '7538'] },
  { key: 'ADMINISTRATION', label: 'Administration et services publics', mccs: ['9399', '9311', '9402', '4900', '9222'] },
  { key: 'ASSOCIATIF_DONS', label: 'Associatif et collecte de dons', mccs: ['8398', '8641', '8699', '8661'] },
  { key: 'MARKETPLACE', label: 'Place de marché (vendeurs tiers)', mccs: ['5262'] },
  { key: 'AUTRE', label: 'Autre activité', mccs: ['5999', '5969', '8999'] },
];

export const SECTOR_KEYS = SECTORS.map((s) => s.key);

const byKey = new Map(SECTORS.map((s) => [s.key, s]));
export const getSector = (key) => byKey.get(key) ?? null;
