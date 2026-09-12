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

- 2026-09-10: iOS実機向け.ipaビルド、2回目も失敗。今度は
  `error: Signing for "frontend-tauri_iOS" requires a development team.`
  `tauri ios build`は実機ターゲットだと必ずアーカイブ+エクスポートフローを通り、
  そこでの署名要求はxcodebuild引数(`CODE_SIGNING_ALLOWED=NO`)では回避できないと判明。

## iOS方針転換: 無料ルートを断念、TestFlightに変更

fastlaneでの無料Apple ID自動署名を検討したが、調査の結果**技術的に不可能**と判明。
`cert`/`sigh`/`match`はいずれも有料Apple Developer Program前提のDeveloper Portal APIを
使っており、無料のPersonal Team署名(Xcode専用の非公開プロトコル)にはアクセスできない。
AltServer/AltStoreが存在するのはまさにこの非公開プロトコルを独自実装しているため。

→ コストより確実性を優先し、**TestFlight($99/年)方式に方針転換**。

### ユーザー側で必要な手続き(代行不可、本人のApple IDが必要)

1. Apple Developer Programへの登録( https://developer.apple.com/programs/enroll/ 、
   本人確認・支払い必要、承認まで最大48時間程度)
2. 承認後、App Store ConnectでApp Store Connect API Keyを発行
   (ユーザーとアクセス → 統合 → App Store Connect API)。
   `Issuer ID` / `Key ID` / `.p8`秘密鍵ファイルの3点が必要
3. App Store Connectで新規アプリを作成(Bundle ID: `com.masa1.frontend-tauri`)

この3点が揃い次第、GitHub Secretsに登録してCIを
「自動署名 + TestFlightへの自動アップロード」に書き換える。

## 自動アップデートの動作検証(保留)

自動アップデート機能が実際に「新バージョン検知→ダウンロード→インストール→再起動」
まで動くかはまだ未検証。動作確認のため試しにv0.1.2をビルド・リリースした
(`Qwen Local Chat v0.1.2`, Latest)。インストール済みのv0.1.1アプリを起動して
実際に自動更新されるか確認する予定だったが、**ユーザー判断で保留**。

## 検討中: Ollamaをアプリに同梱する案(未着手)

「Ollamaが無いとチャット機能が動かない」という現在の制約について、
Tauriの**サイドカー(sidecar)機能**で`ollama.exe`をインストーラに同梱し、
アプリ起動時にRust側から`ollama serve`を自動起動する案を提示。懸念点:

- **モデルファイル(4.7GB)はインストーラに同梱不可**。同梱するとしても
  初回起動時に自動`ollama pull`させる形になり、初回ダウンロードの手間自体は消えない
- **GPU(CUDA)ドライバは同梱不可**。引き続きユーザーのNVIDIAドライバに依存する
- 実装コスト: `tauri-plugin-shell`の追加、sidecarバイナリのビルド設定、
  起動/終了時のプロセスライフサイクル管理(二重起動防止、アプリ終了時のkill)が必要

→ ユーザー判断で**保留**。着手していない。

## UIにバージョン番号を表示

`@tauri-apps/api/app`の`getVersion()`でアプリバージョンを取得し、
ヘッダーに `Qwen Local Chat v0.1.x` の形で表示するようにした
(`core:app:default`に`allow-version`が含まれているので追加権限設定は不要)。
今どのビルドが動いているか一目で分かるようにする目的。

## iOSワークフローを一時無効化

TestFlight対応が済むまで`ios-build.yml`は必ず失敗し続けて通知がうるさいだけなので、
`gh workflow disable "iOS Device Build (unsigned)"` で無効化した(ファイルは削除せず
`disabled_manually`状態)。TestFlight対応の実装時に`gh workflow enable`で再開する。

## iOS対応を断念(一旦保留)

署名(TestFlight)周りを整えても、iOS側には推論エンジンが何もないため
「開けるけど何もできないアプリ」にしかならないと気づき、iOS対応自体を
一旦断念することに決定。理由:
- iPhone上では`http://localhost:11434`はiPhone自身を指すため、PCのOllamaには
  そもそも繋がらない(Windows版と同じフロントのコードをそのまま動かしても無意味)
