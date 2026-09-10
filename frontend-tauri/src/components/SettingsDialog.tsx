import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSetting, setSetting } from "@/lib/db";

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [repo, setRepo] = useState("dOtOb9/qwen-local");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [savedToken, savedRepo] = await Promise.all([
        getSetting("github_token"),
        getSetting("github_repo"),
      ]);
      setToken(savedToken ?? "");
      setRepo(savedRepo ?? "dOtOb9/qwen-local");
    })();
  }, [open]);

  async function save() {
    await Promise.all([
      setSetting("github_token", token.trim()),
      setSetting("github_repo", repo.trim()),
    ]);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          設定
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>設定</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">
              GitHub Personal Access Token (repoスコープ)
            </label>
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.currentTarget.value)}
              placeholder="ghp_..."
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">
              Issue投稿先リポジトリ (owner/repo)
            </label>
            <Input value={repo} onChange={(e) => setRepo(e.currentTarget.value)} />
          </div>
          <Button onClick={save}>{saved ? "保存しました" : "保存"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
