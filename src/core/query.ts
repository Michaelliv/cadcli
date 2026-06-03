import type { DwgDocument, DwgEntity } from "../types.js";
import { EXIT_UNAVAILABLE, EXIT_USER_ERROR } from "../utils/exit-codes.js";
import { DwgCliError } from "./errors.js";

export interface QuerySchemaColumn {
  name: string;
  type: "text" | "integer" | "real";
}

export interface QuerySchemaTable {
  name: string;
  description: string;
  columns: QuerySchemaColumn[];
}

const QUERY_SCHEMA_TABLES: QuerySchemaTable[] = [
  {
    name: "summary",
    description: "One-row drawing summary.",
    columns: [
      { name: "file", type: "text" },
      { name: "format", type: "text" },
      { name: "version", type: "text" },
      { name: "entity_count", type: "integer" },
      { name: "layer_count", type: "integer" },
      { name: "block_count", type: "integer" },
      { name: "unsupported_count", type: "integer" },
    ],
  },
  {
    name: "metadata",
    description: "Document metadata and normalization notes.",
    columns: [
      { name: "key", type: "text" },
      { name: "value", type: "text" },
    ],
  },
  {
    name: "layers",
    description: "Drawing layers and entity counts.",
    columns: [
      { name: "name", type: "text" },
      { name: "entity_count", type: "integer" },
    ],
  },
  {
    name: "blocks",
    description: "Block definitions and definition entity counts.",
    columns: [
      { name: "name", type: "text" },
      { name: "entity_count", type: "integer" },
    ],
  },
  {
    name: "entities",
    description: "All normalized model-space entities, projected narrowly.",
    columns: [
      { name: "id", type: "text" },
      { name: "type", type: "text" },
      { name: "layer", type: "text" },
      { name: "color", type: "text" },
    ],
  },
  {
    name: "texts",
    description:
      "TEXT and MTEXT entities with normalized text and insertion points.",
    columns: [
      { name: "id", type: "text" },
      { name: "type", type: "text" },
      { name: "layer", type: "text" },
      { name: "text", type: "text" },
      { name: "x", type: "real" },
      { name: "y", type: "real" },
      { name: "text_style", type: "text" },
      { name: "text_style_file", type: "text" },
    ],
  },
  {
    name: "inserts",
    description: "Placed block instances with insertion points.",
    columns: [
      { name: "id", type: "text" },
      { name: "layer", type: "text" },
      { name: "block_name", type: "text" },
      { name: "x", type: "real" },
      { name: "y", type: "real" },
    ],
  },
];

type SqliteDatabase = {
  exec(sql: string): void;
  close(): void;
  function(name: string, fn: (...args: unknown[]) => unknown): void;
  prepare(sql: string): {
    readonly?: boolean;
    columns?: () => Array<{ name: string }>;
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): unknown;
  };
};

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
}

export function querySchema(): string {
  return QUERY_SCHEMA_TABLES.map(
    (table) =>
      `${table.name}(${table.columns.map((column) => column.name).join(", ")})`,
  ).join("\n");
}

export function querySchemaTables(): QuerySchemaTable[] {
  return QUERY_SCHEMA_TABLES;
}

async function openMemoryDatabase(): Promise<SqliteDatabase> {
  try {
    const { default: Database } = await import("better-sqlite3");
    return new Database(":memory:") as SqliteDatabase;
  } catch {
    throw new DwgCliError(
      "cadcli query requires the optional better-sqlite3 dependency.",
      "QUERY_UNAVAILABLE",
      EXIT_UNAVAILABLE,
    );
  }
}

function sqlValue(value: unknown): string | number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" || typeof value === "string") return value;
  return String(value);
}

function point(entity: DwgEntity): { x: number | null; y: number | null } {
  const value =
    entity.data.insertionPoint ?? entity.data.position ?? entity.data.point;
  if (!value || typeof value !== "object") return { x: null, y: null };
  const rec = value as Record<string, unknown>;
  const x = Number(rec.x ?? rec.X);
  const y = Number(rec.y ?? rec.Y);
  return {
    x: Number.isFinite(x) ? x : null,
    y: Number.isFinite(y) ? y : null,
  };
}

