import { invoke } from "@tauri-apps/api/core";

export type ChatMessage = {
  role: string;
  content: string;
  tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[];
};

export type ToolContext = {
  rakutenAppId?: string;
  vivaldiEmail?: string;
  vivaldiPassword?: string;
  googleClientId?: string;
  googleClientSecret?: string;
  googleRefreshToken?: string;
  onStatus?: (status: string) => void;
  /** ストリーミングでアシスタントのテキストが増えるたびに呼ばれる(蓄積済み全文を渡す) */
  onToken?: (content: string) => void;
};

type SearchResult = { title: string; url: string; snippet: string };
type RakutenItem = { name: string; price: number; url: string; shop: string };
type EmailSummary = { from: string; subject: string; date: string; unread: boolean };
type GmailSummary = { from: string; subject: string; date: string; snippet: string };

type ToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description: string }>;
      required: string[];
    };
  };
};

const SEARCH_TOOL: ToolDef = {
  type: "function",
  function: {
    name: "search_web",
    description:
      "最新の情報、ニュース、事実確認が必要なときにWeb検索を行う。学習データにない可能性がある話題で使う。",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "検索クエリ(日本語または英語)" },
      },
      required: ["query"],
    },
  },
};

const RAKUTEN_TOOL: ToolDef = {
  type: "function",
  function: {
    name: "search_rakuten",
    description:
      "商品の価格を調べたい、買い物・購入を検討している時に楽天市場で商品を検索する。" +
      "価格比較や商品提案が必要な場面で使う。",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "検索したい商品名・キーワード" },
      },
      required: ["query"],
    },
  },
};

const EMAIL_TOOL: ToolDef = {
  type: "function",
  function: {
    name: "check_email",
    description:
      "Vivaldi.netの受信メール(直近10件)を確認する。未読メール・最近届いた" +
      "メールについて聞かれた時に使う。",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

const GMAIL_TOOL: ToolDef = {
  type: "function",
  function: {
    name: "check_gmail",
    description:
      "Gmailの受信メール(直近10件)を確認する。未読メール・最近届いたメールに" +
      "ついて聞かれた時に使う。",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
};

async function callTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  if (name === "search_web") {
    const query = String(args.query ?? "");
    ctx.onStatus?.(`Web検索中: ${query}`);
    const results = await invoke<SearchResult[]>("search_web", { query });
    return JSON.stringify(results);
  }
  if (name === "search_rakuten" && ctx.rakutenAppId) {
    const query = String(args.query ?? "");
    ctx.onStatus?.(`楽天市場で検索中: ${query}`);
    const results = await invoke<RakutenItem[]>("search_rakuten", {
      applicationId: ctx.rakutenAppId,
      query,
    });
    return JSON.stringify(results);
  }
  if (name === "check_email" && ctx.vivaldiEmail && ctx.vivaldiPassword) {
    ctx.onStatus?.("メールを確認中...");
    const results = await invoke<EmailSummary[]>("fetch_recent_emails", {
      username: ctx.vivaldiEmail,
      password: ctx.vivaldiPassword,
      limit: 10,
    });
    return JSON.stringify(results);
  }
  if (
    name === "check_gmail" &&
    ctx.googleClientId &&
    ctx.googleClientSecret &&
    ctx.googleRefreshToken
  ) {
    ctx.onStatus?.("Gmailを確認中...");
    const results = await invoke<GmailSummary[]>("fetch_gmail_messages", {
      clientId: ctx.googleClientId,
      clientSecret: ctx.googleClientSecret,
      refreshToken: ctx.googleRefreshToken,
      limit: 10,
    });
    return JSON.stringify(results);
  }
  return JSON.stringify({ error: `unknown tool: ${name}` });
}

/**
 * Ollamaの `/api/tags` を叩き、ローカルにpull済みのモデル名一覧を返す。
 * Ollama未起動時などは例外を投げるので、呼び出し側でフォールバックすること。
 */
export async function fetchAvailableModels(ollamaUrl: string): Promise<string[]> {
  const res = await fetch(`${ollamaUrl}/api/tags`);
  if (!res.ok) {
    throw new Error(`Ollama API error: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const models = data.models as { name: string }[] | undefined;
  return (models ?? []).map((m) => m.name);
}

const MAX_TOOL_ROUNDS = 3;

/**
 * `/api/chat` を `stream: true` で叩き、NDJSON(1行1JSON)のレスポンスを読みながら
 * `role`/蓄積済み`content`/`tool_calls`(来ていれば)を返す。tool_callsが確認できた
 * 時点でストリームを打ち切る(以降のトークンを待たずに次のツール実行に進むため)。
 */
async function streamChat(
  ollamaUrl: string,
  model: string,
  messages: ChatMessage[],
  tools: ToolDef[],
  onToken?: (content: string) => void,
): Promise<{ role: string; content: string; tool_calls?: ChatMessage["tool_calls"] }> {
  const res = await fetch(`${ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      tools,
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Ollama API error: ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let role = "assistant";
  let content = "";
  let toolCalls: ChatMessage["tool_calls"] | undefined;

  const processLine = (line: string): boolean => {
    if (!line.trim()) return false;
    const chunk = JSON.parse(line);
    const msg = chunk.message;
    if (msg) {
      role = msg.role ?? role;
      if (msg.content) {
        content += msg.content;
        onToken?.(content);
      }
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        toolCalls = msg.tool_calls;
        return true;
      }
    }
    return Boolean(chunk.done);
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex: number;
      let stop = false;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (processLine(line)) {
          stop = true;
          break;
        }
      }
      if (stop) break;
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  return { role, content, tool_calls: toolCalls };
}

export async function chatWithTools(
  ollamaUrl: string,
  model: string,
  initialMessages: ChatMessage[],
  ctx: ToolContext = {},
): Promise<string> {
  const messages = [...initialMessages];
  const tools: ToolDef[] = [SEARCH_TOOL];
  if (ctx.rakutenAppId) tools.push(RAKUTEN_TOOL);
  if (ctx.vivaldiEmail && ctx.vivaldiPassword) tools.push(EMAIL_TOOL);
  if (ctx.googleClientId && ctx.googleClientSecret && ctx.googleRefreshToken) {
    tools.push(GMAIL_TOOL);
  }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const { role, content, tool_calls } = await streamChat(
      ollamaUrl,
      model,
      messages,
      tools,
      ctx.onToken,
    );

    if (!tool_calls || tool_calls.length === 0) {
      return content;
    }

    messages.push({ role, content, tool_calls });
    for (const call of tool_calls) {
      const result = await callTool(call.function.name, call.function.arguments, ctx);
      messages.push({ role: "tool", content: result });
    }
  }

  throw new Error("ツール呼び出しの上限に達しました");
}
