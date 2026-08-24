const { normalizeBaseUrl, resolveLocalEmbeddingModel } = require('./paths');

function jsonError(data, fallback) {
  if (!data || typeof data !== 'object') return fallback;
  const err = data.error;
  if (typeof err === 'string' && err.trim()) return err;
  if (err && typeof err.message === 'string' && err.message.trim()) return err.message;
  if (typeof data.message === 'string' && data.message.trim()) return data.message;
  return fallback;
}

function summarizeHttpFailure(status, text, data) {
  const body = String(text || '').trim();
  if (status === 404 || /404/.test(body) || /<html/i.test(body)) {
    return (
      `HTTP ${status || 404} from POST /embeddings. ` +
      'The chat API can work while this gateway does not expose an embeddings endpoint, ' +
      'or the embedding model name is wrong.'
    );
  }
  return jsonError(data, body.slice(0, 400) || `HTTP ${status}`);
}

function embeddingLooksValid(data) {
  const first = data?.data?.[0]?.embedding;
  return Array.isArray(first) && first.length > 0;
}

async function postJson({ url, apiKey, body }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
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

async function postChat({ url, apiKey, model, extra }) {
  return postJson({
    url,
    apiKey,
    body: {
      model,
      messages: [{ role: 'user', content: 'ping' }],
      stream: false,
      ...extra,
    },
  });
}

async function postEmbeddings({ url, apiKey, model, extra }) {
  return postJson({
    url,
    apiKey,
    body: {
      model,
      input: ['deepwiki embedding ping'],
      ...extra,
    },
  });
}

async function testEmbeddingConnection({ baseUrl, apiKey, model }) {
  const url = `${baseUrl}/embeddings`;
  let result = await postEmbeddings({ url, apiKey, model });

  if (result.response.status === 400) {
    result = await postEmbeddings({
      url,
      apiKey,
      model,
      extra: { input: 'deepwiki embedding ping' },
    });
  }

  if (result.response.ok && !result.data.error && embeddingLooksValid(result.data)) {
    return { ok: true, model };
  }

  return {
    ok: false,
    code: 'EMBEDDING_ERROR',
    status: result.response.status,
    message: summarizeHttpFailure(result.response.status, result.text, result.data),
  };
}

async function testModelConnection(input) {
  const baseUrl = normalizeBaseUrl(input?.baseUrl || input?.OPENAI_BASE_URL);
  const apiKey = String(input?.apiKey || input?.OPENAI_API_KEY || '').trim();
  const model = String(input?.model || input?.OPENAI_MODEL || '').trim();
  const embeddingModel = resolveLocalEmbeddingModel(
    input?.embeddingModel || input?.OPENAI_EMBEDDING_MODEL
  );

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

    if (!(result.response.ok && !result.data.error)) {
      return {
        ok: false,
        code: 'API_ERROR',
        status: result.response.status,
        message: jsonError(
          result.data,
          result.text.slice(0, 400) || `HTTP ${result.response.status}`
        ),
      };
    }

    // Wiki indexing uses an in-process ONNX embedder. Chat gateways often
    // have no POST /embeddings, so a successful chat ping is enough here.
    return { ok: true, model, embeddingModel, embedderType: 'local' };
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

module.exports = { testModelConnection, testEmbeddingConnection };
