#Requires -Version 5.1
<#
.SYNOPSIS
  Build DeepWiki's native Windows desktop installer (no Docker).

  Bundles portable Python 3.11, Node, MinGit, the FastAPI backend, and the
  Next.js standalone server, then produces an NSIS installer with electron-builder.

.EXAMPLE
  .\scripts\build-win.ps1
  .\scripts\build-win.ps1 -SkipRuntime
#>
param(
  [switch]$SkipRuntime,
  [switch]$ForceRuntime
)

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false
$pythonVersion = "3.11.9"
$mingitVersion = "2.47.1"
$pythonUrl = "https://www.python.org/ftp/python/$pythonVersion/python-$pythonVersion-embed-amd64.zip"
$getPipUrl = "https://bootstrap.pypa.io/get-pip.py"
$mingitUrl = "https://github.com/git-for-windows/git/releases/download/v$mingitVersion.windows.1/MinGit-$mingitVersion-64-bit.zip"
$nodeVersion = ((& node -v) 2>$null)
if (-not $nodeVersion) { throw "node is required on the build machine" }
$nodeVersion = $nodeVersion.ToString().Trim().TrimStart("v")
$nodeUrl = "https://nodejs.org/dist/v$nodeVersion/win-x64/node.exe"

$cacheDir = Join-Path $root "electron\.cache"
$resources = Join-Path $root "electron\resources"
$pythonDir = Join-Path $resources "python"
$nodeDir = Join-Path $resources "node"
$gitDir = Join-Path $resources "git"
$webDir = Join-Path $resources "web"
$apiDir = Join-Path $resources "api"
$tiktokenDir = Join-Path $resources "tiktoken_cache"

function Assert-Command($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $name"
  }
}

function Invoke-Download($url, $dest) {
  Write-Host "==> Downloading $url"
  New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
  if (Test-Path $dest) { return }
  & curl.exe -L --fail --retry 3 --retry-all-errors -o $dest $url
  if ($LASTEXITCODE -ne 0) { throw "Download failed: $url" }
}

function Copy-VcRuntime($destDir) {
  New-Item -ItemType Directory -Force -Path $destDir | Out-Null
  $names = @(
    "vcruntime140.dll",
    "vcruntime140_1.dll",
    "msvcp140.dll",
    "msvcp140_1.dll",
    "msvcp140_2.dll",
    "msvcp140_atomic_wait.dll",
    "msvcp140_codecvt_ids.dll",
    "concrt140.dll",
    "vcomp140.dll"
  )
  $sys = Join-Path $env:WINDIR "System32"
  foreach ($name in $names) {
    $src = Join-Path $sys $name
    if (Test-Path $src) {
      Copy-Item $src (Join-Path $destDir $name) -Force
    }
  }
}

