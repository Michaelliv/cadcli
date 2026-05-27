import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
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
    };
    const dwg = Dwg.withParser(parser, file);
    expect((await dwg.info()).format).toBe("DXF");
    expect(await dwg.layers()).toEqual([{ name: "0", entityCount: 1 }]);
    expect((await dwg.json()).entities[0].type).toBe("LINE");
    expect((await dwg.svg()).svg).toContain("<svg");
  });
});
