import { createRedisClient, connectRedis } from './redis/client.js';
import { createJobQueue } from './queue/job-queue.js';
import { createFileStorage } from './storage/file-storage.js';
import { createEmailProvider } from './providers/email-provider.js';
import { createWhatsAppProvider } from './providers/whatsapp-provider.js';
import { createMalwareScanner } from './providers/malware-scanner.js';
import { connectMongo } from './database/mongo.js';
import { registerModels } from './database/register-models.js';

export async function createInfrastructure({ config, logger, backendRoot, connect = true }) {
  const redis = createRedisClient({ url: config.redis.url, logger });
  const queue = createJobQueue({ redisUrl: config.redis.url, logger });
  const storage = createFileStorage({ config, backendRoot });
  const email = createEmailProvider({ config });
  const whatsapp = createWhatsAppProvider({ config });
  const malwareScanner = createMalwareScanner({ config });

  if (connect) {
    await connectMongo({ uri: config.mongo.uri, logger });
    registerModels();
    await connectRedis(redis, { logger });
  }

  return {
    redis,
    queue,
    storage,
    email,
    whatsapp,
    malwareScanner,
    config,
  };
}
