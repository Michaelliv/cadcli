import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Dwg } from "./index.js";
import type { DwgParser } from "./types.js";

describe("SDK", () => {
  test("exports Dwg and exposes ergonomic methods", async () => {
    const dir = `/tmp/dwgcli-sdk-${Date.now()}`;
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "x.dxf");
    writeFileSync(file, "fake");
    const parser: DwgParser = {
      async parse() {
        return { entities: [{ type: "LINE", layer: "0" }] };
      },
      async thumbnail() {
        return {
          data: new Uint8Array([1]),
          mimeType: "image/png",
          extension: "png",
        };
      },
    };
    const dwg = Dwg.withLibreDwgParser(parser, file);
    expect((await dwg.info()).format).toBe("DXF");
    expect(await dwg.layers()).toEqual([{ name: "0", entityCount: 1 }]);
    expect((await dwg.search({ query: "line" }))[0].type).toBe("LINE");
    expect((await dwg.json()).entities[0].type).toBe("LINE");
    expect(await dwg.blocks()).toEqual([]);
    expect((await dwg.entities())[0].type).toBe("LINE");
    expect(await dwg.document()).toEqual(await dwg.json());
    expect((await dwg.svg()).svg).toContain("<svg");
    expect((await dwg.thumbnail()).mimeType).toBe("image/png");
    expect(Dwg.open(file, { parser })).toBeInstanceOf(Dwg);
  });

  test("SDK exposes LibreDWG native view and edit methods", () => {
    const dir = `/tmp/cadcli-sdk-native-${Date.now()}`;
    const binDir = join(dir, "bin");
    mkdirSync(binDir, { recursive: true });
    for (const [name, body] of [
      ["dwgread", "echo '<svg>sdk</svg>'"],
      ["dwgfilter", "exit 0"],
    ] as const) {
      const tool = join(binDir, name);
      writeFileSync(tool, `#!/bin/sh\n${body}\n`);
      chmodSync(tool, 0o755);
    }
    const file = join(dir, "x.dwg");
    const out = join(dir, "out.dwg");
    writeFileSync(file, "fake");
    const dwg = Dwg.open(file);
    expect(dwg.view({ toolDir: binDir }).svg).toContain("sdk");
    expect(
      dwg.edit({ output: out, expression: ".", toolDir: binDir }).output,
    ).toBe(out);
  });
});
