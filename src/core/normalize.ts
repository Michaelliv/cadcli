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

function getName(value: unknown, fallback: string): string {
  const rec = asRecord(value);
  return String(
    rec.name ?? rec.Name ?? rec.layerName ?? rec.LayerName ?? fallback,
  );
}

function getEntityType(value: unknown): string {
  const rec = asRecord(value);
  return String(
    rec.type ??
      rec.Type ??
      rec.objectType ??
      rec.entityType ??
      rec._type ??
      "UNKNOWN",
  ).toUpperCase();
}

function getLayer(value: unknown): string | undefined {
  const rec = asRecord(value);
  const layer = rec.layer ?? rec.Layer ?? rec.layerName ?? rec.layer_name;
  return layer === undefined || layer === null ? undefined : String(layer);
}

function pointFrom(value: unknown): { x: number; y: number } | null {
  const rec = asRecord(value);
  const x = Number(rec.x ?? rec.X ?? rec[0]);
  const y = Number(rec.y ?? rec.Y ?? rec[1]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function collectEntityPoints(entity: DwgEntity): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const rec = entity.data;
  for (const key of [
    "start",
    "end",
    "center",
    "insertionPoint",
    "position",
    "point",
  ] as const) {
    const p = pointFrom(rec[key]);
    if (p) points.push(p);
  }
  for (const key of ["vertices", "points"] as const) {
    for (const item of asArray(rec[key])) {
      const p = pointFrom(item);
      if (p) points.push(p);
    }
  }
  return points;
}

export function computeBounds(entities: DwgEntity[]): DwgBounds | undefined {
  const all = entities.flatMap(collectEntityPoints);
  if (all.length === 0) return undefined;
  return {
    minX: Math.min(...all.map((p) => p.x)),
    minY: Math.min(...all.map((p) => p.y)),
    maxX: Math.max(...all.map((p) => p.x)),
    maxY: Math.max(...all.map((p) => p.y)),
  };
}

export function normalizeDocument(
  file: string,
  format: DwgFormat,
  raw: unknown,
): DwgDocument {
  const root = asRecord(raw);
  const rawEntities = firstArray(root, [
    "entities",
    "Entities",
    "objects",
    "Objects",
  ]);
  const entities: DwgEntity[] = rawEntities.map((item, index) => {
    const rec = asRecord(item);
    return {
      id: String(rec.id ?? rec.handle ?? rec.Handle ?? index + 1),
      type: getEntityType(rec),
      layer: getLayer(rec),
      color: rec.color as string | number | undefined,
      data: rec,
    };
  });

  const unsupported = entities.filter(
    (e) =>
      ![
        "LINE",
        "CIRCLE",
        "ARC",
        "LWPOLYLINE",
        "POLYLINE",
        "TEXT",
        "MTEXT",
        "POINT",
      ].includes(e.type),
  );
  const rawLayers = firstArray(root, ["layers", "Layers"]);
  const layerNames = new Set<string>(
    rawLayers.map((l, i) => getName(l, `Layer ${i + 1}`)),
  );
  for (const entity of entities) if (entity.layer) layerNames.add(entity.layer);
  const layers: DwgLayer[] = [...layerNames].sort().map((name) => ({
    name,
    entityCount: entities.filter((e) => e.layer === name).length,
  }));

  const rawBlocks = firstArray(root, ["blocks", "Blocks", "blockHeaders"]);
  const blocks: DwgBlock[] = rawBlocks.map((block, index) => {
    const rec = asRecord(block);
    const blockEntities = asArray(rec.entities ?? rec.Entities);
    return {
      name: getName(block, `Block ${index + 1}`),
      entityCount: blockEntities.length,
    };
  });

  const summary: DwgSummary = {
    file: basename(file),
    format,
    version:
      String(root.version ?? root.headerVersion ?? root.dwgVersion ?? "") ||
      undefined,
    counts: {
      entities: entities.length,
      layers: layers.length,
      blocks: blocks.length,
      unsupported: unsupported.length,
    },
    bounds: computeBounds(entities),
  };

  return { summary, layers, blocks, entities, unsupported, raw };
}
