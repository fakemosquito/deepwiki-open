const I18N = {
  zh: {
    splashTitle: '正在启动 DeepWiki',
    splashSubtitle: '桌面版会在本机启动 Wiki 前端与 API',
    setupTitle: '连接模型',
    setupHint:
      '填写兼容 OpenAI 的 Base URL、密钥和对话模型。保存前会先测试连接，通过后再启动服务。',
    baseUrl: 'Base URL',
    apiKey: 'API Key',
    model: 'Model',
    embeddingModel: 'Embedding 模型（可选）',
    saveAndStart: '连接并启动',
    runtimeMissingTitle: '缺少运行组件',
    runtimeMissingBody:
      '未找到打包好的 Python / Node 运行时。请使用 scripts/build-win.ps1 重新打包后再安装。',
    retry: '重试',
    errorTitle: '启动失败',
    fillRequired: '请填写 Base URL、密钥和模型。',
    invalidUrl: 'Base URL 需要以 http:// 或 https:// 开头。',
    testing: '正在测试连接…',
    connectTimeout: '连接超时，请检查 Base URL 或网络。',
    connectNetwork: '无法连接到该地址，请检查 Base URL。',
    connectFail: '连接失败',
    steps: {
      'check-runtime': '检查运行环境',
      'start-api': '启动 API 服务',
      'start-web': '启动前端服务',
      health: '等待服务就绪',
      ready: '即将打开主界面',
    },
  },
  en: {
    splashTitle: 'Starting DeepWiki',
    splashSubtitle: 'The desktop app starts the wiki UI and API on this machine',
    setupTitle: 'Connect a model',
    setupHint:
      'Enter an OpenAI-compatible Base URL, API key, and chat model. The app tests the connection before starting.',
    baseUrl: 'Base URL',
    apiKey: 'API Key',
    model: 'Model',
    embeddingModel: 'Embedding model (optional)',
    saveAndStart: 'Connect and start',
    runtimeMissingTitle: 'Runtime not found',
    runtimeMissingBody:
      'The bundled Python / Node runtime is missing. Rebuild with scripts/build-win.ps1, then reinstall.',
    retry: 'Try again',
    errorTitle: 'Failed to start',
    fillRequired: 'Please fill in Base URL, API key, and model.',
    invalidUrl: 'Base URL must start with http:// or https://.',
    testing: 'Testing connection…',
    connectTimeout: 'Connection timed out. Check the Base URL or your network.',
    connectNetwork: 'Could not reach that address. Check the Base URL.',
    connectFail: 'Connection failed',
    steps: {
      'check-runtime': 'Checking runtime',
      'start-api': 'Starting API',
      'start-web': 'Starting frontend',
      health: 'Waiting for services',
      ready: 'Opening the app',
    },
  },
};

