# Issue→PR 自律ループ ハーネス設計

- 日付: 2026-09-12
- ステータス: 進行中（設計完了、バックログ種まき済み、ループ未起動）

## 目的

frontend-tauri の開発を「Human on the Loop」で回すためのハーネスを設計する。
毎回の実装を人間が承認する（Human-in-the-Loop）のではなく、エージェントが
Issueを拾って実装・PR作成まで自律的に進め、人間は空いた時間にPRをレビュー
してマージするかどうかだけ判断する、という運用に変えるのが狙い。

前提確認（2026-09-12時点）:
- `github.rs` の `create_github_issue` はIssue作成のみ実装済み。Issue→PRの
  自動化フローは存在しない（今回作るのはここから先の部分）。
- `.github/workflows/` には `ios-build.yml` / `windows-build.yml`（ビルドCI）
  のみ。Issue/PR用のワークフローはなし。
- `gh` CLIはこのマシンで認証済み（scopes: repo, workflow）。
- ビルド確認コマンド: フロントは `npm run build`（tsc + vite build）、
  Rust側は `cargo build`（`src-tauri/`）。
- Ollama（ローカルLLM）はこのマシン上でのみ動く。クラウド実行（GitHub
  Actions等）ではOllamaに触れないため、実機での動作確認が要るタスクは
  ローカル実行が前提になる。

## 全体像

```
[GitHub Issue] --(agent-readyラベル)--> [/loopで駆動する開発ループ]
                                              |
                              1. 対象Issueを選ぶ
                              2. ブランチ作成
                              3. 実装
                              4. build/test確認
                              5. commit & push
                              6. PR作成（agent-authoredラベル）
                              7. Issueにコメント（PRへのリンク）
                              8. TaskSheetsに記録
                                              |
                                              v
                              [人間が空き時間にPRレビュー]
                              承認→マージ / 差し戻し→コメント
```

## ループの1サイクル

1. `gh issue list --label agent-ready --state open` で候補を取得
2. 未着手（`agent-in-progress` ラベルなし）のものを1件選ぶ
3. 選んだIssueに `agent-in-progress` ラベルを付け、二重着手を防ぐ
4. ブランチ `agent/issue-<番号>-<slug>` を作成
5. 実装。関連ファイルを変更
6. `npm run build`（フロント）／`cargo build`（Rust）で検証
   - 失敗した場合、1〜2回は自己修正を試みる
   - それでも解決しない場合は `agent-blocked` ラベルを付け、Issueに
     「詰まった理由」をコメントして次のIssueに進む（無理に嘘の完了報告
     をしない）
7. push → `gh pr create` でPR作成。本文にIssue番号を `Refs #<番号>` の形で
   記載（`Fixes` にはしない。理由は下記ガードレール参照）
8. Issueにコメントし、`agent-in-progress` → `agent-authored` に張り替え
9. `TaskSheets/YYYY-MM-DD-issue-<番号>.md` に「やったこと」を1行〜数行で
   記録
10. 次のIssueがあれば続行。なければ `ScheduleWakeup` で次回起床時刻を決めて
    待機（間隔なしの自己ペース `/loop` を想定）

## ガードレール（人間の承認を必須にする境界線）

自律でやってよいこと:
- コード変更・ローカルbuild/test実行
- git commit・ブランチへのpush
- PR作成、Issueへのコメント
- TaskSheetsへの記録

**必ず人間の承認を挟むこと（自律化しない）:**
- `master` への直接push・force push
- PRのマージ（レビューの主眼はここに置く。マージ操作自体が
  Human-on-the-Loopの「介入ポイント」になる）
- `Fixes #n` を使わない理由もこれと同じ:
  マージ前にIssueが自動クローズされてしまうと、レビューが漏れたまま
  片付いたように見えてしまうため、`Refs #n` に留め、クローズは人間が
  マージした結果として自然に起きる形にする
- CI/ワークフローファイル（`.github/workflows/*`）の変更
- 依存関係の破壊的アップグレード、リリース/バージョンタグ操作
- シークレット・トークンの取り扱いを変更する系の変更

スコープ外のIssueに遭遇した場合（設計判断が要る、影響範囲が大きい等）は
実装を試みず、判断が必要な点をコメントして人間に投げる
（`agent-blocked` ラベル）。

## 方針転換(2026-09-12): 駆動先をローカル`/loop`からGitHub Actionsへ

