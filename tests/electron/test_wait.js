const http = require('http');
const net = require('net');
const test = require('node:test');
const assert = require('node:assert/strict');
const { waitHttp, waitTcp, probeHttp, probeTcp } = require('../../electron/wait');

function listen(port = 0) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const tmp = net.createServer();
    tmp.listen(0, '127.0.0.1', () => {
      const { port } = tmp.address();
      tmp.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

test('probeHttp/probeTcp return false when nothing is listening', async () => {
  assert.equal(await probeHttp('http://127.0.0.1:1/health', 200), false);
  assert.equal(await probeTcp(1, 200), false);
});

test('waitHttp and waitTcp succeed against a live server', async () => {
  const { server, port } = await listen();
  try {
    await waitHttp(`http://127.0.0.1:${port}/`, 2000, 400);
    await waitTcp(port, 2000);
    assert.equal(await probeHttp(`http://127.0.0.1:${port}/`, 400), true);
    assert.equal(await probeTcp(port, 400), true);
  } finally {
    server.close();
  }
});

test('waitHttp succeeds when the server starts during polling', async () => {
  const port = await freePort();
  const delayed = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('ok');
  });
  setTimeout(() => delayed.listen(port, '127.0.0.1'), 250);
  try {
    await waitHttp(`http://127.0.0.1:${port}/`, 3000, 400);
  } finally {
    delayed.close();
  }
});

test('waitHttp times out if the server never starts', async () => {
  await assert.rejects(
    () => waitHttp('http://127.0.0.1:1/health', 400, 150),
    /Timeout waiting/
  );
});
