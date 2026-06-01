import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ACadVersion,
  CadDocument,
  Circle,
  DwgReader,
  DwgWriter,
  DxfReader,
  DxfWriter,
  Line,
  LineWeightType,
  LwPolyline,
  MText,
  Point,
  TextEntity,
  XYZ,
} from "@node-projects/acad-ts";
import { editWithAcadTs } from "./acad-edit.js";

type FixtureIds = { line: string; text: string; textHex: string };

function makeFixtureDocument(): { doc: CadDocument; ids: FixtureIds } {
  const doc = new CadDocument(ACadVersion.AC1032);
  const text = new TextEntity();
  text.value = "Old label";
  text.insertPoint = new XYZ(1, 2, 0);
  doc.modelSpace?.entities.add(text);

  const line = new Line(new XYZ(0, 0, 0), new XYZ(10, 0, 0));
  doc.modelSpace?.entities.add(line);

  return {
    doc,
    ids: {
      line: String(line.handle),
      text: String(text.handle),
      textHex: text.handle.toString(16),
    },
  };
}

function writeSampleDxf(file: string): FixtureIds {
  mkdirSync(file.slice(0, file.lastIndexOf("/")), { recursive: true });
  const { doc, ids } = makeFixtureDocument();
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
  return ids;
}

function writeSampleDwg(file: string): FixtureIds {
  mkdirSync(file.slice(0, file.lastIndexOf("/")), { recursive: true });
  const { doc, ids } = makeFixtureDocument();
  const buffer = new ArrayBuffer(1024 * 1024);
  const writer = new DwgWriter(buffer, doc);
  writer.write();
  writeFileSync(file, new Uint8Array(buffer).slice(0, writer.bytesWritten));
  return ids;
}

function readDocument(file: string): CadDocument {
  const bytes = readFileSync(file);
  const data = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return file.endsWith(".dwg")
    ? DwgReader.readFromStream(data.buffer)
    : DxfReader.readFromStream(data);
}

function entities(file: string) {
  return [...(readDocument(file).modelSpace?.entities ?? [])];
}

function firstText(file: string): TextEntity {
  const entity = entities(file).find((item) => item instanceof TextEntity);
  expect(entity).toBeInstanceOf(TextEntity);
  return entity as TextEntity;
}

function firstLine(file: string): Line {
  const entity = entities(file).find((item) => item instanceof Line);
  expect(entity).toBeInstanceOf(Line);
  return entity as Line;
}

