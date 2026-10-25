# GitHubへの保存手順

この配布物にはローカルのGit履歴を作成済みです。**GitHub上のPrivateリポジトリはまだ作成していません。**

## 手順A — GitHub CLI（推奨）

1. VS Codeで `coding-tools-repository` フォルダーを開く。
2. 必要なら `git status` と `git log --oneline` で状態を確認。
3. GitHub CLIにログイン済みなら、以下を実行。

```powershell
gh repo create coding-tools --private --source=. --remote=origin --push
```

**既存の同名リポジトリがある場合は失敗する**ため、先にGitHub上のリポジトリ名を確認。`--private` は重要。

## 手順B — ブラウザで作成

1. GitHubで**Privateの空リポジトリ** `coding-tools` を作成（READMEなどは自動生成しない）。
2. 作成されたリポジトリURLを用いて、次を実行。

```bash
git remote add origin https://github.com/<YOUR-LOGIN>/coding-tools.git
git push -u origin main
```

`<YOUR-LOGIN>`は実際のアカウント名に置き換える。SSHを設定していればSSH URLでもよい。

## 配布用VSIX

ローカルの `dist/` に同梱したVSIXは**.gitignoreの対象**。公開する版だけGitHub Releasesに添付し、ソースとの対応バージョンを説明する。

## ZIPとGitの差

- この配布物のZIPには開発フォルダーがそのまま入り、**ローカルGitの `.git` も含まれる**（GitHubのDownload ZIPとは異なる）。
- GitHubの「Code → Download ZIP」はGit履歴を含まない。継続開発はCloneが確実。
