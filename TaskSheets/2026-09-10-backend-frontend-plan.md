# 技術方針とロードマップ

- 日付: 2026-09-10
- ステータス: 進行中

## 目的

RTX4070 (VRAM 12GB) 上でQwenをはじめとするローカルLLMを動かし、
Tauri製デスクトップアプリから利用できるようにする。
バックエンド(Ollama)を先に動作確認し、後からTauriフロントで繋ぐ順番で進める。

## 方針

### バックエンド: Ollama

- Ollama for Windowsをインストールし、ローカルHTTP API (`http://localhost:11434`) を使う。
- モデルはQwen2.5系のGGUF量子化を使用。VRAM 12GBに収まる範囲で選定する。
  - 第一候補: `qwen2.5:7b-instruct` (q4_K_M、VRAM使用量は数GB程度で余裕あり)
  - 発展候補: `qwen2.5:14b-instruct-q4_K_M` (VRAM 9GB前後、ギリギリ収まる想定。動作確認が必要)
- `nvidia-smi` / `ollama ps` でGPUオフロードされていることを確認する。
- `backend-ollama/` ディレクトリに、モデルpullスクリプトと疎通確認用スクリプト(curlでの`/api/generate`呼び出し等)を用意する。

### フロントエンド: Tauri

- `frontend-tauri/` に Tauri + React + TypeScript (Vite) で雛形を作成する。
  - React+TSはTauriの標準テンプレートで情報が多いため採用。
- UIコンポーネントは shadcn/ui + Tailwind CSS を使う。チャットUI(入力欄、メッセージリスト、選択系)と相性が良く、コピー&カスタマイズしやすい構成のため採用。
- OllamaのローカルAPI (`/api/chat`、ストリーミング対応) をRust側またはJS側から叩く構成にする。
  - まずはJS(fetch)から直接叩く最小構成で疎通確認し、必要に応じてRust側のTauriコマンド経由に寄せる。
- 最低限の機能: 入力欄、メッセージ履歴表示、ストリーミング表示、モデル選択(`/api/tags`から一覧取得)。

## マイルストーン

1. **M1: Ollama動作確認** — Qwen2.5-7Bをpullし、GPU推論が動くことを確認する。
2. **M2: Tauri疎通確認** — Tauri雛形からOllama APIを叩き、1往復のchatが動く最小構成を作る。
3. **M3: チャットUI整備** — 履歴表示、ストリーミング、モデル切り替え、system prompt設定を追加する。
4. **M4: 配布・運用検討(任意)** — インストーラ化やOllama自動起動などを検討する。

## 未決事項

- 14Bモデルを常用するかは、M1でのVRAM実測結果を見て判断する。
- iOS(iPhone 17e)実機への署名インストールは未着手。まずはGitHub Actions
  (macos-latest)でのシミュレータビルド成功を優先し、Apple Developer
  Program登録が必要な実機配布は保留。

## 進捗

- 2026-09-10: M1完了。winget経由でOllama 0.34.0をインストール。
  `qwen2.5:7b-instruct` (q4量子化, 4.7GB) をpullし、`ollama ps`で
  `PROCESSOR: 100% GPU`を確認(RTX4070, VRAM使用量5.6GB/12.3GB)。
  日本語プロンプトへの応答も正常(Alibaba Cloud製と正しく自己紹介)。
  - 注意点: Bashツールのコマンドに直接日本語を書くと文字化けすることがある。
    ファイルに書いてから`curl --data-binary @file`で送ると安定する。

- 2026-09-10: M2進行中。`frontend-tauri/` に Tauri + React + TS + shadcn/ui(Radix,
  Novaプリセット)の雛形を作成し、`npm run tauri dev` でデスクトップウィンドウが
  起動、Ollama `/api/chat` との疎通を確認。
  - セッション機能・長期記憶をSQLite(`@tauri-apps/plugin-sql` + `tauri-plugin-sql`)
    で実装。`sessions` / `messages` / `memories` テーブルをマイグレーションで作成。
    長期記憶は手動メモのみ(サイドバーから追加、全セッション共通のSystem Promptに注入)。
  - 権限ハマりどころ: `sql:default` にはSELECT/LOAD/CLOSEしか含まれず、
    INSERT/UPDATE/DELETEには `sql:allow-execute` を別途capabilitiesに追加する必要がある。
  - Markdown表示未対応だった点を修正。`react-markdown` + `remark-gfm` +
    `@tailwindcss/typography` (`prose`クラス) で assistant メッセージをMarkdown描画。
  - iPhone 17eでの動作について相談。Windows単体ではiOSビルド不可(Mac/Xcode必須)のため、
    リポジトリをPublicに変更し、GitHub Actions の `macos-latest` ランナー(Public repoは無料)
    でiOSシミュレータビルドを試す方針に決定。署名して実機に入れるのは次の段階。

## 次にやること

- M2続き: GitHub Actionsで `tauri ios init` → シミュレータビルドのワークフローを作成し、
  実際にActions上でビルドが通るか確認する
- ストリーミング表示、モデル切り替えなどM3の残タスク
