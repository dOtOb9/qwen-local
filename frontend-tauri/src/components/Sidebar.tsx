import { Button } from "@/components/ui/button";
import { MemoryDialog } from "@/components/MemoryDialog";
import { SettingsDialog } from "@/components/SettingsDialog";
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
        <MemoryDialog
          memories={memories}
          onAddMemory={onAddMemory}
          onDeleteMemory={onDeleteMemory}
        />
        <SettingsDialog />
      </div>
    </aside>
  );
}
