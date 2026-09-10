import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { Memory } from "@/lib/db";

type MemoryDialogProps = {
  memories: Memory[];
  onAddMemory: (content: string) => void;
  onDeleteMemory: (id: number) => void;
};

export function MemoryDialog({ memories, onAddMemory, onDeleteMemory }: MemoryDialogProps) {
  const [input, setInput] = useState("");

  function submit() {
    const text = input.trim();
    if (!text) return;
    onAddMemory(text);
    setInput("");
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          長期記憶
          <Badge variant="secondary">{memories.length}</Badge>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] max-w-lg">
        <DialogHeader>
          <DialogTitle>長期記憶</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="覚えさせたいことを入力..."
          />
          <Button onClick={submit} disabled={!input.trim()}>
            追加
          </Button>
        </div>

        <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
          {memories.length === 0 && (
            <p className="text-sm text-muted-foreground">まだ記憶はありません</p>
          )}
          {memories.map((m) => (
            <div
              key={m.id}
              className="group flex items-start justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm"
            >
              <span className="flex-1 whitespace-pre-wrap">{m.content}</span>
              <button
                type="button"
                onClick={() => onDeleteMemory(m.id)}
                className="shrink-0 text-xs text-muted-foreground hover:text-destructive"
              >
                削除
              </button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
