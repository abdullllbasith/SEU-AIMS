import { ForbiddenError } from '../../../shared/errors/app-error.js';

export function requireCsrf(req, _res, next) {
  const config = req.app.get('config');
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const cookieToken = req.cookies?.[config.auth.csrfCookie];
  const headerToken = req.get('x-csrf-token');
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return next(new ForbiddenError('Invalid CSRF token'));
  }

  return next();
}
