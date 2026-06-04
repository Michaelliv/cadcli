import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { DrawingReader } from "../types.js";
import {
  filterEntities,
  getEntities,
  getThumbnail,
  loadDrawing,
  toSvg,
} from "./drawing.js";
import { DwgCliError } from "./errors.js";
import { normalizeDocument } from "./normalize.js";
import { searchDrawing } from "./search.js";
import { renderSvg } from "./svg.js";

let dir = "";
let file = "";

const raw = {
  version: "AC1032",
  codePage: "ansi_1255",
  layers: [{ name: "0" }, { name: "A-WALL" }],
  blocks: [{ name: "Door", entities: [{ type: "LINE" }] }],
  entities: [
    {
      handle: "10",
      type: "LINE",
      layer: "0",
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
    },
    {
      handle: "11",
      type: "CIRCLE",
      layer: "A-WALL",
      center: { x: 5, y: 5 },
      radius: 2,
    },
    {
      handle: "12",
      type: "MTEXT",
      layer: "A-TEXT",
      text: "jsr muu, 8",
      textStyleFile: "gil.shx",
    },
    { handle: "13", type: "SPLINE", layer: "A-WALL", custom: () => "ignored" },
  ],
};

const parser: DrawingReader = {
  async parse() {
    return raw;
  },
};

beforeEach(() => {
  dir = `/tmp/dwgcli-test-${Date.now()}-${Math.random()}`;
  mkdirSync(dir, { recursive: true });
  file = join(dir, "sample.dwg");
  writeFileSync(file, "fake");
});

afterEach(() => {});