- チャットを実際に動かすには、オンデバイス推論エンジン(llama.cpp Metal / MLX)の
  組み込みか、PCのOllamaへのLAN経由接続のどちらかが別途必要で、TestFlightの
  署名設定より先にこちらを決めるべきだった
- Apple Developer Program登録($99/年)は保留。ユーザーへの依頼もキャンセル

`ios-build.yml`は無効化したまま残し(`frontend-tauri/`ディレクトリのコードも
iOSシェルとして残置)、当面はWindows版に集中する。iOS再開時はまず
オンデバイス推論エンジンの技術調査から。

## 長期記憶をチャットから直接操作できるように

「サイドバーの小さい入力欄にしか記憶を追加できない」使いにくさを解消。
- メッセージ(ユーザー/アシスタントどちらも)にホバーすると「覚える」ボタンが出て、
  そのメッセージ本文をそのまま長期記憶に保存できるようにした
- 入力欄で `/remember <text>` と打つと、Ollamaに送らずその場でメモとして保存する
  ショートカットを追加。保存すると「記憶しました: ...」と一時的に表示される

## 不具合修正: 開発版と本番インストール版がSQLite DB/WebView2プロファイルを共有

`npm run tauri dev` で起動する開発版と、インストール済みの本番アプリが
**同じアプリ識別子**(`com.masa1.frontend-tauri`)を使っていたため、
`%APPDATA%\com.masa1.frontend-tauri\` 以下のSQLiteデータベースと
WebView2のユーザーデータフォルダ(`EBWebView`)を共有してしまっていた。
両方を同時に起動すると競合し、開発版がアプリウィンドウを開かずに
サイレントに終了する(exit code 0)という分かりにくい形で現れた。
- 対処: `src-tauri/tauri.dev.conf.json` に開発専用の識別子
  (`com.masa1.frontend-tauri.dev`)を定義し、`npm run dev:app`
  (`tauri dev --config src-tauri/tauri.dev.conf.json`)で起動するようにした。
  これで本番版とは別のDB・別のWebView2プロファイルになり競合しない。
- 今後、手元で動作確認する時は `npm run tauri dev` ではなく
  `npm run dev:app` を使うこと。

## 不具合修正(本命): 開発版が自動アップデートで本番版に化けていた

識別子分離後も「本番と同じ権限を求められて競合している」という報告があり、
再調査したところ真因が判明。`tauri.dev.conf.json`は`identifier`と`productName`
しか上書きしておらず、**`version`は上書きされていないため開発版は常に`0.1.0`のまま**
だった。一方GitHub Releaseは`v0.1.3`まで進んでいたため、開発版を起動するたびに
`checkForUpdateAndInstall()`がGitHubの方を新しいと判定し、勝手にMSI/NSISを
ダウンロード→インストール→`relaunch()`していた。これが「本番と同じ権限要求
(インストーラのUAC/SmartScreen)」の正体で、開発版ウィンドウが一瞬で消えて
本番版に置き換わっていたように見えていた。
- 対処: `App.tsx`で `import.meta.env.DEV` (Viteが埋め込む開発/本番フラグ)を見て、
  開発ビルドでは`checkForUpdateAndInstall()`自体を呼ばないようにした。
- 教訓: dev/prod分離は識別子(DB・WebView2プロファイル)だけでなく、
  バージョン番号や「本番だけが持つべき挙動(自動更新など)」も一緒に
  見直す必要があった。

## Web検索機能を追加(Ollama tool calling + DuckDuckGo)

qwen2.5:7b-instructがtool callingに対応しているため、Ollamaの`tools`機能で
Web検索を組み込んだ。バックエンドはコスト面からDuckDuckGoの非公式HTML
スクレイピングを選択。

- Rust側(`src-tauri/src/search.rs`): `search_web(query)` コマンドを追加。
  `reqwest` + `scraper` で `https://html.duckduckgo.com/html/` から上位5件を取得。
  - ハマった点1: 単純なGETリクエストだとDuckDuckGoのBot検知(CAPTCHAページ)に
    弾かれ、空の結果になる。**POSTでフォーム送信** + `Accept`/`Accept-Language`/
    `Referer`ヘッダーを付けると正常に結果が返ることをcurlで確認して回避。
  - ハマった点2: `reqwest`のデフォルトTLS実装(rustls)が`aws-lc-rs`のバージョン
    解決に失敗してビルドできなかった。`native-tls`(Windowsのschannel経由)に
    切り替えて解決。
  - 広告枠(`result--ad`)を除外し、`div.result.web-result`のみ拾うようにした。
  - `cargo test`でRust単体テストを書いて直接検証(GUI全体を再ビルドするより
    高速に確認できた)。
