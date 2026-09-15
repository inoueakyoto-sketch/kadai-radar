# QA v0.6.3 - GitHub Pages release

## 維持する機能
- 今日
- 全体ガント
- 課題レーダー
- 時間割
- 時間割からの課題登録
- ルーティン
- 編集・削除・完了
- JSONバックアップ / 復元

## GitHub Pages対応確認
- Vite `base: "./"`
- manifest `start_url: "./"`, `scope: "./"`
- manifest / icon は相対参照
- Service Worker は `import.meta.env.BASE_URL` から登録
- Service Worker内キャッシュURLは registration.scope 基準
- GitHub Actions workflow 同梱
- public/.nojekyll 同梱
- Firebase依存なし

## 注意
この実行環境では `npm install` がネットワークタイムアウトしたため、完全な `npm run build` はGitHub ActionsまたはVS Code側で最終確認してください。
