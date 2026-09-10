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

## 次にやること

- (保留) 自動アップデートの実動作検証(v0.1.1→v0.1.2への自動更新確認)
- (保留) Ollama同梱(sidecar)案の実装
- PC再起動後、OllamaのOLLAMA_ORIGINS設定が自動起動時にも効いているか確認する
- ストリーミング表示、モデル切り替えなどM3の残タスク(Windows版に集中)
