import type { DwgBounds, DwgDocument, DwgEntity, SvgResult } from "../types.js";

type Point = { x: number; y: number };
type Renderer = (entity: DwgEntity) => string | null;

export interface RenderSvgOptions {
  layers?: string[];
  hideLayers?: string[];
  expandInserts?: boolean;
}

const DEFAULT_BOUNDS: DwgBounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

function data(entity: DwgEntity): Record<string, unknown> {
  return entity.data;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function point(value: unknown): Point | null {
  const obj = record(value);
  const x = Number(obj.x ?? obj.X ?? obj[0]);
  const y = Number(obj.y ?? obj.Y ?? obj[1]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function number(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function y(value: number): number {
  return -value;
}

function renderLine(entity: DwgEntity): string | null {
  const rec = data(entity);
  const start = point(rec.start ?? rec.startPoint);
  const end = point(rec.end ?? rec.endPoint);
  if (!start || !end) return null;
  return `<line x1="${start.x}" y1="${y(start.y)}" x2="${end.x}" y2="${y(end.y)}" />`;
}

function renderCircle(entity: DwgEntity): string | null {
  const rec = data(entity);
  const center = point(rec.center);
  const radius = number(rec.radius ?? rec.r);
  if (!center || radius === null) return null;
  return `<circle cx="${center.x}" cy="${y(center.y)}" r="${radius}" />`;
}

function renderPolyline(entity: DwgEntity): string | null {
  const vertices = Array.isArray(entity.data.vertices)
    ? entity.data.vertices.map(point).filter((p): p is Point => p !== null)
    : [];
  if (vertices.length === 0) return null;
  return `<polyline points="${vertices.map((p) => `${p.x},${y(p.y)}`).join(" ")}" />`;
}

function renderText(entity: DwgEntity): string | null {
  const rec = data(entity);
  const position = point(rec.position ?? rec.insertionPoint ?? rec.start);
  if (!position) return null;
  const text = escapeXml(String(rec.text ?? rec.value ?? ""));
  return `<text x="${position.x}" y="${y(position.y)}">${text}</text>`;
}

const RENDERERS: Record<string, Renderer> = {
  LINE: renderLine,
  CIRCLE: renderCircle,
  LWPOLYLINE: renderPolyline,
  POLYLINE: renderPolyline,
  TEXT: renderText,
  MTEXT: renderText,
};

function rendererFor(entity: DwgEntity): Renderer | undefined {
  return RENDERERS[entity.type];
}

function transformedEntity(entity: DwgEntity, offset: Point): DwgEntity {
  return {
    ...entity,
    data: transformData(entity.data, offset),
  };
}

function transformData(
  data: Record<string, unknown>,
  offset: Point,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...data };
  for (const key of [
    "start",
    "end",
    "center",
    "insertionPoint",
    "position",
    "point",
  ]) {
    const transformed = transformPoint(next[key], offset);
    if (transformed) next[key] = transformed;
  }
  if (Array.isArray(next.vertices)) {
    next.vertices = next.vertices.map(
      (vertex) => transformPoint(vertex, offset) ?? vertex,
    );
  }
  return next;
}

function transformPoint(value: unknown, offset: Point): Point | null {
  const p = point(value);
  return p ? { x: p.x + offset.x, y: p.y + offset.y } : null;
}

function blockName(entity: DwgEntity): string | undefined {
  const value = entity.data.blockName ?? entity.data.name;
  return typeof value === "string" ? value : undefined;
}

function expandedInsertElements(doc: DwgDocument, entity: DwgEntity): string[] {
  if (entity.type !== "INSERT") return [];
  const insertionPoint = point(
    entity.data.insertionPoint ?? entity.data.position,
  );
  const name = blockName(entity);
  if (!insertionPoint || !name) return [];
  const block = doc.blocks.find((item) => item.name === name);
  if (!block?.entities) return [];
  const elements: string[] = [];
  for (const child of block.entities) {
    const renderer = rendererFor(child);
    const element =
      renderer?.(transformedEntity(child, insertionPoint)) ?? null;
    if (element) elements.push(element);
  }
  return elements;
}

function boundsFor(doc: DwgDocument): DwgBounds {
  return doc.summary.bounds ?? DEFAULT_BOUNDS;
}

function viewBox(bounds: DwgBounds): string {
  const width = Math.max(1, bounds.maxX - bounds.minX || DEFAULT_BOUNDS.maxX);
  const height = Math.max(1, bounds.maxY - bounds.minY || DEFAULT_BOUNDS.maxY);
  return `${bounds.minX} ${y(bounds.maxY)} ${width} ${height}`;
}

function metadata(unsupported: number, rendered: number): string {
  return escapeXml(JSON.stringify({ unsupported, rendered }));
}

export function renderSvg(
  doc: DwgDocument,
  options: RenderSvgOptions = {},
): SvgResult {
  const bounds = boundsFor(doc);
  const elements: string[] = [];
  let unsupported = 0;
  const entities = filterRenderableEntities(doc.entities, options);

  for (const entity of entities) {
    if (options.expandInserts && entity.type === "INSERT") {
      const expanded = expandedInsertElements(doc, entity);
      if (expanded.length > 0) {
        elements.push(...expanded);
        continue;
      }
    }
    const renderer = rendererFor(entity);
    const element = renderer?.(entity) ?? null;
    if (element) elements.push(element);
    else unsupported++;
  }

  const rendered = elements.length;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox(bounds)}">
  <g fill="none" stroke="currentColor" stroke-width="1">
    ${elements.join("\n    ")}
  </g>
  <metadata>${metadata(unsupported, rendered)}</metadata>
</svg>
`;
  return { svg, unsupported, rendered, bounds };
}

function filterRenderableEntities(
  entities: DwgEntity[],
  options: RenderSvgOptions,
): DwgEntity[] {
  const layers = normalizeSet(options.layers);
  const hideLayers = normalizeSet(options.hideLayers);
  return entities.filter((entity) => {
    const layer = entity.layer?.toLowerCase();
    if (layers && (!layer || !layers.has(layer))) return false;
    if (hideLayers && layer && hideLayers.has(layer)) return false;
    return true;
  });
}

function normalizeSet(values?: string[]): Set<string> | undefined {
  const normalized = values
    ?.flatMap((value) => value.split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return normalized && normalized.length > 0 ? new Set(normalized) : undefined;
}
