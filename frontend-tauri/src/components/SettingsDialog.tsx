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
  const [rakutenAppId, setRakutenAppId] = useState("");
  const [vivaldiEmail, setVivaldiEmail] = useState("");
  const [vivaldiPassword, setVivaldiPassword] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [savedToken, savedRepo, savedRakutenAppId, savedVivaldiEmail, savedVivaldiPassword] =
        await Promise.all([
          getSetting("github_token"),
          getSetting("github_repo"),
          getSetting("rakuten_app_id"),
          getSetting("vivaldi_email"),
          getSetting("vivaldi_password"),
        ]);
      setToken(savedToken ?? "");
      setRepo(savedRepo ?? "dOtOb9/qwen-local");
      setRakutenAppId(savedRakutenAppId ?? "");
      setVivaldiEmail(savedVivaldiEmail ?? "");
      setVivaldiPassword(savedVivaldiPassword ?? "");
    })();
  }, [open]);

  async function save() {
    await Promise.all([
      setSetting("github_token", token.trim()),
      setSetting("github_repo", repo.trim()),
      setSetting("rakuten_app_id", rakutenAppId.trim()),
      setSetting("vivaldi_email", vivaldiEmail.trim()),
      setSetting("vivaldi_password", vivaldiPassword.trim()),
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
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">
              楽天ウェブサービス Application ID
            </label>
            <Input
              type="password"
              value={rakutenAppId}
              onChange={(e) => setRakutenAppId(e.currentTarget.value)}
              placeholder="1234567890123456789"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">
              Vivaldi.net メールアドレス
            </label>
            <Input
              value={vivaldiEmail}
              onChange={(e) => setVivaldiEmail(e.currentTarget.value)}
              placeholder="you@vivaldi.net"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">
              Vivaldi.net パスワード(2段階認証ONならアプリ用パスワード)
            </label>
            <Input
              type="password"
              value={vivaldiPassword}
              onChange={(e) => setVivaldiPassword(e.currentTarget.value)}
            />
          </div>
          <Button onClick={save}>{saved ? "保存しました" : "保存"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
