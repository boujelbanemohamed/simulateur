import ExcelJS from 'exceljs';
import { normalize } from './mccCatalog.js';

/**
 * Lecture d'un référentiel MCC fourni en Excel (.xlsx) ou en CSV.
 *
 * Le fichier vient d'une équipe métier, pas d'un développeur : les en-têtes sont
 * reconnus par leur libellé (avec variantes), l'ordre des colonnes est libre, et
 * une ligne illisible est signalée dans un rapport d'anomalies plutôt que
 * silencieusement ignorée.
 */

/** Intitulés acceptés pour chaque champ, comparés après normalisation. */
const COLONNES = {
  code: ['code', 'mcc', 'code mcc', 'mcc code', 'numero'],
  label: ['libelle', 'libelle fr', 'libelle francais', 'intitule', 'designation', 'label', 'nom'],
  description: ['description', 'description fr', 'description francaise', 'definition'],
  labelEn: ['libelle en', 'libelle anglais', 'label en', 'mcc title', 'title', 'intitule anglais'],
  descriptionEn: ['description en', 'description anglaise', 'mcc description', 'definition visa'],
  keywords: ['mots cles', 'motscles', 'keywords', 'mots cles moteur', 'synonymes'],
  ecommerceRelevance: ['pertinence', 'pertinence e commerce', 'pertinence ecommerce', 'relevance'],
  riskLevel: ['vigilance', 'niveau de vigilance', 'risque', 'niveau de risque', 'risk'],
  note: ['note', 'commentaire', 'remarque'],
  sector: ['secteur', 'secteur d activite', 'famille', 'univers'],
};

const PERTINENCES = {
  high: 'HIGH', forte: 'HIGH', haute: 'HIGH', elevee: 'HIGH', '3': 'HIGH',
  medium: 'MEDIUM', moyenne: 'MEDIUM', moyen: 'MEDIUM', '2': 'MEDIUM',
  low: 'LOW', faible: 'LOW', basse: 'LOW', '1': 'LOW',
};

const VIGILANCES = {
  standard: 'STANDARD', normal: 'STANDARD', normale: 'STANDARD', aucune: 'STANDARD',
  sensible: 'SENSIBLE', renforcee: 'SENSIBLE', 'vigilance renforcee': 'SENSIBLE', surveillance: 'SENSIBLE',
  interdit: 'INTERDIT', interdite: 'INTERDIT', 'non eligible': 'INTERDIT', exclu: 'INTERDIT', refuse: 'INTERDIT',
};

/** Associe chaque colonne du fichier à un champ connu, ou la déclare ignorée. */
function mapperEntetes(entetes) {
  const correspondances = {};
  const ignorees = [];

  entetes.forEach((entete, index) => {
    const cle = normalize(entete);
    if (!cle) return;
    const champ = Object.keys(COLONNES).find((c) => COLONNES[c].includes(cle));
    if (champ && correspondances[champ] === undefined) correspondances[champ] = index;
    else ignorees.push(entete);
  });

  return { correspondances, ignorees };
}

/** Excel rend souvent un code numérique : 5977 → "5977", 742 → "0742". */
function normaliserCode(valeur) {
  if (valeur === null || valeur === undefined) return null;
  const brut = String(valeur).trim().replace(/\.0+$/, '');
  if (!/^\d{1,4}$/.test(brut)) return null;
  return brut.padStart(4, '0');
}

const texte = (valeur) => {
  if (valeur === null || valeur === undefined) return null;
  // ExcelJS renvoie un objet pour les cellules riches ou les formules.
  const brut = typeof valeur === 'object'
    ? (valeur.text ?? valeur.result ?? valeur.richText?.map((r) => r.text).join('') ?? '')
    : String(valeur);
  const propre = brut.trim();
  return propre === '' ? null : propre;
};

/**
 * Découpe une cellule de mots-clés.
 *
 * Le retour à la ligne prime : c'est le séparateur produit à l'export, et
 * certains mots-clés contiennent eux-mêmes une virgule (« local, suburban
 * commuter »). Découper sur la virgule dans ce cas les scinderait en deux à
 * chaque aller-retour. Sans retour à la ligne, on accepte la virgule et le
 * point-virgule, que les équipes métier utilisent naturellement.
 */
const motsCles = (valeur) => {
  const brut = texte(valeur);
  if (!brut) return undefined;
  const separateur = /[\r\n]/.test(brut) ? /[\r\n]+/ : /[,;]/;
  return brut.split(separateur).map((m) => m.trim()).filter(Boolean);
};

/**
 * @param {Buffer} buffer contenu du fichier
 * @param {string} nomFichier sert à choisir le lecteur (xlsx ou csv)
 * @returns {Promise<{entrees, anomalies, colonnesDetectees, colonnesIgnorees, lignesLues}>}
 */
