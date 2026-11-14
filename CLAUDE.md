# VoiceDiary（音声日記アプリ・Web版）

話した内容（iPhone のキーボード音声入力で入れたテキスト）を、Claude API で日記らしい文章に整えて端末内に保存する Web アプリ。作者本人が iPhone 14 のホーム画面から使う。詳細は `SPEC.md` を必ず読むこと。仕様と食い違う実装をする場合は、先に作者へ確認する。

## 環境
- 開発は Windows（PowerShell）。コマンドは Windows で動く書き方にする
- TypeScript（strict）+ Vite + React、テストは Vitest、保存は IndexedDB（idb）
- サーバーなしの静的サイト。GitHub Pages に GitHub Actions でデプロイ
- 主な確認先は iPhone の Safari／ホーム画面アプリ

## コマンド
- 開発サーバー：`npm run dev`
- テスト：`npm test`
- ビルド：`npm run build`
- 型チェック：`npx tsc --noEmit`

## 守ること
- `SPEC.md` の「8. 実装の順番」のフェーズ順に進める。1フェーズ終わるごとにテストとビルドを確認してコミット・push し、作者に iPhone での確認を依頼する
- ロジックは `src/core/` に置き、React と IndexedDB に依存させない。core と services にはテストを書く
- ライブラリは SPEC.md 2章に書かれたものだけ。足したいときは先に作者へ確認する
- APIキーをコード・設定ファイル・ログ・コミット・バックアップに含めない
- 日記の本文・原文を `console.log` に出さない
- 話した原文（`VoiceSegment.transcript`）は保存後に書き換えない。API を呼ぶ前に必ず原文を保存し、失敗しても内容が残るようにする
- 入力途中のテキストは下書きとして自動保存する
- 外部への通信は Claude API だけ（解析ツール・外部フォント・CDN を入れない）
- Claude API は、書く前に公式ドキュメントで最新のモデルIDとブラウザ直接呼び出し用ヘッダを確認する
- iPhone 向けの注意：入力欄の文字は 16px 以上、下部は safe-area を避ける、ホーム画面アプリと Safari では保存領域が別
- UI の文言は日本語。コードのコメントも日本語でよい
- 「今回やらないこと」（SPEC.md 9章）に手を出さない
