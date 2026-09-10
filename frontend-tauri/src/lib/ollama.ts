import { invoke } from "@tauri-apps/api/core";

export type ChatMessage = {
  role: string;
  content: string;
  tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[];
};

type SearchResult = { title: string; url: string; snippet: string };

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

async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
  if (name === "search_web") {
    const results = await invoke<SearchResult[]>("search_web", {
      query: String(args.query ?? ""),
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
): Promise<string> {
  const messages = [...initialMessages];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        tools: [SEARCH_TOOL],
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
      const result = await callTool(call.function.name, call.function.arguments);
      messages.push({ role: "tool", content: result });
    }
  }

  throw new Error("ツール呼び出しの上限に達しました");
}
