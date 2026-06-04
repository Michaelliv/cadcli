import { extname } from "node:path";
import type { DrawingReader, DwgDocument, DwgEntity } from "../types.js";
import { EXIT_USER_ERROR } from "../utils/exit-codes.js";
import { loadDrawing } from "./drawing.js";
import { DwgCliError } from "./errors.js";
import { rasterizeSvg } from "./raster.js";
import { renderSvg } from "./svg.js";

export interface RenderOptions {
  reader?: DrawingReader;
  output?: string;
  width?: number;
  background?: string;
  radius?: number;
  around?: string;
  aroundLabel?: string;
  aroundBlock?: string;
  ink?: boolean;
  stroke?: string;
  strokeWidth?: number;
  fit?: "bounds" | "content";
  layers?: string[];
  hideLayers?: string[];
  markLabels?: string[];
  markBlocks?: string[];
  expandInserts?: boolean;
}

export interface RenderTarget {
  kind: "coordinate" | "label" | "block" | "drawing";
  value?: string;
  matched?: {
    id: string;
    text?: string;
    blockName?: string;
    layer?: string;
    x: number;
    y: number;
  };
}

export interface RenderResult {
  content: string | Uint8Array;
  format: "svg" | "png";
  rendered: number;
  unsupported: number;
  width?: number;
  height?: number;
  target: RenderTarget;
  crop?: {
    cad: { center: { x: number; y: number }; radius: number };
    svg: { viewBox: string };
  };
  viewport?: {
    fit: "bounds" | "content";
    cad?: { minX: number; minY: number; maxX: number; maxY: number };
    viewBox?: { x: number; y: number; width: number; height: number };
    svg?: { viewBox: string };
  };
}

type Point = { x: number; y: number };

export async function renderDrawing(
  file: string,
  options: RenderOptions = {},
): Promise<RenderResult> {
  if (
    options.fit !== undefined &&
    options.fit !== "bounds" &&
    options.fit !== "content"
  ) {
    throw new DwgCliError(
      `Invalid fit mode: ${options.fit}`,
      "INVALID_FIT_MODE",
      EXIT_USER_ERROR,
    );
  }
  const doc = await loadDrawing(file, { reader: options.reader });
  const svgResult = renderSvg(doc, {
    layers: options.layers,
    hideLayers: options.hideLayers,
    expandInserts: options.expandInserts ?? true,
  });
  const target = findTarget(doc, options);
  const crop = target.matched
    ? cropAround({ x: target.matched.x, y: target.matched.y }, options.radius)
    : options.around
      ? cropAround(parseCadPoint(options.around), options.radius)
      : undefined;
  const viewport = crop
    ? undefined
    : viewportFor(
        doc,
        options.fit ?? "content",
        {
          layers: options.layers,
          hideLayers: options.hideLayers,
        },
        options.expandInserts ?? true,
      );
  const format = outputFormat(options.output);

  const viewBox = crop?.viewBox ?? viewport?.viewBox;
  const preparedSvg = addMarkers(
    viewBox
      ? applyViewBox(
          svgResult.svg,
          `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`,
        )
      : svgResult.svg,
    collectMarkers(doc, options),
    viewBox,
  );

  if (format === "svg") {
    return {
      content: preparedSvg,
      format,
      rendered: svgResult.rendered,
      unsupported: svgResult.unsupported,
      target,
      crop,
      viewport,
    };
  }

  const png = rasterizeSvg(preparedSvg, {
    width: options.width ?? 1800,
    background: options.background ?? "white",
    viewBox,
    ink: options.ink ?? true,
    stroke: options.stroke,
    strokeWidth: options.strokeWidth,
  });

  return {
    content: png.png,
    format,
    rendered: svgResult.rendered,
    unsupported: svgResult.unsupported,
    width: png.width,
    height: png.height,
    target,
    crop,
    viewport,
  };
}

function outputFormat(output?: string): "svg" | "png" {
  if (output && extname(output).toLowerCase() === ".svg") return "svg";
  return "png";
}

function viewportFor(
  doc: DwgDocument,
  fit: "bounds" | "content",
  filters: { layers?: string[]; hideLayers?: string[] },
  expandInserts: boolean,
) {
  if (fit === "bounds") return undefined;
  const entities = filterEntitiesByLayer(doc.entities, filters);
  const bounds =
    contentBounds(doc, entities, false) ??
    contentBounds(doc, entities, expandInserts);
  if (!bounds) return undefined;
  const padded = padBounds(bounds, 0.08);
  const viewBox = {
    x: padded.minX,
    y: -padded.maxY,
    width: Math.max(1, padded.maxX - padded.minX),
    height: Math.max(1, padded.maxY - padded.minY),
  };
  return {
    fit,
    cad: padded,
    viewBox,
    svg: {
      viewBox: `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`,
    },
  };
}

function cropAround(point: Point, radius = 3000) {
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new DwgCliError("Invalid radius.", "INVALID_RADIUS", EXIT_USER_ERROR);
  }
  const viewBox = {
    x: point.x - radius,
    y: -point.y - radius,
    width: radius * 2,
    height: radius * 2,
  };
  return {
    viewBox,
    cad: { center: point, radius },
    svg: {
      viewBox: `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`,
    },
  };
}

