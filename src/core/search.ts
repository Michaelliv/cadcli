import MiniSearch from "minisearch";
import type { DwgDocument, DwgEntity, EntityFilter } from "../types.js";
import { type LoadOptions, loadDrawing } from "./drawing.js";
import {
  type CachedSearchDoc,
  computeDrawingFingerprint,
  loadSearchCache,
  saveSearchCache,
} from "./search-cache.js";

export interface DwgSearchOptions extends EntityFilter {
  query?: string;
  limit?: number;
  score?: boolean;
  snippets?: boolean;
  cwd?: string;
}

export interface DwgSearchResult {
  entityId: string;
  type: string;
  layer?: string;
  score: number;
  matches: string[];
  entity: DwgEntity;
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (["string", "number", "boolean", "bigint"].includes(typeof value)) {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(stringifyValue).join(" ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => `${key} ${stringifyValue(val)}`)
      .join(" ");
  }
  return "";
}

function textFields(entity: DwgEntity): string[] {
  const values = [
    entity.id,
    entity.type,
    entity.layer ?? "",
    String(entity.data.text ?? ""),
    String(entity.data.value ?? ""),
    String(entity.data.name ?? ""),
    String(entity.data.blockName ?? ""),
    String(entity.data.block_name ?? ""),
    stringifyValue(entity.data),
  ];
  return values.filter((v) => v.trim().length > 0);
}

function buildDocs(doc: DwgDocument): CachedSearchDoc[] {
  return doc.entities.map((entity, id) => ({
    id,
    entityId: entity.id,
    type: entity.type,
    layer: entity.layer,
    text: textFields(entity).join(" "),
    entity,
  }));
}

function buildIndex(docs: CachedSearchDoc[]): MiniSearch<CachedSearchDoc> {
  const index = new MiniSearch<CachedSearchDoc>({
    fields: ["entityId", "type", "layer", "text"],
    storeFields: ["entityId", "type", "layer", "text"],
    searchOptions: {
      boost: { entityId: 3, type: 2, layer: 2, text: 1 },
      fuzzy: 0.2,
      prefix: true,
    },
  });
  index.addAll(docs);
  return index;
}

function filterDoc(doc: CachedSearchDoc, opts: DwgSearchOptions): boolean {
  if (opts.type && doc.type.toLowerCase() !== opts.type.toLowerCase())
    return false;
  if (opts.layer && doc.layer?.toLowerCase() !== opts.layer.toLowerCase())
    return false;
  return true;
}

function matchesFor(doc: CachedSearchDoc, query: string | undefined): string[] {
  if (!query) return [];
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const chunks = textFields(doc.entity as DwgEntity);
  return chunks
    .filter((chunk) => {
      const lower = chunk.toLowerCase();
      return terms.some((term) => lower.includes(term));
    })
    .slice(0, 5);
}

export async function searchDrawing(
  file: string,
  opts: DwgSearchOptions = {},
  loadOpts: LoadOptions = {},
): Promise<DwgSearchResult[]> {
  const fingerprint = computeDrawingFingerprint(file);
  const cached = loadSearchCache(file, fingerprint, opts.cwd);
  let docs: CachedSearchDoc[];
  let index: MiniSearch<CachedSearchDoc>;

  if (cached) {
    docs = cached.docs;
    index = MiniSearch.loadJSON<CachedSearchDoc>(cached.index, {
      fields: ["entityId", "type", "layer", "text"],
      storeFields: ["entityId", "type", "layer", "text"],
      searchOptions: {
        boost: { entityId: 3, type: 2, layer: 2, text: 1 },
        fuzzy: 0.2,
        prefix: true,
      },
    });
  } else {
    docs = buildDocs(await loadDrawing(file, loadOpts));
    index = buildIndex(docs);
    saveSearchCache(
      file,
      { fingerprint, index: JSON.stringify(index), docs },
      opts.cwd,
    );
  }

  const query = opts.query?.trim();
  const raw = query
    ? index.search(query)
    : docs.map((doc) => ({ ...doc, score: 1 }));
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  const limit = opts.limit ?? 30;

  return raw
    .map((result) => {
      const doc = byId.get(result.id as number) ?? (result as CachedSearchDoc);
      return {
        entityId: doc.entityId,
        type: doc.type,
        layer: doc.layer,
        score: Math.round((Number(result.score) || 1) * 10) / 10,
        matches: opts.snippets === false ? [] : matchesFor(doc, query),
        entity: doc.entity as DwgEntity,
      };
    })
    .filter((result) => filterDoc(resultToCachedDoc(result), opts))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function resultToCachedDoc(result: DwgSearchResult): CachedSearchDoc {
  return {
    id: 0,
    entityId: result.entityId,
    type: result.type,
    layer: result.layer,
    text: "",
    entity: result.entity,
  };
}
