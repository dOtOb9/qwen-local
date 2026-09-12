import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getSetting, setSetting } from "@/lib/db";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [repo, setRepo] = useState("dOtOb9/qwen-local");
  const [rakutenAppId, setRakutenAppId] = useState("");
  const [vivaldiEmail, setVivaldiEmail] = useState("");
  const [vivaldiPassword, setVivaldiPassword] = useState("");
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [googleRefreshToken, setGoogleRefreshToken] = useState("");
  const [googleLoginStatus, setGoogleLoginStatus] = useState<string | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [
        savedToken,
        savedRepo,
        savedRakutenAppId,
        savedVivaldiEmail,
        savedVivaldiPassword,
        savedGoogleClientId,
        savedGoogleClientSecret,
        savedGoogleRefreshToken,
        savedSystemPrompt,
      ] = await Promise.all([
        getSetting("github_token"),
        getSetting("github_repo"),
        getSetting("rakuten_app_id"),
        getSetting("vivaldi_email"),
        getSetting("vivaldi_password"),
        getSetting("google_client_id"),
        getSetting("google_client_secret"),
        getSetting("google_refresh_token"),
        getSetting("system_prompt"),
      ]);
      setToken(savedToken ?? "");
      setRepo(savedRepo ?? "dOtOb9/qwen-local");
      setRakutenAppId(savedRakutenAppId ?? "");
      setVivaldiEmail(savedVivaldiEmail ?? "");
      setVivaldiPassword(savedVivaldiPassword ?? "");
      setGoogleClientId(savedGoogleClientId ?? "");
      setGoogleClientSecret(savedGoogleClientSecret ?? "");
      setGoogleRefreshToken(savedGoogleRefreshToken ?? "");
      setSystemPrompt(savedSystemPrompt ?? "");
      setGoogleLoginStatus(null);
    })();
  }, [open]);

  async function save() {
    await Promise.all([
      setSetting("github_token", token.trim()),
      setSetting("github_repo", repo.trim()),
      setSetting("rakuten_app_id", rakutenAppId.trim()),
      setSetting("vivaldi_email", vivaldiEmail.trim()),
      setSetting("vivaldi_password", vivaldiPassword.trim()),
      setSetting("google_client_id", googleClientId.trim()),
      setSetting("google_client_secret", googleClientSecret.trim()),
      setSetting("system_prompt", systemPrompt.trim()),
    ]);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function loginWithGoogle() {
    setGoogleLoginStatus("ブラウザでログインしてください...");
    try {
      const clientId = googleClientId.trim();
      const clientSecret = googleClientSecret.trim();
      await Promise.all([
        setSetting("google_client_id", clientId),
        setSetting("google_client_secret", clientSecret),
      ]);
      const tokens = await invoke<{ access_token: string; refresh_token?: string }>(
        "google_oauth_login",
        { clientId, clientSecret, scope: GMAIL_SCOPE },
      );
      if (!tokens.refresh_token) {
        setGoogleLoginStatus(
          "refresh tokenが取得できませんでした。Googleアカウントの連携済みアプリからこのアプリを一度解除して、再度お試しください。",
        );
        return;
      }
      await setSetting("google_refresh_token", tokens.refresh_token);
      setGoogleRefreshToken(tokens.refresh_token);
      setGoogleLoginStatus("ログインしました");
    } catch (e) {
      setGoogleLoginStatus(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          設定
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
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

          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <h3 className="text-xs font-semibold text-muted-foreground">Gmail</h3>
            <label className="text-xs text-muted-foreground">
              Google OAuth クライアントID(デスクトップアプリ)
            </label>
            <Input
              value={googleClientId}
              onChange={(e) => setGoogleClientId(e.currentTarget.value)}
              placeholder="xxxxx.apps.googleusercontent.com"
            />
            <label className="text-xs text-muted-foreground">クライアントシークレット</label>
            <Input
              type="password"
              value={googleClientSecret}
              onChange={(e) => setGoogleClientSecret(e.currentTarget.value)}
            />
            <Button
              variant="outline"
              onClick={loginWithGoogle}
              disabled={!googleClientId.trim() || !googleClientSecret.trim()}
            >
              {googleRefreshToken ? "Googleで再ログイン" : "Googleでログイン"}
            </Button>
            {googleRefreshToken && (
              <p className="text-xs text-muted-foreground">連携済みです</p>
            )}
            {googleLoginStatus && (
              <p className="text-xs text-muted-foreground">{googleLoginStatus}</p>
            )}
          </div>

          <div className="flex flex-col gap-1 border-t border-border pt-3">
            <label className="text-xs text-muted-foreground">
              System Prompt(チャット全体に適用する指示。任意)
            </label>
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.currentTarget.value)}
              placeholder="例: 常に関西弁で答えて"
              rows={4}
            />
          </div>

          <Button onClick={save}>{saved ? "保存しました" : "保存"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
