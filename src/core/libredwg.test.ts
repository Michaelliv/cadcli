import { beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  editWithLibreDwgFilter,
  readJsonWithLibreDwg,
  renderSvgWithLibreDwg,
} from "./libredwg.js";

let dir = "";
let binDir = "";

function addTool(name: string, body: string): string {
  const toolPath = join(binDir, name);
  writeFileSync(toolPath, `#!/bin/sh\n${body}\n`);
  chmodSync(toolPath, 0o755);
  return toolPath;
}

beforeEach(() => {
  dir = `/tmp/cadcli-libredwg-${Date.now()}-${Math.random()}`;
  binDir = join(dir, "bin");
  mkdirSync(binDir, { recursive: true });
});

describe("native LibreDWG boundary", () => {
  test("reads JSON through dwgread", () => {
    addTool("dwgread", `echo '{"entities":[]}'`);
    const result = readJsonWithLibreDwg("drawing.dwg", { toolDir: binDir });
    expect(result).toEqual({
      input: "drawing.dwg",
      json: { entities: [] },
      backend: "LibreDWG",
      tool: "dwgread",
      stderr: "",
    });
  });

  test("renders SVG through dwgread", () => {
    addTool("dwgread", "echo '<svg></svg>'; echo warning >&2");
    const result = renderSvgWithLibreDwg("drawing.dwg", { toolDir: binDir });
    expect(result).toEqual({
      input: "drawing.dwg",
      svg: "<svg></svg>\n",
      backend: "LibreDWG",
      tool: "dwgread",
      stderr: "warning\n",
    });
  });

  test("finds tools on PATH when no tool directory is provided", () => {
    addTool("dwgread", "echo '<svg>path</svg>'");
    const oldPath = process.env.PATH;
    process.env.PATH = `${binDir}${oldPath ? `:${oldPath}` : ""}`;
    try {
      expect(renderSvgWithLibreDwg("drawing.dwg").svg).toContain("path");
    } finally {
      process.env.PATH = oldPath;
    }
  });

  test("edits a copied output through dwgfilter", () => {
    addTool("dwgfilter", "echo edited >&2");
    const input = join(dir, "in.dwg");
    const output = join(dir, "out.dwg");
    writeFileSync(input, "source");
    const result = editWithLibreDwgFilter({
      input,
      output,
      expression: ".OBJECTS[]",
      toolDir: binDir,
    });
    expect(readFileSync(output, "utf-8")).toBe("source");
    expect(result.stderr).toBe("edited\n");
    expect(result.output).toBe(output);
  });

  test("allows explicit in-place edits", () => {
    addTool("dwgfilter", "exit 0");
    const input = join(dir, "same.dwg");
    writeFileSync(input, "source");
    const result = editWithLibreDwgFilter({
      input,
      output: input,
      expression: ".",
      overwrite: true,
      toolDir: binDir,
    });
    expect(result.input).toBe(input);
    expect(result.output).toBe(input);
  });

  test("refuses accidental in-place edits", () => {
    expect(() =>
      editWithLibreDwgFilter({
        input: "drawing.dwg",
        output: "drawing.dwg",
        expression: ".",
      }),
    ).toThrow("Refusing to edit in place");
  });

  test("throws friendly errors for missing, failing, and malformed tool output", () => {
    expect(() =>
      renderSvgWithLibreDwg("missing.dwg", { toolDir: binDir }),
    ).toThrow("LibreDWG tool not found: dwgread");

    addTool("dwgread", "echo nope >&2; exit 7");
    expect(() => renderSvgWithLibreDwg("bad.dwg", { toolDir: binDir })).toThrow(
      "dwgread failed for bad.dwg: nope",
    );

    addTool("dwgread", "printf 'not-json'");
    expect(() => readJsonWithLibreDwg("bad.dwg", { toolDir: binDir })).toThrow(
      "stdout: not-json",
    );

    addTool("dwgread", `python3 -c "print('x' * 600, end='')"`);
    expect(() => readJsonWithLibreDwg("bad.dwg", { toolDir: binDir })).toThrow(
      "…",
    );
  });

  test("wraps spawn errors", () => {
    mkdirSync(join(binDir, "dwgread"));
    expect(() => renderSvgWithLibreDwg("bad.dwg", { toolDir: binDir })).toThrow(
      "Could not run dwgread",
    );
  });
});
