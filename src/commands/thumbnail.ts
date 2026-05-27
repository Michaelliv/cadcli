import { getThumbnail } from "../core/drawing.js";
import { writeOutput } from "../core/files.js";
import type { DwgParser } from "../types.js";
import type { OutputOptions } from "../utils/output.js";
import { output, success } from "../utils/output.js";
import { handleCommandError } from "./shared.js";

export async function thumbnail(
  file: string,
  options: OutputOptions & {
    output?: string;
    parser?: DwgParser;
    toolDir?: string;
  },
): Promise<void> {
  try {
    const result = await getThumbnail(file, {
      parser: options.parser,
      toolDir: options.toolDir,
    });
    if (!options.output) {
      output(options, {
        json: () => ({
          mimeType: result.mimeType,
          extension: result.extension,
          bytes: result.data.length,
        }),
        human: () =>
          success(
            `Thumbnail available (${result.mimeType}, ${result.data.length} bytes). Use -o to write it.`,
          ),
      });
      return;
    }
    writeOutput(options.output, result.data);
    output(options, {
      json: () => ({
        success: true,
        file: options.output,
        mimeType: result.mimeType,
        bytes: result.data.length,
      }),
      human: () => success(`Wrote ${options.output}`),
    });
  } catch (err) {
    handleCommandError(err);
  }
}
