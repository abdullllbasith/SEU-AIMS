import { AppError } from '../../shared/errors/app-error.js';

/**
 * Generative AI adapter. Credentials stay on the backend; callers never see them.
 * generate() returns { text, json, citations, usage }.
 */
export class AiProviderError extends AppError {
  constructor(message = 'The AI service is unavailable', { retryable = false, quotaExceeded = false } = {}) {
    super(message, { statusCode: 503, code: 'AI_UNAVAILABLE' });
    this.name = 'AiProviderError';
    this.retryable = retryable;
    this.quotaExceeded = quotaExceeded;
  }
}

export class AiProvider {
  configured = false;

  async generate(_input) {
    throw new Error('AiProvider.generate must be implemented');
  }
}

export class NoopAiProvider extends AiProvider {
  configured = false;

  async generate() {
    throw new AiProviderError('The AI service is not configured');
  }
}

/** Deterministic provider for tests and offline development. Not allowed in production. */
export class DevMockAiProvider extends AiProvider {
  configured = true;

  constructor({ reply } = {}) {
    super();
    this.reply = reply;
    this.calls = [];
  }

  async generate(input) {
    this.calls.push(input);
    const last = [...(input.messages || [])].reverse().find((message) => message.role === 'user');
    if (typeof this.reply === 'function') {
      return this.reply(input);
    }
    return {
      text: `Mock tutor reply to: ${String(last?.text || '').slice(0, 200)}`,
      json: null,
      citations: [],
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
}

function toGeminiContents(messages = [], extraParts = []) {
  const contents = messages.map((message) => ({
    role: message.role === 'model' ? 'model' : 'user',
    parts: [{ text: String(message.text ?? '') }],
  }));
  if (extraParts.length && contents.length) {
    const lastUser = [...contents].reverse().find((item) => item.role === 'user');
    for (const part of extraParts) {
      lastUser?.parts.push({ inlineData: { mimeType: part.mimeType, data: part.data } });
    }
  }
  return contents;
}

export class GeminiAiProvider extends AiProvider {
  configured = true;

  constructor({ config, fetchImpl = globalThis.fetch }) {
    super();
    this.apiKey = config.ai.geminiApiKey;
    this.baseUrl = String(config.ai.geminiBaseUrl).replace(/\/$/, '');
    this.defaultModel = config.ai.model;
    this.reasoningModel = config.ai.reasoningModel;
    this.timeoutMs = config.ai.timeoutMs;
    this.defaultMaxTokens = config.ai.maxOutputTokens;
    this.fetchImpl = fetchImpl;
  }

  async generate({
    system,
    messages = [],
    parts = [],
    responseSchema,
    webSearch = false,
    maxOutputTokens,
    reasoning = false,
  }) {
    const model = reasoning ? this.reasoningModel : this.defaultModel;
    const body = {
      contents: toGeminiContents(messages, parts),
      generationConfig: { maxOutputTokens: maxOutputTokens || this.defaultMaxTokens },
    };
    if (system) {
      body.systemInstruction = { parts: [{ text: system }] };
    }
    // Gemini does not reliably combine grounding with a JSON schema, so callers use one or the other.
    if (responseSchema && !webSearch) {
      body.generationConfig.responseMimeType = 'application/json';
      body.generationConfig.responseSchema = responseSchema;
    }
    if (webSearch) {
      body.tools = [{ google_search: {} }];
    }

    let data;
    try {
      data = await this.#post(model, body);
    } catch (error) {
      // Google Search grounding has its own quota. When it is used up, answer without search instead of failing the student.
      if (!webSearch || !error.quotaExceeded) {
        throw error;
      }
      return this.generate({ system, messages, parts, responseSchema, maxOutputTokens, reasoning, webSearch: false });
    }
    const candidate = data?.candidates?.[0];
    const text = (candidate?.content?.parts || [])
      .map((part) => part.text || '')
      .join('')
      .trim();
    if (!text) {
      throw new AiProviderError('The AI service returned an empty response', { retryable: true });
    }
    let json = null;
    if (responseSchema && !webSearch) {
      try {
        json = JSON.parse(text);
      } catch {
        throw new AiProviderError('The AI service returned malformed structured output', { retryable: true });
      }
    }
    const citations = [];
    const seen = new Set();
    for (const chunk of candidate?.groundingMetadata?.groundingChunks || []) {
      const uri = chunk?.web?.uri;
      if (uri && !seen.has(uri)) {
        seen.add(uri);
        citations.push({ title: chunk.web.title || uri, uri });
      }
    }
    return {
      text,
      json,
      citations,
      usage: {
        inputTokens: data?.usageMetadata?.promptTokenCount || 0,
        outputTokens: data?.usageMetadata?.candidatesTokenCount || 0,
      },
    };
  }

  async #post(model, body) {
    const url = `${this.baseUrl}/models/${encodeURIComponent(model)}:generateContent`;
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (response.ok) {
          return await response.json();
        }
        const retryable = response.status === 429 || response.status >= 500;
        lastError = new AiProviderError(`The AI service responded with status ${response.status}`, {
          retryable,
          quotaExceeded: response.status === 429,
        });
        if (!retryable) {
          throw lastError;
        }
      } catch (error) {
        if (error instanceof AiProviderError && !error.retryable) {
          throw error;
        }
        lastError =
          error instanceof AiProviderError
            ? error
            : new AiProviderError(error?.name === 'AbortError' ? 'The AI service timed out' : 'The AI service is unreachable', {
                retryable: true,
              });
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError;
  }
}

export function createAiProvider({ config, fetchImpl } = {}) {
  const provider = config?.ai?.provider || 'noop';
  if (provider === 'dev_mock') {
    if (config?.isProduction) {
      throw new Error('AI_PROVIDER=dev_mock is not allowed when NODE_ENV is production');
    }
    return new DevMockAiProvider();
  }
  if (provider === 'gemini') {
    if (!config.ai.geminiApiKey) {
      return new NoopAiProvider();
    }
    return new GeminiAiProvider({ config, fetchImpl });
  }
  return new NoopAiProvider();
}