- フロント側(`src/lib/ollama.ts`): `chatWithTools()` を新設。Ollamaの
  `/api/chat`に`tools`定義を渡し、`tool_calls`が返ってきたら`invoke("search_web")`
  を呼んで結果をtoolメッセージとして追加、モデルに再度投げ直すループ
  (最大3ラウンド)を実装。`App.tsx`の直接fetchをこれに置き換えた。
- 動作確認の顛末: 最初にユーザーがテストした際は「検索していると言うが
  最新情報にアクセスできていない」状態だった。原因はBot検知の初期バージョンを
  ビルドしたまま試していたため(空配列がtool結果として返り、モデルが
  自分の知識で答えていた)。POST修正後に再ビルド・再起動して解消。

## 不具合修正: メッセージ内リンクをクリックするとアプリ内で遷移して戻れない

Tauriのwebviewは`<a href>`クリックをデフォルトでアプリ内遷移させてしまい、
外部サイトに飛ぶと戻れなくなる。`MessageContent.tsx`でreact-markdownの
`components`propを使い、リンククリックを`preventDefault`した上で
`@tauri-apps/plugin-opener`の`openUrl()`で既定のブラウザで開くように修正
(プラグイン自体はテンプレートに元々入っていたので追加インストール不要、
`opener:default`権限にも`allow-open-url`が最初から含まれていた)。

## 長期記憶ポップアップ化 + PDFアップロード(ドラッグ&ドロップ対応)

- 長期記憶: サイドバーの小さい欄が使いにくかったため、shadcn Dialog +
  Badgeで独立したポップアップ(`MemoryDialog.tsx`)に移設。
- PDFアップロード: `pdfjs-dist`でPDFのテキストをフロント側で抽出
  (`src/lib/pdf.ts`)。📎ボタンからの選択と、ウィンドウへのドラッグ&ドロップの
  両方に対応。
  - ドラッグ&ドロップの実装メモ: Tauriのwebviewはブラウザ標準のHTML5 DnD
    イベント(`ondrop`等)を素通りさせず、OSレベルのファイルドロップとして
    横取りする。ブラウザの`dataTransfer.files`ではなく、
    `@tauri-apps/api/webview`の`getCurrentWebview().onDragDropEvent()`
    (`enter`/`drop`/`leave`イベント、`drop`時に実ファイルパスの配列が渡る)を
    使う必要がある。取得したパスは📎ボタン経由の添付と同じ
    `readFile` + `extractPdfText`処理を共通関数化(`attachPdfFromPath`)して再利用。
  - アップロードしたPDFの内容はメッセージ本文に埋め込んで永続化しつつ
    (セッション内で後から参照できるように)、チャット欄の表示は
    「📄 ファイル名 + 質問文」だけのコンパクトな表示にするパース処理
    (`parseAttachedFileMessage`)を実装。

## 自己改善パイプライン: チャットから自動でGitHub Issueが溜まる仕組み

「チャットしていく中で自然と機能アイデアがIssueとして溜まっていき、
GitHub Actionsの定期実行でクラウドのClaude Codeが実装してPRを出す」という
仕組みを構築中。2つのパートに分かれる。

### パート1: アプリ側(実装済み)

- ボタン操作なし、完全にバックグラウンドで動作する設計に変更した
  (最初はボタン式のUIで作ったが、ユーザーから「明示的な操作ではなく自然に溜まる形に」
  と指摘があり作り直した)。
