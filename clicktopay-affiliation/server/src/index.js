import { createApp } from './app.js';
import { config } from './config.js';

createApp().listen(config.port, () => {
  console.log(`API ClickToPay Affiliation à l'écoute sur http://localhost:${config.port}`);
});
