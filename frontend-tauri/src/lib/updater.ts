import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export async function checkForUpdateAndInstall(
  onStatus?: (status: string) => void,
): Promise<void> {
  const update = await check();
  if (!update) return;

  onStatus?.(`新しいバージョン ${update.version} をダウンロード中...`);
  await update.downloadAndInstall();
  onStatus?.("再起動して適用します...");
  await relaunch();
}