- 仕組み: `sendMessage()`で通常の応答を返した**直後**に、直近のユーザー発言+
  アシスタント応答の1往復だけを material に、隠れたLLM呼び出し
  (`IDEA_DETECTION_PROMPT`, `src/lib/github.ts`)を発火(fire-and-forget、
  チャットのレスポンス自体はブロックしない)。このプロンプトは
  「このアプリへの機能要望が明確に読み取れる場合だけ【アイデア】形式で出力、
  それ以外は NONE とだけ出力」という厳格な指示にして、雑談がIssue化されないようにした。
  NONE以外が返ってきた時だけ、Rust側の新コマンド`create_github_issue`
  (`src-tauri/src/github.rs`, reqwestでGitHub REST APIを直接叩く)経由で
  Issueを自動作成する。エラーは全て握りつぶし、チャット体験を妨げない設計。
- GitHub Token / 投稿先リポジトリは、新設した`settings`テーブル
  (SQLiteマイグレーションv2)に保存。サイドバーの「設定」ダイアログ
  (`SettingsDialog.tsx`)から入力・保存する。未設定の間は何もしない(サイレント)。
  Tokenは repo スコープの Personal Access Token が必要(ユーザー自身が発行)。

### パート2: GitHub Actions側(ユーザー対応待ち)

- クラウドでのClaude Code定期実行は、Claude Code公式の`/install-github-app`
  コマンドで構築するのが正解と判明(claude-code-guideエージェントで調査)。
  - GitHub Appのインストール自体はGitHubの仕様上、リポジトリ所有者の
    Web上での明示的な認可操作が必須(Claude側から代行不可)。ただしこれは
    **最初の1回だけ**で、以降のcron定期実行・Issue実装・PR作成は完全に
    バックグラウンドで動く。
  - 認証は既存のClaude Pro/Max等のサブスクリプション(OAuthトークン)を
    そのまま使えるので、追加のAPI従量課金は基本的に不要。
  - cronトリガーは公式にサポートされている
    (`on: schedule: - cron: "..."`)。
  - 注意点: publicリポジトリのscheduled runは60日操作がないと自動停止する。
    何もIssueが無いタイミングでも定期実行自体はAPIトークンを消費する
    (「Issueが無ければスキップ」はプロンプト側で制御する必要がある)。
- ユーザーがこのリポジトリに対して`/install-github-app`を実行し、
  cron + 「ラベル付きIssueを実装してPRを出す」ワークフローの内容を詰める
  作業待ち。

## 方向性: 「秘書」化構想と楽天検索の実装

ユーザーから「Gmail・Vivaldi.net・銀行口座を見てくれる秘書のようなアプリにしたい」
という大きな方向性の提案があった。リスク・難易度別に整理して合意:

- **楽天商品検索**: 難易度低、公式無料APIあり。Amazonは商品検索APIの利用に
  アフィリエイト実績が必要(実質課金相当)なため、楽天を採用する判断。
- **Gmail**: Google Cloud ConsoleでのOAuthクライアント作成(ユーザー側の
  一手間)が必要だが、公式APIで安全に実装可能。今回は未着手、次の調査対象。
- **Vivaldi.net**: 標準IMAPで見られる可能性が高いが未調査。
- **銀行口座**: 明確にリスクを指摘して合意。銀行ログインページの直接自動操作
  (スクレイピング)は行わない方針。やるならMoney Forward MEやMoneytreeなど、
  銀行と正式に提携したOpen Banking API経由のアグリゲーターを使う想定
  (これも未着手)。

まず楽天商品検索を実装。
- Rust側 (`src-tauri/src/rakuten.rs`): `search_rakuten(application_id, query)`
  コマンドを追加。楽天市場商品検索API
  (`IchibaItem/Search/20220601`)をreqwestで直接叩く。
- フロント側 (`src/lib/ollama.ts`): `ToolContext`型を導入して
  `rakutenAppId`/`onStatus`をまとめ、Rakuten Application IDが設定されている
  時だけ`search_rakuten`ツールをOllamaに提示する(未設定なら存在しないツール
  として扱われ、混乱を避ける)。
- Application IDは`settings`テーブルに保存(`SettingsDialog.tsx`に入力欄追加)。
  Rakuten DevelopersでApplication ID発行はユーザー本人が行う必要がある
  (無料、アカウント登録のみ)。
