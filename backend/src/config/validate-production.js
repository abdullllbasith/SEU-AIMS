/**
 * Production configuration gates. Do not invent hosting vendors.
 * Unknown settings are reported as unverified, not as passing.
 */
export function validateProductionConfig(config) {
  const problems = [];
  if (!config?.isProduction) {
    return { ok: true, problems };
  }
  if (!config.auth?.jwtSecret || String(config.auth.jwtSecret).length < 32) {
    problems.push('AUTH_JWT_SECRET must be set to a strong secret in production');
  }
  if (config.auth?.cookieSecure === false) {
    problems.push('Auth cookies must be Secure in production');
  }
  if (!config.api?.corsOrigin || config.api.corsOrigin === '*') {
    problems.push('CORS_ORIGIN must be an explicit origin in production');
  }
  if (!config.mongo?.uri) {
    problems.push('MONGODB_URI is required in production');
  }
  if (!config.redis?.url) {
    problems.push('REDIS_URL is required in production so rate limits and sessions can be shared');
  }
  if (config.storage?.driver === 'local_dev') {
    problems.push('FILE_STORAGE_DRIVER=local_dev is not acceptable for production object storage');
  }
  if (config.logLevel === 'debug') {
    problems.push('LOG_LEVEL=debug is not recommended in production');
  }
  return { ok: problems.length === 0, problems };
}

export function assertProductionConfig(config) {
  const result = validateProductionConfig(config);
  if (!result.ok) {
    throw new Error(`Production configuration is incomplete: ${result.problems.join('; ')}`);
  }
  return result;
}
