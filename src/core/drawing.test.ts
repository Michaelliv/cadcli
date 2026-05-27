import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { initStore } from "../store.js";
import type { DwgParser } from "../types.js";
import { getEntities, getThumbnail, loadDrawing, toSvg } from "./drawing.js";
import { DwgCliError } from "./errors.js";
import { searchDrawing } from "./search.js";

let dir = "";
let file = "";

const raw = {
  version: "AC1032",
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
    { handle: "12", type: "SPLINE", layer: "A-WALL" },
  ],
};

const parser: DwgParser = {
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
    const doc = await loadDrawing(file, { parser });
    expect(doc.summary.format).toBe("DWG");
    expect(doc.summary.version).toBe("AC1032");
    expect(doc.layers.map((l) => l.name)).toEqual(["0", "A-WALL"]);
    expect(doc.blocks[0].name).toBe("Door");
    expect(doc.summary.counts).toEqual({
      entities: 3,
      layers: 2,
      blocks: 1,
      unsupported: 1,
    });
    expect(doc.summary.bounds).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 5 });
  });

  test("filters entities by type and layer", async () => {
    const entities = await getEntities(
      file,
      { type: "circle", layer: "a-wall" },
      { parser },
    );
    expect(entities).toHaveLength(1);
    expect(entities[0].id).toBe("11");
  });

  test("throws friendly errors for unknown layer/type", async () => {
    await expect(
      getEntities(file, { layer: "missing" }, { parser }),
    ).rejects.toThrow("Layer not found");
    await expect(
      getEntities(file, { type: "arc" }, { parser }),
    ).rejects.toThrow("Entity type not found");
  });

  test("searches entities with MiniSearch-style ranking and filters", async () => {
    const results = await searchDrawing(
      file,
      { query: "circle", layer: "A-WALL", score: true },
      { parser },
    );
    expect(results).toHaveLength(1);
    expect(results[0].entityId).toBe("11");
    expect(results[0].matches.length).toBeGreaterThan(0);
  });

  test("search caches indexes in .dwg/cache when initialized", async () => {
    initStore(dir);
    let parses = 0;
    const countingParser: DwgParser = {
      async parse() {
        parses++;
        return raw;
      },
    };
    await searchDrawing(
      file,
      { query: "circle", cwd: dir },
      { parser: countingParser },
    );
    await searchDrawing(
      file,
      { query: "circle", cwd: dir },
      { parser: countingParser },
    );
    expect(parses).toBe(1);
    expect(existsSync(join(dir, ".dwg", "cache"))).toBe(true);
  });

  test("renders common entities to SVG and reports unsupported", async () => {
    const result = await toSvg(file, { parser });
    expect(result.svg).toContain("<line");
    expect(result.svg).toContain("<circle");
    expect(result.unsupported).toBe(1);
  });

  test("reports unavailable thumbnails", async () => {
    await expect(getThumbnail(file, { parser })).rejects.toThrow(
      "Thumbnail extraction is not available",
    );
  });

  test("reports file not found and unsupported extensions", async () => {
    await expect(
      loadDrawing(join(dir, "missing.dwg"), { parser }),
    ).rejects.toThrow("File not found");
    const txt = join(dir, "sample.txt");
    writeFileSync(txt, "fake");
    await expect(loadDrawing(txt, { parser })).rejects.toBeInstanceOf(
      DwgCliError,
    );
  });
});
