import type {
  DrawingReader,
  DwgBlock,
  DwgDocument,
  DwgEntity,
  DwgLayer,
  EntityFilter,
  SvgResult,
  ThumbnailResult,
} from "../types.js";
import { EXIT_UNAVAILABLE, EXIT_USER_ERROR } from "../utils/exit-codes.js";
import { AcadTsReader } from "./adapter.js";
import { DwgCliError } from "./errors.js";
import { readCadFile } from "./files.js";
import { normalizeDocument } from "./normalize.js";
import { renderSvg } from "./svg.js";

export interface LoadOptions {
  reader?: DrawingReader;
}

function readerFor(opts: LoadOptions): DrawingReader {
  return opts.reader ?? new AcadTsReader();
}

export async function loadDrawing(
  file: string,
  opts: LoadOptions = {},
): Promise<DwgDocument> {
  const { bytes, format } = readCadFile(file);
  const raw = await readerFor(opts).parse(file, bytes, format);
  return normalizeDocument(file, format, raw);
}

export async function getInfo(file: string, opts?: LoadOptions) {
  return (await loadDrawing(file, opts)).summary;
}

export async function getLayers(
  file: string,
  opts?: LoadOptions,
): Promise<DwgLayer[]> {
  return (await loadDrawing(file, opts)).layers;
}

export async function getBlocks(
  file: string,
  opts?: LoadOptions,
): Promise<DwgBlock[]> {
  return (await loadDrawing(file, opts)).blocks;
}

export function filterEntities(
  entities: DwgEntity[],
  filter: EntityFilter = {},
): DwgEntity[] {
  let result = entities;
  if (filter.type)
    result = result.filter(
      (e) => e.type.toLowerCase() === filter.type?.toLowerCase(),
    );
  if (filter.layer)
    result = result.filter(
      (e) => e.layer?.toLowerCase() === filter.layer?.toLowerCase(),
    );
  if (filter.limit !== undefined) result = result.slice(0, filter.limit);
  return result;
}

export async function getEntities(
  file: string,
  filter: EntityFilter = {},
  opts?: LoadOptions,
): Promise<DwgEntity[]> {
  const doc = await loadDrawing(file, opts);
  if (
    filter.layer &&
    !doc.layers.some(
      (l) => l.name.toLowerCase() === filter.layer?.toLowerCase(),
    )
  ) {
    throw new DwgCliError(
      `Layer not found: ${filter.layer}`,
      "LAYER_NOT_FOUND",
      EXIT_USER_ERROR,
    );
  }
  if (
    filter.type &&
    !doc.entities.some(
      (e) => e.type.toLowerCase() === filter.type?.toLowerCase(),
    )
  ) {
    throw new DwgCliError(
      `Entity type not found: ${filter.type}`,
      "TYPE_NOT_FOUND",
      EXIT_USER_ERROR,
    );
  }
  return filterEntities(doc.entities, filter);
}

export async function toJson(
  file: string,
  opts?: LoadOptions,
): Promise<DwgDocument> {
  return loadDrawing(file, opts);
}

export async function toSvg(
  file: string,
  opts?: LoadOptions,
): Promise<SvgResult> {
  return renderSvg(await loadDrawing(file, opts));
}

export async function getThumbnail(
  file: string,
  opts: LoadOptions = {},
): Promise<ThumbnailResult> {
  const { bytes, format } = readCadFile(file);
  const reader = readerFor(opts);
  if (!reader.thumbnail)
    throw new DwgCliError(
      "Thumbnail extraction is not available through the configured reader.",
      "THUMBNAIL_UNAVAILABLE",
      EXIT_UNAVAILABLE,
    );
  const result = await reader.thumbnail(file, bytes, format);
  if (!result)
    throw new DwgCliError(
      "No thumbnail was found in this drawing.",
      "THUMBNAIL_UNAVAILABLE",
      EXIT_UNAVAILABLE,
    );
  return result;
}
