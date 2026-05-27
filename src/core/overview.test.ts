import { describe, expect, test } from "bun:test";
import type { DwgDocument } from "../types.js";
import { createDrawingOverview } from "./overview.js";

const doc: DwgDocument = {
  summary: {
    file: "office.dwg",
    format: "DWG",
    counts: { entities: 7, layers: 3, blocks: 1, unsupported: 0 },
  },
  layers: [
    { name: "A-TEXT", entityCount: 3 },
    { name: "A-WALL", entityCount: 2 },
  ],
  blocks: [{ name: "DOOR_SINGLE", entityCount: 1 }],
  entities: [
    {
      id: "1",
      type: "TEXT",
      layer: "A-TEXT",
      data: { text: "Conference Room", url: "https://example.com" },
    },
    {
      id: "2",
      type: "MTEXT",
      layer: "A-TEXT",
      data: { value: "Conference Room", hash: "abcdef123456" },
    },
    {
      id: "3",
      type: "TEXT",
      layer: "A-TEXT",
      data: { Text: "Open Office" },
    },
    {
      id: "4",
      type: "LINE",
      layer: "A-WALL",
      data: { name: "Wall-Partition" },
    },
    {
      id: "5",
      type: "INSERT",
      layer: "A-WALL",
      data: { blockName: "DOOR_SINGLE" },
    },
    {
      id: "6",
      type: "INSERT",
      data: { block_name: "CHAIR_OFFICE" },
    },
    {
      id: "7",
      type: "POINT",
      layer: "0",
      data: { value: "", custom: () => "x" },
    },
  ],
  unsupported: [],
  raw: {},
};

describe("drawing overview", () => {
  test("builds categorized search vocabulary", () => {
    const result = createDrawingOverview(doc, { keywords: 5, samples: 2 });

    expect(result.summary.file).toBe("office.dwg");
    expect(result.layers[0].name).toBe("A-TEXT");
    expect(result.layers[0].types).toContain("TEXT");
    expect(result.layers[0].keywords).toContain("conference room");
    expect(result.entityTypes).toContainEqual({ type: "TEXT", count: 2 });
    expect(result.blocks).toContainEqual({
      name: "DOOR_SINGLE",
      definitions: 1,
      references: 1,
    });
    expect(result.blocks).toContainEqual({
      name: "CHAIR_OFFICE",
      definitions: 0,
      references: 1,
    });
    expect(result.text.keywords).toContain("conference room");
    expect(result.text.samples).toEqual(["Conference Room", "Open Office"]);
    expect(result.searchHints).toContain("conference room");
  });

  test("handles sparse drawings", () => {
    const result = createDrawingOverview({
      summary: {
        file: "empty.dxf",
        format: "DXF",
        counts: { entities: 0, layers: 0, blocks: 0, unsupported: 0 },
      },
      layers: [],
      blocks: [],
      entities: [],
      unsupported: [],
      raw: {},
    });

    expect(result.layers).toEqual([]);
    expect(result.entityTypes).toEqual([]);
    expect(result.blocks).toEqual([]);
    expect(result.text).toEqual({ keywords: [], samples: [] });
    expect(result.searchHints).toEqual([]);
  });
});
