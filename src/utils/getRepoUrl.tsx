import RepoInfo from "@/types/repoinfo";

export default function getRepoUrl(repoInfo: RepoInfo): string {
  if (repoInfo.type === 'local') {
    return repoInfo.localPath || repoInfo.repoUrl || '';
  }
  if (repoInfo.repoUrl) {
    return repoInfo.repoUrl;
  }
  if (repoInfo.owner && repoInfo.repo) {
    return "http://example/" + repoInfo.owner + "/" + repoInfo.repo;
  }
  return '';
};