- ついでにツール実行中のステータス表示(「Web検索中: …」)を`chatWithTools`に
  `onStatus`コールバックとして追加(ユーザー要望)。

## 蔵書連携(Kindle/Kinoppy)とVivaldi.netメール連携を実装

「秘書化」構想の続き。Kobo以外の電子書籍サービスと、Vivaldi.netメールに対応。

- **Kindle/Kinoppyとも公式の個人蔵書APIは存在しない**と判明(Amazonは商品カタログ
  検索用のProduct Advertising APIのみ)。代わりにどちらもログイン不要の
  ローカルキャッシュファイルを直接読む方式を採用:
  - Kindle for PC: `%LOCALAPPDATA%\Amazon\Kindle\Cache\KindleSyncMetadataCache.xml`
    (公式アプリが書き出す平文XML。ASIN/タイトル/著者/購入日を含む)
  - Kinoppy: `%APPDATA%\Kinokuniya\Kinoppy3\*.dat`
    (拡張子は.datだが中身は暗号化されていないSQLite。`Book`/`Author`テーブル)
  - `src-tauri/src/ebooks.rs`に`sync_kindle_library`/`sync_kinoppy_library`
    コマンドを実装(roxmltree, rusqlite使用)。起動時に自動同期し、`ebooks`
    テーブルに保存。`check_owned_ebooks`ツールでモデルが必要な時だけ検索する
    (全件を毎回プロンプトに詰めない設計、楽天/Web検索と同じ思想)。
  - Kobo: このPCに未インストールのため保留。実機Kobo端末をUSB接続すれば
    同様に`KoboReader.sqlite`を読める見込み(未検証)。
  - 依存解決の詰まりどころ: `rusqlite`の`bundled`機能が、既に`tauri-plugin-sql`
    経由で入っている`libsqlite3-sys`と「同じネイティブライブラリを二重にリンク
    しようとする」形で衝突した。`rusqlite`のバージョンを、既存の
    `libsqlite3-sys`バージョンと一致するものに固定することで解決
    (結果的に`sqlx`が0.8.6→0.8.0にダウングレードされたが、動作に支障なし)。
- **Vivaldi.netメール**: 公式APIはないが、標準IMAP(`imap.vivaldi.net:993`,
  TLS)でアクセス可能と判明(2段階認証ONならアプリ用パスワードが必要)。
  Gmail(OAuth必須)より簡単なため先行実装。`src-tauri/src/mail.rs`に
  `fetch_recent_emails`コマンドを追加(`imap`クレート、件名などのMIME
  エンコード(`=?UTF-8?B?...?=`等)は`rfc2047-decoder`でデコード)。
  `check_email`ツールとして直近10件の未読/件名/差出人を確認できる。
- どちらの新機能も`SettingsDialog.tsx`に入力欄を追加(GitHub Token等と同じ
  パターン: 未設定なら該当ツールをOllamaに提示しないので混乱しない)。

## 並行セッションについて

このリポジトリでロボット関連(ESP32-CAM等)の別プロジェクトを扱う
別のClaude Codeセッションが並行稼働していることが判明(git logに無関係な
コミットが混在)。ユーザーに確認したところ意図的とのこと。今後
`git add -A`は避け、自分が触ったファイルだけを明示的にstageすること。
`agent-harness-design.md`(Issue→PR自律化の設計)は別セッションが対応中のため触らない。

## Gmail連携(OAuth 2.0 PKCEフロー)を実装

Calendarは別セッションが対応中とのことなので対象外。Gmailのみ実装。

- Google Cloud ConsoleでのOAuthクライアント作成(デスクトップアプリ種別、
  スコープ`gmail.readonly`)はユーザー側の作業として依頼(代行不可)。
