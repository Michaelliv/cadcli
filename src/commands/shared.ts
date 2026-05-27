import { DwgCliError } from "../core/errors.js";
import { error } from "../utils/output.js";

export function handleCommandError(err: unknown): never {
  if (err instanceof DwgCliError) {
    error(err.message);
    process.exit(err.exitCode);
  }
  error((err as Error).message);
  process.exit(1);
}

export function parseLimit(value?: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0)
    throw new Error(`Invalid limit: ${value}`);
  return parsed;
}
