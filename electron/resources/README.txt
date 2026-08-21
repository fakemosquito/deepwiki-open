This folder is copied into the Windows installer extraResources.

- docker-compose.yml is required.
- deepwiki-open.tar is produced by `npm run dist:win` / `scripts/build-win.ps1`
  (`docker build` + `docker save`). If the tar is absent, the app will try
  to pull ghcr.io/asyncfuncai/deepwiki-open:latest at first launch.
