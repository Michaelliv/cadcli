import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DrawingReader } from "../types.js";
import { blocks } from "./blocks.js";
import { edit } from "./edit.js";
import { entities } from "./entities.js";
import { info } from "./info.js";
import { json } from "./json.js";
import { layers } from "./layers.js";
import { search } from "./search.js";
import { svg } from "./svg.js";
import { thumbnail } from "./thumbnail.js";
import { view } from "./view.js";

let stdout = "";
let stderr = "";
let oldLog: typeof console.log;
let oldError: typeof console.error;
let oldExit: typeof process.exit;
let dir = "";
let file = "";

const parser: DrawingReader = {
  async parse() {
    return {
      layers: [{ name: "0" }],
      blocks: [{ name: "Model", entities: [] }],
      entities: [
        {
          handle: "a",
          type: "LINE",
          layer: "0",
          start: { x: 0, y: 0 },
          end: { x: 1, y: 1 },
        },
      ],
    };
  },
  async thumbnail() {
    return {
      data: new Uint8Array([1, 2, 3]),
      mimeType: "image/png",
      extension: "png",
    };
  },
};

function resetOutput() {
  stdout = "";
  stderr = "";
}

beforeEach(() => {
  resetOutput();
  oldLog = console.log;
  oldError = console.error;
  oldExit = process.exit;
  console.log = (...args: unknown[]) => {
    stdout += `${args.join(" ")}\n`;
  };
  console.error = (...args: unknown[]) => {
    stderr += `${args.join(" ")}\n`;
  };
  process.exit = ((code?: string | number | null) => {
    throw new Error(`exit:${code}`);
  }) as typeof process.exit;
  dir = `/tmp/dwgcli-cmd-${Date.now()}-${Math.random()}`;
  mkdirSync(dir, { recursive: true });
  file = join(dir, "sample.dwg");
  writeFileSync(file, "fake");
});

afterEach(() => {
  console.log = oldLog;
  console.error = oldError;
  process.exit = oldExit;
});

function addTool(name: string, body: string): void {
  const binDir = join(dir, "bin");
  mkdirSync(binDir, { recursive: true });
  const toolPath = join(binDir, name);
  writeFileSync(toolPath, `#!/bin/sh\n${body}\n`);
  chmodSync(toolPath, 0o755);
}

