import type { DwgBounds, DwgDocument, DwgEntity, SvgResult } from "../types.js";

function rec(entity: DwgEntity): Record<string, unknown> {
  return entity.data;
}

function point(value: unknown): { x: number; y: number } | null {
  const obj =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const x = Number(obj.x ?? obj.X ?? obj[0]);
  const y = Number(obj.y ?? obj.Y ?? obj[1]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fallbackBounds(): DwgBounds {
  return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
}

export function renderSvg(doc: DwgDocument): SvgResult {
  const bounds = doc.summary.bounds ?? fallbackBounds();
  const width = Math.max(1, bounds.maxX - bounds.minX || 100);
  const height = Math.max(1, bounds.maxY - bounds.minY || 100);
  const elements: string[] = [];
  let unsupported = 0;

  for (const entity of doc.entities) {
    const data = rec(entity);
    if (entity.type === "LINE") {
      const start = point(data.start ?? data.startPoint);
      const end = point(data.end ?? data.endPoint);
      if (start && end)
        elements.push(
          `<line x1="${start.x}" y1="${-start.y}" x2="${end.x}" y2="${-end.y}" />`,
        );
      else unsupported++;
    } else if (entity.type === "CIRCLE") {
      const center = point(data.center);
      const radius = Number(data.radius ?? data.r);
      if (center && Number.isFinite(radius))
        elements.push(
          `<circle cx="${center.x}" cy="${-center.y}" r="${radius}" />`,
        );
      else unsupported++;
    } else if (["LWPOLYLINE", "POLYLINE"].includes(entity.type)) {
      const vertices = Array.isArray(data.vertices)
        ? data.vertices.map(point).filter((p) => p !== null)
        : [];
      if (vertices.length)
        elements.push(
          `<polyline points="${vertices.map((p) => `${p.x},${-p.y}`).join(" ")}" />`,
        );
      else unsupported++;
    } else if (["TEXT", "MTEXT"].includes(entity.type)) {
      const position = point(
        data.position ?? data.insertionPoint ?? data.start,
      );
      const text = String(data.text ?? data.value ?? "");
      if (position)
        elements.push(
          `<text x="${position.x}" y="${-position.y}">${esc(text)}</text>`,
        );
      else unsupported++;
    } else {
      unsupported++;
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.minX} ${-bounds.maxY} ${width} ${height}">\n  <g fill="none" stroke="currentColor" stroke-width="1">\n    ${elements.join("\n    ")}\n  </g>\n  <metadata>{"unsupported":${unsupported},"rendered":${elements.length}}</metadata>\n</svg>\n`;
  return { svg, unsupported, rendered: elements.length, bounds };
}
