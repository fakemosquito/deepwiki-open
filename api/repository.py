import os
import subprocess
from functools import wraps
from collections.abc import Callable
from urllib.parse import quote, unquote, urlparse, urlunparse

from git import Repo as GitRepo, GIT_OK, GitCommandError

from api.logger import get_logger
from api.utils import deepwiki_root

logger = get_logger(__name__)


CLONE_REPO_ROOT = os.path.join(deepwiki_root(), "repo")


def _exception_cleanup(func: Callable) -> Callable:
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except (subprocess.CalledProcessError, GitCommandError) as e:
            err_msg: str | bytes = e.stderr
            if isinstance(err_msg, bytes):
                err_msg = err_msg.decode("utf-8")
            token = kwargs.get("access_token", None)
            if token:
                token_mask = "***TOKEN***"
                err_msg = err_msg.replace(token, token_mask)
                encoded_token = quote(token, safe="")
                err_msg = err_msg.replace(encoded_token, token_mask)
            raise ValueError(err_msg)

    return wrapper


@_exception_cleanup
def _clone_from_gitlab(
    remote_url: str,
    local_path: str,
    *,
    access_token: str | None = None,
    **kwargs,
) -> GitRepo:
    if access_token:
        parsed = urlparse(remote_url)
        access_token = quote(access_token, safe="")

        remote_url = urlunparse(
            (
                parsed.scheme,
                f"oauth2:{access_token}@{parsed.netloc}",
                parsed.path,
                "",
                "",
                "",
            )
        )
    return GitRepo.clone_from(url=remote_url, to_path=local_path, **kwargs)


@_exception_cleanup
def _clone_from_github(
    remote_url: str,
    local_path: str,
    *,
    access_token: str | None = None,
    **kwargs,
) -> GitRepo:
    if access_token:
        parsed = urlparse(remote_url)

        remote_url = urlunparse(
            (
                parsed.scheme,
                f"{access_token}@{parsed.netloc}",
                parsed.path,
                "",
                "",
                "",
            )
        )
    return GitRepo.clone_from(url=remote_url, to_path=local_path, **kwargs)


@_exception_cleanup
def _clone_from_bitbucket(
    remote_url: str,
    local_path: str,
    *,
    access_token: str | None = None,
    **kwargs,
) -> GitRepo:
    if access_token:
        parsed = urlparse(remote_url)
        # Bitbucket has two token formats with different auth schemes:
        #   - HTTP access tokens (prefix "ATCTT") use x-bitbucket-api-token-auth
        #   - App passwords (deprecated, EOL June 2026) use x-token-auth
        # Detect by token prefix so existing app password users keep working.
        auth_scheme = (
            "x-bitbucket-api-token-auth"
            if access_token.startswith("ATCTT")
            else "x-token-auth"
        )
        access_token = quote(access_token, safe="")

        remote_url = urlunparse(
            (
                parsed.scheme,
                f"{auth_scheme}:{access_token}@{parsed.netloc}",
                parsed.path,
                "",
                "",
                "",
            )
        )
    return GitRepo.clone_from(url=remote_url, to_path=local_path, **kwargs)


def _path_is_url(path: str) -> bool:
    """Check if the given path is a URL, or local path string.

    Parameters
    ----------
    path: str
        The path to be checked

    Returns
    -------
    bool. True if is a URL, False otherwise
    """
    try:
        result = urlparse(path)
        return result.scheme in {"http", "https", "ftp"} and bool(result.netloc)
    except Exception:
        return False


def normalize_repo_location(repo_url: str) -> str:
    """Normalize a repository URL or local filesystem path.

    Accepts quoted paths, ``file://`` URLs, and ``~`` home prefixes so desktop
    users can paste Windows/Unix paths as they appear in Explorer.
    """
    text = (repo_url or "").strip().strip('"').strip("'")
    if not text:
        return text
    if text.lower().startswith("file:"):
        parsed = urlparse(text)
        path = unquote(parsed.path or "")
        if parsed.netloc and parsed.netloc not in {"", "localhost"}:
            path = "\\\\" + parsed.netloc + path.replace("/", "\\")
        elif len(path) >= 3 and path[0] == "/" and path[2] == ":":
            path = path[1:]
        text = path
    if text.startswith("~"):
        text = os.path.expanduser(text)
    return text


def _local_basename(path: str) -> str:
    normalized = path.replace("\\", "/").rstrip("/")
    name = normalized.split("/")[-1] if normalized else ""
    return name or "local-repo"


def ensure_local_repo_available(repo: "Repo") -> None:
    """Raise a clear error when a local path cannot be read."""
    if not repo.is_local:
        return
    path = repo.save_path
    if not os.path.isdir(path):
        raise FileNotFoundError(
            f"Local repository path does not exist or is not a directory: {path}"
        )


class Repo:
    def __init__(
        self,
        repo_url: str,
        repo_type: str | None,
        root_path: str = CLONE_REPO_ROOT,
        access_token: str | None = None,
    ):
        """

        Parameters
        ----------
        repo_url
        repo_type
        root_path
        access_token : str, optional
            The access token to use when cloning repository from a private git service.
        """
        self.repo_url = normalize_repo_location(repo_url)
        self.repo_type = repo_type

        os.makedirs(root_path, exist_ok=True)
        self.root_path = root_path
        self.access_token = access_token

    @property
    def name(self):
        return self._extract_repo_name(self.repo_url, repo_type=self.repo_type)

    @property
    def is_local(self) -> bool:
        return not _path_is_url(self.repo_url)

    @staticmethod
    def _extract_repo_name(repo_url: str, repo_type: str | None) -> str:
        if _path_is_url(repo_url):
            url_parts = repo_url.rstrip("/").split("/")
            if repo_type in ["github", "gitlab", "bitbucket"] and len(url_parts) >= 5:
                # GitHub URL format: https://github.com/owner/repo
                # GitLab URL format: https://gitlab.com/owner/repo or https://gitlab.com/group/subgroup/repo
                # Bitbucket URL format: https://bitbucket.org/owner/repo
                owner = url_parts[-2]
                repo = url_parts[-1].replace(".git", "")
                repo_name = f"{owner}_{repo}"
            else:
                repo_name = url_parts[-1].replace(".git", "")
        else:
            # This is a local repository
            repo_name = _local_basename(repo_url)
        return repo_name

    def download(self, force: bool = False) -> None:
        if force or (not self.downloaded and not self.is_local):
            os.makedirs(self.save_path, exist_ok=True)

            if not GIT_OK:
                raise RuntimeError("Missing `git` in current environment")

            kwargs = {
                "remote_url": self.repo_url,
                "local_path": self.save_path,
                "access_token": self.access_token,
                "multi_options": ["--depth=1", "--single-branch"],
            }

            if self.repo_type == "github":
                _clone_from_github(**kwargs)

            elif self.repo_type == "gitlab":
                _clone_from_gitlab(**kwargs)

            elif self.repo_type == "bitbucket":
                _clone_from_bitbucket(**kwargs)
            else:
                raise NotImplementedError(f"Unknown repo type: {self.repo_type}")

            logger.info("Repository %s cloned successfully", self.name)

    @property
    def save_path(self) -> str:
        if self.is_local:
            return os.path.abspath(self.repo_url)
        return os.path.join(self.root_path, self.name)

    @property
    def downloaded(self) -> bool:
        return os.path.exists(self.save_path) and bool(os.listdir(self.save_path))

    def __repr__(self) -> str:
        return f"{self.repo_type}: {self.name}"
