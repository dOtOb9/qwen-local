import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Memory, Session } from "@/lib/db";

type SidebarProps = {
  sessions: Session[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  memories: Memory[];
  onAddMemory: (content: string) => void;
  onDeleteMemory: (id: number) => void;
};

export function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  memories,
  onAddMemory,
  onDeleteMemory,
}: SidebarProps) {
  const [memoryInput, setMemoryInput] = useState("");

  function submitMemory() {
    const text = memoryInput.trim();
    if (!text) return;
    onAddMemory(text);
    setMemoryInput("");
  }

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col gap-4 overflow-hidden border-r border-border p-3">
      <Button onClick={onNewSession} className="w-full">
        + 新しいチャット
      </Button>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {sessions.map((s) => (
          <div
            key={s.id}
            className={
              "group flex items-center justify-between rounded-md px-2 py-1.5 text-sm cursor-pointer " +
              (s.id === activeSessionId
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/50")
            }
            onClick={() => onSelectSession(s.id)}
          >
            <span className="truncate">{s.title}</span>
            <button
              className="hidden shrink-0 text-xs text-muted-foreground hover:text-destructive group-hover:block"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteSession(s.id);
              }}
            >
              削除
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <h2 className="text-xs font-semibold text-muted-foreground">長期記憶</h2>
        <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
          {memories.map((m) => (
            <div
              key={m.id}
              className="group flex items-start justify-between gap-1 rounded-md bg-muted/50 px-2 py-1 text-xs"
            >
              <span className="flex-1">{m.content}</span>
              <button
                className="hidden shrink-0 text-muted-foreground hover:text-destructive group-hover:block"
                onClick={() => onDeleteMemory(m.id)}
              >
                削除
              </button>
            </div>
          ))}
          {memories.length === 0 && (
            <p className="text-xs text-muted-foreground">まだ記憶はありません</p>
          )}
        </div>
        <div className="flex gap-1">
          <Input
            value={memoryInput}
            onChange={(e) => setMemoryInput(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitMemory();
            }}
            placeholder="覚えさせたいことを入力..."
            className="text-xs"
          />
          <Button size="sm" onClick={submitMemory} disabled={!memoryInput.trim()}>
            追加
          </Button>
        </div>
      </div>
    </aside>
  );
}
