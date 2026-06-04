import { readFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { EXIT_USER_ERROR } from "../utils/exit-codes.js";
import { DwgCliError } from "./errors.js";

export interface RasterOptions {
  width?: number;
  height?: number;
  background?: string;
  viewBox?: ViewBox;
  stroke?: string;
  strokeWidth?: number;
  ink?: boolean;
}

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RasterResult {
  png: Uint8Array;
  width?: number;
  height?: number;
}

export function rasterizeSvg(
  svg: string,
  options: RasterOptions = {},
): RasterResult {
  const fitTo = fitToOption(options);
  const resvg = new Resvg(prepareSvg(svg, options), {
    background: options.background,
    fitTo,
  });
  const image = resvg.render();
  return {
    png: image.asPng(),
    width: image.width,
    height: image.height,
  };
}

export function rasterizeSvgFile(
  file: string,
  options: RasterOptions = {},
): RasterResult {
  return rasterizeSvg(readFileSync(file, "utf-8"), options);
}

function fitToOption(options: RasterOptions) {
  if (options.width !== undefined && options.height !== undefined) {
    return { mode: "zoom" as const, value: 1 };
  }
  if (options.width !== undefined) {
    return { mode: "width" as const, value: options.width };
  }
  if (options.height !== undefined) {
    return { mode: "height" as const, value: options.height };
  }
  return undefined;
}

export function parseViewBox(value: unknown): ViewBox | undefined {
  if (value === undefined) return undefined;
  const parts = String(value)
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    throw new DwgCliError(
      `Invalid viewBox: ${String(value)}. Expected "x y width height".`,
      "INVALID_VIEWBOX",
      EXIT_USER_ERROR,
    );
  }
  const [x, y, width, height] = parts;
  if (width <= 0 || height <= 0) {
    throw new DwgCliError(
      "Invalid viewBox: width and height must be positive.",
      "INVALID_VIEWBOX",
      EXIT_USER_ERROR,
    );
  }
  return { x, y, width, height };
}

export function viewBoxAround(
  value: unknown,
  radius: unknown,
): ViewBox | undefined {
  if (value === undefined && radius === undefined) return undefined;
  if (value === undefined || radius === undefined) {
    throw new DwgCliError(
      "Use --around and --radius together.",
      "INVALID_VIEWBOX",
      EXIT_USER_ERROR,
    );
  }
  const center = String(value)
    .split(/[,\s]+/)
    .filter(Boolean)
    .map(Number);
  const parsedRadius = Number(radius);
  if (
    center.length !== 2 ||
    center.some((part) => !Number.isFinite(part)) ||
    !Number.isFinite(parsedRadius) ||
    parsedRadius <= 0
  ) {
    throw new DwgCliError(
      "Invalid crop. Expected --around x,y --radius n.",
      "INVALID_VIEWBOX",
      EXIT_USER_ERROR,
    );
  }
  const [x, y] = center;
  return {
    x: x - parsedRadius,
    y: y - parsedRadius,
    width: parsedRadius * 2,
    height: parsedRadius * 2,
  };
}

export function parseRasterSize(
  value: unknown,
  name: string,
): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new DwgCliError(
      `Invalid ${name}: ${String(value)}`,
      "INVALID_RASTER_SIZE",
      EXIT_USER_ERROR,
    );
  }
  return parsed;
}

export function parseStrokeWidth(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new DwgCliError(
      `Invalid stroke width: ${String(value)}`,
      "INVALID_STROKE_WIDTH",
      EXIT_USER_ERROR,
    );
  }
  return parsed;
}

function prepareSvg(svg: string, options: RasterOptions): string {
  return applyDiagnosticStyle(applyViewBox(svg, options.viewBox), options);
}

function applyViewBox(svg: string, viewBox?: ViewBox): string {
  if (!viewBox) return svg;
  const next = `viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}"`;
  if (/viewBox="[^"]*"/.test(svg)) {
    return svg.replace(/viewBox="[^"]*"/, next);
  }
  return svg.replace(/<svg\b/, `<svg ${next}`);
}

function applyDiagnosticStyle(svg: string, options: RasterOptions): string {
  const stroke = options.stroke ?? (options.ink ? "#111111" : undefined);
  const strokeWidth = options.strokeWidth ?? (options.ink ? 2 : undefined);
  if (!stroke && strokeWidth === undefined) return svg;

  const rules = [
    "svg { color: #111111; }",
    stroke
      ? `line, path, polyline, polygon, circle, ellipse, rect { stroke: ${stroke} !important; }`
      : "",
    strokeWidth !== undefined
      ? `line, path, polyline, polygon, circle, ellipse, rect { stroke-width: ${strokeWidth} !important; }`
      : "",
    stroke ? `text, tspan { fill: ${stroke} !important; }` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const style = `<style id="cadcli-raster-style">${rules}</style>`;
  if (/<svg\b[^>]*>/.test(svg)) {
    return svg.replace(/(<svg\b[^>]*>)/, `$1${style}`);
  }
  return `${style}${svg}`;
}
