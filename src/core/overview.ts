import type { DwgDocument, DwgEntity, DwgSummary } from "../types.js";
import { type LoadOptions, loadDrawing } from "./drawing.js";

export interface OverviewLayer {
  name: string;
  entities: number;
  types: string[];
  keywords: string[];
}

export interface OverviewEntityType {
  type: string;
  count: number;
}

export interface OverviewBlock {
  name: string;
  definitions: number;
  references: number;
}

export interface OverviewText {
  keywords: string[];
  samples: string[];
}

export interface DrawingOverview {
  summary: DwgSummary;
  layers: OverviewLayer[];
  entityTypes: OverviewEntityType[];
  blocks: OverviewBlock[];
  text: OverviewText;
  searchHints: string[];
}

export interface DrawingOverviewOptions {
  keywords?: number;
  samples?: number;
}

interface WeightedText {
  text: string;
  weight: number;
}

const DEFAULT_KEYWORDS = 8;
const DEFAULT_SAMPLES = 8;
const MAX_LAYER_TYPES = 6;
const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "are",
  "was",
  "were",
  "floor",
  "plan",
  "drawing",
]);

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (["string", "number", "boolean", "bigint"].includes(typeof value)) {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(stringifyValue).join(" ");
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map(stringifyValue)
      .join(" ");
  }
  return "";
}

function cleanText(text: string): string {
  return text
    .replace(/https?:\/\/[^\s)>\]]+/g, " ")
    .replace(/\b[a-f0-9]{8,}\b/gi, " ")
    .replace(/[_-]+/g, " ");
}

function tokens(text: string): string[] {
  return (
    cleanText(text)
      .toLowerCase()
      .match(/[\p{L}\p{N}]{2,}/gu) ?? []
  )
    .filter((term) => !STOP_WORDS.has(term))
    .filter((term) => !/^\d+$/.test(term));
}

function terms(text: string): string[] {
  const words = tokens(text);
  const result = [...words];
  for (let index = 0; index < words.length - 1; index++) {
    const left = words[index];
    const right = words[index + 1];
    if (left !== right) result.push(`${left} ${right}`);
  }
  return result;
}

function addTerms(
  freq: Map<string, number>,
  text: string,
  weight: number,
): void {
  for (const term of terms(text)) {
    freq.set(term, (freq.get(term) ?? 0) + weight);
  }
}

function topTerms(freq: Map<string, number>, limit: number): string[] {
  const selected: string[] = [];
  const suppressed = new Set<string>();
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  for (const [term] of sorted) {
    if (selected.length >= limit) break;
    if (suppressed.has(term)) continue;
    if (term.includes(" ") && (freq.get(term) ?? 0) < 2) continue;
    selected.push(term);
    if (term.includes(" ")) {
      for (const part of term.split(" ")) suppressed.add(part);
    }
  }
  return selected;
}

function dataText(entity: DwgEntity): string {
  return [
    entity.id,
    entity.type,
    entity.layer ?? "",
    String(entity.data.text ?? ""),
    String(entity.data.value ?? ""),
    String(entity.data.name ?? ""),
    String(entity.data.blockName ?? ""),
    String(entity.data.block_name ?? ""),
    stringifyValue(entity.data),
  ].join(" ");
}