describe("acad-ts editing", () => {
  test("edits text and writes a new DXF without native tools", () => {
    const dir = `/tmp/dwgcli-acad-edit-${Date.now()}-${Math.random()}`;
    const input = join(dir, "input.dxf");
    const output = join(dir, "output.dxf");
    const ids = writeSampleDxf(input);

    const result = editWithAcadTs({
      input,
      output,
      operations: [{ kind: "setText", entityId: ids.text, text: "New label" }],
    });

    expect(result.backend).toBe("acad-ts");
    expect(firstText(output).value).toBe("New label");
  });

  test("edits text and writes a new DWG without native tools", () => {
    const dir = `/tmp/dwgcli-acad-edit-${Date.now()}-${Math.random()}`;
    const input = join(dir, "input.dwg");
    const output = join(dir, "output.dwg");
    const ids = writeSampleDwg(input);

    editWithAcadTs({
      input,
      output,
      operations: [{ kind: "setText", entityId: ids.text, text: "New label" }],
    });

    expect(firstText(output).value).toBe("New label");
  });

  test("matches entity handles by decimal or hex string", () => {
    const dir = `/tmp/dwgcli-acad-edit-${Date.now()}-${Math.random()}`;
    const input = join(dir, "input.dxf");
    const output = join(dir, "output.dxf");
    const ids = writeSampleDxf(input);

    editWithAcadTs({
      input,
      output,
      operations: [{ kind: "setText", entityId: ids.textHex, text: "Hex" }],
    });

    expect(firstText(output).value).toBe("Hex");
  });

  test("sets layer, moves entities, and deletes entities", () => {
    const dir = `/tmp/dwgcli-acad-edit-${Date.now()}-${Math.random()}`;
    const input = join(dir, "input.dxf");
    const output = join(dir, "output.dxf");
    const ids = writeSampleDxf(input);

    editWithAcadTs({
      input,
      output,
      operations: [
        { kind: "setLayer", entityId: ids.line, layer: "A-WALL" },
        { kind: "move", entityId: ids.line, dx: 5, dy: -2 },
        { kind: "delete", entityId: ids.text },
      ],
    });

    const line = firstLine(output);
    expect(line.layer.name).toBe("A-WALL");
    expect(line.startPoint).toMatchObject({ x: 5, y: -2, z: 0 });
    expect(line.endPoint).toMatchObject({ x: 15, y: -2, z: 0 });
    expect(entities(output).some((item) => item instanceof TextEntity)).toBe(
      false,
    );
  });

  test("edits visual properties, transforms, copies, and matches properties", () => {
    const dir = `/tmp/dwgcli-acad-edit-${Date.now()}-${Math.random()}`;
    const input = join(dir, "input.dxf");
    const output = join(dir, "output.dxf");
    const ids = writeSampleDxf(input);

    editWithAcadTs({
      input,
      output,
      operations: [
        {
          kind: "setColor",
          entityId: ids.line,
          color: { mode: "rgb", r: 255, g: 0, b: 0 },
        },
        { kind: "setLineType", entityId: ids.line, lineType: "DASHED" },
        {
          kind: "setLineWeight",
          entityId: ids.line,
          weight: LineWeightType.W50,
        },
        { kind: "setVisibility", entityId: ids.line, visible: false },
        { kind: "rotate", entityId: ids.line, angleDegrees: 90 },
        { kind: "scale", entityId: ids.line, factor: 2 },
        { kind: "copy", entityId: ids.line, dx: 1, dy: 1 },
        { kind: "matchProperties", entityId: ids.text, sourceId: ids.line },
      ],
    });

    const lines = entities(output).filter(
      (item) => item instanceof Line,
    ) as Line[];
    expect(lines).toHaveLength(2);
    expect(lines[0].color.getRgb()).toEqual([255, 0, 0]);
    expect(lines[0].lineType.name).toBe("DASHED");
    expect(lines[0].lineWeight).toBe(LineWeightType.W50);
    expect(lines[0].isInvisible).toBe(true);
    expect(Math.round(lines[0].endPoint.x)).toBe(0);
    expect(Math.round(lines[0].endPoint.y)).toBe(20);
    expect(firstText(output).layer.name).toBe(lines[0].layer.name);
    expect(firstText(output).color.getRgb()).toEqual([255, 0, 0]);
  });

  test("adds common CAD entities", () => {
    const dir = `/tmp/dwgcli-acad-edit-${Date.now()}-${Math.random()}`;
    const input = join(dir, "input.dxf");
    const output = join(dir, "output.dxf");
    writeSampleDxf(input);

    editWithAcadTs({
      input,
      output,
      operations: [
        { kind: "addPoint", at: { x: 1, y: 1 }, layer: "A-NEW" },
        { kind: "addLine", from: { x: 0, y: 0 }, to: { x: 1, y: 0 } },
        { kind: "addCircle", center: { x: 2, y: 2 }, radius: 3 },
        {
          kind: "addArc",
          center: { x: 3, y: 3 },
          radius: 2,
          startAngleDegrees: 0,
          endAngleDegrees: 90,
        },
        { kind: "addText", text: "New text", at: { x: 4, y: 4 }, height: 2 },
        {
          kind: "addMText",
          text: "New mtext",
          at: { x: 5, y: 5 },
          height: 2,
          width: 10,
        },
        {
          kind: "addPolyline",
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
          ],
          closed: true,
        },
      ],
    });

    const all = entities(output);
    expect(all.some((item) => item instanceof Point)).toBe(true);
    expect(all.filter((item) => item instanceof Line)).toHaveLength(2);
    expect(all.some((item) => item instanceof Circle)).toBe(true);
    expect(
      all.some(
        (item) => item instanceof TextEntity && item.value === "New text",
      ),
    ).toBe(true);
    expect(
      all.some((item) => item instanceof MText && item.value === "New mtext"),
    ).toBe(true);
    const polyline = all.find(
      (item) => item instanceof LwPolyline,
    ) as LwPolyline;
    expect(polyline.vertices).toHaveLength(3);
  });

  test("throws friendly errors for invalid edit targets", () => {
    const dir = `/tmp/dwgcli-acad-edit-${Date.now()}-${Math.random()}`;
    const input = join(dir, "input.dxf");
    const output = join(dir, "output.dxf");
    const ids = writeSampleDxf(input);

    expect(() =>
      editWithAcadTs({
        input,
        output,
        operations: [{ kind: "setText", entityId: ids.line, text: "Nope" }],
      }),
    ).toThrow("Entity is not editable text");

    expect(() =>
      editWithAcadTs({
        input,
        output,
        operations: [{ kind: "delete", entityId: "missing" }],
      }),
    ).toThrow("Entity not found: missing");
  });

  test("refuses accidental in-place edits", () => {
    const dir = `/tmp/dwgcli-acad-edit-${Date.now()}-${Math.random()}`;
    const input = join(dir, "input.dxf");
    const ids = writeSampleDxf(input);

    expect(() =>
      editWithAcadTs({
        input,
        output: input,
        operations: [{ kind: "delete", entityId: ids.text }],
      }),
    ).toThrow("Refusing to edit in place");
  });
});
