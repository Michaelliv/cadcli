import { renderSvgWithAcadTs } from "../core/acad-view.js";
import type { OutputOptions } from "../utils/output.js";
import { handleCommandError, writeCommandOutput } from "./shared.js";

export interface ViewOptions extends OutputOptions {
  output?: string;
}

export async function view(file: string, options: ViewOptions): Promise<void> {
  try {
    const result = renderSvgWithAcadTs(file);
    const svg = result.svg;

    if (options.output) {
      writeCommandOutput(
        options,
        svg,
        () => ({
          success: true,
          file: options.output,
          backend: "acad-ts",
        }),
        `Wrote ${options.output} with acad-ts`,
      );
      return;
    }
    if (options.json) {
      console.log(JSON.stringify({ backend: "acad-ts", svg }, null, 2));
    } else {
      console.log(svg.trimEnd());
    }
  } catch (err) {
    handleCommandError(err);
  }
}
