const http = require('http');
const net = require('net');

const HTTP_RETRY_MS = 200;
const HTTP_REQUEST_TIMEOUT_MS = 1500;
const TCP_RETRY_MS = 150;
const TCP_SOCKET_TIMEOUT_MS = 300;

function waitHttp(url, timeoutMs, requestTimeoutMs = HTTP_REQUEST_TIMEOUT_MS) {
  const started = Date.now();
  const perRequest = Math.max(250, Math.min(requestTimeoutMs, timeoutMs));
  return new Promise((resolve, reject) => {
    let settled = false;
    let current = null;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (current) {
        current.destroy();
        current = null;
      }
      if (error) reject(error);
      else resolve();
    };

    const schedule = () => {
      if (settled) return;
      if (Date.now() - started > timeoutMs) {
        finish(new Error(`Timeout waiting for ${url}`));
        return;
      }
      setTimeout(attempt, HTTP_RETRY_MS);
    };

    const attempt = () => {
      if (settled) return;
      if (Date.now() - started > timeoutMs) {
        finish(new Error(`Timeout waiting for ${url}`));
        return;
      }
      let handled = false;
      const request = http.get(url, (response) => {
        response.resume();
        if (handled) return;
        handled = true;
        if (response.statusCode && response.statusCode < 500) {
          finish();
          return;
        }
        schedule();
      });
      current = request;
      request.on('error', () => {
        if (handled) return;
        handled = true;
        schedule();
      });
      request.setTimeout(perRequest, () => {
        if (handled) return;
        handled = true;
        request.destroy();
        schedule();
      });
    };

    attempt();
  });
}

function waitTcp(port, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };

    const schedule = () => {
      if (settled) return;
      if (Date.now() - started > timeoutMs) {
        finish(new Error(`Timeout waiting for port ${port}`));
        return;
      }
      setTimeout(attempt, TCP_RETRY_MS);
    };

    const attempt = () => {
      if (settled) return;
      if (Date.now() - started > timeoutMs) {
        finish(new Error(`Timeout waiting for port ${port}`));
        return;
      }
      const socket = net.connect({ host: '127.0.0.1', port });
      let handled = false;
      const retry = () => {
        if (handled) return;
        handled = true;
        socket.destroy();
        schedule();
      };
      socket.setTimeout(TCP_SOCKET_TIMEOUT_MS);
      socket.once('connect', () => {
        handled = true;
        socket.end();
        finish();
      });
      socket.once('error', retry);
      socket.once('timeout', retry);
    };

    attempt();
  });
}

function probeHttp(url, timeoutMs = 400) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(Boolean(response.statusCode && response.statusCode < 500));
    });
    request.on('error', () => resolve(false));
    request.setTimeout(timeoutMs, () => {
      request.destroy();
      resolve(false);
    });
  });
}

function probeTcp(port, timeoutMs = TCP_SOCKET_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.once('timeout', () => done(false));
  });
}

module.exports = {
  waitHttp,
  waitTcp,
  probeHttp,
  probeTcp,
};
