# DeepWiki 桌面版

Electron 壳负责窗口、首次密钥配置，以及在本机拉起 Wiki 前端和 Python API。安装和使用都不需要 Docker。

## 运行（开发）

1. `npm install`
2. 先执行一次 `.\scripts\build-win.ps1`（会下载便携 Python / Node / MinGit 并构建前端），或自行准备 Python 3.11+ 与 `npm run build`
3. `npm run electron:dev`

首次启动会要求填写兼容 OpenAI 的 Base URL、密钥和模型，测试连接通过后再启动服务。数据目录：`%APPDATA%\DeepWiki\.adalflow`。

## 打 Windows 安装包

本机需要 Node 20+（不需要 Docker）：

```powershell
.\scripts\build-win.ps1
```

安装包输出：`dist\desktop\DeepWiki-Setup-<version>.exe`。脚本会：

1. `next build`（standalone）
2. 下载便携 Python 3.11、MinGit，并复制当前 `node.exe`
3. 安装 API 依赖，拷贝后端与前端到 `electron/resources`
4. 用 electron-builder 生成 NSIS 安装包

运行时由 Electron 直接启动 `python -m api.main` 和 `node server.js`，不再调用 Docker。
