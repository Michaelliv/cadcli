import {
  type CadDocument,
  DwgReader,
  DwgWriter,
  DxfReader,
  DxfWriter,
  SvgWriter,
} from "@node-projects/acad-ts";
import type { DwgFormat } from "../types.js";
import { EXIT_USER_ERROR } from "../utils/exit-codes.js";
import { arrayBufferFor } from "./adapter.js";
import { DwgCliError } from "./errors.js";
import { readCadFile } from "./files.js";

export interface AcadFile {
  bytes: Uint8Array;
  doc: CadDocument;
  format: DwgFormat;
}

export function parseAcadDocument(
  bytes: Uint8Array,
  format: DwgFormat,
): CadDocument {
  try {
    return format === "DWG"
      ? DwgReader.readFromStream(arrayBufferFor(bytes))
      : DxfReader.readFromStream(bytes);
  } catch (error) {
    throw new DwgCliError(
      `Could not parse ${format}: ${(error as Error).message}`,
      "PARSE_FAILED",
      EXIT_USER_ERROR,
    );
  }
}

export function readAcadFile(file: string): AcadFile {
  const { bytes, format } = readCadFile(file);
  return { bytes, format, doc: parseAcadDocument(bytes, format) };
}

function writeDwg(doc: CadDocument, originalBytes: number): Uint8Array {
  let size = Math.max(1024 * 1024, originalBytes * 4);
  const maxSize = 512 * 1024 * 1024;
  while (size <= maxSize) {
    const buffer = new ArrayBuffer(size);
    const writer = new DwgWriter(buffer, doc);
    writer.write();
    if (writer.bytesWritten <= size) {
      return new Uint8Array(buffer).slice(0, writer.bytesWritten);
    }
    size *= 2;
  }
  throw new DwgCliError(
    "Could not write DWG: output exceeded the maximum supported buffer size.",
    "ACAD_WRITE_FAILED",
    EXIT_USER_ERROR,
  );
}

function writeDxf(doc: CadDocument): Uint8Array {
  let content = "";
  DxfWriter.writeToStream(
    {
      write(value: string | Uint8Array) {
        content +=
          typeof value === "string" ? value : new TextDecoder().decode(value);
      },
      flush() {},
      close() {},
    },
    doc,
  );
  return new TextEncoder().encode(content);
}

export function writeAcadDocument(
  doc: CadDocument,
  format: DwgFormat,
  originalBytes: number,
): Uint8Array {
  try {
    return format === "DWG" ? writeDwg(doc, originalBytes) : writeDxf(doc);
  } catch (error) {
    if (error instanceof DwgCliError) throw error;
    throw new DwgCliError(
      `Could not write ${format}: ${(error as Error).message}`,
      "ACAD_WRITE_FAILED",
      EXIT_USER_ERROR,
    );
  }
}

function trimNullPadding(bytes: Uint8Array): Uint8Array {
  const end = bytes.indexOf(0);
  return end === -1 ? bytes : bytes.slice(0, end);
}

function isOutputCapacityError(error: unknown): boolean {
  return /offset is out of bounds|too small|outside the bounds/i.test(
    (error as Error).message,
  );
}

export function writeAcadSvg(doc: CadDocument): string {
  let size = 1024 * 1024;
  const maxSize = 256 * 1024 * 1024;
  while (size <= maxSize) {
    const output = new Uint8Array(size);
    try {
      const writer = new SvgWriter(output, doc);
      writer.write();
      writer.dispose();
      return new TextDecoder().decode(trimNullPadding(output));
    } catch (error) {
      if (!isOutputCapacityError(error) || size >= maxSize) {
        throw new DwgCliError(
          `Could not render SVG with acad-ts: ${(error as Error).message}`,
          "ACAD_SVG_FAILED",
          EXIT_USER_ERROR,
        );
      }
      size *= 2;
    }
  }
  throw new DwgCliError(
    "Could not render SVG with acad-ts: output exceeded the maximum supported buffer size.",
    "ACAD_SVG_FAILED",
    EXIT_USER_ERROR,
  );
}