export async function lireReferentiel(buffer, nomFichier = '') {
  const classeur = new ExcelJS.Workbook();
  const estCsv = /\.csv$/i.test(nomFichier);

  let feuille;
  if (estCsv) {
    const { Readable } = await import('node:stream');
    feuille = await classeur.csv.read(Readable.from(buffer));
  } else {
    await classeur.xlsx.load(buffer);
    feuille = classeur.worksheets[0];
  }
  if (!feuille || feuille.rowCount === 0) {
    throw new Error('Le fichier ne contient aucune feuille exploitable.');
  }

  const entetes = [];
  feuille.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    entetes[col - 1] = texte(cell.value) ?? '';
  });

  const { correspondances, ignorees } = mapperEntetes(entetes);
  if (correspondances.code === undefined) {
    throw new Error(
      `Colonne « code » introuvable. En-têtes lus : ${entetes.filter(Boolean).join(', ') || '(aucun)'}.`
    );
  }

  const entrees = [];
  const anomalies = [];
  const vus = new Map();
  let lignesLues = 0;

  for (let numero = 2; numero <= feuille.rowCount; numero += 1) {
    const ligne = feuille.getRow(numero);
    const valeur = (champ) =>
      correspondances[champ] === undefined ? null : ligne.getCell(correspondances[champ] + 1).value;

    const cellules = Object.keys(correspondances).map((champ) => texte(valeur(champ)));
    if (cellules.every((c) => c === null)) continue; // ligne vide
    lignesLues += 1;

    const code = normaliserCode(valeur('code'));
    if (!code) {
      anomalies.push({ ligne: numero, motif: 'Code MCC illisible ou absent', valeur: texte(valeur('code')) });
      continue;
    }
    if (vus.has(code)) {
      anomalies.push({ ligne: numero, motif: `Code ${code} déjà présent ligne ${vus.get(code)}`, valeur: code });
      continue;
    }
    vus.set(code, numero);

    const entree = { code };
    for (const champ of ['label', 'description', 'labelEn', 'descriptionEn', 'note', 'sector']) {
      const v = texte(valeur(champ));
      if (v !== null) entree[champ] = v;
    }
    const cles = motsCles(valeur('keywords'));
    if (cles) entree.keywords = cles;

    const pertinence = texte(valeur('ecommerceRelevance'));
    if (pertinence) {
      const traduite = PERTINENCES[normalize(pertinence)];
      if (traduite) entree.ecommerceRelevance = traduite;
      else anomalies.push({ ligne: numero, motif: `Pertinence non reconnue : « ${pertinence} »`, valeur: code });
    }

    const vigilance = texte(valeur('riskLevel'));
    if (vigilance) {
      const traduite = VIGILANCES[normalize(vigilance)];
      if (traduite) entree.riskLevel = traduite;
      else anomalies.push({ ligne: numero, motif: `Niveau de vigilance non reconnu : « ${vigilance} »`, valeur: code });
    }

    entrees.push(entree);
  }

  if (entrees.length === 0) {
    throw new Error("Aucune ligne exploitable : vérifiez que la colonne « code » contient des MCC à 4 chiffres.");
  }

  return {
    entrees,
    anomalies,
    colonnesDetectees: Object.keys(correspondances),
    colonnesIgnorees: ignorees,
    lignesLues,
  };
}

const EN_TETES = [
  { champ: 'code', titre: 'Code', largeur: 10 },
  { champ: 'label', titre: 'Libellé', largeur: 45 },
  { champ: 'description', titre: 'Description', largeur: 70 },
  { champ: 'keywords', titre: 'Mots-clés', largeur: 50 },
  { champ: 'ecommerceRelevance', titre: 'Pertinence', largeur: 14 },
  { champ: 'riskLevel', titre: 'Vigilance', largeur: 16 },
  { champ: 'note', titre: 'Note', largeur: 40 },
  { champ: 'sector', titre: 'Secteur', largeur: 28 },
  { champ: 'labelEn', titre: 'Libellé EN', largeur: 45 },
  { champ: 'descriptionEn', titre: 'Description EN', largeur: 70 },
];

const LIBELLE_PERTINENCE = { HIGH: 'Forte', MEDIUM: 'Moyenne', LOW: 'Faible' };
const LIBELLE_VIGILANCE = { STANDARD: 'Standard', SENSIBLE: 'Sensible', INTERDIT: 'Interdit' };

/**
 * Exporte le référentiel courant. C'est le point de départ du cycle réel :
 * l'équipe télécharge, corrige dans Excel, et réimporte le même fichier.
 */
export async function ecrireReferentiel(codes, format = 'xlsx') {
  const classeur = new ExcelJS.Workbook();
  classeur.creator = 'Plateforme d’affiliation ClickToPay';
  classeur.created = new Date();
  const feuille = classeur.addWorksheet('Référentiel MCC');

  feuille.columns = EN_TETES.map((e) => ({ header: e.titre, key: e.champ, width: e.largeur }));
  feuille.getRow(1).font = { bold: true };
  feuille.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7F0F8' } };
  feuille.views = [{ state: 'frozen', ySplit: 1 }];

  for (const mcc of codes) {
    feuille.addRow({
      code: mcc.code,
      label: mcc.label,
      description: mcc.description,
      // Un mot-clé par ligne : certains contiennent une virgule (« local, suburban
      // commuter ») et un séparateur virgule les scinderait à la relecture.
      keywords: (mcc.keywords ?? []).join('\n'),
      ecommerceRelevance: LIBELLE_PERTINENCE[mcc.ecommerceRelevance] ?? mcc.ecommerceRelevance,
      riskLevel: LIBELLE_VIGILANCE[mcc.riskLevel] ?? mcc.riskLevel,
      note: mcc.note ?? '',
      // Tous les secteurs, séparés par une virgule : n'exporter que le premier
      // puis réimporter le fichier effacerait les autres rattachements.
      sector: (mcc.sectors ?? []).join(', '),
      labelEn: mcc.labelEn ?? '',
      descriptionEn: mcc.descriptionEn ?? '',
    });
  }
  // Le code reste du texte : Excel ne doit pas transformer 5977 en nombre au réenregistrement.
  feuille.getColumn('code').numFmt = '@';
  feuille.getColumn('keywords').alignment = { wrapText: true, vertical: 'top' };
  feuille.getColumn('description').alignment = { wrapText: true, vertical: 'top' };

  return format === 'csv'
    ? Buffer.from(await classeur.csv.writeBuffer())
    : Buffer.from(await classeur.xlsx.writeBuffer());
}
