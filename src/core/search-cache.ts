import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { getCacheDir } from "../store.js";
import { stringifyJson } from "../utils/output.js";

const CACHE_VERSION = 1;

export interface CachedSearchDoc {
  id: number;
  entityId: string;
  type: string;
  layer?: string;
  text: string;
  entity: unknown;
}

export interface SearchCacheData {
  version: number;
  fingerprint: string;
  index: string;
  docs: CachedSearchDoc[];
}

export function computeDrawingFingerprint(file: string): string {
  const stat = statSync(file);
  return createHash("sha1")
    .update(`${resolve(file)}:${stat.size}:${stat.mtimeMs}`)
    .digest("hex");
}

function cacheFileFor(file: string, cacheDir?: string): string {
  const root = cacheDir ?? getCacheDir();
  const key = createHash("sha1").update(resolve(file)).digest("hex");
  return join(root, "search", `${basename(file)}-${key}.search.json`);
}

export function loadSearchCache(
  file: string,
  fingerprint: string,
  cacheDir?: string,
): SearchCacheData | null {
  const cachePath = cacheFileFor(file, cacheDir);
  if (!existsSync(cachePath)) return null;
  try {
    const data = JSON.parse(
      readFileSync(cachePath, "utf-8"),
    ) as SearchCacheData;
    if (data.version !== CACHE_VERSION) return null;
    if (data.fingerprint !== fingerprint) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveSearchCache(
  file: string,
  data: Omit<SearchCacheData, "version">,
  cacheDir?: string,
): void {
  const cachePath = cacheFileFor(file, cacheDir);
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, stringifyJson({ version: CACHE_VERSION, ...data }));
}
