import pytest
import re
import os

import git

from api.repository import Repo, ensure_local_repo_available, normalize_repo_location


def test_repo_is_local():
    repo = Repo(repo_url="./", repo_type="local")
    assert repo.is_local


def test_repo_is_remote(tmpdir):
    repo = Repo(
        repo_url="https://github.com/AsyncFuncAI/deepwiki-open",
        repo_type="github",
        root_path=tmpdir,
    )
    assert not repo.is_local
    assert not repo.downloaded


def test_repo_download_no_git(tmpdir, monkeypatch):
    repo = Repo(
        repo_url="https://github.com/AsyncFuncAI/deepwiki-open",
        repo_type="github",
        root_path=tmpdir,
    )
    from api import repository
    monkeypatch.setattr(repository, "GIT_OK", value=False)

    with pytest.raises(RuntimeError, match="Missing `git` in current environment"):
        repo.download()


def test_repo_download_path_exists(tmpdir, mocker):
    repo = Repo(
        repo_url="https://github.com/AsyncFuncAI/deepwiki-open",
        repo_type="github",
        root_path=tmpdir,
    )

    def touch_file(*args, **kwargs):
        tmp_file = os.path.join(repo.save_path, "touch")
        with open(tmp_file, "w") as f:
            f.write("")
    mocker.patch.object(git.Repo, "clone_from", return_value=None, side_effect=touch_file)

    repo.download()
    assert repo.downloaded
    assert os.path.exists(repo.save_path)


def test_repo_git_clone_message_masking(tmpdir, mocker):
    repo = Repo(
        repo_url="https://github.com/AsyncFuncAI/deepwiki-open",
        repo_type="github",
        root_path=tmpdir,
        access_token="123456789"
    )

    def raise_error(*args, **kwargs):
        raise git.GitCommandError(command="git clone", stderr="123456789 is not a valid token")

    mocker.patch.object(git.Repo, "clone_from", return_value=None, side_effect=raise_error)

    with pytest.raises(ValueError, match=re.escape("***TOKEN*** is not a valid token")):
        repo.download()


@pytest.mark.network
@pytest.mark.parametrize(
    "repo_url, repo_type",
    [
        ("https://github.com/AsyncFuncAI/deepwiki-open", "github"),
        ("https://gitlab.com/gitlab-org/gitlab-pages", "gitlab"),
    ]
)
def test_repo_download(repo_url, repo_type, tmpdir):
    repo = Repo(repo_url, repo_type, root_path=tmpdir)
    repo.download()

    assert repo.downloaded


def test_normalize_quoted_and_file_url():
    assert normalize_repo_location(r'"C:\Users\foo\bar"') == r"C:\Users\foo\bar"
    assert normalize_repo_location("file:///C:/Users/foo/bar") == "C:/Users/foo/bar"
    assert normalize_repo_location("/home/user/project") == "/home/user/project"


def test_local_save_path_uses_existing_directory():
    path = os.path.dirname(os.path.abspath(__file__))
    repo = Repo(repo_url=path, repo_type="local")
    assert repo.is_local
    assert os.path.normcase(os.path.abspath(repo.save_path)) == os.path.normcase(path)
    ensure_local_repo_available(repo)


def test_ensure_local_repo_missing_path():
    missing = os.path.join(os.path.dirname(os.path.abspath(__file__)), "does-not-exist")
    repo = Repo(repo_url=missing, repo_type="local")
    with pytest.raises(FileNotFoundError, match="does not exist"):
        ensure_local_repo_available(repo)
