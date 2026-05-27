import { existsSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { getCacheDir } from "../store.js";
import type { DwgDocument, DwgEntity } from "../types.js";
import { type LoadOptions, loadDrawing } from "./drawing.js";
import {
  type DwgSearchOptions,
  type DwgSearchResult,
  entitySearchFields,
  searchMatchesFor,
} from "./search.js";
import { computeDrawingFingerprint } from "./search-cache.js";

const require = createRequire(import.meta.url);
const SEARCH_SCHEMA_VERSION = 1;

type SqliteDatabase = {
  exec(sql: string): void;
  close(): void;
  prepare(sql: string): {
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): unknown;
  };
};

interface IndexedEntity {
  id: number;
  entityId: string;
  type: string;
  layer?: string;
  text: string;
  entity: DwgEntity;
}

interface SearchRow {
  id: number;
  entity_id: string;
  type: string;
  layer: string | null;
  text: string;
  entity_json: string;
  score: number | null;
}

function sqliteSearchDatabasePath(file: string, cacheDir?: string): string {
  const root = cacheDir ?? getCacheDir();
  const key = computeDrawingFingerprint(file);
  return join(root, "search", `${basename(file)}-${key}.search.sqlite`);
}

async function openSqliteDatabase(
  path: string,
): Promise<SqliteDatabase | null> {
  try {
    const Database = require("better-sqlite3") as new (
      path: string,
    ) => SqliteDatabase;
    return new Database(path);
  } catch {
    return null;
  }
}

