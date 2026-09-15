# QA v0.6.2

## 変更範囲
- Firebase依存を削除し、localStorage保存だけに固定。
- 時間割画面にバックアップ保存／復元を追加。
- GitHub Pagesのサブパス配信向けに相対パス化。
- ガント・時間割・レーダーの既存UI/ロジックは変更しない方針。

## 静的確認
- [x] `src/firebase.ts` を削除
- [x] `firebase` npm依存を削除
- [x] Firebase設定／Firestore設定ファイルを削除
- [x] 課題保存キーは既存 `study-gantt-tasks-v01` を維持
- [x] 時間割保存キーは既存 `study-gantt-timetable-v01` を維持
- [x] バックアップ形式 `KADAI_RADAR_BACKUP_V1`
- [x] バックアップ内容: 課題 + 時間割 + 出力日時 + アプリバージョン
- [x] 復元前に上書き確認を表示
- [x] manifest / icon / Service Worker を相対パス化
- [x] Vite `base: "./"`
- [x] GitHub Pages Actions workflow同梱

## VS Code / 実機で確認する項目
1. 課題を登録して再読み込み後も残る
2. 時間割を変更して再読み込み後も残る
3. `バックアップを保存` でJSONファイルが保存される
4. 課題を追加・削除してからバックアップを復元すると元の状態へ戻る
5. 復元後、ガント・レーダー・時間割が同じデータを表示する
6. PWA/ホーム画面追加後も同一URLでデータが残る
7. ブラウザのサイトデータ削除後、バックアップから復元できる

## 注意
localStorageはブラウザ/サイト単位の保存です。ブラウザのデータ削除、端末初期化、別ブラウザへの変更では消えるため、バックアップを推奨します。
