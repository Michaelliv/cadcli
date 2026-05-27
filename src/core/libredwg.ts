import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { basename, delimiter, join } from "node:path";
import {
  EXIT_ERROR,
  EXIT_UNAVAILABLE,
  EXIT_USER_ERROR,
} from "../utils/exit-codes.js";
import { DwgCliError } from "./errors.js";

export type LibreDwgToolName = "dwgread" | "dwgfilter";

export interface LibreDwgEditResult {
  input: string;
  output: string;
  expression: string;
  backend: "LibreDWG";
  tool: "dwgfilter";
  stderr: string;
}

export interface LibreDwgViewResult {
  input: string;
  output?: string;
  svg: string;
  backend: "LibreDWG";
  tool: "dwgread";
  stderr: string;
}

export interface LibreDwgJsonResult {
  input: string;
  json: unknown;
  backend: "LibreDWG";
  tool: "dwgread";
  stderr: string;
}

const WINDOWS_EXTENSIONS = [".exe", ".cmd", ".bat", ".com"];

function candidateNames(tool: LibreDwgToolName): string[] {
  return [tool, ...WINDOWS_EXTENSIONS.map((ext) => `${tool}${ext}`)];
}

function findTool(
  tool: LibreDwgToolName,
  toolDir?: string,
): string | undefined {
  const dirs = toolDir ? [toolDir] : (process.env.PATH ?? "").split(delimiter);
  for (const dir of dirs.filter(Boolean)) {
    for (const name of candidateNames(tool)) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

function requireTool(tool: LibreDwgToolName, toolDir?: string): string {
  const path = findTool(tool, toolDir);
  if (path) return path;
  throw new DwgCliError(
    `LibreDWG tool not found: ${tool}. Install LibreDWG and make sure ${tool} is on PATH.`,
    "LIBREDWG_TOOL_NOT_FOUND",
    EXIT_UNAVAILABLE,
  );
}

function preview(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 500) return trimmed;
  return `${trimmed.slice(0, 500)}…`;
}

function runLibreDwgTool(
  tool: LibreDwgToolName,
  args: string[],
  toolDir?: string,
): { stdout: string; stderr: string } {
  const path = requireTool(tool, toolDir);
  const result = spawnSync(path, args, { encoding: "utf-8" });

  if (result.error) {
    throw new DwgCliError(
      `Could not run ${tool}: ${result.error.message}`,
      "LIBREDWG_RUN_FAILED",
      EXIT_ERROR,
    );
  }

  if (result.status !== 0) {
    const details = preview(result.stderr || result.stdout);
    throw new DwgCliError(
      `${tool} failed for ${basename(args.at(-1) ?? "input")}${details ? `: ${details}` : ""}`,
      "LIBREDWG_RUN_FAILED",
      EXIT_USER_ERROR,
    );
  }

  return { stdout: result.stdout, stderr: result.stderr };
}

export function readJsonWithLibreDwg(
  file: string,
  opts: { toolDir?: string } = {},
): LibreDwgJsonResult {
  const result = runLibreDwgTool("dwgread", ["-O", "JSON", file], opts.toolDir);

  try {
    return {
      input: file,
      json: JSON.parse(result.stdout),
      backend: "LibreDWG",
      tool: "dwgread",
      stderr: result.stderr,
    };
  } catch (error) {
    const details = preview(result.stdout);
    throw new DwgCliError(
      `dwgread produced invalid JSON for ${basename(file)}: ${(error as Error).message}${details ? `; stdout: ${details}` : ""}`,
      "LIBREDWG_INVALID_JSON",
      EXIT_USER_ERROR,
    );
  }
}

export function renderSvgWithLibreDwg(
  file: string,
  opts: { toolDir?: string } = {},
): LibreDwgViewResult {
  const result = runLibreDwgTool("dwgread", ["-O", "SVG", file], opts.toolDir);
  return {
    input: file,
    svg: result.stdout,
    backend: "LibreDWG",
    tool: "dwgread",
    stderr: result.stderr,
  };
}

export function editWithLibreDwgFilter(opts: {
  input: string;
  output: string;
  expression: string;
  overwrite?: boolean;
  toolDir?: string;
}): LibreDwgEditResult {
  if (opts.input === opts.output && !opts.overwrite) {
    throw new DwgCliError(
      "Refusing to edit in place without --overwrite. Provide --output or pass --overwrite.",
      "EDIT_REQUIRES_OUTPUT_OR_OVERWRITE",
      EXIT_USER_ERROR,
    );
  }

  if (opts.input !== opts.output) copyFileSync(opts.input, opts.output);

  const result = runLibreDwgTool(
    "dwgfilter",
    ["-i", opts.expression, opts.output],
    opts.toolDir,
  );

  return {
    input: opts.input,
    output: opts.output,
    expression: opts.expression,
    backend: "LibreDWG",
    tool: "dwgfilter",
    stderr: result.stderr,
  };
}