function ensureSqliteSchema(db: SqliteDatabase): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS entities (
      id INTEGER PRIMARY KEY,
      entity_id TEXT NOT NULL,
      type TEXT NOT NULL,
      layer TEXT,
      text TEXT NOT NULL,
      entity_json TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(
      entity_id,
      type,
      layer,
      text
    );
  `);
}

function sqliteCacheIsValid(db: SqliteDatabase, fingerprint: string): boolean {
  const row = db
    .prepare("SELECT value FROM meta WHERE key = ?")
    .get("fingerprint") as { value?: string } | undefined;
  const version = db
    .prepare("SELECT value FROM meta WHERE key = ?")
    .get("schema_version") as { value?: string } | undefined;
  return (
    row?.value === fingerprint &&
    version?.value === String(SEARCH_SCHEMA_VERSION)
  );
}

function resetSqliteDatabase(path: string): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    const target = `${path}${suffix}`;
    if (existsSync(target)) rmSync(target, { force: true });
  }
}

function indexedEntities(doc: DwgDocument): IndexedEntity[] {
  return doc.entities.map((entity, id) => ({
    id,
    entityId: entity.id,
    type: entity.type,
    layer: entity.layer,
    text: entitySearchFields(entity).join(" "),
    entity,
  }));
}

function writeSqliteSearchDatabase(
  db: SqliteDatabase,
  fingerprint: string,
  doc: DwgDocument,
): SqliteDatabase {
  ensureSqliteSchema(db);
  const insertMeta = db.prepare(
    "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  const insertEntity = db.prepare(`
    INSERT INTO entities (id, entity_id, type, layer, text, entity_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertFts = db.prepare(`
    INSERT INTO entities_fts (rowid, entity_id, type, layer, text)
    VALUES (?, ?, ?, ?, ?)
  `);

  db.exec("BEGIN");
  try {
    insertMeta.run("schema_version", String(SEARCH_SCHEMA_VERSION));
    insertMeta.run("fingerprint", fingerprint);
    for (const entity of indexedEntities(doc)) {
      insertEntity.run(
        entity.id,
        entity.entityId,
        entity.type,
        entity.layer ?? null,
        entity.text,
        JSON.stringify(entity.entity),
      );
      insertFts.run(
        entity.id,
        entity.entityId,
        entity.type,
        entity.layer ?? "",
        entity.text,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    db.close();
    throw error;
  }
  return db;
}

async function openSqliteSearchDatabase(
  file: string,
  opts: DwgSearchOptions,
  loadOpts: LoadOptions,
): Promise<SqliteDatabase | null> {
  const fingerprint = computeDrawingFingerprint(file);
  const path = sqliteSearchDatabasePath(file, opts.cacheDir);
  if (existsSync(path)) {
    try {
      const db = await openSqliteDatabase(path);
      if (!db) return null;
      ensureSqliteSchema(db);
      if (sqliteCacheIsValid(db, fingerprint)) return db;
      db.close();
    } catch {
      resetSqliteDatabase(path);
    }
  }
  resetSqliteDatabase(path);
  mkdirSync(dirname(path), { recursive: true });
  const db = await openSqliteDatabase(path);
  if (!db) return null;
  return writeSqliteSearchDatabase(
    db,
    fingerprint,
    await loadDrawing(file, loadOpts),
  );
}

function matchesFilterSql(opts: DwgSearchOptions): string {
  const clauses: string[] = [];
  if (opts.type) clauses.push("lower(e.type) = lower(:type)");
  if (opts.layer) clauses.push("lower(e.layer) = lower(:layer)");
  return clauses.length > 0 ? ` AND ${clauses.join(" AND ")}` : "";
}

function ftsQuery(query: string): string {
  return query
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)
    .map((term) => `"${term.replaceAll('"', '""')}"`)
    .join(" OR ");
}

function parseEntity(json: string): DwgEntity | null {
  try {
    const value = JSON.parse(json) as DwgEntity;
    if (
      !value ||
      typeof value.id !== "string" ||
      typeof value.type !== "string"
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function resultScore(score: number | null): number {
  return Math.round((Number(score) || 1) * 10) / 10;
}

function rowToResult(
  row: SearchRow,
  query: string | undefined,
): DwgSearchResult | null {
  const entity = parseEntity(row.entity_json);
  if (!entity) return null;
  return {
    entityId: row.entity_id,
    type: row.type,
    layer: row.layer ?? undefined,
    score: resultScore(row.score),
    matches: searchMatchesFor(entity, query),
    entity,
  };
}

export async function searchWithSqlite(
  file: string,
  opts: DwgSearchOptions,
  loadOpts: LoadOptions,
): Promise<DwgSearchResult[] | null> {
  const db = await openSqliteSearchDatabase(file, opts, loadOpts);
  if (!db) return null;

  const query = opts.query?.trim();
  const limit = opts.limit ?? 30;
  const filter = matchesFilterSql(opts);
  const params: Record<string, string | number> = {
    query: query ? ftsQuery(query) : "",
    limit,
  };
  if (opts.type) params.type = opts.type;
  if (opts.layer) params.layer = opts.layer;

  const rows = query
    ? (db
        .prepare(`
          SELECT e.id, e.entity_id, e.type, e.layer, e.text, e.entity_json,
                 -bm25(entities_fts, 3.0, 2.0, 2.0, 1.0) AS score
          FROM entities_fts
          JOIN entities e ON e.id = entities_fts.rowid
          WHERE entities_fts MATCH :query${filter}
          ORDER BY bm25(entities_fts, 3.0, 2.0, 2.0, 1.0)
          LIMIT :limit
        `)
        .all(params) as SearchRow[])
    : (db
        .prepare(`
          SELECT e.id, e.entity_id, e.type, e.layer, e.text, e.entity_json,
                 1 AS score
          FROM entities e
          WHERE 1 = 1${filter}
          ORDER BY e.id
          LIMIT :limit
        `)
        .all(params) as SearchRow[]);

  db.close();
  return rows
    .map((row) => {
      const result = rowToResult(row, query);
      return result && opts.snippets === false
        ? { ...result, matches: [] }
        : result;
    })
    .filter((result): result is DwgSearchResult => Boolean(result));
}
