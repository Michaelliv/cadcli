import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DwgParser } from "../types.js";
import { blocks } from "./blocks.js";
import { entities } from "./entities.js";
import { info } from "./info.js";
import { init } from "./init.js";
import { json } from "./json.js";
import { layers } from "./layers.js";
import { onboard } from "./onboard.js";
import { svg } from "./svg.js";
import { thumbnail } from "./thumbnail.js";

let stdout = "";
let stderr = "";
let oldLog: typeof console.log;
let oldError: typeof console.error;
let oldExit: typeof process.exit;
let dir = "";
let file = "";

const parser: DwgParser = {
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

describe("commands", () => {
  test("init is idempotent and supports json/quiet", async () => {
    await init({ cwd: dir, json: true });
    expect(JSON.parse(stdout).created).toBe(true);
    resetOutput();
    await init({ cwd: dir, quiet: true });
    expect(stdout).toBe("");
    expect(existsSync(join(dir, ".dwg", "config.json"))).toBe(true);
  });

  test("onboard is idempotent and prefers CLAUDE.md", async () => {
    await onboard({ cwd: dir, json: true });
    expect(readFileSync(join(dir, "CLAUDE.md"), "utf-8")).toContain("<dwg>");
    resetOutput();
    await onboard({ cwd: dir, json: true });
    expect(JSON.parse(stdout).message).toBe("already_onboarded");
  });

  test("info, layers, blocks, and entities support json output", async () => {
    await info(file, { json: true, parser });
    expect(JSON.parse(stdout).counts.entities).toBe(1);
    resetOutput();
    await layers(file, { json: true, parser });
    expect(JSON.parse(stdout).layers[0].name).toBe("0");
    resetOutput();
    await blocks(file, { json: true, parser });
    expect(JSON.parse(stdout).blocks[0].name).toBe("Model");
    resetOutput();
    await entities(file, { json: true, parser, type: "LINE", total: true });
    expect(JSON.parse(stdout).total).toBe(1);
  });

  test("human and total modes stay concise", async () => {
    await info(file, { parser });
    expect(stdout).toContain("sample.dwg");
    resetOutput();
    await layers(file, { parser, total: true });
    expect(stdout.trim()).toBe("1");
    resetOutput();
    await blocks(file, { parser, total: true });
    expect(stdout.trim()).toBe("1");
    resetOutput();
    await entities(file, { parser, total: true });
    expect(stdout.trim()).toBe("1");
  });

  test("json, svg, and thumbnail write output files", async () => {
    const jsonOut = join(dir, "out.json");
    await json(file, { output: jsonOut, quiet: true, parser });
    expect(stdout).toBe("");
    expect(JSON.parse(readFileSync(jsonOut, "utf-8")).entities).toHaveLength(1);
    const svgOut = join(dir, "out.svg");
    await svg(file, { output: svgOut, json: true, parser });
    expect(readFileSync(svgOut, "utf-8")).toContain("<svg");
    resetOutput();
    const pngOut = join(dir, "thumb.png");
    await thumbnail(file, { output: pngOut, json: true, parser });
    expect(JSON.parse(stdout).bytes).toBe(3);
  });

  test("json, svg, and thumbnail can write primary data to stdout", async () => {
    await json(file, { parser });
    expect(JSON.parse(stdout).entities).toHaveLength(1);
    resetOutput();
    await svg(file, { parser });
    expect(stdout).toContain("<svg");
    resetOutput();
    await svg(file, { parser, json: true });
    expect(JSON.parse(stdout).rendered).toBe(1);
    resetOutput();
    await thumbnail(file, { parser, json: true });
    expect(JSON.parse(stdout).mimeType).toBe("image/png");
  });

  test("expected command failures exit with friendly errors", async () => {
    await expect(info(join(dir, "missing.dwg"), { parser })).rejects.toThrow(
      "exit:3",
    );
    expect(stderr).toContain("File not found");
    resetOutput();
    const noThumbParser: DwgParser = {
      async parse() {
        return {};
      },
    };
    await expect(thumbnail(file, { parser: noThumbParser })).rejects.toThrow(
      "exit:4",
    );
    expect(stderr).toContain("Thumbnail extraction is not available");
    resetOutput();
    const badParser: DwgParser = {
      async parse() {
        throw new Error("bad cad");
      },
    };
    await expect(info(file, { parser: badParser })).rejects.toThrow("exit:1");
    expect(stderr).toContain("bad cad");
    resetOutput();
    await expect(json(file, { parser, output: dir })).rejects.toThrow("exit:2");
    expect(stderr).toContain("Could not write output");
  });
});
