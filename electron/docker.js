const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const {
  IMAGE_TAG,
  PROJECT_NAME,
  API_PORT,
  FRONTEND_PORT,
  getComposeFile,
  getImageTar,
  getUserDataPaths,
  toComposePath,
  ensureUserData,
} = require('./paths');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      ...options,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      options.onStdout?.(text);
    });
    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      options.onStderr?.(text);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
        return;
      }
      const error = new Error((stderr || stdout || `${command} exited ${code}`).trim());
      error.code = code;
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

async function dockerAvailable() {
  try {
    await run('docker', ['info']);
    return true;
  } catch {
    return false;
  }
}

function findDockerDesktop() {
  const candidates = [
    'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe',
    path.join(process.env.PROGRAMFILES || '', 'Docker', 'Docker', 'Docker Desktop.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Docker', 'Docker', 'Docker Desktop.exe'),
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

async function startDockerDesktop(emit) {
  const exe = findDockerDesktop();
  if (!exe) return false;
  emit?.({ step: 'start-desktop' });
  spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    if (await dockerAvailable()) return true;
    await sleep(2500);
  }
  return dockerAvailable();
}

async function imageExists(tag) {
  try {
    const { stdout } = await run('docker', ['images', '-q', tag]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function ensureImage(emit) {
  if (await imageExists(IMAGE_TAG)) {
    emit?.({ step: 'image-ready' });
    return IMAGE_TAG;
  }

  const tar = getImageTar();
  if (tar && fs.existsSync(tar) && fs.statSync(tar).size > 64) {
    emit?.({ step: 'load-image' });
    await run('docker', ['load', '-i', tar], {
      onStdout: (text) => emit?.({ step: 'load-image', detail: text }),
      onStderr: (text) => emit?.({ step: 'load-image', detail: text }),
    });
    if (!(await imageExists(IMAGE_TAG))) {
      const { stdout } = await run('docker', [
        'images',
        '--format',
        '{{.Repository}}:{{.Tag}}',
      ]);
      const loaded = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line && !line.includes('<none>'));
      if (loaded) {
        await run('docker', ['tag', loaded, IMAGE_TAG]);
      }
    }
    if (await imageExists(IMAGE_TAG)) {
      return IMAGE_TAG;
    }
  }

  const pullImage =
    process.env.DEEPWIKI_PULL_IMAGE || 'ghcr.io/asyncfuncai/deepwiki-open:latest';
  emit?.({ step: 'pull-image', detail: pullImage });
  try {
    await run('docker', ['pull', pullImage], {
      onStdout: (text) => emit?.({ step: 'pull-image', detail: text }),
      onStderr: (text) => emit?.({ step: 'pull-image', detail: text }),
    });
    await run('docker', ['tag', pullImage, IMAGE_TAG]);
    return IMAGE_TAG;
  } catch {
    const error = new Error('NO_IMAGE');
    error.code = 'NO_IMAGE';
    throw error;
  }
}

function composeEnv() {
  const paths = ensureUserData();
  return {
    ...process.env,
    DEEPWIKI_ENV_FILE: toComposePath(paths.envFile),
    DEEPWIKI_DATA_DIR: toComposePath(paths.dataDir),
    DEEPWIKI_LOG_DIR: toComposePath(paths.logDir),
    PORT: String(API_PORT),
    FRONTEND_PORT: String(FRONTEND_PORT),
  };
}

function compose(args, emit) {
  return run('docker', ['compose', '-p', PROJECT_NAME, '-f', getComposeFile(), ...args], {
    env: composeEnv(),
    onStdout: (text) => emit?.({ step: 'compose', detail: text }),
    onStderr: (text) => emit?.({ step: 'compose', detail: text }),
  });
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

async function startStack(emit) {
  emit?.({ step: 'check-docker' });
  if (!(await dockerAvailable())) {
    const started = await startDockerDesktop(emit);
    if (!started) {
      const error = new Error('DOCKER_UNAVAILABLE');
      error.code = 'DOCKER_UNAVAILABLE';
      error.dockerInstalled = Boolean(findDockerDesktop());
      throw error;
    }
  }

  if (await isStackReady()) {
    emit?.({ step: 'ready' });
    return;
  }

  await ensureImage(emit);
  emit?.({ step: 'compose' });
  await compose(['up', '-d', '--remove-orphans'], emit);
  emit?.({ step: 'health' });
  await waitHttp(`http://127.0.0.1:${API_PORT}/health`, 240000);
  await waitHttp(`http://127.0.0.1:${FRONTEND_PORT}`, 120000);
  emit?.({ step: 'ready' });
}

async function stopStack(emit) {
  try {
    await compose(['stop'], emit);
  } catch {
    // Ignore shutdown errors so the window can still close.
  }
}

async function restartStack(emit) {
  await stopStack(emit);
  await startStack(emit);
}

function getStatus() {
  return {
    dockerInstalled: Boolean(findDockerDesktop()) || process.platform !== 'win32',
    composeFile: getComposeFile(),
    imageTar: getImageTar(),
    imageTarExists: fs.existsSync(getImageTar()),
    userData: getUserDataPaths(),
    apiUrl: `http://127.0.0.1:${API_PORT}`,
    appUrl: `http://127.0.0.1:${FRONTEND_PORT}`,
  };
}

module.exports = {
  dockerAvailable,
  findDockerDesktop,
  startStack,
  stopStack,
  restartStack,
  isStackReady,
  getStatus,
};
