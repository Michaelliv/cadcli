import { toJson } from "../core/drawing.js";
import { stringifyJson } from "../utils/output.js";
import {
  type DrawingCommandOptions,
  handleCommandError,
  type OutputFileOptions,
  writeCommandOutput,
} from "./shared.js";

export async function json(
  file: string,
  options: DrawingCommandOptions & OutputFileOptions,
): Promise<void> {
  try {
    const doc = await toJson(file, {
      reader: options.reader,
    });
    const content = `${stringifyJson(doc)}\n`;
    if (options.output) {
      writeCommandOutput(
        options,
        content,
        () => ({ success: true, file: options.output }),
        `Wrote ${options.output}`,
      );
      return;
    }
    console.log(content.trimEnd());
  } catch (err) {
    handleCommandError(err);
  }
}
