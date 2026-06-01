import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ACadVersion,
  CadDocument,
  DxfWriter,
  TextEntity,
  XYZ,
} from "@node-projects/acad-ts";
import { renderSvgWithAcadTs } from "./acad-view.js";

function writeTextDxf(file: string): void {
  mkdirSync(file.slice(0, file.lastIndexOf("/")), { recursive: true });
  const doc = new CadDocument(ACadVersion.AC1032);
  const text = new TextEntity();
  text.value = "Renderable";
  text.insertPoint = new XYZ(1, 2, 0);
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
}

describe("acad-ts view", () => {
  test("renders text SVG without native tools or ByLayer color crashes", () => {
    const dir = `/tmp/dwgcli-acad-view-${Date.now()}-${Math.random()}`;
    const file = join(dir, "input.dxf");
    writeTextDxf(file);

    const result = renderSvgWithAcadTs(file);

    expect(result.backend).toBe("acad-ts");
    expect(result.svg).toContain("<svg");
    expect(result.svg).toContain("Renderable");
  });
});
