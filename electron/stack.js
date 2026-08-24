const { app } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
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
const { waitHttp, waitTcp, probeHttp, probeTcp } = require('./wait');

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
  // Packaged builds must use the bundled CPython. Falling back to PATH would
  // pick up Python 2.7 on older Windows machines.
  if (app.isPackaged) return null;
  for (const name of ['python3', 'python']) {
    const found = resolveOnPath(name);
    if (isUsablePython(found)) return found;
  }
  return null;
}

function nodeExe() {
  const bundled = getNodeExe();
  if (exists(bundled)) return bundled;
  if (app.isPackaged) return null;
  return resolveOnPath('node');
}

function gitExe() {
  const bundled = getGitExe();
  if (exists(bundled)) return bundled;
  return resolveOnPath('git');
}

async function isStackReady() {
  const [apiOk, webOk] = await Promise.all([
    probeHttp(`http://127.0.0.1:${API_PORT}/health`),
    probeTcp(FRONTEND_PORT),
  ]);
  return apiOk && webOk;
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

function pushBinDir(pathParts, filePath) {
  if (filePath && filePath.includes(path.sep)) {
    pathParts.push(path.dirname(filePath));
  }
}

function runtimeEnv(paths) {
  const settings = readSettings();
  const python = pythonExe();
  const node = nodeExe();
  const git = gitExe();
  const pathParts = [];
  pushBinDir(pathParts, python);
  if (python) {
    const scripts = path.join(path.dirname(python), 'Scripts');
    if (exists(scripts)) pathParts.push(scripts);
  }
  pushBinDir(pathParts, node);
  pushBinDir(pathParts, git);
  if (git && git.includes(path.sep)) {
    const gitRoot = path.dirname(path.dirname(git));
    const mingw = path.join(gitRoot, 'mingw64', 'bin');
    if (exists(mingw)) pathParts.push(mingw);
    const usrBin = path.join(gitRoot, 'usr', 'bin');
    if (exists(usrBin)) pathParts.push(usrBin);
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
    DEEPWIKI_EMBEDDER_TYPE: 'local',
    FASTEMBED_CACHE_PATH: getFastembedCachePath(paths),
    HOME: paths.root,
    USERPROFILE: paths.root,
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',
    PYTHONUNBUFFERED: '1',
    PYTHONNOUSERSITE: '1',
    PY_PYTHON: '3.11',
    PYTHONPATH: app.isPackaged ? getRuntimeRoot() : getAppRoot(),
    PATH: pathParts.join(path.delimiter),
  };
  delete env.PYTHONHOME;
  delete env.PYTHONSTARTUP;
  delete env.VIRTUAL_ENV;
  delete env.CONDA_PREFIX;
  delete env.CONDA_DEFAULT_ENV;
  delete env.CONDA_PYTHON_EXE;
  if (git && git.includes(path.sep)) {
    env.GIT_PYTHON_GIT_EXECUTABLE = git;
  }
  return env;
}

function getFastembedCachePath(paths) {
  const bundled = path.join(getRuntimeRoot(), 'fastembed_cache');
  if (exists(bundled)) {
    try {
      if (fs.readdirSync(bundled).length > 0) return bundled;
    } catch {
      // fall through to the user-data cache
    }
  }
  return path.join(paths.root, 'models');
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
  // Embeddable CPython ships a python*._pth that enables isolated mode, so
  // PYTHONPATH and cwd are ignored. Inject the module root before import.
  const bootstrap = [
    'import sys, runpy',
    `sys.path.insert(0, ${JSON.stringify(cwd)})`,
    "runpy.run_module('api.main', run_name='__main__')",
  ].join('; ');
  apiChild = spawnLogged(python, ['-u', '-c', bootstrap], {
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
  if (!app.isPackaged) {
    const nextBin = path.join(getAppRoot(), 'node_modules', 'next', 'dist', 'bin', 'next');
    if (exists(nextBin)) {
      webChild = spawnLogged(
        node,
        [
          nextBin,
          'dev',
          '--turbopack',
          '--port',
          String(FRONTEND_PORT),
          '--hostname',
          '127.0.0.1',
        ],
        {
          cwd: getAppRoot(),
          env: {
            ...env,
            NODE_ENV: 'development',
            PORT: String(FRONTEND_PORT),
          },
          logFile,
          name: 'web',
        }
      );
      return;
    }
  }

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

  const error = new Error(app.isPackaged ? 'RUNTIME_MISSING' : 'NODE_MISSING');
  error.code = app.isPackaged ? 'RUNTIME_MISSING' : 'NODE_MISSING';
  throw error;
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
    await Promise.all([
      waitHttp(`http://127.0.0.1:${API_PORT}/health`, 180000, 1500),
      waitTcp(FRONTEND_PORT, 180000),
    ]);
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