describe("drawing core", () => {
  test("loads and normalizes drawings", async () => {
    const doc = await loadDrawing(file, { reader: parser });
    expect(doc.summary.format).toBe("DWG");
    expect(doc.summary.version).toBe("AC1032");
    expect(doc.metadata.codePage).toBe("ansi_1255");
    expect(doc.metadata.textNormalization).toEqual({
      applied: ["hebrew-keyboard"],
      entitiesChanged: 1,
    });
    expect(doc.entities[2].data.text).toBe("חדר צוות 8");
    expect(doc.layers.map((l) => l.name)).toEqual(["0", "A-TEXT", "A-WALL"]);
    expect(doc.blocks[0].name).toBe("Door");
    expect(doc.summary.counts).toEqual({
      entities: 4,
      layers: 3,
      blocks: 1,
      unsupported: 1,
    });
    expect(doc.summary.bounds).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 5 });
  });

  test("normalizes alternate raw database shapes", () => {
    const doc = normalizeDocument("alt.dxf", "DXF", {
      headerVersion: "AC1018",
      encoding: "utf-8",
      Layers: [{ Name: "Layer A" }],
      blockHeaders: [{ Name: "Block A", Entities: [{ type: "LINE" }] }],
      Objects: [
        {
          Handle: "H1",
          Type: "TEXT",
          Layer: "Layer A",
          color: 7,
          point: { X: 1, Y: 2 },
        },
        { objectType: "point", layer_name: "Layer B", points: [[3, 4]] },
        null,
      ],
    });
    expect(doc.summary.version).toBe("AC1018");
    expect(doc.metadata.codePage).toBe("utf-8");
    expect(doc.summary.format).toBe("DXF");
    expect(doc.layers.map((layer) => layer.name)).toEqual([
      "Layer A",
      "Layer B",
    ]);
    expect(doc.blocks[0]).toMatchObject({ name: "Block A", entityCount: 1 });
    expect(doc.blocks[0].entities?.[0]).toMatchObject({ type: "LINE" });
    expect(doc.entities[0].id).toBe("H1");
    expect(doc.entities[2].type).toBe("UNKNOWN");
  });

  test("filters entities by type and layer", async () => {
    const entities = await getEntities(
      file,
      { type: "circle", layer: "a-wall" },
      { reader: parser },
    );
    expect(entities).toHaveLength(1);
    expect(entities[0].id).toBe("11");
    expect(
      filterEntities((await loadDrawing(file, { reader: parser })).entities, {
        limit: 2,
      }),
    ).toHaveLength(2);
  });

  test("throws friendly errors for unknown layer/type", async () => {
    await expect(
      getEntities(file, { layer: "missing" }, { reader: parser }),
    ).rejects.toThrow("Layer not found");
    await expect(
      getEntities(file, { type: "arc" }, { reader: parser }),
    ).rejects.toThrow("Entity type not found");
  });

  test("searches entities with ranking and filters", async () => {
    const results = await searchDrawing(
      file,
      { query: "circle", layer: "A-WALL", score: true },
      { reader: parser },
    );
    expect(results).toHaveLength(1);
    expect(results[0].entityId).toBe("11");
    expect(results[0].matches.length).toBeGreaterThan(0);

    const noQuery = await searchDrawing(
      file,
      { limit: 2, snippets: false },
      { reader: parser },
    );
    expect(noQuery).toHaveLength(2);
    expect(noQuery[0].matches).toEqual([]);

    const blankQuery = await searchDrawing(
      file,
      { query: "   ", limit: 1 },
      { reader: parser },
    );
    expect(blankQuery[0].matches).toEqual([]);

    const wrongType = await searchDrawing(
      file,
      { query: "circle", type: "LINE" },
      { reader: parser },
    );
    expect(wrongType).toEqual([]);

    const wrongLayer = await searchDrawing(
      file,
      { query: "circle", layer: "0" },
      { reader: parser },
    );
    expect(wrongLayer).toEqual([]);
  });

  test("search caches indexes in the standard cache directory", async () => {
    const cacheDir = join(dir, "cache");
    let parses = 0;
    const countingParser: DrawingReader = {
      async parse() {
        parses++;
        return raw;
      },
    };
    await searchDrawing(
      file,
      { query: "circle", cacheDir },
      { reader: countingParser },
    );
    await searchDrawing(
      file,
      { query: "circle", cacheDir },
      { reader: countingParser },
    );
    expect(parses).toBe(1);
    expect(existsSync(join(cacheDir, "search"))).toBe(true);
  });

  test("search ignores stale index hits that are missing from cached docs", async () => {
    const cacheDir = join(dir, "stale-cache");
    await searchDrawing(
      file,
      { query: "circle", cacheDir },
      { reader: parser },
    );
    const searchDir = join(cacheDir, "search");
    const [cacheFile] = readdirSync(searchDir);
    const cachePath = join(searchDir, cacheFile);
    const cached = JSON.parse(readFileSync(cachePath, "utf-8"));
    writeFileSync(cachePath, JSON.stringify({ ...cached, docs: [] }));

    const results = await searchDrawing(
      file,
      { query: "circle", cacheDir },
      { reader: parser },
    );
    expect(results).toEqual([]);
  });

  test("renders common entities to SVG and reports unsupported", async () => {
    const result = await toSvg(file, { reader: parser });
    expect(result.svg).toContain("<line");
    expect(result.svg).toContain("<circle");
    expect(result.unsupported).toBe(2);
  });

  test("renders SVG edge cases", () => {
    const result = renderSvg({
      summary: {
        file: "edge.dwg",
        format: "DWG",
        counts: { entities: 7, layers: 0, blocks: 0, unsupported: 0 },
      },
      layers: [],
      blocks: [],
      unsupported: [],
      metadata: {},
      raw: {},
      entities: [
        { id: "1", type: "LINE", data: {} },
        { id: "2", type: "CIRCLE", data: {} },
        {
          id: "2b",
          type: "CIRCLE",
          data: { center: { x: 2, y: 3 }, radius: 4 },
        },
        {
          id: "3",
          type: "POLYLINE",
          data: {
            vertices: [
              { x: 0, y: 0 },
              { X: 1, Y: 1 },
            ],
          },
        },
        { id: "4", type: "LWPOLYLINE", data: { vertices: [] } },
        {
          id: "5",
          type: "TEXT",
          data: { position: { x: 1, y: 2 }, text: 'A&B<"' },
        },
        { id: "6", type: "MTEXT", data: {} },
        { id: "7", type: "INSERT", data: {} },
      ],
    });
    expect(result.bounds).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
    expect(result.svg).toContain("<circle");
    expect(result.svg).toContain("<polyline");
    expect(result.svg).toContain("A&amp;B&lt;&quot;");
    expect(result.unsupported).toBe(5);
  });

  test("renders simple block insert geometry when requested", () => {
    const result = renderSvg(
      {
        summary: {
          file: "blocks.dwg",
          format: "DWG",
          counts: { entities: 1, layers: 0, blocks: 1, unsupported: 0 },
        },
        layers: [],
        blocks: [
          {
            name: "Door",
            entityCount: 1,
            entities: [
              {
                id: "b1",
                type: "LINE",
                data: { start: { x: 0, y: 0 }, end: { x: 2, y: 0 } },
              },
            ],
          },
        ],
        unsupported: [],
        metadata: {},
        raw: {},
        entities: [
          {
            id: "1",
            type: "INSERT",
            data: { blockName: "Door", insertionPoint: { x: 10, y: 20 } },
          },
        ],
      },
      { expandInserts: true },
    );

    expect(result.svg).toContain('x1="10"');
    expect(result.svg).toContain('x2="12"');
    expect(result.unsupported).toBe(0);
  });

  test("renders SVG with layer filters", () => {
    const result = renderSvg(
      {
        summary: {
          file: "layers.dwg",
          format: "DWG",
          counts: { entities: 3, layers: 0, blocks: 0, unsupported: 0 },
        },
        layers: [],
        blocks: [],
        unsupported: [],
        metadata: {},
        raw: {},
        entities: [
          {
            id: "1",
            type: "LINE",
            layer: "wall",
            data: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
          },
          {
            id: "2",
            type: "LINE",
            layer: "furniture",
            data: { start: { x: 2, y: 2 }, end: { x: 3, y: 3 } },
          },
          { id: "3", type: "INSERT", layer: "wall", data: {} },
        ],
      },
      { layers: ["wall"] },
    );

    expect(result.svg).toContain('x1="0"');
    expect(result.svg).not.toContain('x1="2"');
    expect(result.unsupported).toBe(1);
  });

  test("reports unavailable and missing thumbnails", async () => {
    await expect(getThumbnail(file, { reader: parser })).rejects.toThrow(
      "Thumbnail extraction is not available",
    );
    const nullThumbnailParser: DrawingReader = {
      async parse() {
        return raw;
      },
      async thumbnail() {
        return null;
      },
    };
    await expect(
      getThumbnail(file, { reader: nullThumbnailParser }),
    ).rejects.toThrow("No thumbnail was found");
  });

  test("reports file not found and unsupported extensions", async () => {
    await expect(
      loadDrawing(join(dir, "missing.dwg"), { reader: parser }),
    ).rejects.toThrow("File not found");
    const txt = join(dir, "sample.txt");
    writeFileSync(txt, "fake");
    await expect(loadDrawing(txt, { reader: parser })).rejects.toBeInstanceOf(
      DwgCliError,
    );
  });
});
