import { describe, expect, test } from "bun:test";
import type { DwgDocument } from "../types.js";
import { queryDrawing, querySchema, querySchemaTables } from "./query.js";

async function hasBetterSqlite(): Promise<boolean> {
  try {
    const { default: Database } = await import("better-sqlite3");
    const db = new Database(":memory:");
    db.close();
    return true;
  } catch {
    return false;
  }
}

const testWithSqlite = (await hasBetterSqlite()) ? test : test.skip;

const doc: DwgDocument = {
  summary: {
    file: "office.dwg",
    format: "DWG",
    version: "AC1032",
    counts: { entities: 3, layers: 2, blocks: 1, unsupported: 0 },
  },
  metadata: {
    codePage: "ansi_1255",
    textNormalization: { applied: ["hebrew-keyboard"], entitiesChanged: 1 },
  },
  layers: [
    { name: "A-TEXT", entityCount: 1 },
    { name: "ריהוט", entityCount: 1 },
  ],
  blocks: [{ name: "chair4", entityCount: 10 }],
  entities: [
    {
      id: "1",
      type: "MTEXT",
      layer: "A-TEXT",
      data: {
        text: "חדר צוות 8",
        insertionPoint: { x: 10.2, y: 20.8 },
        textStyle: "gil",
        textStyleFile: "gil.shx",
      },
    },
    {
      id: "2",
      type: "INSERT",
      layer: "ריהוט",
      data: { blockName: "chair4", insertionPoint: { x: 30, y: 40 } },
    },
    { id: "3", type: "LINE", layer: "0", data: {} },
  ],
  unsupported: [],
  raw: {},
};

describe("query engine", () => {
  test("describes the query schema for humans and JSON consumers", () => {
    expect(querySchema()).toContain("texts");
    expect(querySchema()).toContain("inserts");
    expect(
      querySchemaTables().find((table) => table.name === "texts"),
    ).toMatchObject({
      description:
        "TEXT and MTEXT entities with normalized text and insertion points.",
      columns: expect.arrayContaining([
        { name: "text", type: "text" },
        { name: "x", type: "real" },
      ]),
    });
  });

  testWithSqlite(
    "exposes narrow CAD tables and convenience tables",
    async () => {
      const rooms = await queryDrawing(
        doc,
        "select id, text, layer, round(x) as x from texts where text like 'חדר%'",
      );
      expect(rooms.columns).toEqual(["id", "text", "layer", "x"]);
      expect(rooms.rows).toEqual([
        { id: "1", text: "חדר צוות 8", layer: "A-TEXT", x: 10 },
      ]);

      const inserts = await queryDrawing(
        doc,
        "select id, block_name, x, y from inserts where block_name = 'chair4'",
      );
      expect(inserts.rows).toEqual([
        { id: "2", block_name: "chair4", x: 30, y: 40 },
      ]);
    },
  );

  test("rejects non-read-only SQL", async () => {
    await expect(queryDrawing(doc, "delete from entities")).rejects.toThrow(
      "SELECT statement",
    );
  });
});
