import { describe, expect, test } from "bun:test";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  computeDrawingFingerprint,
  loadSearchCache,
  saveSearchCache,
} from "./search-cache.js";

function cacheFiles(cacheDir: string, file: string): string[] {
  return readdirSync(join(cacheDir, "search")).filter((name) =>
    name.startsWith(basename(file)),
  );
}

describe("search cache", () => {
  test("saves, loads, invalidates, and ignores corruption", () => {
    const dir = `/tmp/cadcli-cache-${Date.now()}-${Math.random()}`;
    const cacheDir = join(dir, "cache");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "drawing.dwg");
    writeFileSync(file, "fake");
    const fingerprint = computeDrawingFingerprint(file);

    expect(loadSearchCache(file, fingerprint, cacheDir)).toBe(null);
    saveSearchCache(
      file,
      {
        fingerprint,
        index: "{}",
        docs: [
          {
            id: 1,
            entityId: "A",
            type: "LINE",
            text: "line",
            entity: { id: "A", type: "LINE", data: {} },
          },
        ],
      },
      cacheDir,
    );
    expect(loadSearchCache(file, fingerprint, cacheDir)?.docs[0].entityId).toBe(
      "A",
    );
    expect(loadSearchCache(file, "wrong", cacheDir)).toBe(null);

    const [cacheFile] = cacheFiles(cacheDir, file);
    writeFileSync(join(cacheDir, "search", cacheFile), "not json");
    expect(loadSearchCache(file, fingerprint, cacheDir)).toBe(null);
  });

  test("rejects cache payloads with the wrong shape", () => {
    const dir = `/tmp/cadcli-cache-shape-${Date.now()}-${Math.random()}`;
    const cacheDir = join(dir, "cache");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "drawing.dwg");
    writeFileSync(file, "fake");
    const fingerprint = computeDrawingFingerprint(file);

    saveSearchCache(file, { fingerprint, index: "{}", docs: [] }, cacheDir);
    const [cacheFile] = cacheFiles(cacheDir, file);
    const cachePath = join(cacheDir, "search", cacheFile);

    for (const payload of [
      {},
      { version: 1, fingerprint, index: {}, docs: [] },
      { version: 1, fingerprint, index: "{}", docs: [{}] },
      { version: 2, fingerprint, index: "{}", docs: [] },
    ]) {
      writeFileSync(cachePath, JSON.stringify(payload));
      expect(loadSearchCache(file, fingerprint, cacheDir)).toBe(null);
    }
  });
});
