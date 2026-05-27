import { beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NativeLibreDwgReader } from "./adapter.js";

let dir = "";
let binDir = "";
let file = "";

function addDwgread(body: string): void {
  const tool = join(binDir, "dwgread");
  writeFileSync(tool, `#!/bin/sh\n${body}\n`);
  chmodSync(tool, 0o755);
}

beforeEach(() => {
  dir = `/tmp/cadcli-adapter-${Date.now()}-${Math.random()}`;
  binDir = join(dir, "bin");
  mkdirSync(binDir, { recursive: true });
  file = join(dir, "x.dwg");
  writeFileSync(file, "fake");
});

describe("NativeLibreDwgReader", () => {
  test("parses native dwgread JSON output", async () => {
    addDwgread(`echo '{"version":"AC1032","entities":[{"type":"LINE"}]}'`);
    const reader = new NativeLibreDwgReader(binDir);
    await expect(reader.parse(file, new Uint8Array(), "DWG")).resolves.toEqual({
      version: "AC1032",
      entities: [{ type: "LINE" }],
    });
  });

  test("requires native dwgread and validates JSON", async () => {
    const missing = new NativeLibreDwgReader(binDir);
    await expect(missing.parse(file, new Uint8Array(), "DWG")).rejects.toThrow(
      "LibreDWG tool not found: dwgread",
    );

    addDwgread("echo not-json");
    const invalid = new NativeLibreDwgReader(binDir);
    await expect(invalid.parse(file, new Uint8Array(), "DWG")).rejects.toThrow(
      "dwgread produced invalid JSON",
    );
  });

  test("reports thumbnail extraction as unavailable", async () => {
    const reader = new NativeLibreDwgReader(binDir);
    await expect(reader.thumbnail()).rejects.toThrow(
      "Thumbnail extraction is not available through native LibreDWG",
    );
  });
});