function findTarget(doc: DwgDocument, options: RenderOptions): RenderTarget {
  const requested = [
    options.around,
    options.aroundLabel,
    options.aroundBlock,
  ].filter(Boolean);
  if (requested.length > 1) {
    throw new DwgCliError(
      "Use only one of --around, --around-label, or --around-block.",
      "INVALID_RENDER_TARGET",
      EXIT_USER_ERROR,
    );
  }

  if (options.around) {
    const point = parseCadPoint(options.around);
    return {
      kind: "coordinate",
      value: options.around,
      matched: { id: "coordinate", x: point.x, y: point.y },
    };
  }

  if (options.aroundLabel) {
    const match = doc.entities.find((entity) => {
      const text = textValue(entity);
      return text?.includes(options.aroundLabel ?? "");
    });
    if (!match) {
      throw new DwgCliError(
        `Label not found: ${options.aroundLabel}`,
        "RENDER_TARGET_NOT_FOUND",
        EXIT_USER_ERROR,
      );
    }
    const point = entityPoint(match);
    if (!point) {
      throw new DwgCliError(
        `Label has no insertion point: ${options.aroundLabel}`,
        "RENDER_TARGET_NOT_FOUND",
        EXIT_USER_ERROR,
      );
    }
    return {
      kind: "label",
      value: options.aroundLabel,
      matched: {
        id: match.id,
        text: textValue(match),
        layer: match.layer,
        x: point.x,
        y: point.y,
      },
    };
  }

  if (options.aroundBlock) {
    const match = doc.entities.find((entity) =>
      blockName(entity)?.includes(options.aroundBlock ?? ""),
    );
    if (!match) {
      throw new DwgCliError(
        `Block not found: ${options.aroundBlock}`,
        "RENDER_TARGET_NOT_FOUND",
        EXIT_USER_ERROR,
      );
    }
    const point = entityPoint(match);
    if (!point) {
      throw new DwgCliError(
        `Block has no insertion point: ${options.aroundBlock}`,
        "RENDER_TARGET_NOT_FOUND",
        EXIT_USER_ERROR,
      );
    }
    return {
      kind: "block",
      value: options.aroundBlock,
      matched: {
        id: match.id,
        blockName: blockName(match),
        layer: match.layer,
        x: point.x,
        y: point.y,
      },
    };
  }

  return { kind: "drawing" };
}

function collectMarkers(doc: DwgDocument, options: RenderOptions) {
  const markers: Array<{
    x: number;
    y: number;
    label: string;
    kind: "label" | "block";
  }> = [];
  for (const entity of doc.entities) {
    const point = entityPoint(entity);
    if (!point) continue;
    const text = textValue(entity);
    if (text && matchesAny(text, options.markLabels)) {
      markers.push({ ...point, label: text, kind: "label" });
    }
    const name = blockName(entity);
    if (name && matchesAny(name, options.markBlocks)) {
      markers.push({ ...point, label: name, kind: "block" });
    }
  }
  return markers;
}

function addMarkers(
  svg: string,
  markers: Array<{
    x: number;
    y: number;
    label: string;
    kind: "label" | "block";
  }>,
  viewBox?: { x: number; y: number; width: number; height: number },
): string {
  if (markers.length === 0) return svg;
  const radius =
    Math.max(viewBox?.width ?? 1000, viewBox?.height ?? 1000) * 0.008;
  const fontSize = radius * 1.05;
  const elements = markers
    .map((marker) => {
      const color = marker.kind === "label" ? "#d12" : "#06c";
      const x = marker.x;
      const y = -marker.y;
      return `<g class="cadcli-marker"><circle cx="${x}" cy="${y}" r="${radius}" fill="none" stroke="${color}" stroke-width="${radius * 0.16}"/><text x="${x + radius * 1.25}" y="${y - radius * 1.25}" fill="${color}" stroke="white" stroke-width="${radius * 0.08}" paint-order="stroke" font-size="${fontSize}">${escapeXml(marker.label)}</text></g>`;
    })
    .join("\n");
  return svg.replace(
    "</svg>",
    `<g id="cadcli-markers">${elements}</g>\n</svg>`,
  );
}

