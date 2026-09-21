import { createApp } from './app.js';
import { config } from './config.js';
import { ecouterModifications } from './services/mccCatalog.js';

createApp().listen(config.port, async () => {
  console.log(`API ClickToPay Affiliation à l'écoute sur http://localhost:${config.port}`);
  // Le référentiel peut être modifié par une autre instance : on écoute pour
  // recharger le cache local au lieu de servir des codes périmés.
  try {
    await ecouterModifications();
  } catch (err) {
    console.error('Écoute du référentiel MCC indisponible :', err.message);
  }
});