function visibleText(entity: DwgEntity): string | undefined {
  const text = entity.data.text ?? entity.data.value ?? entity.data.Text;
  if (text === undefined || text === null) return undefined;
  const trimmed = String(text).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function blockName(entity: DwgEntity): string | undefined {
  const value =
    entity.data.blockName ?? entity.data.block_name ?? entity.data.name;
  if (value === undefined || value === null) return undefined;
  const name = String(value).trim();
  return name.length > 0 ? name : undefined;
}

function frequencyBy<T extends string | undefined>(
  values: T[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function sortedCounts(counts: Map<string, number>): [string, number][] {
  return [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
}

function layerKeywords(
  entities: DwgEntity[],
  documentFrequency: Map<string, number>,
  totalLayers: number,
  maxKeywords: number,
): string[] {
  const weighted: WeightedText[] = entities.map((entity) => ({
    text: dataText(entity),
    weight: entity.type === "TEXT" || entity.type === "MTEXT" ? 3 : 1,
  }));
  const freq = new Map<string, number>();
  for (const source of weighted) addTerms(freq, source.text, source.weight);
  const scored = new Map<string, number>();
  for (const [term, tf] of freq) {
    const idf = Math.log(1 + totalLayers / (documentFrequency.get(term) ?? 1));
    scored.set(term, tf * idf);
  }
  return topTerms(scored, maxKeywords);
}

function buildDocumentFrequency(
  layerEntities: Map<string, DwgEntity[]>,
): Map<string, number> {
  const df = new Map<string, number>();
  for (const entities of layerEntities.values()) {
    const seen = new Set<string>();
    for (const entity of entities) {
      for (const term of terms(dataText(entity))) seen.add(term);
    }
    for (const term of seen) df.set(term, (df.get(term) ?? 0) + 1);
  }
  return df;
}

function uniquePush(
  items: string[],
  value: string | undefined,
  limit: number,
): void {
  if (!value || items.length >= limit || items.includes(value)) return;
  items.push(value);
}

export function createDrawingOverview(
  doc: DwgDocument,
  opts: DrawingOverviewOptions = {},
): DrawingOverview {
  const maxKeywords = opts.keywords ?? DEFAULT_KEYWORDS;
  const maxSamples = opts.samples ?? DEFAULT_SAMPLES;
  const layerEntities = new Map<string, DwgEntity[]>();

  for (const layer of doc.layers) layerEntities.set(layer.name, []);
  for (const entity of doc.entities) {
    const layer = entity.layer ?? "(no layer)";
    if (!layerEntities.has(layer)) layerEntities.set(layer, []);
    layerEntities.get(layer)?.push(entity);
  }

  const documentFrequency = buildDocumentFrequency(layerEntities);
  const totalLayers = Math.max(layerEntities.size, 1);
  const layers: OverviewLayer[] = [...layerEntities.entries()].map(
    ([name, entities]) => {
      const typeCounts = sortedCounts(frequencyBy(entities.map((e) => e.type)));
      return {
        name,
        entities: entities.length,
        types: typeCounts.slice(0, MAX_LAYER_TYPES).map(([type]) => type),
        keywords: layerKeywords(
          entities,
          documentFrequency,
          totalLayers,
          maxKeywords,
        ),
      };
    },
  );

  layers.sort(
    (a, b) => b.entities - a.entities || a.name.localeCompare(b.name),
  );

  const entityTypes = sortedCounts(
    frequencyBy(doc.entities.map((e) => e.type)),
  ).map(([type, count]) => ({ type, count }));

  const references = frequencyBy(doc.entities.map(blockName));
  const definitionCounts = frequencyBy(doc.blocks.map((block) => block.name));
  const blockNames = new Set([
    ...references.keys(),
    ...definitionCounts.keys(),
  ]);
  const blocks = [...blockNames]
    .map((name) => ({
      name,
      definitions: definitionCounts.get(name) ?? 0,
      references: references.get(name) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.references - a.references ||
        b.definitions - a.definitions ||
        a.name.localeCompare(b.name),
    );

  const textFreq = new Map<string, number>();
  const textSamples: string[] = [];
  for (const entity of doc.entities) {
    const text = visibleText(entity);
    if (!text) continue;
    uniquePush(textSamples, text, maxSamples);
    addTerms(textFreq, text, 1);
  }

  const searchHints: string[] = [];
  for (const term of topTerms(textFreq, maxKeywords))
    uniquePush(searchHints, term, maxKeywords);
  for (const layer of layers) uniquePush(searchHints, layer.name, maxKeywords);
  for (const block of blocks) uniquePush(searchHints, block.name, maxKeywords);
  for (const type of entityTypes)
    uniquePush(searchHints, type.type, maxKeywords);

  return {
    summary: doc.summary,
    layers,
    entityTypes,
    blocks,
    text: {
      keywords: topTerms(textFreq, maxKeywords),
      samples: textSamples,
    },
    searchHints,
  };
}

export async function getOverview(
  file: string,
  opts: DrawingOverviewOptions = {},
  loadOpts: LoadOptions = {},
): Promise<DrawingOverview> {
  return createDrawingOverview(await loadDrawing(file, loadOpts), opts);
}
