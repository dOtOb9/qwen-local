# プロジェクトセットアップ

- 日付: 2026-09-10
- ステータス: 進行中

## 目的

RTX4070でQwenなどのローカルLLMを動かす。フロントエンドはTauri、
バックエンドはOllama想定。将来的にプロジェクトごとsubtreeで分離できる
モノレポ構成で管理する。

## やったこと

- リポジトリ `qwen-local` の雛形作成
- README.md / TaskSheets/ ディレクトリ整備
- GitHub Private Repoとして公開予定

## 次にやること

- `frontend-tauri/` の雛形作成 (Tauri + Rust)
- `backend-ollama/` にOllamaセットアップ手順・スクリプトを整備
- Qwen2.5系モデルの動作確認 (VRAM 12GBに収まる量子化サイズの選定)
