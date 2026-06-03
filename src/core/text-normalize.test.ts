import { describe, expect, test } from "bun:test";
import type { DwgDocument } from "../types.js";
import { normalizeTextAuto } from "./text-normalize.js";

function documentWith(opts: {
  codePage?: string;
  text: string;
  textStyleFile?: string;
}): DwgDocument {
  return {
    summary: {
      file: "office.dwg",
      format: "DWG",
      counts: { entities: 1, layers: 0, blocks: 0, unsupported: 0 },
    },
    metadata: { codePage: opts.codePage },
    layers: [],
    blocks: [],
    entities: [
      {
        id: "1",
        type: "MTEXT",
        layer: "A-TEXT",
        data: {
          text: opts.text,
          textStyleFile: opts.textStyleFile,
        },
      },
    ],
    unsupported: [],
    raw: {},
  };
}

describe("text normalization", () => {
  test("routes Hebrew legacy SHX text through keyboard-layout normalization", () => {
    const doc = normalizeTextAuto(
      documentWith({
        codePage: "ansi_1255",
        textStyleFile: "gil.shx",
        text: "jsr muu, 8",
      }),
    );

    expect(doc.entities[0].data.text).toBe("חדר צוות 8");
    expect(doc.metadata.textNormalization).toEqual({
      applied: ["hebrew-keyboard"],
      entitiesChanged: 1,
    });
  });

  test("does not corrupt ordinary Latin text without matching CAD evidence", () => {
    const doc = normalizeTextAuto(
      documentWith({
        codePage: "ansi_1255",
        textStyleFile: "arial.ttf",
        text: "manager station",
      }),
    );

    expect(doc.entities[0].data.text).toBe("manager station");
    expect(doc.metadata.textNormalization).toBeUndefined();
  });

  test("does not re-normalize text that is already in the target script", () => {
    const doc = normalizeTextAuto(
      documentWith({
        codePage: "ansi_1255",
        textStyleFile: "gil.shx",
        text: "חדר צוות 8",
      }),
    );

    expect(doc.entities[0].data.text).toBe("חדר צוות 8");
    expect(doc.metadata.textNormalization).toBeUndefined();
  });
});
