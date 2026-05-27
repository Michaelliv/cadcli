import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { findRoot, initStore, readConfig } from "./store.js";

describe("store", () => {
  test("initializes, finds, and reads config", () => {
    const dir = `/tmp/cadcli-store-${Date.now()}-${Math.random()}`;
    const nested = join(dir, "a", "b");
    mkdirSync(nested, { recursive: true });
    expect(findRoot(nested)).toBe(null);
    const first = initStore(dir);
    const second = initStore(dir);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(findRoot(nested)).toBe(first.path);
    expect(readConfig(first.path).cache).toBe(true);
  });
});