- `src-tauri/src/gmail.rs`に本格的なOAuth 2.0 Authorization Code + PKCEの
  「ループバック」フローを実装(トークン貼り付けではない):
  1. ローカルの空きポートでTCPリスナーを立てる
  2. PKCE code_verifier/challengeを生成し、`open`クレートでシステムの
     既定ブラウザを開いてGoogleの認可画面を表示
  3. ユーザーがログイン・許可すると`http://127.0.0.1:<port>/callback`に
     リダイレクトされ、コードをローカルリスナーで受け取る
  4. コードをGoogleのトークンエンドポイントに送ってaccess_token/refresh_token
     に交換
  - `refresh_token`だけを`settings`テーブルに保存し、以降は`fetch_gmail_messages`
    コマンド内で毎回リフレッシュしてaccess_tokenを取得する(再ログイン不要)。
  - Gmail APIはメッセージ一覧に本文/件名が含まれないため、一覧取得後に
    1件ずつ`format=metadata`で件名・差出人・日付を取得するN+1呼び出しになる
    (limit=10で11リクエスト程度、許容範囲と判断)。
- フロント側は`SettingsDialog.tsx`に Client ID/Secret入力欄と
  「Googleでログイン」ボタンを追加。ボタン押下で`google_oauth_login`
  コマンドを呼び、ブラウザでの認可完了を待ってrefresh_tokenを保存する。
  `check_gmail`ツールをOllamaに追加(Client ID/Secret/refresh_token全て
  揃っている時だけ提示)。

## 検討して見送り: 秘密情報を集約するサーバーの導入

Gmail有効化作業中に「GCPのクライアント情報をアプリ本体に持たせたくない、
サーバーを別途立ててそこに集約したい」という提案があった。ホスティング先
(クラウドの無料枠を検討)まで話したが、結局**サーバー導入自体を見送り**、
現状通りアプリのローカルSQLite(`settings`テーブル)に保持する方式を継続する
ことで合意。実装変更なし。

## Kindle/Kinoppy蔵書連携を削除

技術的には問題なく動いていたが、「他アプリのローカルファイルを覗きに行くのが
気持ち悪い」という心理的な理由で、機能自体を完全に削除することに決定。
- API経由での再実装(購入履歴をAPIで追う)も検討したが、Amazon/Kinokuniyaとも
  個人の購入履歴を取得できる公式APIは存在せず、代替はGmail購入確認メールの
  パースのみ。それはサンプル本や読み放題が抜け落ちる上にパースが脆く、
  ローカルファイル方式より後退するため見送り、機能ごと削除する判断になった。
- `src-tauri/src/ebooks.rs`を削除、`sync_kindle_library`/`sync_kinoppy_library`
  コマンドと`check_owned_ebooks`ツールを撤去。`ebooks`テーブルは既存ユーザーの
  DBにも残らないよう、`DROP TABLE IF EXISTS ebooks;`のマイグレーション(v4)を
  追加して確実に消す(過去のマイグレーション定義自体は書き換えず、新しい
  マイグレーションで対処する方針を踏襲)。
- 使わなくなった`rusqlite`/`roxmltree`もCargo.tomlから削除。

## 銀行連携を見送り、モバイル展開を再検討、地震情報監視を実装

- **銀行連携**: 調査の結果、Zaim APIは手入力データのみ(連携データ取得不可)、
  Moneytree LINKは完全に法人向け(個人が自己申請で使える形ではない)と判明。
  スクレイピングも却下済みのため、個人利用で銀行データを自動取得する現実的な
  手段が無いと判断し、見送りに決定。
- **React Nativeでのモバイル展開**: 一時検討したが見送り。
  - iOSはReact Nativeにしても「ビルドにMacが必須」という制約は変わらない
    (Apple側の制約であり、Tauri固有の話ではないため)。
  - Expo EAS Buildというクラウドビルドサービスで「Mac不要」は解決できるが、
    実機に入れるための署名にはApple Developer Program($99/年)が別途必要で、
    以前断念したコストの問題はそのまま残ると説明し、見送りとなった。
  - 「WindowsもTauriから移行してコードベース統一すべきか」という論点も
    出たが、`react-native-windows`はマイナーでコミュニティが小さく、
    既に多くの機能が動いている現行Tauri版を書き直すコストに見合わないため
    非推奨とし、見送りで合意。Windows版は引き続きTauriで進める。
