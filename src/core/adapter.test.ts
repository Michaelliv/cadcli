import { beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  AcadTsReader,
  arrayBufferFor,
  normalizeAcadDocument,
} from "./adapter.js";

let dir = "";
let file = "";

beforeEach(() => {
  dir = `/tmp/cadcli-adapter-${Date.now()}-${Math.random()}`;
  mkdirSync(dir, { recursive: true });
  file = join(dir, "x.dwg");
  writeFileSync(file, "fake");
});

class Line {
  handle = 10;
  layer = { name: "A-WALL" };
  color = { index: 7 };
  startPoint = { x: 0, y: 1 };
  endPoint = { x: 2, y: 3, z: 4 };
}

class Circle {
  handle = 11;
  layer = { name: "A-DOOR" };
  color = "red";
  center = { x: 5, y: 6 };
  radius = 2;
}

class Arc {
  handle = 12;
  center = { x: 0, y: 0 };
  radius = 3;
  startAngle = 0;
  endAngle = 1;
}

class LwPolyline {
  handle = 13;
  vertices = [{ location: { x: 1, y: 2 } }, { x: 3, y: 4 }];
}

class TextEntity {
  handle = 14;
  layer = { name: "A-TEXT" };
  value = "Conference";
  insertPoint = { x: 7, y: 8 };
  _style = { name: "Standard", filename: "arial.ttf" };
}

class MText {
  handle = 15;
  plainText = "Room 20";
  insertPoint = { x: 9, y: 10 };
  _style = { _name: "gil", filename: "gil.shx" };
}

class Insert {
  handle = 16;
  block = { name: "DOOR_SINGLE" };
  insertPoint = { x: 11, y: 12 };
}

class ProxyEntity {
  handle = 17;
}

function fakeAcadDocument() {
  const modelEntities = [
    new Line(),
    new Circle(),
    new Arc(),
    new LwPolyline(),
    new TextEntity(),
    new MText(),
    new Insert(),
    new ProxyEntity(),
  ];
  return {
    header: { versionString: "AC1032", codePage: "ansi_1255" },
    layers: [{ name: "A-WALL" }, { name: "A-TEXT" }],
    blockRecords: [
      { name: "*Model_Space", entities: modelEntities },
      { name: "DOOR_SINGLE", entities: [new Line()] },
    ],
    modelSpace: { entities: modelEntities },
  };
}

describe("AcadTsReader", () => {
  test("normalizes acad-ts documents for cadcli", () => {
    const raw = normalizeAcadDocument(
      fakeAcadDocument() as Parameters<typeof normalizeAcadDocument>[0],
    ) as {
      version: string;
      codePage?: string;
      layers: unknown[];
      blocks: unknown[];
      entities: Array<Record<string, unknown>>;
    };

    expect(raw.version).toBe("AC1032");
    expect(raw.codePage).toBe("ansi_1255");
    expect(raw.layers).toHaveLength(2);
    expect(raw.blocks).toHaveLength(2);
    expect(raw.entities.map((entity) => entity.type)).toEqual([
      "LINE",
      "CIRCLE",
      "ARC",
      "LWPOLYLINE",
      "TEXT",
      "MTEXT",
      "INSERT",
      "PROXY",
    ]);
    expect(raw.entities[0].start).toEqual({ x: 0, y: 1 });
    expect(raw.entities[0].end).toEqual({ x: 2, y: 3, z: 4 });
    expect(raw.entities[0].color).toBe(7);
    expect(raw.entities[1].color).toBe("red");
    expect(raw.entities[1].radius).toBe(2);
    expect(raw.entities[3].vertices).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
    expect(raw.entities[4].text).toBe("Conference");
    expect(raw.entities[4].textStyle).toBe("Standard");
    expect(raw.entities[4].textStyleFile).toBe("arial.ttf");
    expect(raw.entities[5].text).toBe("Room 20");
    expect(raw.entities[5].textStyle).toBe("gil");
    expect(raw.entities[5].textStyleFile).toBe("gil.shx");
    expect(raw.entities[6].blockName).toBe("DOOR_SINGLE");

    const sparse = normalizeAcadDocument({
      header: { version: 0 },
      layers: null,
      blockRecords: null,
      modelSpace: null,
    } as Parameters<typeof normalizeAcadDocument>[0]) as {
      version: string;
      codePage?: string;
      layers: unknown[];
      blocks: unknown[];
      entities: unknown[];
    };
    expect(sparse).toEqual({
      version: "0",
      codePage: undefined,
      layers: [],
      blocks: [],
      entities: [],
    });
  });

  test("converts byte views to exact array buffers", () => {
    const source = new Uint8Array([0, 1, 2, 3]);
    const view = source.subarray(1, 3);
    expect([...new Uint8Array(arrayBufferFor(view))]).toEqual([1, 2]);
  });

  test("parses DXF input and reports unsupported thumbnails and parse errors", async () => {
    const reader = new AcadTsReader();
    const dxf = `0
SECTION
2
HEADER
9
$ACADVER
1
AC1032
0
ENDSEC
0
SECTION
2
ENTITIES
0
LINE
8
0
10
0
20
0
11
1
21
1
0
ENDSEC
0
EOF
`;

    const parsed = await reader.parse(
      file,
      new TextEncoder().encode(dxf),
      "DXF",
    );
    expect(parsed).toBeObject();
    await expect(reader.thumbnail()).rejects.toThrow(
      "Thumbnail extraction is not available through acad-ts",
    );
    await expect(
      reader.parse(file, new Uint8Array([1, 2, 3]), "DWG"),
    ).rejects.toThrow("Could not parse DWG");
  });
});
