import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ACadVersion,
  CadDocument,
  DxfReader,
  DxfWriter,
  TextEntity,
  XYZ,
} from "@node-projects/acad-ts";
import type { DrawingReader } from "../types.js";
import { blocks } from "./blocks.js";
import { edit } from "./edit.js";
import { entities } from "./entities.js";
import { info } from "./info.js";
import { json } from "./json.js";
import { layers } from "./layers.js";
import { overview } from "./overview.js";
import { render } from "./render.js";
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
          text: "Conference room",
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

function writeCadFixture(path: string): string {
  const doc = new CadDocument(ACadVersion.AC1032);
  const text = new TextEntity();
  text.value = "Old label";
  text.insertPoint = new XYZ(1, 2, 0);
  doc.modelSpace?.entities.add(text);
  let content = "";
  DxfWriter.writeToStream(
    {
      write(value: string) {
        content += value;
      },
      flush() {},
      close() {},
    },
    doc,
  );
  writeFileSync(path, content);
  return String(text.handle);
}

function readFirstText(path: string): TextEntity | undefined {
  const bytes = readFileSync(path);
  const doc = DxfReader.readFromStream(
    new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
  );
  return [...(doc.modelSpace?.entities ?? [])].find(
    (entity) => entity instanceof TextEntity,
  ) as TextEntity | undefined;
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
    resetOutput();
    await overview(file, { json: true, reader: parser, keywords: "3" });
    expect(JSON.parse(stdout).searchHints).toContain("conference");
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
    resetOutput();
    await overview(file, { reader: parser });
    expect(stdout).toContain("SEARCH HINTS");
    expect(stdout).toContain("Conference room");
  });

  test("view and edit use acad-ts", async () => {
    const cadFile = join(dir, "sample.dxf");
    const id = writeCadFixture(cadFile);
    const viewOut = join(dir, "view.svg");
    await view(cadFile, { output: viewOut, json: true });
    expect(JSON.parse(stdout).backend).toBe("acad-ts");
    expect(readFileSync(viewOut, "utf-8")).toContain("<svg");
    resetOutput();

    const editOut = join(dir, "edited.dxf");
    await edit(cadFile, {
      setText: "New label",
      textId: id,
      output: editOut,
      json: true,
    });
    expect(JSON.parse(stdout).backend).toBe("acad-ts");
    expect(readFirstText(editOut).value).toBe("New label");
    resetOutput();

    await view(cadFile, { json: true });
    expect(JSON.parse(stdout).svg).toContain("<svg");
    resetOutput();
    await view(cadFile, { output: join(dir, "view-human.svg") });
    expect(stdout).toContain("Wrote");
  });

  test("view writes SVG to stdout in human mode", async () => {
    const cadFile = join(dir, "sample.dxf");
    writeCadFixture(cadFile);
    await view(cadFile, {});
    expect(stdout).toContain("<svg");
  });

  test("edit validates acad-ts input", async () => {
    await expect(edit(file, {})).rejects.toThrow("exit:2");
    expect(stderr).toContain("No edit operation specified");
    resetOutput();
    await expect(
      edit(file, {
        setText: "New label",
        output: join(dir, "x.dxf"),
      }),
    ).rejects.toThrow("exit:2");
    expect(stderr).toContain("--set-text requires --text-id");
    resetOutput();
    await expect(
      edit(file, {
        move: "1",
        dx: "wat",
        output: join(dir, "x.dxf"),
      }),
    ).rejects.toThrow("exit:2");
    expect(stderr).toContain("Invalid --dx");
    resetOutput();

    const cadFile = join(dir, "sample.dxf");
    const id = writeCadFixture(cadFile);
    const editOut = join(dir, "layered.dxf");
    await edit(cadFile, {
      setLayer: "A-NEW",
      layerId: id,
      delete: id,
      output: editOut,
      json: true,
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.changed).toBe(2);
    expect(readFirstText(editOut)).toBeUndefined();
  });

  test("render writes diagnostic bundles for agent visual understanding", async () => {
    const renderParser: DrawingReader = {
      async parse() {
        return {
          layers: [{ name: "wall" }, { name: "ריהוט" }],
          blocks: [
            {
              name: "DoorBlock",
              entities: [
                {
                  type: "LINE",
                  start: { x: 0, y: 0 },
                  end: { x: 2, y: 0 },
                },
              ],
            },
          ],
          entities: [
            {
              handle: "wall1",
              type: "LINE",
              layer: "wall",
              start: { x: 0, y: 0 },
              end: { x: 10, y: 0 },
            },
            {
              handle: "label1",
              type: "TEXT",
              layer: "ריהוט",
              text: "חדר תקשורת",
              position: { x: 4, y: 2 },
            },
            {
              handle: "insert1",
              type: "INSERT",
              layer: "wall",
              blockName: "DoorBlock",
              insertionPoint: { x: 5, y: 0 },
            },
          ],
        };
      },
    };

    const renderOut = join(dir, "render.png");
    await render(file, {
      output: renderOut,
      json: true,
      reader: renderParser,
      markLabel: "חדר תקשורת",
    });
    expect(JSON.parse(stdout).rendered).toBeGreaterThan(1);
    expect(readFileSync(renderOut).subarray(0, 8).toString("hex")).toBe(
      "89504e470d0a1a0a",
    );
    resetOutput();

    const bundleOut = join(dir, "renders");
    await render(file, {
      output: bundleOut,
      json: true,
      reader: renderParser,
      diagnose: true,
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.success).toBe(true);
    expect(parsed.renders.map((item: { name: string }) => item.name)).toEqual([
      "overview",
      "architecture",
      "no-furniture",
      "furniture",
      "evidence-marked",
    ]);
    expect(readFileSync(join(bundleOut, "evidence.json"), "utf-8")).toContain(
      "architecture",
    );
    expect(
      readFileSync(join(bundleOut, "overview.png"))
        .subarray(0, 8)
        .toString("hex"),
    ).toBe("89504e470d0a1a0a");
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
    ).rejects.toThrow("exit:2");
    expect(stderr).toContain("Invalid limit");
    resetOutput();
    await expect(svg(file, { reader: badParser })).rejects.toThrow("exit:1");
    expect(stderr).toContain("bad cad");
    resetOutput();
    await expect(view(file, {})).rejects.toThrow("exit:2");
    expect(stderr).toContain("Could not parse DWG");
    resetOutput();
    await expect(json(file, { reader: parser, output: dir })).rejects.toThrow(
      "exit:2",
    );
    expect(stderr).toContain("Could not write output");
    resetOutput();
    await expect(
      entities(file, { reader: parser, limit: "bad" }),
    ).rejects.toThrow("exit:2");
    expect(stderr).toContain("Invalid limit");
    resetOutput();
    await expect(
      overview(file, { reader: parser, keywords: "bad" }),
    ).rejects.toThrow("exit:2");
    expect(stderr).toContain("Invalid limit");
  });
});
