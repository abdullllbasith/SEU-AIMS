import { createRedisClient, connectRedis, disconnectRedis } from './redis/client.js';
import { createJobQueue } from './queue/job-queue.js';
import { createFileStorage } from './storage/file-storage.js';
import { createEmailProvider } from './providers/email-provider.js';
import { createWhatsAppProvider } from './providers/whatsapp-provider.js';
import { createMalwareScanner } from './providers/malware-scanner.js';
import { createAiProvider } from './providers/ai-provider.js';
import { connectMongo } from './database/mongo.js';
import { registerModels } from './database/register-models.js';
import { ensureCurriculumMappingIndex } from '../modules/academic-foundation/models/ensure-curriculum-index.js';
import { ensureConversationIndexes } from '../modules/study-room/models/ensure-conversation-index.js';

export async function createInfrastructure({ config, logger, backendRoot, connect = true }) {
  let redis = createRedisClient({ url: config.redis.url, logger });
  const storage = createFileStorage({ config, backendRoot });
  const email = createEmailProvider({ config });
  const whatsapp = createWhatsAppProvider({ config });
  const malwareScanner = createMalwareScanner({ config, storage });
  const aiProvider = createAiProvider({ config });

  if (connect) {
    await connectMongo({
      uri: config.mongo.uri,
      logger,
      maxPoolSize: config.mongo.maxPoolSize,
      serverSelectionTimeoutMS: config.mongo.serverSelectionTimeoutMS,
    });
    registerModels();
    await ensureCurriculumMappingIndex({ logger });
    await ensureConversationIndexes({ logger });
    try {
      await connectRedis(redis, { logger });
    } catch (error) {
      if (config.isProduction && process.env.VERCEL !== '1') {
        throw error;
      }
      logger.warn('Redis is not reachable; API will run without the shared queue and socket adapter', {
        message: error.message,
      });
      await disconnectRedis(redis, { logger });
      redis = null;
    }
  }

  const queue = createJobQueue({
    redis: connect && redis ? redis : null,
    redisUrl: config.redis.url,
    logger,
    prefix: config.redis.queuePrefix,
  });

  return {
    redis,
    queue,
    storage,
    email,
    whatsapp,
    malwareScanner,
    aiProvider,
    config,
  };
}
