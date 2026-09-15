# 課題レーダー v0.6.4 - GitHub Pages 更新手順

現在の公開方式は `gh-pages` ブランチです。

## 初回だけ
GitHub の `Settings > Pages` で以下を設定します。

- Source: `Deploy from a branch`
- Branch: `gh-pages`
- Folder: `/ (root)`

## 更新時
ローカルでこのフォルダを現在のリポジトリへ反映した後、次を実行します。

```powershell
git add .
git commit -m "Update Kadai Radar v0.6.4"
git push origin main
```

`main` への push を検知すると `.github/workflows/deploy-pages.yml` が自動実行されます。
ビルド成功後、`dist` の内容が `gh-pages` ブランチへ公開されます。

## Actions で確認する項目

- Checkout
- Setup Node
- Install dependencies
- Build
- Deploy to gh-pages

すべて緑色になれば公開成功です。
