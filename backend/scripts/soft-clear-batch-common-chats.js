#!/usr/bin/env node
/**
 * Soft-clear every batch common-chat message by setting deletedAt.
 * Records are kept (no hard delete). Private chats are not touched.
 *
 * Usage (from backend/):
 *   node scripts/soft-clear-batch-common-chats.js           # dry run, prints counts only
 *   node scripts/soft-clear-batch-common-chats.js --apply   # writes deletedAt
 */
import dotenv from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(scriptDir, '../../.env') });
dotenv.config({ path: join(scriptDir, '../.env') });

import { connectMongo, disconnectMongo } from '../src/infrastructure/database/mongo.js';
import { registerModels } from '../src/infrastructure/database/register-models.js';
import { Conversation } from '../src/modules/study-room/models/conversation.model.js';
import { Message } from '../src/modules/study-room/models/message.model.js';

const apply = process.argv.includes('--apply');

async function main() {
  registerModels();
  await connectMongo({ uri: process.env.MONGODB_URI });

  const conversationIds = await Conversation.find({ type: 'BATCH' }).distinct('_id');
  const filter = { conversationId: { $in: conversationIds }, deletedAt: { $exists: false } };
  const pending = await Message.countDocuments(filter);
  const total = await Message.countDocuments({ conversationId: { $in: conversationIds } });

  console.log(`Batch conversations: ${conversationIds.length}`);
  console.log(`Batch messages total: ${total}`);
  console.log(`Messages to soft-clear (not already deleted): ${pending}`);

  if (!apply) {
    console.log('Dry run only. Re-run with --apply to write deletedAt.');
    return;
  }

  const result = await Message.updateMany(filter, { $set: { deletedAt: new Date() } });
  console.log(`Soft-cleared ${result.modifiedCount} message(s).`);
}

main()
  .catch((error) => {
    console.error('Soft-clear failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => disconnectMongo());
