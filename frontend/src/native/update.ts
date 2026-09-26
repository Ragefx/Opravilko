import { registerPlugin } from "@capacitor/core";
import { App } from "@capacitor/app";
import { isNativeApp } from "../dropbox/auth";

/** Installing the app's own updates (android/.../update/UpdatePlugin.java). */
interface OpravilkoUpdatePlugin {
  canInstall(): Promise<{ allowed: boolean }>;
  allowInstalls(): Promise<void>;
  install(options: { url: string }): Promise<void>;
  addListener(event: "progress", cb: (e: { percent: number }) => void): Promise<{ remove: () => void }>;
}
const OpravilkoUpdate = registerPlugin<OpravilkoUpdatePlugin>("OpravilkoUpdate");

const LATEST = "https://api.github.com/repos/Ragefx/Opravilko/releases/latest";

export interface AppUpdate {
  build: number;
  /** The APK to download. */
  url: string;
}

/** The installed app's build number (null on the website). */
export async function installedBuild(): Promise<number | null> {
  if (!isNativeApp) return null;
  try {
    return Number((await App.getInfo()).build) || null;
  } catch {
    return null;
  }
}

/** The newest build on GitHub, whether or not it's newer than this one. */
export async function latestBuild(): Promise<AppUpdate | null> {
  const res = await fetch(LATEST, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) return null;
  const release = (await res.json()) as { tag_name?: string; assets?: { name: string; browser_download_url: string }[] };
  const build = Number(release.tag_name?.match(/android-build-(\d+)/)?.[1]);
  const apk = release.assets?.find((a) => a.name.endsWith(".apk"));
  return build && apk ? { build, url: apk.browser_download_url } : null;
}

/** A newer build than the installed one, if there is one (app only). */
export async function checkForUpdate(): Promise<AppUpdate | null> {
  const installed = await installedBuild();
  if (!installed) return null;
  try {
    const latest = await latestBuild();
    return latest && latest.build > installed ? latest : null;
  } catch {
    return null; // offline, or GitHub unreachable: try again later
  }
}

/**
 * Downloads the update and opens Android's installer. Returns "permission"
 * when Opravilko first needs allowing to install apps (Settings opens for it).
 */
export async function installUpdate(update: AppUpdate, onProgress: (percent: number) => void): Promise<"started" | "permission"> {
  const { allowed } = await OpravilkoUpdate.canInstall();
  if (!allowed) {
    await OpravilkoUpdate.allowInstalls();
    return "permission";
  }
  const listener = await OpravilkoUpdate.addListener("progress", (e) => onProgress(e.percent));
  try {
    await OpravilkoUpdate.install({ url: update.url });
    return "started";
  } finally {
    listener.remove();
  }
}
