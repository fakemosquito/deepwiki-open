const { app } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const {
  API_PORT,
  FRONTEND_PORT,
  getAppRoot,
  getRuntimeRoot,
  getPythonExe,
  getNodeExe,
  getGitExe,
  getApiRoot,
  getWebRoot,
  getUserDataPaths,
  ensureUserData,
  readSettings,
  writeDesktopModelConfig,
} = require('./paths');

let apiChild = null;
let webChild = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function exists(filePath) {
  try {
    return Boolean(filePath && fs.existsSync(filePath));
  } catch {
    return false;
  }
}

function resolveOnPath(name) {
  const ext = process.platform === 'win32' ? '.exe' : '';
  const fileName = name.endsWith('.exe') ? name : `${name}${ext}`;
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, fileName);
    if (exists(candidate)) return candidate;
  }
  return null;
}

function isUsablePython(filePath) {
  if (!filePath) return false;
  const lower = filePath.toLowerCase();
  if (lower.includes('python27') || lower.includes('python26')) return false;
  if (lower.includes('\\windowsapps\\')) return false;
  return true;
}

function pythonExe() {
  const bundled = getPythonExe();
  if (exists(bundled)) return bundled;
  for (const name of ['python3', 'python']) {
    const found = resolveOnPath(name);
    if (isUsablePython(found)) return found;
  }
  return null;
}

function nodeExe() {
  const bundled = getNodeExe();
  if (exists(bundled)) return bundled;
  return resolveOnPath('node');
}

function gitExe() {
  const bundled = getGitExe();
  if (exists(bundled)) return bundled;
  return resolveOnPath('git');
}

function waitHttp(url, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get(url, (response) => {
        response.resume();
        if (response.statusCode && response.statusCode < 500) {
          resolve();
          return;
        }
        retry();
      });
      request.on('error', retry);
      request.setTimeout(2500, () => {
        request.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Timeout waiting for ${url}`));
        return;
      }
      setTimeout(attempt, 1500);
    };
    attempt();
  });
}

async function isStackReady() {
  try {
    await waitHttp(`http://127.0.0.1:${API_PORT}/health`, 1200);
    await waitHttp(`http://127.0.0.1:${FRONTEND_PORT}`, 1200);
    return true;
  } catch {
    return false;
  }
}

function appendLog(filePath, chunk) {
  try {
    fs.appendFileSync(filePath, chunk);
  } catch {
    // Ignore disk errors so a full log disk does not take down the app.
  }
}

function spawnLogged(command, args, { cwd, env, logFile, name }) {
  const child = spawn(command, args, {
    cwd,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (chunk) => appendLog(logFile, chunk));
  child.stderr?.on('data', (chunk) => appendLog(logFile, chunk));
  child.on('error', (error) => {
    appendLog(logFile, `\n[${name}] spawn error: ${error.message}\n`);
  });
  child.on('close', (code) => {
    appendLog(logFile, `\n[${name}] exited with code ${code}\n`);
  });
  return child;
}

function killTree(child) {
  if (!child || child.killed || !child.pid) return;
  const pid = child.pid;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/t', '/f'], {
      windowsHide: true,
      stdio: 'ignore',
    });
  } else {
    try {
      child.kill('SIGTERM');
    } catch {
      // already gone
    }
  }
}

function runtimeEnv(paths) {
  const settings = readSettings();
  const git = gitExe();
  const pathParts = [];
  if (git && git.includes(path.sep)) {
    pathParts.push(path.dirname(git));
    const mingw = path.join(path.dirname(path.dirname(git)), 'mingw64', 'bin');
    if (exists(mingw)) pathParts.push(mingw);
  }
  pathParts.push(process.env.PATH || '');

  writeDesktopModelConfig(settings.keys || {});
  const env = {
    ...process.env,
    ...(settings.keys || {}),
    PORT: String(API_PORT),
    FRONTEND_PORT: String(FRONTEND_PORT),
    NODE_ENV: 'production',
    SERVER_BASE_URL: `http://127.0.0.1:${API_PORT}`,
    LOG_LEVEL: 'INFO',
    LOG_FILE_PATH: path.join(paths.logDir, 'application.log'),
    TIKTOKEN_CACHE_DIR: path.join(getRuntimeRoot(), 'tiktoken_cache'),
    DEEPWIKI_CONFIG_DIR: paths.configDir,
    DEEPWIKI_EMBEDDER_TYPE: 'openai',
    HOME: paths.root,
    USERPROFILE: paths.root,
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',
    PYTHONUNBUFFERED: '1',
    PYTHONPATH: app.isPackaged ? getRuntimeRoot() : getAppRoot(),
    PATH: pathParts.join(path.delimiter),
  };
  if (git && git.includes(path.sep)) {
    env.GIT_PYTHON_GIT_EXECUTABLE = git;
  }
  return env;
}