「Issue/PRの作成者をGitHubのbotらしく(`claude[bot]`バッジ付きで)見せたい」という
要望があり、`claude-code-guide`エージェントで`/install-github-app`の挙動を調査した。
結論:
- `/install-github-app`はリポジトリ所有者本人がブラウザで認可する必要があり、
  **エージェントからは実行代行できない**(ユーザー自身がこのセッションで実行する)
- 実行後、Actions経由で作成されるIssue/PRは正式に`claude[bot]`(公式botバッジ付き)
  名義になる。ただしこれは**GitHub Actionsトリガー(cron/@claudeメンション)向け**の
  仕組みで、ローカルセッションの`/loop`から流用するのは想定外の使い方
- そのため、本設計で言う「ハーネスの駆動」は**ローカル`/loop`ではなく、
  `/install-github-app`が生成するGitHub Actionsワークフロー(cron +
  `agent-ready`ラベルトリガー)側に実装する**方針に変更する。これは
  `2026-09-10-backend-frontend-plan.md`の「自己改善パイプライン パート2」で
  以前から保留になっていた作業と同一
- 上記の「ループの1サイクル」「ガードレール」の内容(ブランチ+PR運用、
  `master`直接push禁止、マージは人間、`Refs #n`でIssueを紐付け等)はそのまま
  Actionsワークフローのプロンプトとして使う。変わるのは駆動元(ローカル
  セッション → GitHub Actions)と、それに伴う作成者名義(dOtOb9 → claude[bot])のみ

### 次のアクション

1. ~~ユーザーが `/install-github-app` をこのセッションで実行~~ 完了
   (2026-09-12。スタンドアロンCLIをインストールし、生成されたセットアップPR
   ([#5](https://github.com/dOtOb9/qwen-local/pull/5))をマージ。
   `claude-code-review.yml`(PRレビュー自動化)と`claude.yml`(`@claude`
   メンション応答)が有効化された)
2. ~~cronスケジュールと自律開発ロジックの追加~~ 完了
   (2026-09-12。`.github/workflows/agent-dev-loop.yml` を新設。6時間おきの
   cron + 手動実行(`workflow_dispatch`)、上記「ループの1サイクル」
   「ガードレール」の内容をそのままプロンプトとして埋め込んだ。
   注意: `claude-code-action`をスケジュール実行+自律PR作成という用途で
   使う公式の実例は無く、今回の権限設定・プロンプト構成は
   `claude-code-guide`エージェントの調査結果を基にした独自構成。
   まず`workflow_dispatch`で手動実行して動作確認してからcronに委ねること)
3. `agent-ready`ラベル付きの種Issue(#1〜#4)で実際に動作確認する
   (次のアクション、ユーザー対応待ち: このワークフローファイルをmasterに
   マージした上で、Actionsタブから`Agent Dev Loop`を手動実行(Run workflow)
   して1サイクル試す)

## 実行場所についての結論

このハーネスを駆動するのはOllamaではなくClaude Code自身（コーディング
エージェントとしての私）なので、「ローカルLLMにクラウドから触れない」
という制約はハーネス自体には掛からない。ただし、実装した機能が実際に
Ollamaと繋がって動くかの確認（`npm run dev:app` を起動しての動作確認）は
このマシンでしかできない。したがって:

- ループの駆動そのもの: このマシン上のClaude Codeセッションで `/loop`
  （間隔指定なし＝自己ペース）を使うのが素直
- GitHub Actions: 既存の `ios-build.yml`/`windows-build.yml` の役割
  （PRが上がった際の自動ビルド確認）に留め、ハーネスの駆動役にはしない

## 未決事項（実装に進む前に決めたいこと）

- バックログの種：現在Issueは0件。まず何を `agent-ready` にするかを
  人間が選定 or 私がコード読解して改善案を数件Issue化するところから
  始める必要がある
- 1サイクルで扱うIssueの粒度（大きすぎるIssueは分割が必要）
- TaskSheetsの粒度: Issueごとに1ファイルか、ループの日次ログを1ファイルに
  まとめるか

## 次にやること

- ユーザーとバックログの種（最初にどのIssueを`agent-ready`にするか）を
  決める
- 上記が決まったら `/loop` を実際に起動して試す（このタスクシートでは
  設計のみ。起動はユーザーの合意後）
