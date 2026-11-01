const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

function serialize(level, message, meta, context) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    service: context.service,
    message,
  };

  if (meta && typeof meta === 'object') {
    payload.meta = sanitize(meta);
  }

  return JSON.stringify(payload);
}

function sanitize(meta) {
  const blocked = new Set([
    'password',
    'passwordHash',
    'token',
    'accessToken',
    'refreshToken',
    'resetToken',
    'csrfToken',
    'secret',
    'apiKey',
    'authorization',
    'cookie',
    'privateKey',
    'plaintext',
    'ciphertext',
    'encryptedPayload',
    'cookie',
    'privateKey',
    'plaintext',
    'ciphertext',
    'encryptedPayload',
    'wrappedKey',
    'email',
    'phone',
    'whatsappNumber',
    'resultCode',
    'registrationNumber',
    'prompt',
    'completion',
    'documentText',
    'messageText',
    'answers',
    'geminiApiKey',
  ]);

  const out = {};
  for (const [key, value] of Object.entries(meta)) {
    if (blocked.has(key)) {
      out[key] = '[redacted]';
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function createLogger({ service = 'seu-aims', level = 'info' } = {}) {
  const min = LEVELS[level] ?? LEVELS.info;

  function write(levelName, message, meta) {
    if ((LEVELS[levelName] ?? 9) > min) {
      return;
    }
    const line = serialize(levelName, message, meta, { service });
    if (levelName === 'error') {
      process.stderr.write(`${line}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  }

  return {
    error(message, meta) {
      write('error', message, meta);
    },
    warn(message, meta) {
      write('warn', message, meta);
    },
    info(message, meta) {
      write('info', message, meta);
    },
    debug(message, meta) {
      write('debug', message, meta);
    },
  };
}
