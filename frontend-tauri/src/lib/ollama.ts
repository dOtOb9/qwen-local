import { invoke } from "@tauri-apps/api/core";

export type ChatMessage = {
  role: string;
  content: string;
  tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[];
};

export type ToolContext = {
  rakutenAppId?: string;
  onStatus?: (status: string) => void;
};

type SearchResult = { title: string; url: string; snippet: string };
type RakutenItem = { name: string; price: number; url: string; shop: string };

const SEARCH_TOOL = {
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

const RAKUTEN_TOOL = {
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
  const tools = ctx.rakutenAppId ? [SEARCH_TOOL, RAKUTEN_TOOL] : [SEARCH_TOOL];

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
