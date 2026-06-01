import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ACadVersion,
  CadDocument,
  DxfReader,
  DxfWriter,
  TextEntity,
  XYZ,
} from "@node-projects/acad-ts";
import { Dwg } from "./index.js";
import type { DrawingReader } from "./types.js";

describe("SDK", () => {
  test("exports Dwg and exposes ergonomic methods", async () => {
    const dir = `/tmp/dwgcli-sdk-${Date.now()}`;
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "x.dxf");
    writeFileSync(file, "fake");
    const parser: DrawingReader = {
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
    const dwg = Dwg.open(file, { reader: parser });
    expect((await dwg.info()).format).toBe("DXF");
    expect(await dwg.layers()).toEqual([{ name: "0", entityCount: 1 }]);
    expect((await dwg.search({ query: "line" }))[0].type).toBe("LINE");
    expect((await dwg.overview()).entityTypes[0].type).toBe("LINE");
    expect((await dwg.json()).entities[0].type).toBe("LINE");
    expect(await dwg.blocks()).toEqual([]);
    expect((await dwg.entities())[0].type).toBe("LINE");
    expect(await dwg.document()).toEqual(await dwg.json());
    expect((await dwg.svg()).svg).toContain("<svg");
    expect((await dwg.thumbnail()).mimeType).toBe("image/png");
    expect(Dwg.open(file, { reader: parser })).toBeInstanceOf(Dwg);
  });

  test("SDK exposes acad-ts view and edit methods", () => {
    const dir = `/tmp/cadcli-sdk-acad-${Date.now()}`;
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "x.dxf");
    const out = join(dir, "out.dxf");
    const doc = new CadDocument(ACadVersion.AC1032);
    const text = new TextEntity();
    text.value = "Old";
    text.insertPoint = new XYZ(0, 0, 0);
    doc.modelSpace?.entities.add(text);
    let content = "";
    DxfWriter.writeToStream(
      {
        write(value: string) {
          content += value;
        },
        flush() {},
        close() {},
      },
      doc,
    );
    writeFileSync(file, content);

    const dwg = Dwg.open(file);
    expect(dwg.view().svg).toContain("<svg");
    expect(
      dwg.edit({
        output: out,
        operations: [
          { kind: "setText", entityId: String(text.handle), text: "New" },
        ],
      }).output,
    ).toBe(out);

    const edited = DxfReader.readFromStream(readFileSync(out));
    expect(
      ([...(edited.modelSpace?.entities ?? [])][0] as TextEntity).value,
    ).toBe("New");
  });
});
