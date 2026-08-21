#Requires -Version 5.1
<#
.SYNOPSIS
  Build the DeepWiki Docker image, export it, and produce a Windows NSIS installer.

.EXAMPLE
  .\scripts\build-win.ps1
  .\scripts\build-win.ps1 -SkipImage
#>
param(
  [switch]$SkipImage,
  [string]$ImageTag = "deepwiki-open:desktop"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Assert-Command($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $name"
  }
}

Assert-Command npm

if (-not $SkipImage) {
  Assert-Command docker
  Write-Host "==> Building Docker image $ImageTag"
  docker build -t $ImageTag .
  if ($LASTEXITCODE -ne 0) { throw "docker build failed" }

  New-Item -ItemType Directory -Force -Path "electron\resources" | Out-Null
  $tar = Join-Path $root "electron\resources\deepwiki-open.tar"
  Write-Host "==> Saving image to $tar"
  docker save $ImageTag -o $tar
  if ($LASTEXITCODE -ne 0) { throw "docker save failed" }
  Get-Item $tar | Format-List FullName, Length
}

Write-Host "==> Installing npm dependencies"
if (Test-Path "package-lock.json") {
  npm ci --legacy-peer-deps
} else {
  npm install --legacy-peer-deps
}

Write-Host "==> Building Windows NSIS installer"
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npx electron-builder --win nsis --publish never
if ($LASTEXITCODE -ne 0) { throw "electron-builder failed" }

Write-Host "==> Done. Installer is under dist\desktop\"
Get-ChildItem "dist\desktop\*.exe" | Format-Table Name, Length, LastWriteTime
