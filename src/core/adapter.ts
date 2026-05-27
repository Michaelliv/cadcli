import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { DwgFormat, DwgParser, ThumbnailResult } from "../types.js";
import {
  EXIT_ERROR,
  EXIT_UNAVAILABLE,
  EXIT_USER_ERROR,
} from "../utils/exit-codes.js";
import { DwgCliError } from "./errors.js";

type LibreDwgInstance = {
  dwg_read_data: (bytes: Uint8Array, fileType: unknown) => unknown;
  convert: (dwg: unknown) => unknown;
  dwg_free?: (dwg: unknown) => void;
};

type LibreDwgModule = {
  LibreDwg: { create: (wasmPath?: string) => Promise<LibreDwgInstance> };
  Dwg_File_Type: Record<string, unknown>;
};

function defaultWasmPath(): string | undefined {
  try {
    const require = createRequire(import.meta.url);
    const entry = require.resolve("@mlightcad/libredwg-web");
    return `${join(dirname(dirname(entry)), "wasm")}/`;
  } catch {
    return undefined;
  }
}

export class LibredwgParser implements DwgParser {
  private lib?: LibreDwgInstance;
  private fileType?: Record<string, unknown>;

  constructor(private readonly wasmPath?: string) {}

  async parse(
    _file: string,
    bytes: Uint8Array,
    format: DwgFormat,
  ): Promise<unknown> {
    await this.ensureLoaded();
    if (!this.lib || !this.fileType)
      throw new DwgCliError(
        "libredwg-web did not initialize.",
        "PARSER_INIT_FAILED",
        EXIT_ERROR,
      );
    const type = this.fileType[format];
    try {
      const dwg = this.lib.dwg_read_data(bytes, type);
      const db = this.lib.convert(dwg);
      this.lib.dwg_free?.(dwg);
      return db;
    } catch (error) {
      throw new DwgCliError(
        `Could not parse drawing: ${(error as Error).message}`,
        "PARSE_FAILED",
        EXIT_USER_ERROR,
      );
    }
  }

  async thumbnail(): Promise<ThumbnailResult | null> {
    throw new DwgCliError(
      "Thumbnail extraction is not available through the current libredwg-web wrapper for this file.",
      "THUMBNAIL_UNAVAILABLE",
      EXIT_UNAVAILABLE,
    );
  }

  private async ensureLoaded(): Promise<void> {
    if (this.lib) return;
    try {
      const mod = (await import("@mlightcad/libredwg-web")) as LibreDwgModule;
      this.lib = await mod.LibreDwg.create(this.wasmPath ?? defaultWasmPath());
      this.fileType = mod.Dwg_File_Type;
    } catch (error) {
      throw new DwgCliError(
        `Could not load @mlightcad/libredwg-web: ${(error as Error).message}`,
        "PARSER_LOAD_FAILED",
        EXIT_ERROR,
      );
    }
  }
}