function matchesAny(value: string, patterns?: string[]): boolean {
  const normalized = patterns?.map((pattern) => pattern.trim()).filter(Boolean);
  return normalized?.some((pattern) => value.includes(pattern)) ?? false;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseCadPoint(value: string): Point {
  const parts = value
    .split(/[,\s]+/)
    .filter(Boolean)
    .map(Number);
  if (parts.length !== 2 || parts.some((part) => !Number.isFinite(part))) {
    throw new DwgCliError(
      "Invalid coordinate. Expected x,y.",
      "INVALID_COORDINATE",
      EXIT_USER_ERROR,
    );
  }
  return { x: parts[0], y: parts[1] };
}

function filterEntitiesByLayer(
  entities: DwgEntity[],
  filters: { layers?: string[]; hideLayers?: string[] },
): DwgEntity[] {
  const layers = normalizeLayerSet(filters.layers);
  const hideLayers = normalizeLayerSet(filters.hideLayers);
  return entities.filter((entity) => {
    const layer = entity.layer?.toLowerCase();
    if (layers && (!layer || !layers.has(layer))) return false;
    if (hideLayers && layer && hideLayers.has(layer)) return false;
    return true;
  });
}

function normalizeLayerSet(values?: string[]): Set<string> | undefined {
  const normalized = values
    ?.flatMap((value) => value.split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return normalized && normalized.length > 0 ? new Set(normalized) : undefined;
}

function contentBounds(
  doc: DwgDocument,
  entities: DwgEntity[],
  expandInserts: boolean,
) {
  const boxes = entities.flatMap((entity) =>
    entityBoxes(doc, entity, expandInserts),
  );
  if (boxes.length === 0) return null;

  const centersX = boxes.map((box) => (box.minX + box.maxX) / 2);
  const centersY = boxes.map((box) => (box.minY + box.maxY) / 2);
  const minX = quantile(centersX, 0.02);
  const maxX = quantile(centersX, 0.98);
  const minY = quantile(centersY, 0.02);
  const maxY = quantile(centersY, 0.98);
  const kept = boxes.filter((box) => {
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    return cx >= minX && cx <= maxX && cy >= minY && cy <= maxY;
  });
  const source = kept.length >= Math.max(3, boxes.length * 0.5) ? kept : boxes;
  return {
    minX: Math.min(...source.map((box) => box.minX)),
    minY: Math.min(...source.map((box) => box.minY)),
    maxX: Math.max(...source.map((box) => box.maxX)),
    maxY: Math.max(...source.map((box) => box.maxY)),
  };
}

function entityBoxes(
  doc: DwgDocument,
  entity: DwgEntity,
  expandInserts: boolean,
) {
  if (expandInserts && entity.type === "INSERT") {
    const insertionPoint = entityPoint(entity);
    const name = blockName(entity);
    const block = name
      ? doc.blocks.find((item) => item.name === name)
      : undefined;
    if (insertionPoint && block?.entities?.length) {
      return block.entities
        .map((child) => entityBox(transformedEntity(child, insertionPoint)))
        .filter(
          (
            box,
          ): box is {
            minX: number;
            minY: number;
            maxX: number;
            maxY: number;
          } => Boolean(box),
        );
    }
  }
  const box = entityBox(entity);
  return box ? [box] : [];
}

function transformedEntity(entity: DwgEntity, offset: Point): DwgEntity {
  return { ...entity, data: transformData(entity.data, offset) };
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

function entityBox(entity: DwgEntity) {
  if (entity.type === "LINE") {
    const start = point(entity.data.start ?? entity.data.startPoint);
    const end = point(entity.data.end ?? entity.data.endPoint);
    if (!start || !end) return null;
    return boxFromPoints([start, end]);
  }
  if (entity.type === "CIRCLE") {
    const center = point(entity.data.center);
    const radius = Number(entity.data.radius ?? entity.data.r);
    if (!center || !Number.isFinite(radius)) return null;
    return {
      minX: center.x - radius,
      minY: center.y - radius,
      maxX: center.x + radius,
      maxY: center.y + radius,
    };
  }
  if (entity.type === "LWPOLYLINE" || entity.type === "POLYLINE") {
    const vertices = Array.isArray(entity.data.vertices)
      ? entity.data.vertices.map(point).filter((p): p is Point => p !== null)
      : [];
    return vertices.length > 0 ? boxFromPoints(vertices) : null;
  }
  if (entity.type === "TEXT" || entity.type === "MTEXT") {
    const textPoint = entityPoint(entity);
    return textPoint ? boxFromPoints([textPoint]) : null;
  }
  return null;
}

function boxFromPoints(points: Point[]) {
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}

function padBounds(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  ratio: number,
) {
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const pad = Math.max(width, height) * ratio;
  return {
    minX: bounds.minX - pad,
    minY: bounds.minY - pad,
    maxX: bounds.maxX + pad,
    maxY: bounds.maxY + pad,
  };
}

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * q)),
  );
  return sorted[index];
}

function entityPoint(entity: DwgEntity): Point | null {
  return point(
    entity.data.insertionPoint ?? entity.data.position ?? entity.data.start,
  );
}

function point(value: unknown): Point | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const x = Number(record.x ?? record.X ?? record[0]);
  const y = Number(record.y ?? record.Y ?? record[1]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function textValue(entity: DwgEntity): string | undefined {
  const value = entity.data.text ?? entity.data.value;
  return typeof value === "string" ? value : undefined;
}

function blockName(entity: DwgEntity): string | undefined {
  const value = entity.data.blockName ?? entity.data.name;
  return typeof value === "string" ? value : undefined;
}

function applyViewBox(svg: string, viewBox: string): string {
  const next = `viewBox="${viewBox}"`;
  if (/viewBox="[^"]*"/.test(svg)) return svg.replace(/viewBox="[^"]*"/, next);
  return svg.replace(/<svg\b/, `<svg ${next}`);
}
