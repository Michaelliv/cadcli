import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { LibredwgParser } from "./adapter.js";

let stdout = "";
let stderr = "";
let oldLog: typeof console.log;
let oldError: typeof console.error;

beforeEach(() => {
  stdout = "";
  stderr = "";
  oldLog = console.log;
  oldError = console.error;
  console.log = (...args: unknown[]) => {
    stdout += `${args.join(" ")}\n`;
  };
  console.error = (...args: unknown[]) => {
    stderr += `${args.join(" ")}\n`;
  };
});

afterEach(() => {
  console.log = oldLog;
  console.error = oldError;
});

describe("LibredwgParser", () => {
  test("loads libredwg-web, redirects parser logs, converts, and frees", async () => {
    let freed: unknown;
    const parser = new LibredwgParser("/wasm/", async () => ({
      Dwg_File_Type: { DWG: 1, DXF: 2 },
      LibreDwg: {
        async create(wasmPath?: string) {
          expect(wasmPath).toBe("/wasm/");
          return {
            dwg_read_data(bytes: Uint8Array, fileType: unknown) {
              console.log("native log");
              expect(bytes).toEqual(new Uint8Array([1]));
              expect(fileType).toBe(1);
              return "dwg-pointer";
            },
            convert(dwg: unknown) {
              expect(dwg).toBe("dwg-pointer");
              return { entities: [] };
            },
            dwg_free(dwg: unknown) {
              freed = dwg;
            },
          };
        },
      },
    }));

    await expect(
      parser.parse("x.dwg", new Uint8Array([1]), "DWG"),
    ).resolves.toEqual({ entities: [] });
    expect(freed).toBe("dwg-pointer");
    expect(stdout).toBe("");
    expect(stderr).toContain("native log");
  });

  test("wraps parser load and parse failures", async () => {
    const loadFail = new LibredwgParser(undefined, async () => {
      throw new Error("missing wasm");
    });
    await expect(
      loadFail.parse("x.dwg", new Uint8Array(), "DWG"),
    ).rejects.toThrow("Could not load @mlightcad/libredwg-web: missing wasm");

    const parseFail = new LibredwgParser(undefined, async () => ({
      Dwg_File_Type: { DWG: 1 },
      LibreDwg: {
        async create() {
          return {
            dwg_read_data() {
              throw new Error("bad drawing");
            },
            convert() {
              return {};
            },
          };
        },
      },
    }));
    await expect(
      parseFail.parse("x.dwg", new Uint8Array(), "DWG"),
    ).rejects.toThrow("Could not parse drawing: bad drawing");
  });

  test("reports thumbnail extraction as unavailable", async () => {
    const parser = new LibredwgParser();
    await expect(parser.thumbnail()).rejects.toThrow(
      "Thumbnail extraction is not available",
    );
  });

  test("default libredwg-web loader is wired", async () => {
    const parser = new LibredwgParser();
    try {
      const result = await parser.parse(
        "bad.dwg",
        new Uint8Array([1, 2, 3]),
        "DWG",
      );
      expect(result).toBeDefined();
    } catch (error) {
      expect((error as Error).message).toMatch(
        /Could not (load @mlightcad\/libredwg-web|parse drawing)/,
      );
    }
  });
});
