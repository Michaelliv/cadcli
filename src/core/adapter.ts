import type { CadDocument } from "@node-projects/acad-ts";
import { DwgReader, DxfReader } from "@node-projects/acad-ts";
import type { DrawingReader, DwgFormat, ThumbnailResult } from "../types.js";
import { EXIT_UNAVAILABLE, EXIT_USER_ERROR } from "../utils/exit-codes.js";
import { DwgCliError } from "./errors.js";

interface NormalizedAcadEntity {
  handle?: unknown;
  type: string;
  layer?: string;
  color?: unknown;
  [key: string]: unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export function arrayBufferFor(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function items<T>(value: Iterable<T> | null | undefined): T[] {
  return value ? [...value] : [];
}

function point(
  value: unknown,
): { x: number; y: number; z?: number } | undefined {
  const rec = asRecord(value);
  const x = Number(rec.x ?? rec.X);
  const y = Number(rec.y ?? rec.Y);
  const z = Number(rec.z ?? rec.Z);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return Number.isFinite(z) ? { x, y, z } : { x, y };
}

function constructorName(value: unknown): string {
  const ctor = asRecord(value).constructor;
  return typeof ctor === "function" && ctor.name ? ctor.name : "UNKNOWN";
}

function entityType(entity: unknown): string {
  const name = constructorName(entity);
  const known: Record<string, string> = {
    BlockReference: "INSERT",
    Insert: "INSERT",
    Line: "LINE",
    Circle: "CIRCLE",
    Arc: "ARC",
    LwPolyline: "LWPOLYLINE",
    Polyline2D: "POLYLINE",
    Polyline3D: "POLYLINE",
    TextEntity: "TEXT",
    MText: "MTEXT",
    Point: "POINT",
  };
  return known[name] ?? name.replace(/Entity$/, "").toUpperCase();
}

function layerName(entity: unknown): string | undefined {
  const layer = asRecord(entity).layer;
  const name = asRecord(layer).name;
  return name === undefined || name === null ? undefined : String(name);
}

function colorValue(entity: unknown): string | number | undefined {
  const color = asRecord(entity).color;
  if (color === undefined || color === null) return undefined;
  const index = asRecord(color).index;
  if (typeof index === "number") return index;
  return String(color);
}

function valueString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function blockName(entity: unknown): string | undefined {
  const block = asRecord(entity).block;
  return valueString(asRecord(block).name);
}

function vertices(
  entity: unknown,
): { x: number; y: number; z?: number }[] | undefined {
  const raw = asRecord(entity).vertices;
  if (!Array.isArray(raw)) return undefined;
  const result = raw
    .map((vertex) => point(asRecord(vertex).location ?? vertex))
    .filter((vertex): vertex is { x: number; y: number; z?: number } =>
      Boolean(vertex),
    );
  return result.length > 0 ? result : undefined;
}

function normalizeAcadEntity(entity: unknown): NormalizedAcadEntity {
  const rec = asRecord(entity);
  const type = entityType(entity);
  const data: NormalizedAcadEntity = {
    handle: rec.handle,
    type,
    layer: layerName(entity),
    color: colorValue(entity),
  };

  const start = point(rec.startPoint);
  const end = point(rec.endPoint);
  const center = point(rec.center);
  const insertPoint = point(rec.insertPoint);
  const location = point(rec.location);
  const entityVertices = vertices(entity);
  const text = valueString(rec.plainText ?? rec.value);
  const name = blockName(entity);

  if (start) data.start = start;
  if (end) data.end = end;
  if (center) data.center = center;
  if (insertPoint) data.insertionPoint = insertPoint;
  if (insertPoint) data.position = insertPoint;
  if (location) data.point = location;
  if (entityVertices) data.vertices = entityVertices;
  if (typeof rec.radius === "number") data.radius = rec.radius;
  if (typeof rec.startAngle === "number") data.startAngle = rec.startAngle;
  if (typeof rec.endAngle === "number") data.endAngle = rec.endAngle;
  if (text) data.text = text;
  if (name) data.blockName = name;

  return data;
}

export function normalizeAcadDocument(doc: CadDocument): unknown {
  const layers = items(doc.layers).map((layer) => ({ name: layer.name }));
  const blocks = items(doc.blockRecords).map((block) => ({
    name: block.name,
    entities: items(block.entities).map((entity) => ({
      type: entityType(entity),
    })),
  }));
  const entities = items(doc.modelSpace?.entities).map(normalizeAcadEntity);

  return {
    version: doc.header?.versionString ?? String(doc.header?.version ?? ""),
    layers,
    blocks,
    entities,
  };
}

export class AcadTsReader implements DrawingReader {
  async parse(
    _file: string,
    bytes: Uint8Array,
    format: DwgFormat,
  ): Promise<unknown> {
    try {
      const doc =
        format === "DWG"
          ? DwgReader.readFromStream(arrayBufferFor(bytes))
          : DxfReader.readFromStream(bytes);
      return normalizeAcadDocument(doc);
    } catch (error) {
      throw new DwgCliError(
        `Could not parse ${format}: ${(error as Error).message}`,
        "PARSE_FAILED",
        EXIT_USER_ERROR,
      );
    }
  }

  async thumbnail(): Promise<ThumbnailResult | null> {
    throw new DwgCliError(
      "Thumbnail extraction is not available through acad-ts.",
      "THUMBNAIL_UNAVAILABLE",
      EXIT_UNAVAILABLE,
    );
  }
}
