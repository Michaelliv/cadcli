import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { basename, join } from "node:path";
import {
  EXIT_ERROR,
  EXIT_UNAVAILABLE,
  EXIT_USER_ERROR,
} from "../utils/exit-codes.js";
import { DwgCliError } from "./errors.js";

export interface LibreDwgTool {
  name: string;
  available: boolean;
  path?: string;
}

export interface LibreDwgStatus {
  backend: "LibreDWG";
  mode: "libredwg-native+libredwg-web";
  tools: LibreDwgTool[];
  viewing: "LibreDWG dwgread when available; libredwg-web renderer otherwise";
  editing: "native dwgfilter/dwgadd/dwgwrite/dwgrewrite when available";
}

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

const TOOLS = [
  "dwgread",
  "dwgfilter",
  "dwgadd",
  "dwgwrite",
  "dwgrewrite",
  "dwg2dxf",
  "dxf2dwg",
];

function which(tool: string, toolDir?: string): string | undefined {
  if (toolDir) {
    const candidate = join(toolDir, tool);
    if (existsSync(candidate)) return candidate;
  }
  const result = spawnSync("/bin/sh", ["-lc", `command -v ${tool}`], {
    encoding: "utf-8",
  });
  const found = result.stdout.trim();
  return result.status === 0 && found ? found : undefined;
}

export function getLibreDwgStatus(toolDir?: string): LibreDwgStatus {
  return {
    backend: "LibreDWG",
    mode: "libredwg-native+libredwg-web",
    tools: TOOLS.map((name) => {
      const path = which(name, toolDir);
      return { name, available: Boolean(path), ...(path ? { path } : {}) };
    }),
    viewing: "LibreDWG dwgread when available; libredwg-web renderer otherwise",
    editing: "native dwgfilter/dwgadd/dwgwrite/dwgrewrite when available",
  };
}

function requireTool(tool: string, toolDir?: string): string {
  const path = which(tool, toolDir);
  if (!path) {
    throw new DwgCliError(
      `LibreDWG tool not found: ${tool}. Install LibreDWG and make sure ${tool} is on PATH.`,
      "LIBREDWG_TOOL_NOT_FOUND",
      EXIT_UNAVAILABLE,
    );
  }
  return path;
}

function runTool(
  tool: string,
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
    throw new DwgCliError(
      `${tool} failed for ${basename(args.at(-1) ?? "input")}: ${result.stderr || result.stdout}`.trim(),
      "LIBREDWG_RUN_FAILED",
      EXIT_USER_ERROR,
    );
  }
  return { stdout: result.stdout, stderr: result.stderr };
}

export function renderSvgWithLibreDwg(
  file: string,
  opts: { toolDir?: string } = {},
): LibreDwgViewResult {
  const result = runTool("dwgread", ["-O", "SVG", file], opts.toolDir);
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
  const result = runTool(
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
