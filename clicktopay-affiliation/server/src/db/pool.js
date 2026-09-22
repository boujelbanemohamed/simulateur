import pg from 'pg';
import { config } from '../config.js';

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

export const query = (text, params) => pool.query(text, params);

/**
 * Exécute `fn` dans une transaction et relâche toujours le client.
 *
 * Le retour arrière est protégé : lancé sur une connexion déjà morte — soit
 * exactement la situation d'un incident de base — il levait à son tour et
 * REMPLAÇAIT l'erreur d'origine. Le journal ne gardait plus que « connection
 * terminated », et la cause réelle de l'incident était perdue au moment précis
 * où l'on en avait besoin.
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  let transactionOuverte = false;
  // Non nul quand l'état de la connexion n'est plus fiable : elle est alors
  // détruite plutôt que recyclée par le lot.
  let connexionSuspecte = null;
  try {
    await client.query('BEGIN');
    transactionOuverte = true;
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    if (transactionOuverte) {
      try {
        await client.query('ROLLBACK');
      } catch (retourArriere) {
        console.error('Retour arrière impossible :', retourArriere.message);
        connexionSuspecte = retourArriere;
      }
    } else {
      // `BEGIN` lui-même a échoué : il n'y a rien à annuler.
      connexionSuspecte = err;
    }
    // Toujours l'erreur d'origine, jamais celle du retour arrière.
    throw err;
  } finally {
    // Une erreur métier laisse la connexion saine : la détruire à chaque refus
    // ferait tourner le lot pour rien. Seule une connexion suspecte est retirée.
    client.release(connexionSuspecte ?? undefined);
  }
}
