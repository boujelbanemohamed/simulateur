-- Schéma de la plateforme d'affiliation ClickToPay
-- Exécuté par `npm run db:migrate` (idempotent).

CREATE TABLE IF NOT EXISTS banks (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(16)  NOT NULL UNIQUE,
  name        VARCHAR(160) NOT NULL,
  active      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- AGENT    : saisit et soumet les demandes d'affiliation
-- BANQUIER : valide, modifie les MCC, rejette ou demande un complément
-- ADMIN    : administre les utilisateurs et le référentiel
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  bank_id       INTEGER      NOT NULL REFERENCES banks(id),
  email         VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(120) NOT NULL,
  first_name    VARCHAR(80)  NOT NULL,
  last_name     VARCHAR(80)  NOT NULL,
  role          VARCHAR(16)  NOT NULL CHECK (role IN ('AGENT', 'BANQUIER', 'ADMIN')),
  active        BOOLEAN      NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_bank ON users(bank_id);

-- Référentiel MCC (source : Visa Merchant Data Standards Manual, codes ISO 18245
-- partagés avec Mastercard). Alimenté par `npm run db:seed`.
CREATE TABLE IF NOT EXISTS mcc_codes (
  code            CHAR(4)      PRIMARY KEY,
  label_fr        VARCHAR(255) NOT NULL,
  description_fr  TEXT         NOT NULL,
  label_en        VARCHAR(255) NOT NULL,
  description_en  TEXT         NOT NULL,
  keywords        TEXT[]       NOT NULL DEFAULT '{}',
  similar_codes   TEXT[]       NOT NULL DEFAULT '{}',
  ecommerce_relevance VARCHAR(8) NOT NULL DEFAULT 'LOW'
                   CHECK (ecommerce_relevance IN ('HIGH', 'MEDIUM', 'LOW')),
  risk_level      VARCHAR(12)  NOT NULL DEFAULT 'STANDARD'
                   CHECK (risk_level IN ('STANDARD', 'SENSIBLE', 'INTERDIT')),
  note            TEXT,
  networks        TEXT[]       NOT NULL DEFAULT '{VISA,MASTERCARD}',
  source          VARCHAR(160) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mcc_relevance ON mcc_codes(ecommerce_relevance);

CREATE TABLE IF NOT EXISTS affiliation_requests (
  id          SERIAL PRIMARY KEY,
  reference   VARCHAR(24)  NOT NULL UNIQUE,
  bank_id     INTEGER      NOT NULL REFERENCES banks(id),
  created_by  INTEGER      NOT NULL REFERENCES users(id),
  status      VARCHAR(24)  NOT NULL DEFAULT 'BROUILLON'
               CHECK (status IN ('BROUILLON', 'SOUMISE', 'COMPLEMENT_REQUIS', 'VALIDEE', 'REJETEE')),

  -- Site marchand
  site_name          VARCHAR(160) NOT NULL,
  site_url           VARCHAR(255) NOT NULL,
  site_languages     VARCHAR(120),

  -- Société
  company_name       VARCHAR(160) NOT NULL,
  legal_form         VARCHAR(40),
  rne                VARCHAR(32)  NOT NULL,
  tax_id             VARCHAR(32),
  company_created_on DATE,
  share_capital      NUMERIC(14, 3),

  -- Contact
  contact_first_name VARCHAR(80)  NOT NULL,
  contact_last_name  VARCHAR(80)  NOT NULL,
  contact_email      VARCHAR(160) NOT NULL,
  contact_phone      VARCHAR(32)  NOT NULL,

  -- Adresse physique
  address_line1      VARCHAR(180) NOT NULL,
  address_line2      VARCHAR(180),
  city               VARCHAR(80)  NOT NULL,
  postal_code        VARCHAR(16),
  governorate        VARCHAR(80),
  country            VARCHAR(80)  NOT NULL DEFAULT 'Tunisie',

  -- Activité (alimente le moteur de suggestion MCC)
  activity_sector      VARCHAR(80),
  activity_description TEXT         NOT NULL,
  product_types        TEXT,
  delivery_mode        VARCHAR(16)  NOT NULL DEFAULT 'PHYSIQUE'
                        CHECK (delivery_mode IN ('PHYSIQUE', 'NUMERIQUE', 'SERVICE', 'MIXTE')),
  has_subscription     BOOLEAN      NOT NULL DEFAULT FALSE,
  is_marketplace       BOOLEAN      NOT NULL DEFAULT FALSE,
  sells_abroad         BOOLEAN      NOT NULL DEFAULT FALSE,
  average_basket       NUMERIC(14, 3),
  monthly_volume       NUMERIC(14, 3),
  currency             CHAR(3)      NOT NULL DEFAULT 'TND',

  -- Coordonnées bancaires
  rib             VARCHAR(24),
  account_holder  VARCHAR(160),
  bank_agency     VARCHAR(120),

  -- MCC : proposé par l'agent (assisté par le moteur), puis arbitré par le banquier
  proposed_visa_mcc        CHAR(4) REFERENCES mcc_codes(code),
  proposed_mastercard_mcc  CHAR(4) REFERENCES mcc_codes(code),
  proposed_justification   TEXT,
  final_visa_mcc           CHAR(4) REFERENCES mcc_codes(code),
  final_mastercard_mcc     CHAR(4) REFERENCES mcc_codes(code),

  -- Workflow
  submitted_at     TIMESTAMPTZ,
  decided_at       TIMESTAMPTZ,
  decided_by       INTEGER REFERENCES users(id),
  decision_comment TEXT,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_requests_bank_status ON affiliation_requests(bank_id, status);
CREATE INDEX IF NOT EXISTS idx_requests_created_by ON affiliation_requests(created_by);

-- Photographie des MCC proposés par le moteur au moment de la soumission :
-- le banquier doit pouvoir voir ce qui avait été proposé, et pourquoi.
CREATE TABLE IF NOT EXISTS mcc_suggestions (
  id            SERIAL PRIMARY KEY,
  request_id    INTEGER     NOT NULL REFERENCES affiliation_requests(id) ON DELETE CASCADE,
  network       VARCHAR(12) NOT NULL CHECK (network IN ('VISA', 'MASTERCARD')),
  mcc_code      CHAR(4)     NOT NULL REFERENCES mcc_codes(code),
  rank          SMALLINT    NOT NULL,
  score         SMALLINT    NOT NULL,
  matched_terms TEXT[]      NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (request_id, network, mcc_code)
);

CREATE INDEX IF NOT EXISTS idx_suggestions_request ON mcc_suggestions(request_id);

-- Piste d'audit : toute action métier laisse une trace horodatée et nominative.
CREATE TABLE IF NOT EXISTS request_events (
  id          SERIAL PRIMARY KEY,
  request_id  INTEGER     NOT NULL REFERENCES affiliation_requests(id) ON DELETE CASCADE,
  user_id     INTEGER     REFERENCES users(id),
  event_type  VARCHAR(32) NOT NULL,
  comment     TEXT,
  payload     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_request ON request_events(request_id, created_at);

-- Compteur de références AFF-<année>-<séquence>
CREATE SEQUENCE IF NOT EXISTS affiliation_reference_seq START 1;

-- ===========================================================================
-- Administration : la base devient la référence du référentiel MCC, et les
-- profils, banques et codes sont administrables depuis l'application.
-- ===========================================================================

ALTER TABLE mcc_codes ADD COLUMN IF NOT EXISTS active     BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE mcc_codes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE mcc_codes ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Historique des modifications du référentiel : un MCC est une donnée
-- réglementaire, chaque changement doit rester justifiable.
CREATE TABLE IF NOT EXISTS mcc_code_history (
  id         SERIAL PRIMARY KEY,
  code       CHAR(4)     NOT NULL,
  user_id    INTEGER     REFERENCES users(id),
  action     VARCHAR(24) NOT NULL,
  avant      JSONB,
  apres      JSONB,
  comment    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcc_history_code ON mcc_code_history(code, created_at DESC);

-- Journal des actions d'administration (utilisateurs, banques, imports).
CREATE TABLE IF NOT EXISTS admin_events (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER     REFERENCES users(id),
  entity     VARCHAR(24) NOT NULL,
  entity_id  VARCHAR(64),
  action     VARCHAR(32) NOT NULL,
  payload    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_events_date ON admin_events(created_at DESC);

-- Horodatage du dernier changement de mot de passe : tout jeton émis avant est
-- refusé, ce qui coupe réellement les sessions ouvertes lors d'une réinitialisation.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ===========================================================================
-- Secteurs d'activité : ils amorcent le moteur de suggestion avec les MCC les
-- plus fréquents pour un type de commerce. Sortis du code source pour que les
-- codes ajoutés par import puissent y être rattachés sans redéploiement.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS sectors (
  key       VARCHAR(40)  PRIMARY KEY,
  label     VARCHAR(120) NOT NULL,
  position  SMALLINT     NOT NULL DEFAULT 0,
  active    BOOLEAN      NOT NULL DEFAULT TRUE
);

-- Un MCC peut relever de plusieurs secteurs (5912 est à la fois « santé » et
-- « beauté ») : le rattachement est donc une table de liaison, avec un rang qui
-- traduit la priorité du code dans le secteur.
CREATE TABLE IF NOT EXISTS mcc_sectors (
  sector_key VARCHAR(40) NOT NULL REFERENCES sectors(key) ON DELETE CASCADE,
  mcc_code   CHAR(4)     NOT NULL REFERENCES mcc_codes(code) ON DELETE CASCADE,
  rank       SMALLINT    NOT NULL DEFAULT 0,
  PRIMARY KEY (sector_key, mcc_code)
);

CREATE INDEX IF NOT EXISTS idx_mcc_sectors_code ON mcc_sectors(mcc_code);

-- `now()` renvoie l'heure de DÉBUT de transaction : deux écritures concurrentes
-- peuvent donc être horodatées dans l'ordre inverse de leur exécution réelle.
-- Sur une piste d'audit réglementaire, l'ordre doit être celui des faits.
ALTER TABLE request_events   ALTER COLUMN created_at SET DEFAULT clock_timestamp();
ALTER TABLE mcc_code_history ALTER COLUMN created_at SET DEFAULT clock_timestamp();
ALTER TABLE admin_events     ALTER COLUMN created_at SET DEFAULT clock_timestamp();

-- ===========================================================================
-- Unicité de l'adresse électronique, insensible à la casse.
-- ===========================================================================

-- La contrainte UNIQUE portée par la colonne `email` est sensible à la casse :
-- « Agent@banque.tn » et « agent@banque.tn » pouvaient coexister, alors que la
-- connexion compare en minuscules et se serait retrouvée devant deux lignes,
-- dont une seule aurait été retenue, arbitrairement. Les contrôles applicatifs
-- ne suffisent pas : deux créations concurrentes passent l'une et l'autre.
-- La contrainte d'origine est conservée : redondante, mais la retirer
-- demanderait un ALTER TABLE non rejouable.
DO $$
DECLARE doublons TEXT;
BEGIN
  SELECT string_agg(adresse, ', ') INTO doublons
    FROM (SELECT lower(email) AS adresse FROM users GROUP BY lower(email) HAVING count(*) > 1) d;
  IF doublons IS NOT NULL THEN
    -- Échouer ici avec la liste des adresses en cause vaut mieux que de laisser
    -- PostgreSQL refuser l'index sur une erreur brute, sans désigner le problème.
    RAISE EXCEPTION 'Migration interrompue : ces adresses existent en plusieurs casses et doivent être corrigées avant la pose de l''index unique : %', doublons;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email));

-- Le journal se lit désormais page par page, trié par (created_at DESC, id DESC) :
-- l'identifiant départage les entrées du même horodatage, faute de quoi deux
-- pages successives montrent deux fois la même ligne. L'index à une seule
-- colonne ne couvrait que la moitié de ce tri, et `CREATE INDEX IF NOT EXISTS`
-- ne remplace pas un index déjà présent : il faut le retirer explicitement.
DROP INDEX IF EXISTS idx_admin_events_date;
CREATE INDEX IF NOT EXISTS idx_admin_events_date ON admin_events(created_at DESC, id DESC);

-- ===========================================================================
-- Photographie autoportante des suggestions.
-- ===========================================================================

-- La relecture reconstituait le libellé depuis le catalogue VIVANT : un code
-- renommé, corrigé ou désactivé depuis la soumission faisait relire au banquier
-- une photographie retouchée — et un code disparu du cache, une entrée sans
-- libellé. Les deux colonnes restent nullables : c'est ce qui distingue une
-- photographie ancienne, à reconstituer faute de mieux, d'une photographie
-- complète. Aucune valeur n'est inventée rétroactivement.
ALTER TABLE mcc_suggestions ADD COLUMN IF NOT EXISTS label_at_submit       VARCHAR(255);
ALTER TABLE mcc_suggestions ADD COLUMN IF NOT EXISTS description_at_submit TEXT;
