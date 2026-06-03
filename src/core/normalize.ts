import { basename } from "node:path";
import type {
  DwgBlock,
  DwgBounds,
  DwgDocument,
  DwgEntity,
  DwgFormat,
  DwgLayer,
  DwgSummary,
} from "../types.js";

const ENTITY_ARRAY_FIELDS = ["entities", "Entities", "objects", "Objects"];
const LAYER_ARRAY_FIELDS = ["layers", "Layers"];
const BLOCK_ARRAY_FIELDS = ["blocks", "Blocks", "blockHeaders"];
const POINT_FIELDS = [
  "start",
  "end",
  "center",
  "insertionPoint",
  "position",
  "point",
] as const;
const POINT_LIST_FIELDS = ["vertices", "points"] as const;
const SUPPORTED_ENTITY_TYPES = new Set([
  "LINE",
  "CIRCLE",
  "ARC",
  "LWPOLYLINE",
  "POLYLINE",
  "TEXT",
  "MTEXT",
  "POINT",
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstArray(raw: Record<string, unknown>, names: string[]): unknown[] {
  for (const name of names) {
    const value = raw[name];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function stringField(
  rec: Record<string, unknown>,
  names: string[],
): string | undefined {
  for (const name of names) {
    const value = rec[name];
    if (value !== undefined && value !== null && String(value) !== "") {
      return String(value);
    }
  }
  return undefined;
}

function getName(value: unknown, fallback: string): string {
  return (
    stringField(asRecord(value), ["name", "Name", "layerName", "LayerName"]) ??
    fallback
  );
}

function getEntityType(value: unknown): string {
  return (
    stringField(asRecord(value), [
      "type",
      "Type",
      "objectType",
      "entityType",
      "_type",
    ]) ?? "UNKNOWN"
  ).toUpperCase();
}

function getLayer(value: unknown): string | undefined {
  return stringField(asRecord(value), [
    "layer",
    "Layer",
    "layerName",
    "layer_name",
  ]);
}

function pointFrom(value: unknown): { x: number; y: number } | null {
  const rec = asRecord(value);
  const x = Number(rec.x ?? rec.X ?? rec[0]);
  const y = Number(rec.y ?? rec.Y ?? rec[1]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function collectEntityPoints(entity: DwgEntity): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (const key of POINT_FIELDS) {
    const point = pointFrom(entity.data[key]);
    if (point) points.push(point);
  }
  for (const key of POINT_LIST_FIELDS) {
    for (const item of asArray(entity.data[key])) {
      const point = pointFrom(item);
      if (point) points.push(point);
    }
  }
  return points;
}

function normalizeEntity(item: unknown, index: number): DwgEntity {
  const rec = asRecord(item);
  return {
    id: String(rec.id ?? rec.handle ?? rec.Handle ?? index + 1),
    type: getEntityType(rec),
    layer: getLayer(rec),
    color: rec.color as string | number | undefined,
    data: rec,
  };
}

function normalizeLayers(
  rawLayers: unknown[],
  entities: DwgEntity[],
): DwgLayer[] {
  const counts = new Map<string, number>();
  for (const [index, layer] of rawLayers.entries()) {
    counts.set(getName(layer, `Layer ${index + 1}`), 0);
  }
  for (const entity of entities) {
    if (!entity.layer) continue;
    counts.set(entity.layer, (counts.get(entity.layer) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, entityCount]) => ({ name, entityCount }));
}

function normalizeBlocks(rawBlocks: unknown[]): DwgBlock[] {
  return rawBlocks.map((block, index) => {
    const rec = asRecord(block);
    return {
      name: getName(block, `Block ${index + 1}`),
      entityCount: asArray(rec.entities ?? rec.Entities).length,
    };
  });
}

export function computeBounds(entities: DwgEntity[]): DwgBounds | undefined {
  const points = entities.flatMap(collectEntityPoints);
  if (points.length === 0) return undefined;
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}

export function normalizeDocument(
  file: string,
  format: DwgFormat,
  raw: unknown,
): DwgDocument {
  const root = asRecord(raw);
  const entities = firstArray(root, ENTITY_ARRAY_FIELDS).map(normalizeEntity);
  const unsupported = entities.filter(
    (entity) => !SUPPORTED_ENTITY_TYPES.has(entity.type),
  );
  const layers = normalizeLayers(
    firstArray(root, LAYER_ARRAY_FIELDS),
    entities,
  );
  const blocks = normalizeBlocks(firstArray(root, BLOCK_ARRAY_FIELDS));
  const version = stringField(root, ["version", "headerVersion", "dwgVersion"]);
  const metadata = {
    codePage: stringField(root, ["codePage", "encoding"]),
  };

  const summary: DwgSummary = {
    file: basename(file),
    format,
    version,
    counts: {
      entities: entities.length,
      layers: layers.length,
      blocks: blocks.length,
      unsupported: unsupported.length,
    },
    bounds: computeBounds(entities),
  };

  return { summary, metadata, layers, blocks, entities, unsupported, raw };
}
