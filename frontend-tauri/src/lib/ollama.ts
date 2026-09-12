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

const MAX_TOOL_ROUNDS = 3;

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
    const res = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        tools,
        stream: false,
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const message: ChatMessage = data.message;

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return message.content;
    }

    messages.push(message);
    for (const call of message.tool_calls) {
      const result = await callTool(call.function.name, call.function.arguments, ctx);
      messages.push({ role: "tool", content: result });
    }
  }

  throw new Error("ツール呼び出しの上限に達しました");
}
