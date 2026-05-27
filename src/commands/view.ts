import { writeOutput } from "../core/files.js";
import { renderSvgWithLibreDwg } from "../core/libredwg.js";
import type { OutputOptions } from "../utils/output.js";
import { output, success } from "../utils/output.js";
import { handleCommandError } from "./shared.js";

export interface ViewOptions extends OutputOptions {
  output?: string;
  toolDir?: string;
}

export async function view(file: string, options: ViewOptions): Promise<void> {
  try {
    const result = renderSvgWithLibreDwg(file, { toolDir: options.toolDir });
    const svg = result.svg;
    const tool = result.tool;

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
