import { homedir } from "node:os";
import { join } from "node:path";

const APP_NAME = "cadcli";

export interface CacheDirOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  home?: string;
}

export function getCacheDir(options: CacheDirOptions = {}): string {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const home = options.home ?? homedir();

  if (env.CADCLI_CACHE_DIR) return env.CADCLI_CACHE_DIR;

  if (platform === "darwin") {
    return join(home, "Library", "Caches", APP_NAME);
  }

  if (platform === "win32") {
    return join(
      env.LOCALAPPDATA ?? join(home, "AppData", "Local"),
      APP_NAME,
      "Cache",
    );
  }

  return join(env.XDG_CACHE_HOME ?? join(home, ".cache"), APP_NAME);
}
