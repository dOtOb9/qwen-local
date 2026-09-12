# CI失敗調査: Agent Dev Loop (run 34717470724)

- 日付: 2026-09-12
- ステータス: 保留(人間の対応待ち)

## 目的

GitHub Actionsワークフロー「Agent Dev Loop」(`.github/workflows/agent-dev-loop.yml`,
schedule実行, run ID: 34717470724, ブランチ: master, 対応PR番号: 無し)が
失敗した原因を切り分け、必要な対応をまとめる。

## やったこと

- `gh run view 34717470724 --log-failed` / `--log` でログを調査。
  失敗ステップは "Run agent dev loop cycle"(`anthropics/claude-code-action@v1`)。
  エラー内容:

  ```
  Action failed with error: Claude execution failed: Reached maximum number of turns (60)
  Execution failed: Reached maximum number of turns (60)
  ```

  SDKの結果イベントは `"subtype": "error_max_turns", "is_error": true, "num_turns": 61`
  で、`claude_args` に指定された `--max-turns 60` の上限に達して強制終了していた。

- 実際にエージェントがどこまで進んだかをリポジトリ側の状態から確認:
  - Issue #4(「Google Calendar連携の基盤(OAuth認可 + 予定参照)を実装する」)に
    `agent-in-progress` ラベルが付与済み(手順3まで実行)。
  - リモートに `agent/issue-4-google-calendar-oauth` ブランチが作成・push済み
    (手順4〜8まで完了)。中身は `calendar.rs` の追加、`SettingsDialog.tsx` /
    `ollama.ts` への組み込みなど、Issue #4のスコープに沿った実装で、
    `TaskSheets/2026-09-12-issue-4.md` も同じコミットに含まれていた
    (手順12も完了)。
  - Issue #4へのコメントは無く、ラベルも `agent-ready-for-pr` に
    変わっていない → 手順9〜11(compare URL組み立て・ラベル変更・
    Issueコメント)が未実行のままターン数上限で強制終了したと判断できる。

- 上記から、**アプリケーションコード(`frontend-tauri/`配下)自体には問題がなく**、
  実装・ビルド確認・commit・pushまでは正常に完了していたことを確認した。
  失敗原因は純粋にワークフロー設定側の `--max-turns 60` が、
  「Issue選定→実装→Linux簡易ビルド確認(npm run build / cargo build)→
  git status確認→commit→push→compare URL組み立て→ラベル変更→
  Issueコメント→TaskSheet作成」という一連の手順に対して不足していたこと。
  今回は61ターン目で打ち切られており、後片付け系の手順(9〜11)だけが
  積み残しになった。

- このワークフローファイル自体を変更する権限がこのアクションには無いため、
  本ファイル(TaskSheet)への記録のみ行い、`.github/workflows/agent-dev-loop.yml`
  は変更していない。

- Issue #4へは、実装は完了しているが後片付けの手順が未完了である旨と、
  人間が直接PRを作成できるcompare URLをコメントした
  (`gh issue comment 4`)。

## 次にやること

- **`.github/workflows/agent-dev-loop.yml` の `claude_args` にある
  `--max-turns 60` を引き上げる**(人間の手による修正が必要)。
  修正案:

  ```yaml
          claude_args: >-
            --allowedTools "Bash(git:*),Bash(gh:*),Bash(npm:*),Bash(cargo:*),Edit,Write,Read,Glob,Grep"
            --max-turns 100
  ```

  今回のケースでは61ターンで打ち切られ、実装・ビルド確認・push
  (手順1〜8, 12)は完了していたが、後片付け(手順9〜11: compare URL
  組み立て・ラベル変更・Issueコメント)の3ステップ分が不足していた。
  実装の複雑さ(ファイル数・ビルド再試行の有無)によって必要ターン数は
  変動するため、余裕を見て `100` 程度への引き上げを提案する。
  (代替案: 手順9〜11をワークフロー側のシェルステップとして
  Claude実行後に切り出し、Claudeの担当範囲を実装・push までに
  限定してターン消費を減らす方法もあるが、これは設計変更を伴うため
  別途検討が必要)。

- Issue #4に残った積み残し状態(`agent-in-progress` ラベル、
  未コメントのcompare URL)は、本タスクの一環として
  `gh issue comment 4` で人間向けに報告済み。人間側でPRを作成し、
  レビュー後に `agent-in-progress` ラベルを外して問題ない。
