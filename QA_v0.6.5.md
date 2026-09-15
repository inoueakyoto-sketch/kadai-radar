# QA v0.6.5

- [x] Task型に後方互換な optional workState を追加
- [x] 既存データは workState 未設定でも未着手として扱う
- [x] 「いまからする」で inProgress 保存
- [x] 「まだ途中」で inProgress 維持
- [x] 「やっぱりやめた」で notStarted に戻す
- [x] 「できた」で completed=true / workState=notStarted
- [x] 完了の「元に戻す」で直前の workState を復元
- [x] 今日画面では途中課題を優先表示
- [x] 全体ガントに途中表示を追加（通常課題・ルーティン）
- [x] レーダーに途中表示を追加（個別ターゲット・クラスター）
- [x] バックアップJSONに workState が自然に含まれ、旧バックアップも読み込み可能
- [x] 時間割ロジック・ガント期限配置・レーダー半径ロジックは変更なし
