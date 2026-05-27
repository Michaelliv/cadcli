import { toSvg } from "../core/drawing.js";
import { DwgCliError } from "../core/errors.js";
import { writeOutput } from "../core/files.js";
import { renderSvgWithLibreDwg } from "../core/libredwg.js";
import type { OutputOptions } from "../utils/output.js";
import { output, success } from "../utils/output.js";
import { handleCommandError } from "./shared.js";

export interface ViewOptions extends OutputOptions {
  output?: string;
}

export async function view(file: string, options: ViewOptions): Promise<void> {
  try {
    let svg: string;
    let tool: string;
    try {
      const result = renderSvgWithLibreDwg(file);
      svg = result.svg;
      tool = result.tool;
    } catch (err) {
      if (
        !(err instanceof DwgCliError) ||
        err.code !== "LIBREDWG_TOOL_NOT_FOUND"
      )
        throw err;
      const fallback = await toSvg(file);
      svg = fallback.svg;
      tool = "libredwg-web+internal-svg";
    }

    if (options.output) {
      writeOutput(options.output, svg);
      output(options, {
        json: () => ({
          success: true,
          file: options.output,
          backend: "LibreDWG",
          tool,
        }),
        human: () => success(`Wrote ${options.output} with ${tool}`),
      });
      return;
    }
    if (options.json) {
      console.log(JSON.stringify({ backend: "LibreDWG", tool, svg }, null, 2));
    } else {
      console.log(svg.trimEnd());
    }
  } catch (err) {
    handleCommandError(err);
  }
}
