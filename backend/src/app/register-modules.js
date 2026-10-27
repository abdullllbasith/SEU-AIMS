import { createAuthenticationModule } from '../modules/authentication/index.js';
import { createAcademicFoundationModule } from '../modules/academic-foundation/index.js';
import { createLearningEnvironmentModule } from '../modules/learning-environment/index.js';
import { createStudyRoomModule } from '../modules/study-room/index.js';
import { createResultsModule } from '../modules/results/index.js';
import { createGpaCgpaModule } from '../modules/gpa-cgpa/index.js';
import { createCaRecoveryModule } from '../modules/ca-recovery/index.js';
import { createNoticesCalendarModule } from '../modules/notices-calendar/index.js';
import { createNotificationsModule } from '../modules/notifications/index.js';
import { createStudentExperienceModule } from '../modules/student-experience/index.js';
import { createFilesModule } from '../modules/files/index.js';
import { createAuditSecurityModule } from '../modules/audit-security/index.js';
import { createAdminOperationsModule } from '../modules/admin-operations/index.js';
import { createLecturerWorkspaceModule } from '../modules/lecturer-workspace/index.js';

export function registerModules(app, { config, logger, infrastructure }) {
  const modules = [
    createAuthenticationModule({ config, logger, infrastructure }),
    createAcademicFoundationModule({ config, logger, infrastructure }),
    createLearningEnvironmentModule({ config, logger, infrastructure }),
    createStudyRoomModule(),
    createResultsModule(),
    createGpaCgpaModule(),
    createCaRecoveryModule(),
    createNoticesCalendarModule(),
    createNotificationsModule(),
    createStudentExperienceModule(),
    createFilesModule(),
    createAuditSecurityModule(),
    createAdminOperationsModule(),
    createLecturerWorkspaceModule(),
  ];

  for (const module of modules) {
    if (Array.isArray(module.routes) && module.routes.length > 0) {
      for (const route of module.routes) {
        app.use(route.prefix, route.router);
      }
    } else if (module.router && module.apiPrefix) {
      app.use(module.apiPrefix, module.router);
    }

    if (Array.isArray(module.additionalRoutes)) {
      for (const route of module.additionalRoutes) {
        app.use(route.prefix, route.router);
      }
    }

    logger.debug('Module registered', { id: module.id, apiPrefix: module.apiPrefix });
  }

  return { modules, infrastructure };
}
