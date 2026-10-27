import { Conversation } from './conversation.model.js';

const LEGACY_BATCH_INDEX = 'type_1_batchId_1';
const BATCH_INDEX = 'batch_conversation_unique';

export async function ensureConversationIndexes({ logger } = {}) {
  const existing = await Conversation.collection.indexes();
  const legacy = existing.find((item) => item.name === LEGACY_BATCH_INDEX);
  if (legacy && !legacy.partialFilterExpression) {
    await Conversation.collection.dropIndex(LEGACY_BATCH_INDEX);
  }

  await Conversation.collection.createIndex(
    { type: 1, batchId: 1 },
    {
      unique: true,
      name: BATCH_INDEX,
      partialFilterExpression: { type: 'BATCH' },
    },
  );

  logger?.info('Study Room conversation indexes verified', { name: BATCH_INDEX });
}
