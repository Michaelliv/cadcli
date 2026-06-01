import { toSvg } from "../core/drawing.js";
import {
  type DrawingCommandOptions,
  handleCommandError,
  type OutputFileOptions,
  writeCommandOutput,
} from "./shared.js";

export async function svg(
  file: string,
  options: DrawingCommandOptions & OutputFileOptions,
): Promise<void> {
  try {
    const result = await toSvg(file, {
      reader: options.reader,
    });
    if (options.output) {
      writeCommandOutput(
        options,
        result.svg,
        () => ({
          success: true,
          file: options.output,
          rendered: result.rendered,
          unsupported: result.unsupported,
        }),
        `Wrote ${options.output} (${result.rendered} rendered, ${result.unsupported} unsupported)`,
      );
    } else if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(result.svg.trimEnd());
    }
  } catch (err) {
    handleCommandError(err);
  }
}
