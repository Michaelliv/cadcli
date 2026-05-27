import { describe, expect, test } from "bun:test";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  computeDrawingFingerprint,
  loadSearchCache,
  saveSearchCache,
} from "./search-cache.js";

describe("search cache", () => {
  test("saves, loads, invalidates, and ignores corruption", () => {
    const dir = `/tmp/cadcli-cache-${Date.now()}-${Math.random()}`;
    const cacheDir = join(dir, "cache");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "drawing.dwg");
    writeFileSync(file, "fake");
    const fingerprint = computeDrawingFingerprint(file);

    expect(loadSearchCache(file, fingerprint, cacheDir)).toBe(null);
    saveSearchCache(file, { fingerprint, index: "{}", docs: [] }, cacheDir);
    expect(loadSearchCache(file, fingerprint, cacheDir)?.fingerprint).toBe(
      fingerprint,
    );
    expect(loadSearchCache(file, "wrong", cacheDir)).toBe(null);

    const searchDir = join(cacheDir, "search");
    const files = readdirSync(searchDir).filter((name) =>
      name.startsWith(basename(file)),
    );
    writeFileSync(join(searchDir, files[0]), "not json");
    expect(loadSearchCache(file, fingerprint, cacheDir)).toBe(null);
  });
});
