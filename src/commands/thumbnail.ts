import { getThumbnail } from "../core/drawing.js";
import { output, success } from "../utils/output.js";
import {
  type DrawingCommandOptions,
  handleCommandError,
  type OutputFileOptions,
  writeCommandOutput,
} from "./shared.js";

export async function thumbnail(
  file: string,
  options: DrawingCommandOptions & OutputFileOptions,
): Promise<void> {
  try {
    const result = await getThumbnail(file, {
      reader: options.reader,
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
    writeCommandOutput(
      options,
      result.data,
      () => ({
        success: true,
        file: options.output,
        mimeType: result.mimeType,
        bytes: result.data.length,
      }),
      `Wrote ${options.output}`,
    );
  } catch (err) {
    handleCommandError(err);
  }
}
