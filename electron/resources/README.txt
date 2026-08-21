This folder is filled by `scripts/build-win.ps1` and copied into the Windows installer extraResources.

Packaged layout:

- python/     portable CPython 3.11 + site-packages
- node/       node.exe used to run the Next.js standalone server
- git/        MinGit, used by GitPython to clone repositories
- api/        FastAPI backend
- web/        Next.js standalone output (server.js, .next, public)
- tiktoken_cache/

Docker is not used by the desktop app.
