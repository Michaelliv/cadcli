import type { DrawingReader, DwgFormat, ThumbnailResult } from "../types.js";
import { EXIT_UNAVAILABLE, EXIT_USER_ERROR } from "../utils/exit-codes.js";
import { DwgCliError } from "./errors.js";
import { readJsonWithLibreDwg } from "./libredwg.js";

export class NativeLibreDwgReader implements DrawingReader {
  constructor(private readonly toolDir?: string) {}

  async parse(
    file: string,
    _bytes: Uint8Array,
    _format: DwgFormat,
  ): Promise<unknown> {
    try {
      return readJsonWithLibreDwg(file, { toolDir: this.toolDir }).json;
    } catch (error) {
      if (error instanceof DwgCliError) throw error;
      throw new DwgCliError(
        `Could not parse LibreDWG JSON: ${(error as Error).message}`,
        "PARSE_FAILED",
        EXIT_USER_ERROR,
      );
    }
  }

  async thumbnail(): Promise<ThumbnailResult | null> {
    throw new DwgCliError(
      "Thumbnail extraction is not available through native LibreDWG.",
      "THUMBNAIL_UNAVAILABLE",
      EXIT_UNAVAILABLE,
    );
  }
}
