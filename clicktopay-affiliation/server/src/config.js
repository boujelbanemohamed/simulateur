import 'dotenv/config';

const required = (name, fallback) => {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
};

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required(
    'DATABASE_URL',
    'postgres://clicktopay:clicktopay@127.0.0.1:5432/clicktopay'
  ),
  jwtSecret: required('JWT_SECRET', 'dev-secret-a-remplacer-en-production'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  // Nombre de MCC proposés par réseau
  suggestionLimit: Number(process.env.SUGGESTION_LIMIT ?? 6),
  // Tentatives de connexion autorisées par fenêtre, par IP et par compte visé.
  // Relevé dans les tests automatisés, qui se connectent des dizaines de fois.
  loginRateLimitMax: Number(process.env.LOGIN_RATE_LIMIT_MAX ?? 10),
  loginRateLimitWindowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
};
