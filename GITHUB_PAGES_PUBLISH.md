# 課題レーダーを GitHub Pages で公開する

この版は Firebase を使用しません。データは各スマホのブラウザ内に保存されます。
GitHub Pages はアプリ本体（HTML/CSS/JavaScript）の配信だけを行います。

## 1. GitHubでリポジトリを作る

GitHubで新規リポジトリを作成します。

推奨名:

`kadai-radar`

Public / Private は利用条件に合わせて選択してください。
GitHub Pages の利用可否はアカウント/リポジトリ設定に依存します。

## 2. このフォルダをリポジトリへ入れる

VS Codeでこのフォルダを開き、ターミナルで以下を実行します。

```powershell
git init
git add .
git commit -m "Initial release of Kadai Radar"
git branch -M main
git remote add origin https://github.com/<YOUR_GITHUB_NAME>/kadai-radar.git
git push -u origin main
```

`<YOUR_GITHUB_NAME>` は自分のGitHubユーザー名に置き換えてください。

## 3. GitHub PagesをGitHub Actions方式にする

GitHubのリポジトリを開きます。

`Settings` → `Pages` → `Build and deployment` → `Source`

で **GitHub Actions** を選択します。

## 4. 自動デプロイ

mainブランチへpushすると、

`.github/workflows/deploy-pages.yml`

が自動実行されます。

GitHubの `Actions` タブで緑色のチェックになれば公開成功です。

公開URLは通常、

`https://<YOUR_GITHUB_NAME>.github.io/kadai-radar/`

です。

## 5. 今後の更新

コードを更新したら、

```powershell
git add .
git commit -m "Update Kadai Radar"
git push
```

だけでGitHub Pagesも自動更新されます。

## データ保存について

課題・時間割はGitHubには保存されません。
各スマホのブラウザ内（localStorage）にだけ保存されます。

機種変更・ブラウザデータ削除に備えて、アプリ内の

`時間割 → データのバックアップ`

からJSONバックアップを保存してください。

## PWAについて

スマホのブラウザからGitHub PagesのURLを開き、ホーム画面に追加できます。
更新後に古い画面が残る場合は、一度再読み込みしてください。
