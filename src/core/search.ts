import type { DwgDocument, DwgEntity, EntityFilter } from "../types.js";
import { type LoadOptions, loadDrawing } from "./drawing.js";
import {
  type CachedSearchDoc,
  computeDrawingFingerprint,
  loadSearchCache,
  saveSearchCache,
} from "./search-cache.js";

const DEFAULT_LIMIT = 30;
const MAX_MATCHES = 5;

export interface DwgSearchOptions extends EntityFilter {
  query?: string;
  limit?: number;
  score?: boolean;
  snippets?: boolean;
  cacheDir?: string;
}

export interface DwgSearchResult {
  entityId: string;
  type: string;
  layer?: string;
  score: number;
  matches: string[];
  entity: DwgEntity;
}

type ScanDoc = CachedSearchDoc & { entity: DwgEntity };

export function stringifySearchValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (["string", "number", "boolean", "bigint"].includes(typeof value)) {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(stringifySearchValue).join(" ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => `${key} ${stringifySearchValue(val)}`)
      .join(" ");
  }
  return "";
}

export function entitySearchFields(entity: DwgEntity): string[] {
  const values = [
    entity.id,
    entity.type,
    entity.layer ?? "",
    String(entity.data.text ?? ""),
    String(entity.data.value ?? ""),
    String(entity.data.name ?? ""),
    String(entity.data.blockName ?? ""),
    String(entity.data.block_name ?? ""),
    stringifySearchValue(entity.data),
  ];
  return values.filter((value) => value.trim().length > 0);
}

function buildScanDocs(doc: DwgDocument): ScanDoc[] {
  return doc.entities.map((entity, id) => ({
    id,
    entityId: entity.id,
    type: entity.type,
    layer: entity.layer,
    text: entitySearchFields(entity).join(" "),
    entity,
  }));
}

async function loadScanCorpus(
  file: string,
  opts: DwgSearchOptions,
  loadOpts: LoadOptions,
): Promise<ScanDoc[]> {
  const fingerprint = computeDrawingFingerprint(file);
  const cached = loadSearchCache(file, fingerprint, opts.cacheDir);
  if (cached) return cached.docs as ScanDoc[];

  const docs = buildScanDocs(await loadDrawing(file, loadOpts));
  saveSearchCache(file, { fingerprint, index: "scan", docs }, opts.cacheDir);
  return docs;
}

function matchesFilter(doc: ScanDoc, opts: DwgSearchOptions): boolean {
  if (opts.type && doc.type.toLowerCase() !== opts.type.toLowerCase()) {
    return false;
  }
  if (opts.layer && doc.layer?.toLowerCase() !== opts.layer.toLowerCase()) {
    return false;
  }
  return true;
}

export function searchMatchesFor(
  entity: DwgEntity,
  query: string | undefined,
): string[] {
  if (!query) return [];
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  return entitySearchFields(entity)
    .filter((chunk) => {
      const lower = chunk.toLowerCase();
      return terms.some((term) => lower.includes(term));
    })
    .slice(0, MAX_MATCHES);
}

function queryTerms(query: string | undefined): string[] {
  return query?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
}

function scanScore(doc: ScanDoc, terms: string[]): number {
  if (terms.length === 0) return 1;
  const entityId = doc.entityId.toLowerCase();
  const type = doc.type.toLowerCase();
  const layer = doc.layer?.toLowerCase() ?? "";
  const text = doc.text.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (entityId.includes(term)) score += 3;
    if (type.includes(term)) score += 2;
    if (layer.includes(term)) score += 2;
    if (text.includes(term)) score += 1;
  }
  return score;
}

function resultScore(score: number): number {
  return Math.round((score || 1) * 10) / 10;
}

async function searchWithScan(
  file: string,
  opts: DwgSearchOptions = {},
  loadOpts: LoadOptions = {},
): Promise<DwgSearchResult[]> {
  const docs = await loadScanCorpus(file, opts, loadOpts);
  const query = opts.query?.trim();
  const terms = queryTerms(query);

  return docs
    .filter((doc) => matchesFilter(doc, opts))
    .map((doc) => ({ doc, score: scanScore(doc, terms) }))
    .filter(({ score }) => terms.length === 0 || score > 0)
    .map(({ doc, score }) => ({
      entityId: doc.entityId,
      type: doc.type,
      layer: doc.layer,
      score: resultScore(score),
      matches:
        opts.snippets === false ? [] : searchMatchesFor(doc.entity, query),
      entity: doc.entity,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit ?? DEFAULT_LIMIT);
}

async function searchWithDiskIndex(
  file: string,
  opts: DwgSearchOptions,
  loadOpts: LoadOptions,
): Promise<DwgSearchResult[] | null> {
  const { searchWithSqlite } = await import("./sqlite-search.js");
  return searchWithSqlite(file, opts, loadOpts);
}

export async function searchDrawing(
  file: string,
  opts: DwgSearchOptions = {},
  loadOpts: LoadOptions = {},
): Promise<DwgSearchResult[]> {
  return (
    (await searchWithDiskIndex(file, opts, loadOpts)) ??
    searchWithScan(file, opts, loadOpts)
  );
}
