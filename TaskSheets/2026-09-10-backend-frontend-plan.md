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

- 2026-09-10: `.github/workflows/ios-build.yml` を追加。macos-latestランナーで
  `tauri ios init` → `tauri ios build --target aarch64-sim --debug --ci` を実行し、
  シミュレータ用.appをartifactとしてアップロードする構成。署名は行わない(実機配布は保留)。

## 設計方針: プラットフォームごとのモデル分離

Windows版(PC本体, RTX4070)とiOS版で使うモデルを分ける方針に決定。
- **Windows版**: 引き続きOllama経由で `qwen2.5:7b-instruct` などVRAMに余裕のあるモデルを使う。
- **iOS版**: iPhone上で完結する軽量モデル(Qwen2.5の0.5B/1.5B級など)を、
  Ollamaではなくllama.cpp(Metal)やMLX等のオンデバイス推論エンジンで動かす想定。
- 前提として、iOS側にはまだ推論エンジンそのものが実装されていない
  (現状のiOSビルドはUIシェルのみで、Ollamaにネットワーク越しに繋ぐ構成にもなっていない)。
  モデル分離の実装は、iOS用オンデバイス推論エンジンを組み込むタイミングでまとめて行う。

- 2026-09-10: iOS Actionsワークフロー、初回で成功(macos-latest, 4m12s、
  シミュレータ用`.app`をartifactアップロード)。

## 自動アップデート機能(Windows)

- push → GitHub Actions(`windows-latest`)でMSI/NSISインストーラをビルドし、
  GitHub Releaseとして公開する構成(`.github/workflows/windows-build.yml`)。
  ビルドのたびに `tauri.conf.json` のversionを `0.1.<GITHUB_RUN_NUMBER>` に
  自動インクリメントし、常に最新バージョンとしてリリースされるようにしている。
- 署名用の鍵ペアは `tauri signer generate` で作成(パスワードなし)。
  公開鍵は `tauri.conf.json` の `plugins.updater.pubkey` に、秘密鍵は
  GitHub Secrets (`TAURI_SIGNING_PRIVATE_KEY`) に登録済み。秘密鍵ファイル
  (`frontend-tauri/updater-key.pem`)はローカルのみに存在し、.gitignore済み。
- アプリ側は `@tauri-apps/plugin-updater` + `plugin-process` を追加し、
  起動時に `https://github.com/dOtOb9/qwen-local/releases/latest/download/latest.json`
  を確認、新バージョンがあればダウンロード→インストール→自動再起動する
  (`src/lib/updater.ts`)。

## 次にやること

- Windows Actionsワークフローの実行結果を確認し、MSIビルド・リリース・
  latest.json生成が正しく動くか検証する
- iOS用オンデバイス推論エンジン(llama.cpp Metal / MLX)の技術調査・組み込み
- ストリーミング表示、モデル切り替えなどM3の残タスク(Windows版)
