import { invoke } from "@tauri-apps/api/core";

const IDEA_PREFIX = "【アイデア】";

export function parseIdeaMessage(content: string): { title: string; body: string } | null {
  if (!content.startsWith(IDEA_PREFIX)) return null;
  const rest = content.slice(IDEA_PREFIX.length);
  const newlineIdx = rest.indexOf("\n");
  if (newlineIdx === -1) {
    return { title: rest.trim(), body: "" };
  }
  return {
    title: rest.slice(0, newlineIdx).trim(),
    body: rest.slice(newlineIdx + 1).trim(),
  };
}

// Run silently after every exchange to decide whether it implies a feature
// request for this app. Must output NOTHING but NONE when there's no signal,
// so normal conversations never get misfiled as issues.
export const IDEA_DETECTION_PROMPT =
  "あなたはQwen Local Chat(Ollama + Tauriのローカルチャットアプリ)の開発チームの一員です。" +
  "直後に渡す直近のユーザーとのやりとり1往復だけを見て、" +
  "このアプリ自体に対する機能要望・不満・改善アイデアが" +
  "明確に読み取れる場合だけ、次の形式で1つ出力してください:\n" +
  "【アイデア】<20字程度のタイトル>\n<2〜4文程度の説明>\n\n" +
  "やりとりの内容がこのアプリと無関係(一般的な質問や雑談など)な場合は、" +
  "他に何も書かず NONE とだけ出力してください。迷ったら NONE を選んでください。";

export async function createGithubIssue(
  token: string,
  repo: string,
  title: string,
  body: string,
): Promise<string> {
  return invoke<string>("create_github_issue", { token, repo, title, body });
}