function Expand-Zip($zip, $dest) {
  if (Test-Path $dest) {
    Remove-Item $dest -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Expand-Archive -LiteralPath $zip -DestinationPath $dest -Force
}

function Copy-Tree($src, $dst, $excludeDirs = @()) {
  if (Test-Path $dst) {
    Remove-Item $dst -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $dst | Out-Null
  $xd = @()
  foreach ($name in $excludeDirs) {
    $xd += $name
  }
  $args = @($src, $dst, "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/nc", "/ns", "/np")
  if ($xd.Count -gt 0) {
    $args += "/XD"
    $args += $xd
  }
  $args += @("/XF", "*.pyc")
  & robocopy @args | Out-Null
  if ($LASTEXITCODE -ge 8) {
    throw "robocopy failed copying $src -> $dst (exit $LASTEXITCODE)"
  }
}

Assert-Command npm
Assert-Command node
Assert-Command curl.exe

New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
New-Item -ItemType Directory -Force -Path $resources | Out-Null

Write-Host "==> Installing npm dependencies"
if (Test-Path "package-lock.json") {
  npm ci --legacy-peer-deps
} else {
  npm install --legacy-peer-deps
}
if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

Write-Host "==> Building Next.js standalone app"
$env:NODE_ENV = "production"
$env:NEXT_TELEMETRY_DISABLED = "1"
$env:NODE_OPTIONS = "--max-old-space-size=4096"
$env:SERVER_BASE_URL = "http://127.0.0.1:8001"
npm run build
if ($LASTEXITCODE -ne 0) { throw "next build failed" }

$standalone = Join-Path $root ".next\standalone"
if (-not (Test-Path (Join-Path $standalone "server.js"))) {
  throw "Next.js standalone output missing (.next/standalone/server.js)"
}

if (-not $SkipRuntime) {
  $pythonExe = Join-Path $pythonDir "python.exe"
  $needPython = $ForceRuntime -or -not (Test-Path $pythonExe)

  if ($needPython) {
    $pythonZip = Join-Path $cacheDir "python-$pythonVersion-embed-amd64.zip"
    Invoke-Download $pythonUrl $pythonZip
    Expand-Zip $pythonZip $pythonDir

    $pth = Get-ChildItem $pythonDir -Filter "python*._pth" | Select-Object -First 1
    if (-not $pth) { throw "python ._pth file not found" }
    $pyZip = (Get-ChildItem $pythonDir -Filter "python*.zip" | Select-Object -First 1).Name
    @"
$pyZip
.
..
Lib/site-packages
import site
"@ | Set-Content -Path $pth.FullName -Encoding ascii

    $getPip = Join-Path $cacheDir "get-pip.py"
    Invoke-Download $getPipUrl $getPip
    & $pythonExe $getPip --no-warn-script-location
    if ($LASTEXITCODE -ne 0) { throw "get-pip.py failed" }
  }

  Write-Host "==> Installing Python API dependencies"
  if (-not (Test-Path $pythonExe)) { throw "python.exe missing at $pythonExe" }
  & $pythonExe -m pip install --upgrade pip --no-warn-script-location
  if ($LASTEXITCODE -ne 0) { throw "pip upgrade failed" }
  & $pythonExe -m pip install --prefer-binary --no-warn-script-location -r (Join-Path $PSScriptRoot "desktop-requirements.txt")
  if ($LASTEXITCODE -ne 0) { throw "pip install failed" }
  Copy-Item $pythonExe (Join-Path $pythonDir "python3.exe") -Force
  Copy-VcRuntime $pythonDir

  & $pythonExe -c "import sys; assert sys.version_info[:2] >= (3, 11), sys.version"
  if ($LASTEXITCODE -ne 0) { throw "Bundled Python is not 3.11+" }
  & $pythonExe -c "import fastapi, uvicorn, adalflow, faiss, tiktoken, git, numpy, onnxruntime, fastembed"
  if ($LASTEXITCODE -ne 0) { throw "Python runtime import check failed" }

  New-Item -ItemType Directory -Force -Path $tiktokenDir | Out-Null
  $env:TIKTOKEN_CACHE_DIR = $tiktokenDir
  & $pythonExe -c "import tiktoken; tiktoken.get_encoding('cl100k_base')"
  if ($LASTEXITCODE -ne 0) { throw "tiktoken cache warmup failed" }

  Write-Host "==> Bundling portable Node $nodeVersion"
  New-Item -ItemType Directory -Force -Path $nodeDir | Out-Null
  $nodeExe = Join-Path $nodeDir "node.exe"
  $needNode = $ForceRuntime -or -not (Test-Path $nodeExe)
  $nodeCache = Join-Path $cacheDir "node-$nodeVersion-win-x64.exe"
  try {
    Invoke-Download $nodeUrl $nodeCache
  } catch {
    Write-Host "Official Node download failed, copying local node.exe"
    Copy-Item (Get-Command node).Source $nodeCache -Force
  }
  if ($needNode -or $ForceRuntime) {
    Copy-Item $nodeCache $nodeExe -Force
  }
  Copy-VcRuntime $nodeDir
  & $nodeExe -v
  if ($LASTEXITCODE -ne 0) { throw "Bundled node.exe failed to start" }

  $needGit = $ForceRuntime -or -not (Test-Path (Join-Path $gitDir "cmd\git.exe"))
  if ($needGit) {
    Write-Host "==> Bundling MinGit"
    $mingitZip = Join-Path $cacheDir "MinGit-$mingitVersion-64-bit.zip"
    Invoke-Download $mingitUrl $mingitZip
    Expand-Zip $mingitZip $gitDir
  }

  Write-Host "==> Copying API sources"
  Copy-Tree (Join-Path $root "api") $apiDir @("__pycache__", "logs", ".venv")

  $wikiVendor = Join-Path $apiDir "services\wiki\vendor"
  New-Item -ItemType Directory -Force -Path $wikiVendor | Out-Null
  $mermaidJs = Join-Path $root "node_modules\mermaid\dist\mermaid.min.js"
  $markedJs = Join-Path $root "node_modules\marked\lib\marked.umd.js"
  if (-not (Test-Path $mermaidJs)) { throw "Missing $mermaidJs (needed for offline wiki HTML export)" }
  Copy-Item $mermaidJs (Join-Path $wikiVendor "mermaid.min.js") -Force
  if (Test-Path $markedJs) {
    Copy-Item $markedJs (Join-Path $wikiVendor "marked.umd.js") -Force
  }

  Write-Host "==> Copying Next.js standalone server"
  if (Test-Path $webDir) { Remove-Item $webDir -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $webDir | Out-Null
  Copy-Tree $standalone $webDir
  $webNext = Join-Path $webDir ".next"
  New-Item -ItemType Directory -Force -Path $webNext | Out-Null
  Copy-Tree (Join-Path $root ".next\static") (Join-Path $webNext "static")
  if (Test-Path (Join-Path $root "public")) {
    Copy-Tree (Join-Path $root "public") (Join-Path $webDir "public")
  }
}

Write-Host "==> Building Windows NSIS installer"
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npx electron-builder --win nsis --publish never
if ($LASTEXITCODE -ne 0) { throw "electron-builder failed" }

Write-Host "==> Done. Installer is under dist\desktop\"
Get-ChildItem "dist\desktop\*.exe" | Format-Table Name, Length, LastWriteTime
