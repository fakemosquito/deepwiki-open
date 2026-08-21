import { extractUrlDomain, extractUrlPath } from '@/utils/urlDecoder';

export interface ParsedRepositoryInput {
  owner: string;
  repo: string;
  type: string;
  fullPath?: string;
  localPath?: string;
}

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function fromFileUrl(value: string): string {
  if (!/^file:/i.test(value)) return value;
  try {
    const url = new URL(value);
    let pathname = decodeURIComponent(url.pathname);
    if (url.host && url.host !== 'localhost') {
      return `\\\\${url.host}${pathname.replace(/\//g, '\\')}`;
    }
    if (/^\/[a-zA-Z]:/.test(pathname)) {
      pathname = pathname.slice(1);
    }
    return pathname;
  } catch {
    return value.replace(/^file:\/\//i, '');
  }
}

function folderName(pathValue: string): string {
  const parts = pathValue.replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean);
  const name = parts[parts.length - 1] || 'local-repo';
  return name.replace(/\.git$/i, '') || 'local-repo';
}

export function isLocalFilesystemPath(value: string): boolean {
  if (/^[a-zA-Z]:[\\/]/.test(value)) return true;
  if (/^\\\\[^\\/]+/.test(value)) return true;
  if (value.startsWith('~/') || value.startsWith('~\\')) return true;
  if (value.startsWith('./') || value.startsWith('.\\')) return true;
  if (value.startsWith('../') || value.startsWith('..\\')) return true;
  // Unix absolute path, but not protocol-relative URLs like //github.com/foo/bar
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  return false;
}

export function parseRepositoryInput(input: string): ParsedRepositoryInput | null {
  let value = fromFileUrl(stripWrappingQuotes(input));
  if (!value) return null;

  if (isLocalFilesystemPath(value)) {
    return {
      owner: 'local',
      repo: folderName(value),
      type: 'local',
      localPath: value,
    };
  }

  const customGitRegex = /^(?:https?:\/\/)?([^/]+)\/(.+?)\/([^/]+)(?:\.git)?\/?$/;
  const ownerRepoRegex = /^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/;

  if (customGitRegex.test(value)) {
    const domain = extractUrlDomain(value);
    let type = 'github';
    if (domain?.includes('gitlab.com') || domain?.includes('gitlab.')) {
      type = 'gitlab';
    } else if (domain?.includes('bitbucket.org') || domain?.includes('bitbucket.')) {
      type = 'bitbucket';
    } else if (domain?.includes('github.com')) {
      type = 'github';
    } else {
      type = 'web';
    }

    const fullPath = extractUrlPath(value)?.replace(/\.git$/, '');
    const parts = fullPath?.split('/') ?? [];
    if (parts.length >= 2) {
      let repo = (parts[parts.length - 1] || '').trim();
      const owner = (parts[parts.length - 2] || '').trim();
      if (repo.endsWith('.git')) {
        repo = repo.slice(0, -4);
      }
      if (owner && repo) {
        return { owner, repo, type, fullPath };
      }
    }
  }

  const ownerRepo = value.match(ownerRepoRegex);
  if (ownerRepo && !value.includes('\\')) {
    return { owner: ownerRepo[1], repo: ownerRepo[2], type: 'github' };
  }

  return null;
}
