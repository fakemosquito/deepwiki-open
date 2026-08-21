const STRINGS = {
  zh: {
    appName: 'DeepWiki',
    splashTitle: '正在启动 DeepWiki',
    splashSubtitle: '桌面版会通过 Docker 启动 Wiki 服务',
    stepCheckDocker: '检查 Docker 环境',
    stepStartDesktop: '启动 Docker Desktop',
    stepLoadImage: '导入应用镜像',
    stepPullImage: '拉取应用镜像',
    stepCompose: '启动服务容器',
    stepHealth: '等待服务就绪',
    stepReady: '即将打开主界面',
    setupTitle: '首次配置',
    setupHint:
      '至少填写一个模型密钥，或填写本地 Ollama 地址。这些值会写入本机配置，并注入 Docker 容器。',
    googleKey: 'Google API Key',
    openaiKey: 'OpenAI API Key',
    openrouterKey: 'OpenRouter API Key',
    ollamaHost: 'Ollama Host（可选）',
    skipSetup: '稍后再说',
    saveAndStart: '保存并启动',
    startNow: '启动 DeepWiki',
    dockerMissingTitle: '未检测到 Docker',
    dockerMissingBody:
      'DeepWiki 桌面版需要 Docker Desktop（Linux 容器）来运行后端与前端服务。安装完成后重新打开本应用即可。',
    dockerNotRunning: 'Docker 已安装但尚未就绪，正在尝试启动 Docker Desktop…',
    downloadDocker: '下载 Docker Desktop',
    retry: '重新检测',
    errorTitle: '启动失败',
    errorNoImage:
      '没有找到预置镜像，也无法从仓库拉取。请用构建脚本重新打包（会执行 docker build && docker save）。',
    openLogs: '打开日志目录',
    settings: '设置',
    restart: '重启服务',
    openData: '打开数据目录',
    quit: '退出',
    fileMenu: '文件',
    helpMenu: '帮助',
    dockerDocs: 'Docker Desktop 说明',
  },
  en: {
    appName: 'DeepWiki',
    splashTitle: 'Starting DeepWiki',
    splashSubtitle: 'The desktop app boots the wiki stack with Docker',
    stepCheckDocker: 'Checking Docker',
    stepStartDesktop: 'Starting Docker Desktop',
    stepLoadImage: 'Loading application image',
    stepPullImage: 'Pulling application image',
    stepCompose: 'Starting containers',
    stepHealth: 'Waiting for services',
    stepReady: 'Opening the app',
    setupTitle: 'First-run setup',
    setupHint:
      'Provide at least one model key, or an Ollama host. Values are stored locally and injected into Docker.',
    googleKey: 'Google API Key',
    openaiKey: 'OpenAI API Key',
    openrouterKey: 'OpenRouter API Key',
    ollamaHost: 'Ollama Host (optional)',
    skipSetup: 'Skip for now',
    saveAndStart: 'Save and start',
    startNow: 'Start DeepWiki',
    dockerMissingTitle: 'Docker not found',
    dockerMissingBody:
      'The desktop app needs Docker Desktop (Linux containers) to run the API and UI. Install it, then reopen DeepWiki.',
    dockerNotRunning: 'Docker is installed but not ready. Trying to start Docker Desktop…',
    downloadDocker: 'Download Docker Desktop',
    retry: 'Check again',
    errorTitle: 'Failed to start',
    errorNoImage:
      'No bundled image was found and pulling failed. Rebuild with the packaging script (docker build && docker save).',
    openLogs: 'Open logs',
    settings: 'Settings',
    restart: 'Restart services',
    openData: 'Open data folder',
    quit: 'Quit',
    fileMenu: 'File',
    helpMenu: 'Help',
    dockerDocs: 'Docker Desktop docs',
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
