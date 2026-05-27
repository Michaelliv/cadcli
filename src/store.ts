import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = ".dwg";

export interface DwgConfig {
  created: string;
  cache: boolean;
}

export function findRoot(start = process.cwd()): string | null {
  let dir = start;
  while (true) {
    const candidate = join(dir, DATA_DIR);
    if (existsSync(candidate)) return candidate;
    const parent = join(dir, "..");
    if (parent === dir) return null;
    dir = parent;
  }
}

export function initStore(cwd = process.cwd()): {
  path: string;
  created: boolean;
} {
  const root = join(cwd, DATA_DIR);
  const created = !existsSync(root);
  mkdirSync(join(root, "cache"), { recursive: true });
  const configPath = join(root, "config.json");
  if (!existsSync(configPath)) {
    const config: DwgConfig = {
      created: new Date().toISOString(),
      cache: true,
    };
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  }
  return { path: root, created };
}

export function readConfig(root: string): DwgConfig {
  return JSON.parse(readFileSync(join(root, "config.json"), "utf-8"));
}
