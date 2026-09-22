import 'dotenv/config';

const environnement = process.env.NODE_ENV ?? 'development';
const enProduction = environnement === 'production';

/**
 * Valeur obligatoire en production, avec repli de développement.
 *
 * La version précédente ne pouvait jamais lever : un repli étant toujours
 * fourni, la valeur n'était jamais `undefined`. Une API démarrée en production
 * sans `JWT_SECRET` tournait donc avec le secret de développement, publié dans
 * le dépôt — de quoi forger un jeton ADMIN et traverser le cloisonnement
 * inter-banques. Mieux vaut refuser de démarrer.
 */
const required = (name, replileDeDeveloppement) => {
  const value = process.env[name];
  if (value !== undefined && value !== '') return value;
  if (enProduction) {
    throw new Error(
      `Variable d'environnement obligatoire en production : ${name}. ` +
        'Le repli de développement ne doit jamais servir hors développement.'
    );
  }
  return replileDeDeveloppement;
};

/**
 * Secrets refusés en production : celui publié dans le dépôt, et tout secret
 * trop court pour résister à une recherche exhaustive. Exiger la seule présence
 * de la variable laissait passer la valeur de développement, connue de quiconque
 * lit le code.
 */
const SECRET_DE_DEVELOPPEMENT = 'dev-secret-a-remplacer-en-production';
const LONGUEUR_MINIMALE_SECRET = 32;

const secretDeProduction = (valeur) => {
  if (!enProduction) return valeur;
  if (valeur === SECRET_DE_DEVELOPPEMENT) {
    throw new Error(
      'JWT_SECRET vaut le secret de développement publié dans le dépôt : ' +
        'tout jeton, y compris administrateur, pourrait être forgé.'
    );
  }
  if (valeur.length < LONGUEUR_MINIMALE_SECRET) {
    throw new Error(
      `JWT_SECRET doit compter au moins ${LONGUEUR_MINIMALE_SECRET} caractères en production.`
    );
  }
  return valeur;
};

export const config = {
  env: environnement,
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required(
    'DATABASE_URL',
    'postgres://clicktopay:clicktopay@127.0.0.1:5432/clicktopay'
  ),
  jwtSecret: secretDeProduction(required('JWT_SECRET', SECRET_DE_DEVELOPPEMENT)),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  // Nombre de MCC proposés par réseau
  suggestionLimit: Number(process.env.SUGGESTION_LIMIT ?? 6),
  // Tentatives de connexion autorisées par fenêtre, par IP et par compte visé.
  // Relevé dans les tests automatisés, qui se connectent des dizaines de fois.
  loginRateLimitMax: Number(process.env.LOGIN_RATE_LIMIT_MAX ?? 10),
  loginRateLimitWindowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
};
