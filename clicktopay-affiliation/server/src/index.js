import { createApp } from './app.js';
import { config } from './config.js';
import { arreterEcoute, ecouterModifications } from './services/mccCatalog.js';

const serveur = createApp().listen(config.port, async () => {
  console.log(`API ClickToPay Affiliation à l'écoute sur http://localhost:${config.port}`);
  // Le référentiel peut être modifié par une autre instance : on écoute pour
  // recharger le cache local au lieu de servir des codes périmés. Un échec n'est
  // pas fatal : le service replanifie sa reprise tout seul.
  try {
    await ecouterModifications();
  } catch (err) {
    console.error('Écoute du référentiel MCC indisponible :', err.message);
  }
});

// Sans cela, une tentative de reprise programmée peut survivre à l'arrêt demandé
// et rouvrir une connexion sur une base qu'on est en train de quitter.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    arreterEcoute();
    serveur.close(() => process.exit(0));
  });
}
