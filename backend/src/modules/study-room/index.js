/**
 * Public API for the study-room module.
 * Other modules must import from this file only.
 */
import { createRouter } from './routes/index.js';

export const MODULE_ID = 'study-room';
export const API_PREFIX = '/api/study-room';

export function createStudyRoomModule() {
  const router = createRouter();
  return {
    id: MODULE_ID,
    apiPrefix: API_PREFIX,
    router,
  };
}

export { createRouter };
export {
  Conversation,
  Message,
  SharedFolder,
  SharedResource,
  StudyRoomSettings,
  CryptoPublicKey,
  ConversationKeyEnvelope,
  MessageReceipt,
  ResourceReport,
} from './models/index.js';
export { attachStudyRoomRealtime } from './realtime/attach-study-room.js';
export { disconnectStudyRoomSockets } from './realtime/socket-registry.js';
export { syncSharedResourceAfterScan } from './services/resource.service.js';
export { listStudentAvailableSharedResources } from './services/agent-source.service.js';
export { CRYPTO_PROTOCOL, MODERATION_MODES } from './constants.js';
