import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname } from "node:path";
import type { DwgFormat } from "../types.js";
import { EXIT_NOT_FOUND, EXIT_USER_ERROR } from "../utils/exit-codes.js";
import { DwgCliError } from "./errors.js";

export function detectFormat(file: string): DwgFormat {
  const ext = extname(file).toLowerCase();
  if (ext === ".dwg") return "DWG";
  if (ext === ".dxf") return "DXF";
  throw new DwgCliError(
    `Unsupported file extension: ${ext || "none"}. Expected .dwg or .dxf.`,
    "UNSUPPORTED_FORMAT",
    EXIT_USER_ERROR,
  );
}

export function readCadFile(file: string): {
  bytes: Uint8Array;
  format: DwgFormat;
} {
  if (!existsSync(file)) {
    throw new DwgCliError(
      `File not found: ${file}`,
      "FILE_NOT_FOUND",
      EXIT_NOT_FOUND,
    );
  }
  return { bytes: readFileSync(file), format: detectFormat(file) };
}

export function writeOutput(file: string, data: string | Uint8Array): void {
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, data);
  } catch (error) {
    throw new DwgCliError(
      `Could not write output to ${file}: ${(error as Error).message}`,
      "OUTPUT_WRITE_FAILED",
      EXIT_USER_ERROR,
    );
  }
}
