import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sidebar } from "@/components/Sidebar";
import { MessageContent } from "@/components/MessageContent";
import {
  addMemory,
  addMessage,
  createSession,
  deleteMemory,
  deleteSession,
  listMemories,
  listMessages,
  listSessions,
  type Memory,
  type Session,
  type StoredMessage,
} from "@/lib/db";
import { checkForUpdateAndInstall } from "@/lib/updater";

const OLLAMA_URL = "http://localhost:11434";
const MODEL = "qwen2.5:7b-instruct";

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    getVersion().then(setAppVersion);

    (async () => {
      const [existingSessions, existingMemories] = await Promise.all([
        listSessions(),
        listMemories(),
      ]);
      setSessions(existingSessions);
      setMemories(existingMemories);
      if (existingSessions.length > 0) {
        setActiveSessionId(existingSessions[0].id);
      }
    })();

    checkForUpdateAndInstall(setUpdateStatus).catch((e) => {
      console.error("Update check failed:", e);
    });
  }, []);

  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
      return;
    }
    listMessages(activeSessionId).then(setMessages);
  }, [activeSessionId]);

  function handleNewSession() {
    setActiveSessionId(null);
    setMessages([]);
    setError(null);
  }

  async function handleSelectSession(id: string) {
    setActiveSessionId(id);
    setError(null);
  }

  async function handleDeleteSession(id: string) {
    await deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setMessages([]);
    }
  }

  async function handleAddMemory(content: string) {
    await addMemory(content);
    setMemories(await listMemories());
  }

  async function handleDeleteMemory(id: number) {
    await deleteMemory(id);
    setMemories((prev) => prev.filter((m) => m.id !== id));
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    setLoading(true);
    setError(null);
    setInput("");

    try {
      let sessionId = activeSessionId;
      if (!sessionId) {
        const title = text.length > 30 ? text.slice(0, 30) + "…" : text;
        const session = await createSession(title);
        sessionId = session.id;
        setSessions((prev) => [session, ...prev]);
        setActiveSessionId(sessionId);
      }

      const userMessage: StoredMessage = {
        id: -1,
        session_id: sessionId,
        role: "user",
        content: text,
        created_at: Date.now(),
      };
      const nextMessages = [...messages, userMessage];
      setMessages(nextMessages);
      await addMessage(sessionId, "user", text);

      const chatMessages: { role: string; content: string }[] = [];
      if (memories.length > 0) {
        chatMessages.push({
          role: "system",
          content:
            "ユーザーについて覚えていること:\n" +
            memories.map((m) => `- ${m.content}`).join("\n"),
        });
      }
      chatMessages.push(...nextMessages.map((m) => ({ role: m.role, content: m.content })));

      const res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, messages: chatMessages, stream: false }),
      });

      if (!res.ok) {
        throw new Error(`Ollama API error: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      const assistantContent: string = data.message.content;

      setMessages((prev) => [
        ...prev,
        {
          id: -1,
          session_id: sessionId!,
          role: "assistant",
          content: assistantContent,
          created_at: Date.now(),
        },
      ]);
      await addMessage(sessionId, "assistant", assistantContent);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen">
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        memories={memories}
        onAddMemory={handleAddMemory}
        onDeleteMemory={handleDeleteMemory}
      />

      <main className="flex h-screen flex-1 flex-col gap-4 p-4">
        <div className="flex items-baseline gap-2">
          <h1 className="text-lg font-semibold">Qwen Local Chat</h1>
          {appVersion && (
            <span className="text-xs text-muted-foreground">v{appVersion}</span>
          )}
        </div>
        {updateStatus && (
          <p className="rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground">
            {updateStatus}
          </p>
        )}

        <Card className="flex-1 overflow-hidden p-0">
          <ScrollArea className="h-full p-4">
            <div className="flex flex-col gap-3">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.role === "user"
                      ? "self-end whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-primary-foreground"
                      : "self-start rounded-lg bg-muted px-3 py-2 text-foreground"
                  }
                >
                  {m.role === "assistant" ? <MessageContent content={m.content} /> : m.content}
                </div>
              ))}
              {loading && <div className="text-sm text-muted-foreground">考え中...</div>}
            </div>
          </ScrollArea>
        </Card>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            placeholder="メッセージを入力..."
            disabled={loading}
          />
          <Button type="submit" disabled={loading || !input.trim()}>
            送信
          </Button>
        </form>
      </main>
    </div>
  );
}

export default App;
