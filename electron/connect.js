const { normalizeBaseUrl } = require('./paths');

function jsonError(data, fallback) {
  if (!data || typeof data !== 'object') return fallback;
  const err = data.error;
  if (typeof err === 'string' && err.trim()) return err;
  if (err && typeof err.message === 'string' && err.message.trim()) return err.message;
  if (typeof data.message === 'string' && data.message.trim()) return data.message;
  return fallback;
}

async function postChat({ url, apiKey, model, extra }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        stream: false,
        ...extra,
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    let data = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = {};
    }
    return { response, data, text };
  } finally {
    clearTimeout(timer);
  }
}

async function testModelConnection(input) {
  const baseUrl = normalizeBaseUrl(input?.baseUrl || input?.OPENAI_BASE_URL);
  const apiKey = String(input?.apiKey || input?.OPENAI_API_KEY || '').trim();
  const model = String(input?.model || input?.OPENAI_MODEL || '').trim();

  if (!baseUrl || !apiKey || !model) {
    return { ok: false, code: 'INVALID' };
  }
  if (!/^https?:\/\//i.test(baseUrl)) {
    return { ok: false, code: 'INVALID_URL' };
  }

  const url = `${baseUrl}/chat/completions`;
  try {
    let result = await postChat({
      url,
      apiKey,
      model,
      extra: { max_tokens: 1 },
    });

    if (result.response.status === 400) {
      result = await postChat({ url, apiKey, model, extra: {} });
    }

    if (result.response.ok && !result.data.error) {
      return { ok: true, model };
    }

    return {
      ok: false,
      code: 'API_ERROR',
      status: result.response.status,
      message: jsonError(
        result.data,
        result.text.slice(0, 400) || `HTTP ${result.response.status}`
      ),
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { ok: false, code: 'TIMEOUT' };
    }
    return {
      ok: false,
      code: 'NETWORK',
      message: error.message || String(error),
    };
  }
}

module.exports = { testModelConnection };