function textValue(entity: DwgEntity): string | null {
  const value = entity.data.text ?? entity.data.value ?? entity.data.Text;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function blockName(entity: DwgEntity): string | null {
  const value =
    entity.data.blockName ?? entity.data.block_name ?? entity.data.name;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function createSchema(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE summary (
      file TEXT,
      format TEXT,
      version TEXT,
      entity_count INTEGER,
      layer_count INTEGER,
      block_count INTEGER,
      unsupported_count INTEGER
    );
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE layers (name TEXT PRIMARY KEY, entity_count INTEGER);
    CREATE TABLE blocks (name TEXT PRIMARY KEY, entity_count INTEGER);
    CREATE TABLE entities (id TEXT PRIMARY KEY, type TEXT, layer TEXT, color TEXT);
    CREATE TABLE texts (
      id TEXT PRIMARY KEY,
      type TEXT,
      layer TEXT,
      text TEXT,
      x REAL,
      y REAL,
      text_style TEXT,
      text_style_file TEXT
    );
    CREATE TABLE inserts (
      id TEXT PRIMARY KEY,
      layer TEXT,
      block_name TEXT,
      x REAL,
      y REAL
    );
  `);
}

function registerFunctions(db: SqliteDatabase): void {
  db.function("regexp", (pattern, value) => {
    if (typeof pattern !== "string" || value === null || value === undefined) {
      return 0;
    }
    try {
      return new RegExp(pattern, "u").test(String(value)) ? 1 : 0;
    } catch {
      return 0;
    }
  });
}

function insertDocument(db: SqliteDatabase, doc: DwgDocument): void {
  db.prepare("INSERT INTO summary VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    doc.summary.file,
    doc.summary.format,
    doc.summary.version ?? null,
    doc.summary.counts.entities,
    doc.summary.counts.layers,
    doc.summary.counts.blocks,
    doc.summary.counts.unsupported,
  );

  const insertMetadata = db.prepare("INSERT INTO metadata VALUES (?, ?)");
  if (doc.metadata.codePage)
    insertMetadata.run("code_page", doc.metadata.codePage);
  if (doc.metadata.textNormalization) {
    insertMetadata.run(
      "text_normalization_applied",
      doc.metadata.textNormalization.applied.join(","),
    );
    insertMetadata.run(
      "text_normalization_entities_changed",
      doc.metadata.textNormalization.entitiesChanged,
    );
  }

  const insertLayer = db.prepare("INSERT INTO layers VALUES (?, ?)");
  const insertBlock = db.prepare("INSERT INTO blocks VALUES (?, ?)");
  const insertEntity = db.prepare("INSERT INTO entities VALUES (?, ?, ?, ?)");
  const insertText = db.prepare(
    "INSERT INTO texts VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const insertInsert = db.prepare("INSERT INTO inserts VALUES (?, ?, ?, ?, ?)");

  db.exec("BEGIN");
  try {
    for (const layer of doc.layers)
      insertLayer.run(layer.name, layer.entityCount);

    for (const block of doc.blocks)
      insertBlock.run(block.name, block.entityCount);

    for (const entity of doc.entities) {
      insertEntity.run(
        entity.id,
        entity.type,
        entity.layer ?? null,
        sqlValue(entity.color),
      );

      const { x, y } = point(entity);
      const text = textValue(entity);
      if ((entity.type === "TEXT" || entity.type === "MTEXT") && text) {
        insertText.run(
          entity.id,
          entity.type,
          entity.layer ?? null,
          text,
          x,
          y,
          sqlValue(entity.data.textStyle),
          sqlValue(entity.data.textStyleFile),
        );
      }

      if (entity.type === "INSERT") {
        insertInsert.run(
          entity.id,
          entity.layer ?? null,
          blockName(entity),
          x,
          y,
        );
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function ensureSelectQuery(sql: string): void {
  const trimmed = sql.trim();
  if (!/^(select|with)\b/i.test(trimmed)) {
    throw new DwgCliError(
      "Query SQL must be a SELECT statement.",
      "INVALID_QUERY_SQL",
      EXIT_USER_ERROR,
    );
  }
}

function ensureReadOnlyStatement(statement: { readonly?: boolean }): void {
  if (statement.readonly === false) {
    throw new DwgCliError(
      "Query SQL must be read-only.",
      "INVALID_QUERY_SQL",
      EXIT_USER_ERROR,
    );
  }
}

export async function queryDrawing(
  doc: DwgDocument,
  sql: string,
): Promise<QueryResult> {
  ensureSelectQuery(sql);
  const db = await openMemoryDatabase();
  try {
    createSchema(db);
    registerFunctions(db);
    insertDocument(db, doc);
    const statement = db.prepare(sql);
    ensureReadOnlyStatement(statement);
    const rows = statement.all() as Record<string, unknown>[];
    const columns =
      statement.columns?.().map((column) => column.name) ??
      Object.keys(rows[0] ?? {});
    return { columns, rows };
  } finally {
    db.close();
  }
}
