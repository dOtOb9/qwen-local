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

- 2026-09-10: Windows Actionsワークフロー、初回で成功(10m12s)。
  `Qwen Local Chat v0.1.1` としてGitHub Releaseが作成され、MSI/NSIS/署名/
  latest.jsonすべて正しく生成されることを確認。

## iOS実機配布方針(コスト面から無料ルートに変更)

TestFlight(Apple Developer Program $99/年)を提案したが、コストがネックとの
ことで無料ルートに変更。
- **AltStore/AltServer方式**に決定。CIはiOS向けに**署名なしの.ipa**を生成するだけに
  留め、実機への署名・インストール・7日ごとの自動再署名はWindows PC上のAltServer
  (無料、Mac不要)が担う。
- `.github/workflows/ios-build.yml` を「シミュレータビルド」から「実機向け
  署名なし.ipaビルド」に変更。`tauri ios build` の署名付きアーカイブ/エクスポート
  フロー(Apple ID必須)を使わず、`xcodebuild build` を直接 `CODE_SIGNING_ALLOWED=NO`
  で実行し、生成された`.app`を手動で`Payload/`に詰めて`.ipa`化する方式。
  Apple Developer Programは一切不要。
- 自動アップデートはWindows版のTauri updaterほどシームレスではなく、
  AltStoreの「Source」機能(GitHub Releasesを指すJSONを自作)で代替する想定。
  これは未実装(次回以降の課題)。
- この方式は初回実行で成功する保証がないため、実際のCIログを見ながら調整する前提。
- 初回実行は失敗。`xcodebuild`を直接叩いたことが原因で、Tauriが生成した
  Xcodeプロジェクトの「Build Rust Code」スクリプトフェーズが、`tauri ios build`
  自身が立てるIPCサーバー(addr file経由)に依存しているため
  `failed to read missing addr file` でクラッシュした。
  `xcodebuild`直呼びをやめ、`tauri ios build -- --target aarch64 --debug --ci --
  CODE_SIGNING_ALLOWED=NO ...` のように、tauri CLI経由でXcodeへの引数だけ
  署名無効化を渡す形に修正して再実行中。

## 不具合修正: Windowsパッケージ版で "Failed to fetch"

インストールした`v0.1.1`のMSIで、チャット送信が "Failed to fetch" で失敗する不具合。
- 原因: 本番ビルドのTauriアプリは `https://tauri.localhost` というオリジンから
  動作するが、これが Ollama の `OLLAMA_ORIGINS` 許可リストに入っておらず、
  CORSで403 Forbiddenになっていた。開発時(`tauri dev`)は `http://localhost:1420`
  というOllamaのデフォルト許可オリジンで動いていたため気づかなかった。
- 対処: ユーザー環境変数 `OLLAMA_ORIGINS` に `https://tauri.localhost` を追加して
  Ollamaを再起動。
  - ハマった点: `tauri://localhost` (ワイルドカードなしの非http/httpsスキーム)を
    含めるとOllamaが起動時にpanicする(`bad origin: origins must contain '*' or
    include http://,https://,...`)。Ollamaのデフォルト許可リストには`tauri://*`
    (ワイルドカード付き)は最初から入っているが、`https://tauri.localhost`という
    具体的なオリジンは入っていないので、これを追加する必要がある。
  - 今回はその場でOllamaプロセスを再起動して確認したが、Windows起動時に自動起動する
    Ollama(トレイアプリ)にも環境変数が正しく効いているか、PC再起動後に要確認。

## 次にやること

- iOS実機向け.ipaビルド(`ios-build.yml`)の再実行結果を確認する
- 成功したら、Windows PCにAltServerをインストールし、実機への初回サイドロードを試す
- AltStoreのSource JSONを自作し、Releaseベースの更新通知を作る(任意、後回し可)
- PC再起動後、OllamaのOLLAMA_ORIGINS設定が自動起動時にも効いているか確認する
- iOS用オンデバイス推論エンジン(llama.cpp Metal / MLX)の技術調査・組み込み
- ストリーミング表示、モデル切り替えなどM3の残タスク(Windows版)
