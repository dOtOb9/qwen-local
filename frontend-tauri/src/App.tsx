import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { getCurrentWebview } from "@tauri-apps/api/webview";
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
import { chatWithTools, fetchAvailableModels, type OllamaModel } from "@/lib/ollama";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildAttachedFileMessage,
  extractPdfText,
  parseAttachedFileMessage,
} from "@/lib/pdf";
import { createGithubIssue, IDEA_DETECTION_PROMPT, parseIdeaMessage } from "@/lib/github";
import { getSetting, setSetting } from "@/lib/db";

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
  const [rememberStatus, setRememberStatus] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<{ name: string; text: string } | null>(
    null,
  );
  const [attaching, setAttaching] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [issueStatus, setIssueStatus] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState(MODEL);
  const [availableModels, setAvailableModels] = useState<OllamaModel[]>([
    { name: MODEL, supportsTools: true },
  ]);

  useEffect(() => {
    const unlistenPromise = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "enter") {
        setIsDraggingFile(true);
      } else if (event.payload.type === "leave") {
        setIsDraggingFile(false);
      } else if (event.payload.type === "drop") {
        setIsDraggingFile(false);
        const pdfPath = event.payload.paths.find((p) => p.toLowerCase().endsWith(".pdf"));
        if (pdfPath) {
          attachPdfFromPath(pdfPath);
        } else {
          setError("PDFファイルのみ添付できます");
        }
      }
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

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

    if (!import.meta.env.DEV) {
      checkForUpdateAndInstall(setUpdateStatus).catch((e) => {
        console.error("Update check failed:", e);
      });
    }

    (async () => {
      const savedModel = await getSetting("selected_model");
      try {
        const models = await fetchAvailableModels(OLLAMA_URL);
        if (models.length > 0) {
          setAvailableModels(models);
          const savedModelExists = savedModel && models.some((m) => m.name === savedModel);
          setSelectedModel(savedModelExists ? savedModel : models[0].name);
          return;
        }
      } catch (e) {
        console.error("Failed to fetch Ollama models:", e);
      }
      // Ollama未起動時などはフォールバックとして既定のMODELを使う
      if (savedModel) setSelectedModel(savedModel);
    })();
  }, []);

  async function handleSelectModel(model: string) {
    setSelectedModel(model);
    await setSetting("selected_model", model);
  }

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

  async function handleRememberText(content: string) {
    await handleAddMemory(content);
    const preview = content.length > 40 ? content.slice(0, 40) + "…" : content;
    setRememberStatus(`記憶しました: ${preview}`);
    setTimeout(() => setRememberStatus(null), 3000);
  }

  async function handleDeleteMemory(id: number) {
    await deleteMemory(id);
    setMemories((prev) => prev.filter((m) => m.id !== id));
  }

  async function attachPdfFromPath(path: string) {
    setAttaching(true);
    setError(null);
    try {
      const bytes = await readFile(path);
      const text = await extractPdfText(bytes);
      const name = path.split(/[\\/]/).pop() ?? path;
      setAttachedFile({ name, text });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAttaching(false);
    }
  }

  async function handleAttachPdf() {
    const path = await open({
      multiple: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!path || typeof path !== "string") return;
    await attachPdfFromPath(path);
  }

  // Silently checks the latest exchange for an implied feature request and,
  // if the model thinks there is one, files it as a GitHub Issue with no
  // user interaction. Never surfaces errors — this must not interrupt chat.
  async function maybeFileIdeaFromExchange(userText: string, assistantText: string) {
    try {
      const [token, repo] = await Promise.all([
        getSetting("github_token"),
        getSetting("github_repo"),
      ]);
      if (!token || !repo) return;

      const classifyMessages = [
        { role: "system", content: IDEA_DETECTION_PROMPT },
        { role: "user", content: userText },
        { role: "assistant", content: assistantText },
      ];
      const result = await chatWithTools(OLLAMA_URL, MODEL, classifyMessages);
      const idea = parseIdeaMessage(result);
      if (!idea) return;

      await createGithubIssue(token, repo, idea.title, idea.body);
      setIssueStatus(`💡 Issueを自動作成しました: ${idea.title}`);
      setTimeout(() => setIssueStatus(null), 6000);
    } catch {
      // best-effort background task; swallow failures silently
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    if (text.startsWith("/remember ")) {
      const memoryText = text.slice("/remember ".length).trim();
      setInput("");
      if (memoryText) {
        await handleRememberText(memoryText);
      }
      return;
    }

    const fileToSend = attachedFile;

    setLoading(true);
    setError(null);
    setInput("");
    setAttachedFile(null);

    try {
      let sessionId = activeSessionId;
      if (!sessionId) {
        const title = text.length > 30 ? text.slice(0, 30) + "…" : text;
        const session = await createSession(title);
        sessionId = session.id;
        setSessions((prev) => [session, ...prev]);
        setActiveSessionId(sessionId);
      }

      const content = fileToSend
        ? buildAttachedFileMessage(fileToSend.name, fileToSend.text, text)
        : text;

      const userMessage: StoredMessage = {
        id: -1,
        session_id: sessionId,
        role: "user",
        content,
        created_at: Date.now(),
      };
      const nextMessages = [...messages, userMessage];
      setMessages(nextMessages);
      await addMessage(sessionId, "user", content);

      const chatMessages: { role: string; content: string }[] = [];
      const systemPrompt = await getSetting("system_prompt");
      if (systemPrompt) {
        chatMessages.push({ role: "system", content: systemPrompt });
      }
      if (memories.length > 0) {
        chatMessages.push({
          role: "system",
          content:
            "ユーザーについて覚えていること:\n" +
            memories.map((m) => `- ${m.content}`).join("\n"),
        });
      }
      chatMessages.push(...nextMessages.map((m) => ({ role: m.role, content: m.content })));

      const [
        rakutenAppId,
        vivaldiEmail,
        vivaldiPassword,
        googleClientId,
        googleClientSecret,
        googleRefreshToken,
      ] = await Promise.all([
        getSetting("rakuten_app_id"),
        getSetting("vivaldi_email"),
        getSetting("vivaldi_password"),
        getSetting("google_client_id"),
        getSetting("google_client_secret"),
        getSetting("google_refresh_token"),
      ]);
      setStreamingContent("");
      const supportsTools =
        availableModels.find((m) => m.name === selectedModel)?.supportsTools ?? true;
      const assistantContent = await chatWithTools(OLLAMA_URL, selectedModel, chatMessages, {
        supportsTools,
        rakutenAppId: rakutenAppId ?? undefined,
        vivaldiEmail: vivaldiEmail ?? undefined,
        vivaldiPassword: vivaldiPassword ?? undefined,
        googleClientId: googleClientId ?? undefined,
        googleClientSecret: googleClientSecret ?? undefined,
        googleRefreshToken: googleRefreshToken ?? undefined,
        onStatus: (status) => {
          setToolStatus(status);
          setStreamingContent("");
        },
        onToken: setStreamingContent,
      });
      setToolStatus(null);
      setStreamingContent("");

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

      // Fire-and-forget: don't block the chat UI on this.
      maybeFileIdeaFromExchange(text, assistantContent);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setToolStatus(null);
      setStreamingContent("");
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
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold">Qwen Local Chat</h1>
          {appVersion && (
            <span className="text-xs text-muted-foreground">v{appVersion}</span>
          )}
          <Select value={selectedModel} onValueChange={handleSelectModel}>
            <SelectTrigger size="sm" className="ml-auto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableModels.map((model) => (
                <SelectItem key={model.name} value={model.name}>
                  {model.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {updateStatus && (
          <p className="rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground">
            {updateStatus}
          </p>
        )}
        {issueStatus && (
          <p className="rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground">
            {issueStatus}
          </p>
        )}
        <Card
          className={
            "flex-1 overflow-hidden p-0 transition-colors " +
            (isDraggingFile ? "ring-2 ring-primary" : "")
          }
        >
          {isDraggingFile && (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              PDFをここにドロップ
            </div>
          )}
          <ScrollArea className={"h-full p-4" + (isDraggingFile ? " hidden" : "")}>
            <div className="flex flex-col gap-3">
              {messages.map((m, i) => {
                const attachment = m.role === "user" ? parseAttachedFileMessage(m.content) : null;
                return (
                <div
                  key={i}
                  className={
                    "group relative max-w-[85%] " +
                    (m.role === "user" ? "self-end" : "self-start")
                  }
                >
                  <div
                    className={
                      m.role === "user"
                        ? "whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-primary-foreground"
                        : "rounded-lg bg-muted px-3 py-2 text-foreground"
                    }
                  >
                    {m.role === "assistant" ? (
                      <MessageContent content={m.content} />
                    ) : attachment ? (
                      <>
                        <div className="mb-1 inline-flex items-center gap-1 rounded bg-primary-foreground/20 px-1.5 py-0.5 text-xs">
                          📄 {attachment.filename}
                        </div>
                        <div>{attachment.question}</div>
                      </>
                    ) : (
                      m.content
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRememberText(attachment ? attachment.question : m.content)}
                    className="absolute -top-2 hidden rounded bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground shadow-sm hover:text-foreground group-hover:block"
                    style={m.role === "user" ? { left: "-0.25rem" } : { right: "-0.25rem" }}
                    title="このメッセージを長期記憶に保存"
                  >
                    覚える
                  </button>
                </div>
                );
              })}
              {loading && toolStatus && (
                <div className="text-sm text-muted-foreground">{toolStatus}</div>
              )}
              {loading && !toolStatus && streamingContent && (
                <div className="max-w-[85%] self-start rounded-lg bg-muted px-3 py-2 text-foreground">
                  <MessageContent content={streamingContent} />
                </div>
              )}
              {loading && !toolStatus && !streamingContent && (
                <div className="text-sm text-muted-foreground">考え中...</div>
              )}
            </div>
          </ScrollArea>
        </Card>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {rememberStatus && (
          <p className="text-sm text-muted-foreground">{rememberStatus}</p>
        )}

        {attachedFile && (
          <div className="flex items-center gap-2 self-start rounded-md bg-muted px-3 py-1.5 text-sm">
            📄 {attachedFile.name}
            <button
              type="button"
              onClick={() => setAttachedFile(null)}
              className="text-muted-foreground hover:text-destructive"
            >
              ×
            </button>
          </div>
        )}

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
        >
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleAttachPdf}
            disabled={loading || attaching}
            title="PDFを添付"
          >
            📎
          </Button>
          <Input
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            placeholder={
              attaching
                ? "PDFを読み込み中..."
                : "メッセージを入力... (/remember で長期記憶に保存)"
            }
            disabled={loading || attaching}
          />
          <Button type="submit" disabled={loading || attaching || !input.trim()}>
            送信
          </Button>
        </form>
      </main>
    </div>
  );
}

export default App;
