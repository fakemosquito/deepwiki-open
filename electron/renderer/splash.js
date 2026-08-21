const I18N = {
  zh: {
    splashTitle: '正在启动 DeepWiki',
    splashSubtitle: '桌面版会通过 Docker 启动 Wiki 服务',
    setupTitle: '首次配置',
    setupHint: '至少填写一个模型密钥，或填写本地 Ollama 地址。这些值会写入本机并注入 Docker 容器。',
    googleKey: 'Google API Key',
    openaiKey: 'OpenAI API Key',
    openrouterKey: 'OpenRouter API Key',
    ollamaHost: 'Ollama Host（可选）',
    skipSetup: '稍后再说',
    saveAndStart: '保存并启动',
    dockerMissingTitle: '未检测到 Docker',
    dockerMissingBody:
      'DeepWiki 桌面版需要 Docker Desktop（Linux 容器）来运行后端与前端服务。安装完成后重新打开本应用即可。',
    downloadDocker: '下载 Docker Desktop',
    retry: '重新检测',
    errorTitle: '启动失败',
    errorNoImage: '没有找到预置镜像，也无法拉取。请用打包脚本重新构建（docker build && docker save）。',
    steps: {
      'check-docker': '检查 Docker 环境',
      'start-desktop': '启动 Docker Desktop',
      'load-image': '导入应用镜像',
      'pull-image': '拉取应用镜像',
      'image-ready': '镜像已就绪',
      compose: '启动服务容器',
      health: '等待服务就绪',
      ready: '即将打开主界面',
    },
  },
  en: {
    splashTitle: 'Starting DeepWiki',
    splashSubtitle: 'The desktop app boots the wiki stack with Docker',
    setupTitle: 'First-run setup',
    setupHint: 'Provide at least one model key, or an Ollama host. Values are stored locally and injected into Docker.',
    googleKey: 'Google API Key',
    openaiKey: 'OpenAI API Key',
    openrouterKey: 'OpenRouter API Key',
    ollamaHost: 'Ollama Host (optional)',
    skipSetup: 'Skip for now',
    saveAndStart: 'Save and start',
    dockerMissingTitle: 'Docker not found',
    dockerMissingBody:
      'The desktop app needs Docker Desktop (Linux containers) to run the API and UI. Install it, then reopen DeepWiki.',
    downloadDocker: 'Download Docker Desktop',
    retry: 'Check again',
    errorTitle: 'Failed to start',
    errorNoImage: 'No bundled image was found and pulling failed. Rebuild with docker build && docker save.',
    steps: {
      'check-docker': 'Checking Docker',
      'start-desktop': 'Starting Docker Desktop',
      'load-image': 'Loading application image',
      'pull-image': 'Pulling application image',
      'image-ready': 'Image ready',
      compose: 'Starting containers',
      health: 'Waiting for services',
      ready: 'Opening the app',
    },
  },
};

const STEP_ORDER = [
  'check-docker',
  'start-desktop',
  'load-image',
  'pull-image',
  'image-ready',
  'compose',
  'health',
  'ready',
];

const $ = (id) => document.getElementById(id);
const panels = {
  setup: $('setup'),
  progress: $('progress'),
  dockerMissing: $('dockerMissing'),
  error: $('error'),
};

let strings = I18N.zh;
let currentStep = '';

function show(name) {
  for (const [key, el] of Object.entries(panels)) {
    el.classList.toggle('hidden', key !== name);
  }
}

function applyStrings() {
  $('title').textContent = strings.splashTitle;
  $('subtitle').textContent = strings.splashSubtitle;
  $('setupTitle').textContent = strings.setupTitle;
  $('setupHint').textContent = strings.setupHint;
  $('labelGoogle').textContent = strings.googleKey;
  $('labelOpenai').textContent = strings.openaiKey;
  $('labelOpenrouter').textContent = strings.openrouterKey;
  $('labelOllama').textContent = strings.ollamaHost;
  $('skipBtn').textContent = strings.skipSetup;
  $('saveBtn').textContent = strings.saveAndStart;
  $('dockerMissingTitle').textContent = strings.dockerMissingTitle;
  $('dockerMissingBody').textContent = strings.dockerMissingBody;
  $('downloadDockerBtn').textContent = strings.downloadDocker;
  $('retryBtn').textContent = strings.retry;
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

async function startApp() {
  show('progress');
  renderSteps('check-docker');
  const result = await window.desktop.start();
  if (result?.ok) return;
  if (result?.code === 'DOCKER_UNAVAILABLE' && !result.dockerInstalled) {
    show('dockerMissing');
    return;
  }
  $('errorBody').textContent =
    result?.code === 'NO_IMAGE' ? strings.errorNoImage : result?.message || strings.errorTitle;
  show('error');
}

async function boot() {
  const locale = await window.desktop.getLocale();
  strings = locale === 'zh' ? I18N.zh : I18N.en;
  applyStrings();

  const [config, status] = await Promise.all([
    window.desktop.getConfig(),
    window.desktop.getStatus(),
  ]);

  const keyFields = ['GOOGLE_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'OLLAMA_HOST'];
  for (const field of keyFields) {
    $(field).value = config.keys?.[field] || '';
  }

  window.desktop.onProgress((payload) => {
    if (!payload?.step) return;
    currentStep = payload.step;
    show('progress');
    renderSteps(payload.step);
    appendDetail(payload.detail || '');
  });

  if (!status.dockerReady && !status.dockerInstalled) {
    show('dockerMissing');
    return;
  }

  const hasKey = keyFields.some((field) => (config.keys?.[field] || '').trim());
  if (!hasKey) {
    show('setup');
    return;
  }

  await startApp();
}

$('saveBtn').addEventListener('click', async () => {
  await window.desktop.setConfig({
    keys: {
      GOOGLE_API_KEY: $('GOOGLE_API_KEY').value.trim(),
      OPENAI_API_KEY: $('OPENAI_API_KEY').value.trim(),
      OPENROUTER_API_KEY: $('OPENROUTER_API_KEY').value.trim(),
      OLLAMA_HOST: $('OLLAMA_HOST').value.trim(),
    },
  });
  await startApp();
});

$('skipBtn').addEventListener('click', () => startApp());
$('retryBtn').addEventListener('click', () => startApp());
$('errorRetryBtn').addEventListener('click', () => startApp());
$('downloadDockerBtn').addEventListener('click', () => {
  window.desktop.openExternal(
    'https://www.docker.com/products/docker-desktop/'
  );
});

boot().catch((error) => {
  $('errorBody').textContent = error.message || String(error);
  show('error');
});
