import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

dotenv.config({ path: path.join(backendRoot, '.env') });
dotenv.config({ path: path.join(backendRoot, '../.env') });

function optional(name, fallback = '') {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function integer(name, fallback) {
  const raw = optional(name, String(fallback));
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Load configuration from the environment.
 * Does not invent academic policy. Does not embed secrets in source.
 */
export function loadConfig() {
  const nodeEnv = optional('NODE_ENV', 'development');

  return {
    env: nodeEnv,
    isProduction: nodeEnv === 'production',
    logLevel: optional('LOG_LEVEL', 'info'),
    api: {
      host: optional('API_HOST', '0.0.0.0'),
      port: integer('API_PORT', 3001),
      publicUrl: optional('API_PUBLIC_URL', 'http://localhost:3001'),
      corsOrigin: optional('CORS_ORIGIN', 'http://localhost:5173'),
      jsonBodyLimit: optional('JSON_BODY_LIMIT', '1mb'),
      rateLimitWindowMs: integer('RATE_LIMIT_WINDOW_MS', 60_000),
      rateLimitMax: integer('RATE_LIMIT_MAX', 120),
    },
    auth: {
      jwtSecret: optional('AUTH_JWT_SECRET'),
      accessTtlSeconds: integer('AUTH_ACCESS_TTL_SECONDS', 900),
      refreshTtlSeconds: integer('AUTH_REFRESH_TTL_SECONDS', 60 * 60 * 24 * 7),
      resetTtlSeconds: integer('AUTH_RESET_TTL_SECONDS', 60 * 30),
      passwordMinLength: integer('AUTH_PASSWORD_MIN_LENGTH', 10),
      cookieSecure: nodeEnv === 'production',
      cookieSameSite: optional('AUTH_COOKIE_SAMESITE', 'lax'),
      accessCookie: optional('AUTH_ACCESS_COOKIE', 'seu_access'),
      refreshCookie: optional('AUTH_REFRESH_COOKIE', 'seu_refresh'),
      csrfCookie: optional('AUTH_CSRF_COOKIE', 'seu_csrf'),
      loginWindowMs: integer('AUTH_LOGIN_WINDOW_MS', 15 * 60 * 1000),
      loginMaxAttempts: integer('AUTH_LOGIN_MAX_ATTEMPTS', 10),
    },
    mongo: {
      uri: nodeEnv === 'test' ? optional('MONGODB_TEST_URI', optional('MONGODB_URI')) : optional('MONGODB_URI'),
      testUri: optional('MONGODB_TEST_URI'),
    },
    redis: {
      url: optional('REDIS_URL'),
    },
    storage: {
      driver: optional('FILE_STORAGE_DRIVER', 'local_dev'),
      localPath: optional('FILE_STORAGE_LOCAL_PATH', '.local-storage'),
      bucket: optional('FILE_STORAGE_BUCKET'),
      region: optional('FILE_STORAGE_REGION'),
      endpoint: optional('FILE_STORAGE_ENDPOINT'),
      accessKeyId: optional('FILE_STORAGE_ACCESS_KEY_ID'),
      secretAccessKey: optional('FILE_STORAGE_SECRET_ACCESS_KEY'),
    },
    email: {
      provider: optional('EMAIL_PROVIDER', 'noop'),
      from: optional('EMAIL_FROM'),
      apiKey: optional('EMAIL_API_KEY'),
    },
    whatsapp: {
      baseUrl: optional('WHATSAPP_CLOUD_API_BASE_URL', 'https://graph.facebook.com'),
      version: optional('WHATSAPP_CLOUD_API_VERSION', 'v21.0'),
      phoneNumberId: optional('WHATSAPP_CLOUD_API_PHONE_NUMBER_ID'),
      accessToken: optional('WHATSAPP_CLOUD_API_ACCESS_TOKEN'),
      webhookVerifyToken: optional('WHATSAPP_CLOUD_API_WEBHOOK_VERIFY_TOKEN'),
      appSecret: optional('WHATSAPP_CLOUD_API_APP_SECRET'),
      timeoutMs: integer('PROVIDER_TIMEOUT_MS', 10_000),
    },
    malwareScanner: {
      provider: optional('MALWARE_SCANNER_PROVIDER', 'noop'),
      url: optional('MALWARE_SCANNER_URL'),
      apiKey: optional('MALWARE_SCANNER_API_KEY'),
    },
    timezone: optional('TZ', 'Asia/Colombo'),
    notifications: {
      retryMax: integer('NOTIFICATION_RETRY_MAX', 5),
      defaultLocale: optional('NOTIFICATION_DEFAULT_LOCALE', 'en'),
    },
    files: {
      maxBytes: integer('FILE_MAX_BYTES', 20 * 1024 * 1024),
    },
    audit: {
      retentionDays: integer('AUDIT_RETENTION_DAYS', 0),
    },
    studyRoom: {
      messageMaxPerMinute: integer('STUDY_ROOM_MESSAGE_MAX_PER_MINUTE', 60),
      typingMaxPerMinute: integer('STUDY_ROOM_TYPING_MAX_PER_MINUTE', 30),
      searchMaxPerMinute: integer('STUDY_ROOM_SEARCH_MAX_PER_MINUTE', 30),
      ciphertextMaxChars: integer('STUDY_ROOM_CIPHERTEXT_MAX_CHARS', 16_000),
      historyPageSize: integer('STUDY_ROOM_HISTORY_PAGE_SIZE', 50),
    },
  };
}
