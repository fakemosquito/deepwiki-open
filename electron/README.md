# DeepWiki 桌面版

Electron 壳负责窗口、首次密钥配置和 Docker 生命周期；Wiki 前端 / Python API 仍在现有 Docker 镜像里运行。

## 运行（开发）

1. 安装并启动 [Docker Desktop](https://www.docker.com/products/docker-desktop/)（Linux 容器）
2. `npm install`
3. `npm run electron:dev`

首次启动会要求填写至少一个模型密钥（或 Ollama 地址）。数据目录：`%APPDATA%\DeepWiki\adalflow`。

## 打 Windows 安装包

本机（推荐，需 Docker + Node 20）：

```powershell
.\scripts\build-win.ps1
```

安装包输出：`dist\desktop\DeepWiki-Setup-<version>.exe`。脚本会 `docker build` 应用镜像、`docker save` 进安装包，再用 electron-builder 生成 NSIS。

当前仓库在无 Docker 的机器上也能先打出 Electron 安装包（约 80MB）。安装后第一次启动会：

1. 检测并引导安装 Docker Desktop
2. 若安装包内带有 `deepwiki-open.tar` 则 `docker load`
3. 否则拉取 `ghcr.io/asyncfuncai/deepwiki-open:latest`

只用 Docker 构建（适合 CI / 不想在宿主机装 electron-builder）：

```powershell
docker compose -f docker-compose.build-desktop.yml run --rm export-image
docker compose -f docker-compose.build-desktop.yml run --rm win-installer
```

不把镜像打进安装包（体积更小，首次启动会尝试拉取 `ghcr.io/asyncfuncai/deepwiki-open:latest`）：

```powershell
.\scripts\build-win.ps1 -SkipImage
```
