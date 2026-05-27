import MiniSearch from "minisearch";
import type { DwgDocument, DwgEntity, EntityFilter } from "../types.js";
import { type LoadOptions, loadDrawing } from "./drawing.js";
import {
  type CachedSearchDoc,
  computeDrawingFingerprint,
  loadSearchCache,
  saveSearchCache,
} from "./search-cache.js";

const SEARCH_FIELDS = ["entityId", "type", "layer", "text"] as const;
const STORE_FIELDS = ["entityId", "type", "layer", "text"] as const;
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

type SearchDoc = CachedSearchDoc & { entity: DwgEntity };

interface SearchHit {
  id: number;
  score?: number;
}

function createSearchIndex(): MiniSearch<SearchDoc> {
  return new MiniSearch<SearchDoc>({
    fields: [...SEARCH_FIELDS],
    storeFields: [...STORE_FIELDS],
    searchOptions: {
      boost: { entityId: 3, type: 2, layer: 2, text: 1 },
      fuzzy: 0.2,
      prefix: true,
    },
  });
}

function loadSearchIndex(indexJson: string): MiniSearch<SearchDoc> {
  return MiniSearch.loadJSON<SearchDoc>(indexJson, {
    fields: [...SEARCH_FIELDS],
    storeFields: [...STORE_FIELDS],
    searchOptions: {
      boost: { entityId: 3, type: 2, layer: 2, text: 1 },
      fuzzy: 0.2,
      prefix: true,
    },
  });
}

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

function buildDocs(doc: DwgDocument): SearchDoc[] {
  return doc.entities.map((entity, id) => ({
    id,
    entityId: entity.id,
    type: entity.type,
    layer: entity.layer,
    text: entitySearchFields(entity).join(" "),
    entity,
  }));
}

function buildIndex(docs: SearchDoc[]): MiniSearch<SearchDoc> {
  const index = createSearchIndex();
  index.addAll(docs);
  return index;
}

function matchesFilter(doc: SearchDoc, opts: DwgSearchOptions): boolean {
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

async function loadSearchCorpus(
  file: string,
  opts: DwgSearchOptions,
  loadOpts: LoadOptions,
): Promise<{ docs: SearchDoc[]; index: MiniSearch<SearchDoc> }> {
  const fingerprint = computeDrawingFingerprint(file);
  const cached = loadSearchCache(file, fingerprint, opts.cacheDir);

  if (cached) {
    return {
      docs: cached.docs as SearchDoc[],
      index: loadSearchIndex(cached.index),
    };
  }

  const docs = buildDocs(await loadDrawing(file, loadOpts));
  const index = buildIndex(docs);
  saveSearchCache(
    file,
    { fingerprint, index: JSON.stringify(index), docs },
    opts.cacheDir,
  );
  return { docs, index };
}

function resultScore(result: { score?: number }): number {
  return Math.round((Number(result.score) || 1) * 10) / 10;
}

async function searchWithMiniSearch(
  file: string,
  opts: DwgSearchOptions = {},
  loadOpts: LoadOptions = {},
): Promise<DwgSearchResult[]> {
  const { docs, index } = await loadSearchCorpus(file, opts, loadOpts);
  const query = opts.query?.trim();
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  const raw: SearchHit[] = query
    ? index.search(query).map((result) => ({
        id: Number(result.id),
        score: result.score,
      }))
    : docs.map((doc) => ({ id: doc.id, score: 1 }));

  return raw
    .map((result) => ({ result, doc: byId.get(result.id) }))
    .filter((item): item is { result: SearchHit; doc: SearchDoc } =>
      Boolean(item.doc),
    )
    .filter(({ doc }) => matchesFilter(doc, opts))
    .map(({ result, doc }) => ({
      entityId: doc.entityId,
      type: doc.type,
      layer: doc.layer,
      score: resultScore(result),
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
    searchWithMiniSearch(file, opts, loadOpts)
  );
}