- **地震情報のリアルタイム監視**を実装。P2P地震情報API
  (`wss://api.p2pquake.net/v2/ws`、無料・認証不要のコミュニティ運営API)に
  フロントから直接WebSocket接続(`src/lib/earthquake.ts`)。震度2相当
  (`maxScale >= 20`)以上の地震情報(code 551)を受信したら、チャット画面に
  赤いアラートバナーを表示する。接続が切れたら10秒後に自動再接続。
  Rust側の実装は不要(ブラウザ標準のWebSocket APIで完結)。
- ついでに「Rust側をCargo Workspace化すべきか」という質問があったが、
  今の規模(1クレート+モジュール分割)では時期尚早と判断し見送り。

## 次の方向性: 「秘書」から「スーパーアプリ」へ

ユーザーから「このアプリ自体をスーパーアプリのようにしたい」という
発言があった。Web検索・買い物(楽天)・メール(Vivaldi/Gmail)・GitHub Issue
自動化・地震情報など、既にこれまで積み上げてきた機能群がこの方向性と
自然に合致している。今後の機能追加もこの枠組みで位置づけていく想定。

## 地震情報を独立タブ化 + 日本地図アニメーション表示

「地図を出して、地震波が広がる感じも出してほしい」「もう完全に別タブみたいに
していい」という要望を受け、テキストバナーだけだった地震情報を専用タブに格上げ。
これがスーパーアプリ構想の最初の「独立タブ」実例になる。

- `src/lib/japanProjection.ts`: 実在都市の緯度経度を基準点にした簡易的な
  正距円筒図法もどきの投影関数と、北海道・本州・四国・九州の簡略化した
  シルエットパスを自作(外部SVGはライセンス・座標系の不確実性があったため
  採用せず、投影関数と地図パスを同じ基準点から作ることで、震源プロットと
  地図形状の相対位置が必ず整合するようにした)。測量precisionはないが
  視覚的に「日本のどのあたりか」が分かるレベル。
- `src/components/EarthquakeView.tsx`: 地図上に震源を投影し、最新の地震には
  CSSアニメーション(`@keyframes`で半径と透明度を変化)で同心円が広がる
  「地震波」演出を追加。震度に応じて色分け(赤=震度6強以上 → 黄緑=震度2)。
  直近30件の履歴リストも表示。
- `App.tsx`にシンプルなタブ切り替え(チャット/地震情報)を追加。地震情報タブは
  チャットのメイン領域を丸ごと置き換える形の独立ビュー。
- `earthquake.ts`にlatitude/longitude(P2P地震情報APIの`hypocenter`から取得、
  震源不明を示す`-200`はnull化)と履歴用の`id`フィールドを追加。

## 地図を実データに差し替え + Mac風Dock + フルスクリーン化

自作の簡易地図では不満足とのフィードバック(「もっとリアルな地図じゃないと」)
を受け、実データに差し替え。あわせて「画面全体を変えるくらいでいい、Chatとは
関係ないから」「Macみたいに下にDockを表示できると良いのでは」という要望も反映。

- 地図データはGeolonia社の`japanese-prefectures`(MITライセンス、47都道府県、
  viewBox 0 0 1000 1000)をそのまま`src/assets/japan-map.svg`として取り込み。
  Vite の `?raw` importでSVG文字列として読み込み、`dangerouslySetInnerHTML`で
  ベース地図を描画し、その上に同じviewBoxの透明なSVGレイヤーを重ねて震源マーカーを
  プロットする2層構成。
- **座標変換の作り方**: Geoloniaのデータはlat/lonそのままの投影ではなく、
  独自のtransform(matrix + 都道府県ごとのtranslate)で配置された挿絵的な地図
  なので、緯度経度→SVG座標の変換式が公開されていなかった。そこでNode.jsの
  簡易スクリプトでSVGを解析: 各都道府県の`<polygon points>`/`<path d>`から
  バウンディングボックス中心を算出→transformを順に適用して最終SVG座標を算出→
  47都道府県庁所在地の実際の緯度経度との対応から最小二乗法でアフィン変換
  (`svgX = a*lon + b*lat + c`, `svgY = d*lon + e*lat + f`)を推定
  (`src/lib/japanProjection.ts`に結果を埋め込み)。
  - ハマった点: 最初`points`属性を`"x,y x,y"`形式と誤解してパースし、Y座標が
    全てNaNになった。実際は`"x y x y"`という単純空白区切りだった。
  - 沖縄・鹿児島は離島が広範囲に散らばっており、バウンディングボックス中心が
    県庁所在地の実際の位置から大きくズレる(残差300〜1000)ため、
    アフィン変換の較正対象からは除外(本土側の残差は最大でも70程度に収まった)。
    そのため沖縄・鹿児島近辺の震源はやや不正確にプロットされる制約が残る。
