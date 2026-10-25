import { loadConfig } from '../src/config/index.js';
import { assertProductionConfig } from '../src/config/validate-production.js';
import { createLogger } from '../src/infrastructure/logging/logger.js';
import { createInfrastructure } from '../src/infrastructure/create-infrastructure.js';
import { createApp } from '../src/app/create-app.js';

let appPromise;

function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      const config = loadConfig();
      assertProductionConfig(config);
      const logger = createLogger({ service: 'seu-aims-api', level: config.logLevel });
      const infrastructure = await createInfrastructure({
        config,
        logger,
        backendRoot: process.cwd(),
        connect: true,
      });
      return createApp({ config, logger, infrastructure });
    })().catch((error) => {
      appPromise = null;
      throw error;
    });
  }
  return appPromise;
}

export default async function handler(req, res) {
  const url = req.url || '/';
  if (!url.startsWith('/api')) {
    const queryIndex = url.indexOf('?');
    const path = queryIndex === -1 ? url : url.slice(0, queryIndex);
    const query = queryIndex === -1 ? '' : url.slice(queryIndex);
    const normalized = path.startsWith('/') ? path : `/${path}`;
    req.url = `/api${normalized}${query}`;
  }
  const app = await getApp();
  return app(req, res);
}
