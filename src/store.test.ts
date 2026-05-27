import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { getCacheDir } from "./store.js";

describe("store", () => {
  test("resolves the standard cache directory for each platform", () => {
    expect(
      getCacheDir({ env: {}, platform: "darwin", home: "/Users/me" }),
    ).toBe(join("/Users/me", "Library", "Caches", "cadcli"));

    expect(
      getCacheDir({
        env: { XDG_CACHE_HOME: "/tmp/cache" },
        platform: "linux",
        home: "/home/me",
      }),
    ).toBe(join("/tmp/cache", "cadcli"));

    expect(getCacheDir({ env: {}, platform: "linux", home: "/home/me" })).toBe(
      join("/home/me", ".cache", "cadcli"),
    );

    expect(
      getCacheDir({
        env: { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" },
        platform: "win32",
        home: "C:\\Users\\me",
      }),
    ).toBe(join("C:\\Users\\me\\AppData\\Local", "cadcli", "Cache"));
  });

  test("supports an explicit cache directory override", () => {
    expect(
      getCacheDir({
        env: { CADCLI_CACHE_DIR: "/tmp/cadcli-cache" },
        platform: "linux",
        home: "/home/me",
      }),
    ).toBe("/tmp/cadcli-cache");
  });
});