- **UI構造の変更**: `src/components/Dock.tsx`を新設。画面下部固定・半透明・
  ホバーで少し浮き上がるMac Dock風のアイコンボタン(💬チャット/🌐地震情報)。
  地震情報タブを選ぶと、サイドバーごとチャットUIを完全に置き換えるフル
  スクリーンの`EarthquakeView`になる(以前は同じレイアウト内でメイン領域だけ
  差し替えていた)。将来増える他の「ミニアプリ」もこのDockに追加していく想定。

## 次にやること

- Rakuten Application IDを発行してもらい、実際に商品検索が動くか確認する
- Vivaldi.netのメールアドレス/パスワードを設定して、実際にメール確認が動くか確認する
- Google Cloud ConsoleでOAuthクライアントを作成し、実際にGmailログイン
  フローが通るか確認する
- 銀行口座連携: Money Forward ME等の公式連携APIの調査(直接スクレイピングはしない)
- (ユーザー対応待ち) `/install-github-app`の実行、およびcronワークフローの内容確定
  → 2026-09-12: 並行セッション側で実行済みらしく、リモートに
  `claude-code-review.yml`/`claude-pr-assistant.yml` が追加されているのを確認。
  自律Issue→PRループも実際に稼働し、チャットのストリーミング表示を
  自動実装・マージ済み(2026-09-12、PR #10)。
- (保留) 自動アップデートの実動作検証(v0.1.1→v0.1.2への自動更新確認)
- (保留) Ollama同梱(sidecar)案の実装
- PC再起動後、OllamaのOLLAMA_ORIGINS設定が自動起動時にも効いているか確認する
- 沖縄・鹿児島周辺の震源プロット精度は要改善(現状は既知の制約として許容)

## 表示閾値と通知閾値を分離、履歴の事前読み込みを追加

「震度どのレベルから表示される？何も表示されない」との指摘を受けて調査したところ、
実際に直近の地震のほとんどが震度1(閾値の震度2未満)で、単に閾値が高すぎて
表示されていなかっただけと判明(P2P地震情報の`/v2/history`で実データを確認)。
- 表示(地図・履歴)の閾値を震度2→**震度1**に変更(`watchEarthquakes`の
  デフォルト`minScale`を20→10)。
- 起動時に何も表示されない体験を避けるため、`/v2/history?codes=551`から
  直近の観測データを取得して履歴を事前に埋める`fetchRecentEarthquakes`を追加。
- さらに「震度3以上で通知しない?」との要望を受け、**表示とは別に
  「実際のデスクトップ通知」を震度3以上限定**にする形で使い分けた
  (`NOTIFY_MIN_SCALE = 30`)。`@tauri-apps/plugin-notification` /
  `tauri-plugin-notification`を追加し、起動時に通知権限をリクエスト、
  該当する地震が来たらOSのネイティブ通知を送信する。

## 発生時刻の表示 + P波/S波シミュレーション

- 履歴リストの各行に発生時刻(`q.time`)を追加表示。デスクトップ通知の本文にも
  時刻を含めた。
- 「P波・S波のシミュレーションも追加した?」との質問を受けて未実装だったため追加。
  最新の地震にのみ、震源から同時に発生する2つの波紋を表示: P波(初期微動、
  約7km/s、青・細め・遠くまで届く)とS波(主要動=本震の揺れそのもの、約4km/s、
  震度に応じた色・太め・P波より近い距離までしか届かない)。速度比7:4を
  そのまま同一アニメーション時間内の到達半径比(110:63)に反映しているだけの
  簡易表現で、実際の秒数とは対応していない(疑似シミュレーション)。
