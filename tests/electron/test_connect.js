const http = require('http');
const test = require('node:test');
const assert = require('node:assert/strict');
const { testModelConnection } = require('../../electron/connect');
const { resolveLocalEmbeddingModel } = require('../../electron/paths');

function listen(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

test('chat 200 with embeddings 404 still succeeds for local embedder', async () => {
  const { server, port } = await listen((req, res) => {
    if (String(req.url).includes('/chat/completions')) {
      json(res, 200, { choices: [{ message: { content: 'ok' } }] });
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end('<html><h1>404 Not Found</h1></html>');
  });
  try {
    const result = await testModelConnection({
      OPENAI_BASE_URL: `http://127.0.0.1:${port}/v1`,
      OPENAI_API_KEY: 'sk-test',
      OPENAI_MODEL: 'glm-test',
    });
    assert.equal(result.ok, true);
    assert.equal(result.model, 'glm-test');
    assert.equal(result.embedderType, 'local');
    assert.equal(result.embeddingModel, 'BAAI/bge-small-en-v1.5');
  } finally {
    server.close();
  }
});

test('chat 200 succeeds and remaps remote embedding model names', async () => {
  const { server, port } = await listen((req, res) => {
    json(res, 200, { choices: [{ message: { content: 'ok' } }] });
  });
  try {
    const result = await testModelConnection({
      OPENAI_BASE_URL: `http://127.0.0.1:${port}/v1`,
      OPENAI_API_KEY: 'sk-test',
      OPENAI_MODEL: 'glm-test',
      OPENAI_EMBEDDING_MODEL: 'text-embedding-3-small',
    });
    assert.deepEqual(result, {
      ok: true,
      model: 'glm-test',
      embeddingModel: 'BAAI/bge-small-en-v1.5',
      embedderType: 'local',
    });
  } finally {
    server.close();
  }
});

test('resolveLocalEmbeddingModel keeps custom local names', () => {
  assert.equal(resolveLocalEmbeddingModel(''), 'BAAI/bge-small-en-v1.5');
  assert.equal(resolveLocalEmbeddingModel('nomic-embed-text'), 'BAAI/bge-small-en-v1.5');
  assert.equal(
    resolveLocalEmbeddingModel('sentence-transformers/all-MiniLM-L6-v2'),
    'sentence-transformers/all-MiniLM-L6-v2'
  );
});