describe("commands", () => {
  test("info, layers, blocks, and entities support json output", async () => {
    await info(file, { json: true, reader: parser });
    expect(JSON.parse(stdout).counts.entities).toBe(1);
    resetOutput();
    await layers(file, { json: true, reader: parser });
    expect(JSON.parse(stdout).layers[0].name).toBe("0");
    resetOutput();
    await blocks(file, { json: true, reader: parser });
    expect(JSON.parse(stdout).blocks[0].name).toBe("Model");
    resetOutput();
    await entities(file, {
      json: true,
      reader: parser,
      type: "LINE",
      total: true,
    });
    expect(JSON.parse(stdout).total).toBe(1);
  });

  test("search supports json, scoring, snippets, and total", async () => {
    await search(file, {
      reader: parser,
      json: true,
      query: "line",
      score: true,
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.results[0].type).toBe("LINE");
    expect(parsed.results[0].score).toBeGreaterThan(0);
    expect(parsed.results[0].matches.length).toBeGreaterThan(0);
    resetOutput();
    await search(file, {
      reader: parser,
      total: true,
      type: "LINE",
      limit: "1",
    });
    expect(stdout.trim()).toBe("1");
  });

  test("human and total modes stay concise", async () => {
    await info(file, { reader: parser });
    expect(stdout).toContain("sample.dwg");
    resetOutput();
    await layers(file, { reader: parser, total: true });
    expect(stdout.trim()).toBe("1");
    resetOutput();
    await blocks(file, { reader: parser, total: true });
    expect(stdout.trim()).toBe("1");
    resetOutput();
    await entities(file, { reader: parser, total: true });
    expect(stdout.trim()).toBe("1");
    resetOutput();
    await layers(file, { reader: parser });
    expect(stdout).toContain("0");
    resetOutput();
    await blocks(file, { reader: parser });
    expect(stdout).toContain("Model");
    resetOutput();
    await entities(file, { reader: parser });
    expect(stdout).toContain("LINE");
    resetOutput();
    await search(file, { reader: parser, query: "line", score: true });
    expect(stdout).toContain("score");
  });

  test("view and edit use LibreDWG native tools", async () => {
    addTool("dwgread", "echo '<svg>native</svg>'");
    const viewOut = join(dir, "view.svg");
    await view(file, {
      output: viewOut,
      json: true,
      toolDir: join(dir, "bin"),
    });
    expect(JSON.parse(stdout).tool).toBe("dwgread");
    expect(readFileSync(viewOut, "utf-8")).toContain("native");
    resetOutput();

    addTool("dwgfilter", "echo edited >&2");
    const editOut = join(dir, "edited.dwg");
    await edit(file, {
      jq: ".",
      output: editOut,
      json: true,
      toolDir: join(dir, "bin"),
    });
    expect(JSON.parse(stdout).tool).toBe("dwgfilter");
    resetOutput();
    await edit(file, {
      jq: ".",
      output: editOut,
      toolDir: join(dir, "bin"),
    });
    expect(stdout).toContain("Edited");
    resetOutput();
    expect(readFileSync(editOut, "utf-8")).toBe("fake");
    resetOutput();
    await view(file, { json: true, toolDir: join(dir, "bin") });
    expect(JSON.parse(stdout).svg).toContain("native");
    resetOutput();
    await view(file, {
      output: join(dir, "view-human.svg"),
      toolDir: join(dir, "bin"),
    });
    expect(stdout).toContain("Wrote");
  });

  test("view writes SVG to stdout in human mode", async () => {
    addTool("dwgread", "echo '<svg>stdout</svg>'");
    await view(file, { toolDir: join(dir, "bin") });
    expect(stdout).toContain("stdout");
  });

  test("edit validates jq input and native tool availability", async () => {
    await expect(edit(file, {})).rejects.toThrow("exit:1");
    expect(stderr).toContain("No edit expression specified");
    resetOutput();
    await expect(
      edit(file, {
        jq: ".",
        output: join(dir, "x.dwg"),
        toolDir: join(dir, "bin"),
      }),
    ).rejects.toThrow("exit:4");
    expect(stderr).toContain("LibreDWG tool not found");
  });

  test("json, svg, and thumbnail write output files", async () => {
    const jsonOut = join(dir, "out.json");
    await json(file, { output: jsonOut, quiet: true, reader: parser });
    expect(stdout).toBe("");
    resetOutput();
    await json(file, { output: jsonOut, json: true, reader: parser });
    expect(JSON.parse(stdout).success).toBe(true);
    resetOutput();
    await json(file, { output: jsonOut, reader: parser });
    expect(stdout).toContain("Wrote");
    resetOutput();
    expect(JSON.parse(readFileSync(jsonOut, "utf-8")).entities).toHaveLength(1);
    const svgOut = join(dir, "out.svg");
    await svg(file, { output: svgOut, json: true, reader: parser });
    expect(readFileSync(svgOut, "utf-8")).toContain("<svg");
    resetOutput();
    await svg(file, { output: svgOut, reader: parser });
    expect(stdout).toContain("rendered");
    resetOutput();
    const pngOut = join(dir, "thumb.png");
    await thumbnail(file, { output: pngOut, json: true, reader: parser });
    expect(JSON.parse(stdout).bytes).toBe(3);
    resetOutput();
    await thumbnail(file, { reader: parser });
    expect(stdout).toContain("Thumbnail available");
    resetOutput();
    await thumbnail(file, { output: pngOut, reader: parser });
    expect(stdout).toContain("Wrote");
  });

  test("json, svg, and thumbnail can write primary data to stdout", async () => {
    await json(file, { reader: parser });
    expect(JSON.parse(stdout).entities).toHaveLength(1);
    resetOutput();
    await svg(file, { reader: parser });
    expect(stdout).toContain("<svg");
    resetOutput();
    await svg(file, { reader: parser, json: true });
    expect(JSON.parse(stdout).rendered).toBe(1);
    resetOutput();
    await thumbnail(file, { reader: parser, json: true });
    expect(JSON.parse(stdout).mimeType).toBe("image/png");
  });

  test("expected command failures exit with friendly errors", async () => {
    await expect(
      info(join(dir, "missing.dwg"), { reader: parser }),
    ).rejects.toThrow("exit:3");
    expect(stderr).toContain("File not found");
    resetOutput();
    const noThumbParser: DrawingReader = {
      async parse() {
        return {};
      },
    };
    await expect(thumbnail(file, { reader: noThumbParser })).rejects.toThrow(
      "exit:4",
    );
    expect(stderr).toContain("Thumbnail extraction is not available");
    resetOutput();
    const badParser: DrawingReader = {
      async parse() {
        throw new Error("bad cad");
      },
    };
    await expect(info(file, { reader: badParser })).rejects.toThrow("exit:1");
    expect(stderr).toContain("bad cad");
    resetOutput();
    await expect(blocks(file, { reader: badParser })).rejects.toThrow("exit:1");
    expect(stderr).toContain("bad cad");
    resetOutput();
    await expect(layers(file, { reader: badParser })).rejects.toThrow("exit:1");
    expect(stderr).toContain("bad cad");
    resetOutput();
    await expect(
      search(file, { reader: parser, limit: "bad" }),
    ).rejects.toThrow("exit:1");
    expect(stderr).toContain("Invalid limit");
    resetOutput();
    await expect(svg(file, { reader: badParser })).rejects.toThrow("exit:1");
    expect(stderr).toContain("bad cad");
    resetOutput();
    addTool("dwgread", "echo nope >&2; exit 2");
    await expect(view(file, { toolDir: join(dir, "bin") })).rejects.toThrow(
      "exit:2",
    );
    expect(stderr).toContain("dwgread failed");
    resetOutput();
    await expect(json(file, { reader: parser, output: dir })).rejects.toThrow(
      "exit:2",
    );
    expect(stderr).toContain("Could not write output");
    resetOutput();
    await expect(
      entities(file, { reader: parser, limit: "bad" }),
    ).rejects.toThrow("exit:1");
    expect(stderr).toContain("Invalid limit");
  });
});
