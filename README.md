# qwen-local

RTX 4070 (12GB VRAM) 上でQwenなどのローカルLLMを動かすためのワークベンチ。

## 構成方針

各サブプロジェクトはリポジトリ直下にトップレベルディレクトリとして配置し、
将来的に `git subtree split` で個別リポジトリへ分離できる状態を保つ。

```
qwen-local/
  TaskSheets/       # 作業ログ・タスク管理(このリポジトリ専属、subtree対象外)
  frontend-tauri/   # (予定) Tauri製デスクトップフロントエンド
  backend-ollama/   # (予定) Ollamaセットアップ・運用スクリプト
```

サブプロジェクトを分離する場合の例:

```sh
git subtree split --prefix=frontend-tauri -b frontend-tauri-only
```

分離後は新しいリポジトリを作成し、そのブランチをpushする。

## 現状

- バックエンド: Ollama (Qwen2.5系のGGUF量子化モデルを想定)
- フロントエンド: Tauri (Rust + WebView、OllamaのローカルHTTP APIを叩く)

詳細な経緯は [TaskSheets](./TaskSheets/) を参照。