const STEP_ORDER = ['check-runtime', 'start-api', 'start-web', 'health', 'ready'];
const RUNTIME_CODES = new Set(['PYTHON_MISSING', 'NODE_MISSING', 'RUNTIME_MISSING']);
const FIELDS = ['OPENAI_BASE_URL', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_EMBEDDING_MODEL'];

const $ = (id) => document.getElementById(id);
const panels = {
  setup: $('setup'),
  progress: $('progress'),
  runtimeMissing: $('runtimeMissing'),
  error: $('error'),
};

let strings = I18N.zh;
let currentStep = '';
let connecting = false;

function show(name) {
  for (const [key, el] of Object.entries(panels)) {
    el.classList.toggle('hidden', key !== name);
  }
}

function setStatus(text, kind) {
  const el = $('setupStatus');
  if (!text) {
    el.hidden = true;
    el.textContent = '';
    el.className = 'status';
    return;
  }
  el.hidden = false;
  el.textContent = text;
  el.className = `status ${kind || ''}`.trim();
}

function applyStrings() {
  $('title').textContent = strings.splashTitle;
  $('subtitle').textContent = strings.splashSubtitle;
  $('setupTitle').textContent = strings.setupTitle;
  $('setupHint').textContent = strings.setupHint;
  $('labelBaseUrl').textContent = strings.baseUrl;
  $('labelApiKey').textContent = strings.apiKey;
  $('labelModel').textContent = strings.model;
  $('labelEmbedding').textContent = strings.embeddingModel;
  $('saveBtn').textContent = strings.saveAndStart;
  $('runtimeMissingTitle').textContent = strings.runtimeMissingTitle;
  $('runtimeMissingBody').textContent = strings.runtimeMissingBody;
  $('runtimeRetryBtn').textContent = strings.retry;
  $('errorTitle').textContent = strings.errorTitle;
  $('errorRetryBtn').textContent = strings.retry;
  renderSteps(currentStep);
}

function renderSteps(active) {
  const list = $('steps');
  list.innerHTML = '';
  const activeIndex = STEP_ORDER.indexOf(active);
  for (const [index, key] of STEP_ORDER.entries()) {
    const item = document.createElement('li');
    item.textContent = strings.steps[key];
    if (key === active) item.className = 'active';
    else if (activeIndex > index) item.className = 'done';
    list.appendChild(item);
  }
}

function appendDetail(text) {
  if (!text || !text.trim()) return;
  const log = $('detail');
  log.textContent = `${log.textContent}${text}`.slice(-2500);
  log.scrollTop = log.scrollHeight;
}

function readForm() {
  return {
    OPENAI_BASE_URL: $('OPENAI_BASE_URL').value.trim(),
    OPENAI_API_KEY: $('OPENAI_API_KEY').value.trim(),
    OPENAI_MODEL: $('OPENAI_MODEL').value.trim(),
    OPENAI_EMBEDDING_MODEL: $('OPENAI_EMBEDDING_MODEL').value.trim(),
  };
}

function fillForm(keys) {
  for (const field of FIELDS) {
    $(field).value = keys?.[field] || '';
  }
}

function hasConnection(keys) {
  const k = keys || {};
  return Boolean(
    String(k.OPENAI_BASE_URL || '').trim() &&
      String(k.OPENAI_API_KEY || '').trim() &&
      String(k.OPENAI_MODEL || '').trim()
  );
}

function connectErrorText(result) {
  if (result?.code === 'INVALID') return strings.fillRequired;
  if (result?.code === 'INVALID_URL') return strings.invalidUrl;
  if (result?.code === 'TIMEOUT') return strings.connectTimeout;
  if (result?.code === 'NETWORK') {
    return result.message ? `${strings.connectNetwork} ${result.message}` : strings.connectNetwork;
  }
  if (result?.message) return `${strings.connectFail}：${result.message}`;
  return strings.connectFail;
}

async function startApp() {
  show('progress');
  renderSteps('check-runtime');
  const result = await window.desktop.start();
  if (result?.ok) return;
  if (RUNTIME_CODES.has(result?.code)) {
    show('runtimeMissing');
    return;
  }
  $('errorBody').textContent = result?.message || strings.errorTitle;
  show('error');
}

async function connectAndStart() {
  if (connecting) return;
  const keys = readForm();
  if (!hasConnection(keys)) {
    show('setup');
    setStatus(strings.fillRequired, 'error');
    return;
  }

  connecting = true;
  $('saveBtn').disabled = true;
  show('setup');
  setStatus(strings.testing, '');

  try {
    const result = await window.desktop.connect({ keys });
    if (result?.ok) {
      show('progress');
      return;
    }
    if (RUNTIME_CODES.has(result?.code)) {
      show('runtimeMissing');
      return;
    }
    if (result?.code === 'START_FAILED') {
      $('errorBody').textContent = result?.message || strings.errorTitle;
      show('error');
      return;
    }
    setStatus(connectErrorText(result), 'error');
  } catch (error) {
    setStatus(error.message || strings.connectFail, 'error');
  } finally {
    connecting = false;
    $('saveBtn').disabled = false;
  }
}

async function boot() {
  const locale = await window.desktop.getLocale();
  strings = locale === 'zh' ? I18N.zh : I18N.en;
  applyStrings();

  const [config, status] = await Promise.all([
    window.desktop.getConfig(),
    window.desktop.getStatus(),
  ]);

  fillForm(config.keys);

  window.desktop.onProgress((payload) => {
    if (payload?.step === 'open-settings') {
      show('setup');
      return;
    }
    if (!payload?.step) return;
    currentStep = payload.step;
    show('progress');
    renderSteps(payload.step);
    appendDetail(payload.detail || '');
  });

  if (!status.runtimeReady) {
    show('runtimeMissing');
    return;
  }

  const openSettings = location.hash.replace('#', '') === 'settings';
  if (openSettings || !hasConnection(config.keys)) {
    show('setup');
    return;
  }

  await startApp();
}

$('saveBtn').addEventListener('click', () => connectAndStart());
$('runtimeRetryBtn').addEventListener('click', () => startApp());
$('errorRetryBtn').addEventListener('click', () => {
  show('setup');
});

boot().catch((error) => {
  $('errorBody').textContent = error.message || String(error);
  show('error');
});
