import { DwgCliError } from "../core/errors.js";
import { writeOutput } from "../core/files.js";
import { Dwg } from "../sdk.js";
import type { DrawingReader } from "../types.js";
import { EXIT_USER_ERROR } from "../utils/exit-codes.js";
import type { OutputOptions } from "../utils/output.js";
import { error, output, success } from "../utils/output.js";

export interface DrawingCommandOptions extends OutputOptions {
  reader?: DrawingReader;
}

export interface OutputFileOptions extends OutputOptions {
  output?: string;
}

export function drawingFor(file: string, options: DrawingCommandOptions): Dwg {
  return Dwg.open(file, {
    reader: options.reader,
  });
}

export function userError(message: string, code = "USER_ERROR"): DwgCliError {
  return new DwgCliError(message, code, EXIT_USER_ERROR);
}

export function handleCommandError(err: unknown): never {
  if (err instanceof DwgCliError) {
    error(err.message);
    process.exit(err.exitCode);
  }
  error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

export function parseLimit(value?: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw userError(`Invalid limit: ${value}`, "INVALID_LIMIT");
  }
  return parsed;
}

export function writeCommandOutput(
  options: OutputFileOptions,
  content: string | Uint8Array,
  jsonPayload: () => unknown,
  humanMessage: string,
): void {
  if (!options.output) return;
  writeOutput(options.output, content);
  output(options, {
    json: jsonPayload,
    human: () => success(humanMessage),
  });
}
