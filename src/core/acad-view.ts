import { type CadDocument, Color } from "@node-projects/acad-ts";
import { readAcadFile, writeAcadSvg } from "./acad.js";

export interface AcadSvgViewResult {
  input: string;
  svg: string;
  backend: "acad-ts";
}

// acad-ts SvgWriter currently crashes when text resolves ByLayer/ByBlock
// through an index that has no RGB entry. Normalize render-only colors here;
// the source file is untouched because view reparses the document every time.
function makeEntityColorsRenderable(doc: CadDocument): void {
  for (const entity of doc.modelSpace?.entities ?? []) {
    const candidate = entity as {
      color?: { isByLayer?: boolean; isByBlock?: boolean };
    };
    if (candidate.color?.isByLayer || candidate.color?.isByBlock) {
      candidate.color = Color.black;
    }
  }
}

export function renderSvgWithAcadTs(file: string): AcadSvgViewResult {
  const { doc } = readAcadFile(file);
  makeEntityColorsRenderable(doc);
  return {
    input: file,
    svg: writeAcadSvg(doc),
    backend: "acad-ts",
  };
}
