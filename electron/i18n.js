const STRINGS = {
  zh: {
    appName: 'DeepWiki',
    splashTitle: '正在启动 DeepWiki',
    splashSubtitle: '桌面版会在本机启动 Wiki 前端与 API',
    stepCheckRuntime: '检查运行环境',
    stepStartApi: '启动 API 服务',
    stepStartWeb: '启动前端服务',
    stepHealth: '等待服务就绪',
    stepReady: '即将打开主界面',
    setupTitle: '连接模型',
    setupHint:
      '填写兼容 OpenAI 的 Base URL、密钥和对话模型。保存前会先测试连接，通过后再启动服务。',
    baseUrl: 'Base URL',
    apiKey: 'API Key',
    model: 'Model',
    embeddingModel: 'Embedding 模型（可选）',
    saveAndStart: '连接并启动',
    startNow: '启动 DeepWiki',
    runtimeMissingTitle: '缺少运行组件',
    runtimeMissingBody:
      '未找到打包好的 Python / Node 运行时。请使用 scripts/build-win.ps1 重新打包后再安装。',
    retry: '重试',
    errorTitle: '启动失败',
    errorRuntime:
      '本机运行时不完整。请重新执行打包脚本，确保安装包内包含 Python、Node 与 API/前端文件。',
    fillRequired: '请填写 Base URL、密钥和模型。',
    invalidUrl: 'Base URL 需要以 http:// 或 https:// 开头。',
    testing: '正在测试连接…',
    connectTimeout: '连接超时，请检查 Base URL 或网络。',
    connectNetwork: '无法连接到该地址，请检查 Base URL。',
    connectFail: '连接失败',
    openLogs: '打开日志目录',
    settings: '设置',
    restart: '重启服务',
    openData: '打开数据目录',
    quit: '退出',
    fileMenu: '文件',
    helpMenu: '帮助',
    projectHome: '项目主页',
  },
  en: {
    appName: 'DeepWiki',
    splashTitle: 'Starting DeepWiki',
    splashSubtitle: 'The desktop app starts the wiki UI and API on this machine',
    stepCheckRuntime: 'Checking runtime',
    stepStartApi: 'Starting API',
    stepStartWeb: 'Starting frontend',
    stepHealth: 'Waiting for services',
    stepReady: 'Opening the app',
    setupTitle: 'Connect a model',
    setupHint:
      'Enter an OpenAI-compatible Base URL, API key, and chat model. The app tests the connection before starting.',
    baseUrl: 'Base URL',
    apiKey: 'API Key',
    model: 'Model',
    embeddingModel: 'Embedding model (optional)',
    saveAndStart: 'Connect and start',
    startNow: 'Start DeepWiki',
    runtimeMissingTitle: 'Runtime not found',
    runtimeMissingBody:
      'The bundled Python / Node runtime is missing. Rebuild with scripts/build-win.ps1, then reinstall.',
    retry: 'Try again',
    errorTitle: 'Failed to start',
    errorRuntime:
      'The local runtime is incomplete. Rebuild so the installer includes Python, Node, the API, and the web UI.',
    fillRequired: 'Please fill in Base URL, API key, and model.',
    invalidUrl: 'Base URL must start with http:// or https://.',
    testing: 'Testing connection…',
    connectTimeout: 'Connection timed out. Check the Base URL or your network.',
    connectNetwork: 'Could not reach that address. Check the Base URL.',
    connectFail: 'Connection failed',
    openLogs: 'Open logs',
    settings: 'Settings',
    restart: 'Restart services',
    openData: 'Open data folder',
    quit: 'Quit',
    fileMenu: 'File',
    helpMenu: 'Help',
    projectHome: 'Project home',
  },
};

function resolveLocale(preferred) {
  const raw = String(preferred || '').toLowerCase();
  if (raw.startsWith('zh')) return 'zh';
  if (STRINGS[raw]) return raw;
  return 'en';
}

function t(locale, key) {
  const lang = resolveLocale(locale);
  return (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key;
}

module.exports = { STRINGS, resolveLocale, t };