function assertRuntime() {
  const python = pythonExe();
  const node = nodeExe();
  if (!python) {
    const error = new Error('PYTHON_MISSING');
    error.code = 'PYTHON_MISSING';
    throw error;
  }
  if (!node) {
    const error = new Error('NODE_MISSING');
    error.code = 'NODE_MISSING';
    throw error;
  }
  if (app.isPackaged) {
    const apiMain = path.join(getApiRoot(), 'main.py');
    const serverJs = path.join(getWebRoot(), 'server.js');
    if (!exists(apiMain) || !exists(serverJs)) {
      const error = new Error('RUNTIME_MISSING');
      error.code = 'RUNTIME_MISSING';
      throw error;
    }
  }
  return { python, node };
}

function startApi(python, env, logFile) {
  const cwd = app.isPackaged ? getRuntimeRoot() : getAppRoot();
  apiChild = spawnLogged(python, ['-u', '-m', 'api.main'], {
    cwd,
    env,
    logFile,
    name: 'api',
  });
  apiChild.on('close', () => {
    if (apiChild && apiChild.exitCode !== 0 && apiChild.exitCode !== null) {
      apiChild = null;
    }
  });
}

function startWeb(node, env, logFile) {
  const serverJs = path.join(getWebRoot(), 'server.js');
  if (exists(serverJs)) {
    webChild = spawnLogged(node, [serverJs], {
      cwd: getWebRoot(),
      env: {
        ...env,
        PORT: String(FRONTEND_PORT),
        HOSTNAME: '127.0.0.1',
      },
      logFile,
      name: 'web',
    });
    return;
  }

  if (app.isPackaged) {
    const error = new Error('RUNTIME_MISSING');
    error.code = 'RUNTIME_MISSING';
    throw error;
  }

  const nextBin = path.join(getAppRoot(), 'node_modules', 'next', 'dist', 'bin', 'next');
  if (!exists(nextBin)) {
    const error = new Error('NODE_MISSING');
    error.code = 'NODE_MISSING';
    throw error;
  }
  webChild = spawnLogged(node, [nextBin, 'dev', '--port', String(FRONTEND_PORT)], {
    cwd: getAppRoot(),
    env: {
      ...env,
      NODE_ENV: 'development',
      PORT: String(FRONTEND_PORT),
    },
    logFile,
    name: 'web',
  });
}

async function startStack(emit) {
  emit?.({ step: 'check-runtime' });
  const paths = ensureUserData();
  const { python, node } = assertRuntime();
  const env = runtimeEnv(paths);

  if (await isStackReady()) {
    emit?.({ step: 'ready' });
    return;
  }

  emit?.({ step: 'start-api' });
  startApi(python, env, path.join(paths.logDir, 'api.log'));
  emit?.({ step: 'start-web' });
  startWeb(node, env, path.join(paths.logDir, 'web.log'));

  emit?.({ step: 'health' });
  try {
    await waitHttp(`http://127.0.0.1:${API_PORT}/health`, 180000);
    await waitHttp(`http://127.0.0.1:${FRONTEND_PORT}`, 180000);
  } catch (error) {
    const logHint = `\nSee logs in ${paths.logDir}`;
    error.message = `${error.message}${logHint}`;
    throw error;
  }
  emit?.({ step: 'ready' });
}

async function stopStack() {
  killTree(webChild);
  killTree(apiChild);
  webChild = null;
  apiChild = null;
  await sleep(400);
}

async function restartStack(emit) {
  await stopStack();
  await startStack(emit);
}

function getStatus() {
  const python = pythonExe();
  const node = nodeExe();
  const git = gitExe();
  return {
    runtimeReady: Boolean(python && node),
    pythonPath: python,
    nodePath: node,
    gitPath: git,
    apiRoot: getApiRoot(),
    webRoot: getWebRoot(),
    userData: getUserDataPaths(),
    apiUrl: `http://127.0.0.1:${API_PORT}`,
    appUrl: `http://127.0.0.1:${FRONTEND_PORT}`,
  };
}

module.exports = {
  startStack,
  stopStack,
  restartStack,
  isStackReady,
  getStatus,
};
