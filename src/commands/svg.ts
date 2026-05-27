import { toSvg } from "../core/drawing.js";
import { writeOutput } from "../core/files.js";
import type { DrawingReader } from "../types.js";
import type { OutputOptions } from "../utils/output.js";
import { output, success } from "../utils/output.js";
import { handleCommandError } from "./shared.js";

export async function svg(
  file: string,
  options: OutputOptions & {
    output?: string;
    reader?: DrawingReader;
    toolDir?: string;
  },
): Promise<void> {
  try {
    const result = await toSvg(file, {
      reader: options.reader,
      toolDir: options.toolDir,
    });
    if (options.output) {
      writeOutput(options.output, result.svg);
      output(options, {
        json: () => ({
          success: true,
          file: options.output,
          rendered: result.rendered,
          unsupported: result.unsupported,
        }),
        human: () =>
          success(
            `Wrote ${options.output} (${result.rendered} rendered, ${result.unsupported} unsupported)`,
          ),
      });
    } else if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(result.svg.trimEnd());
    }
  } catch (err) {
    handleCommandError(err);
  }
}
