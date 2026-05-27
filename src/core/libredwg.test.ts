import { describe, expect, test } from "bun:test";
import { editWithLibreDwgFilter, getLibreDwgStatus } from "./libredwg.js";

describe("LibreDWG backend", () => {
  test("reports native LibreDWG tool availability", () => {
    const status = getLibreDwgStatus();
    expect(status.backend).toBe("LibreDWG");
    expect(status.mode).toBe("native+wasm");
    expect(status.tools.map((tool) => tool.name)).toContain("dwgfilter");
  });

  test("refuses in-place edits without explicit overwrite", () => {
    expect(() =>
      editWithLibreDwgFilter({
        input: "drawing.dwg",
        output: "drawing.dwg",
        expression: ".",
      }),
    ).toThrow("Refusing to edit in place");
  });
});
