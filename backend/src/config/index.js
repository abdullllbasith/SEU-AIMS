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
      port: integer('API_PORT', integer('PORT', 3001)),
      publicUrl: optional('API_PUBLIC_URL', optional('RENDER_EXTERNAL_URL', 'http://localhost:3001')),
      corsOrigin: optional('CORS_ORIGIN', optional('RENDER_EXTERNAL_URL', 'http://localhost:5173')),
      frontendDist: optional('FRONTEND_DIST'),
      jsonBodyLimit: optional('JSON_BODY_LIMIT', '1mb'),
      rateLimitWindowMs: integer('RATE_LIMIT_WINDOW_MS', 60_000),
      rateLimitMax: integer('RATE_LIMIT_MAX', 120),
      trustProxy: integer('TRUST_PROXY', 1),
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
      maxPoolSize: integer('MONGODB_MAX_POOL_SIZE', 20),
      serverSelectionTimeoutMS: integer('MONGODB_SERVER_SELECTION_TIMEOUT_MS', 5000),
    },
    redis: {
      url: optional('REDIS_URL'),
      queuePrefix: optional('REDIS_QUEUE_PREFIX', 'seu-aims:queue'),
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
      smtp: {
        host: optional('SMTP_HOST'),
        port: integer('SMTP_PORT', 587),
        secure: optional('SMTP_SECURE', 'false') === 'true',
        user: optional('SMTP_USER'),
        pass: optional('SMTP_PASS'),
      },
    },
    whatsapp: {
      baseUrl: optional('WHATSAPP_CLOUD_API_BASE_URL', 'https://graph.facebook.com'),
      version: optional('WHATSAPP_CLOUD_API_VERSION', 'v21.0'),
      phoneNumberId: optional('WHATSAPP_CLOUD_API_PHONE_NUMBER_ID'),
      accessToken: optional('WHATSAPP_CLOUD_API_ACCESS_TOKEN'),
      webhookVerifyToken: optional('WHATSAPP_CLOUD_API_WEBHOOK_VERIFY_TOKEN'),
      appSecret: optional('WHATSAPP_CLOUD_API_APP_SECRET'),
      timeoutMs: integer('PROVIDER_TIMEOUT_MS', 10_000),
      templateLanguage: optional('WHATSAPP_TEMPLATE_LANGUAGE', 'en'),
      /** Approved Meta template names, keyed by notification type. Empty means not configured. */
      templates: {
        CA_EXAM_SCHEDULED: optional('WHATSAPP_TEMPLATE_CA_EXAM_SCHEDULED'),
        CA_EXAM_RESCHEDULED: optional('WHATSAPP_TEMPLATE_CA_EXAM_RESCHEDULED'),
        CA_EXAM_CANCELLED: optional('WHATSAPP_TEMPLATE_CA_EXAM_CANCELLED'),
        CA_REMINDER: optional('WHATSAPP_TEMPLATE_CA_REMINDER'),
        CA_EXAM_COMPLETED: optional('WHATSAPP_TEMPLATE_CA_EXAM_COMPLETED'),
        CA_EXAM_MISSED: optional('WHATSAPP_TEMPLATE_CA_EXAM_MISSED'),
      },
    },
    malwareScanner: {
      provider: optional('MALWARE_SCANNER_PROVIDER', 'noop'),
      url: optional('MALWARE_SCANNER_URL'),
      apiKey: optional('MALWARE_SCANNER_API_KEY'),
    },
    ai: {
      provider: optional('AI_PROVIDER', 'noop'),
      geminiApiKey: optional('GEMINI_API_KEY'),
      geminiBaseUrl: optional('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta'),
      model: optional('GEMINI_MODEL', 'gemini-2.5-flash'),
      reasoningModel: optional('GEMINI_MODEL_REASONING', 'gemini-2.5-pro'),
      timeoutMs: integer('AI_TIMEOUT_MS', 45_000),
      maxOutputTokens: integer('AI_MAX_OUTPUT_TOKENS', 2048),
    },
    studyAgent: {
      messagesPerMinute: integer('STUDY_AGENT_MSGS_PER_MINUTE', 12),
      dailyRequests: integer('STUDY_AGENT_DAILY_REQUESTS', 200),
      maxMessageChars: integer('STUDY_AGENT_MAX_MESSAGE_CHARS', 4000),
      retrievalTopK: integer('STUDY_AGENT_RETRIEVAL_TOP_K', 6),
      contextCharBudget: integer('STUDY_AGENT_CONTEXT_CHAR_BUDGET', 8000),
      historyMessages: integer('STUDY_AGENT_HISTORY_MESSAGES', 12),
      maxImages: integer('STUDY_AGENT_MAX_IMAGES', 5),
      imageMaxBytes: integer('STUDY_AGENT_IMAGE_MAX_BYTES', 5 * 1024 * 1024),
    },
    timezone: optional('TZ', 'Asia/Colombo'),
    notifications: {
      retryMax: integer('NOTIFICATION_RETRY_MAX', 5),
      defaultLocale: optional('NOTIFICATION_DEFAULT_LOCALE', 'en'),
      sweepIntervalMs: integer('NOTIFICATION_SWEEP_INTERVAL_MS', 30_000),
      leaseMs: integer('NOTIFICATION_LEASE_MS', 120_000),
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
