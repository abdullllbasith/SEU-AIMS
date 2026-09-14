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
export { Conversation } from './models/conversation.model.js';
export { Message } from './models/message.model.js';
export { SharedFolder } from './models/shared-folder.model.js';
export { SharedResource } from './models/shared-resource.model.js';
