import { toJson } from "../core/drawing.js";
import { writeOutput } from "../core/files.js";
import type { DwgParser } from "../types.js";
import type { OutputOptions } from "../utils/output.js";
import { output, stringifyJson, success } from "../utils/output.js";
import { handleCommandError } from "./shared.js";

export async function json(
  file: string,
  options: OutputOptions & {
    output?: string;
    parser?: DwgParser;
    toolDir?: string;
  },
): Promise<void> {
  try {
    const doc = await toJson(file, {
      parser: options.parser,
      toolDir: options.toolDir,
    });
    const content = `${stringifyJson(doc)}\n`;
    if (options.output) {
      writeOutput(options.output, content);
      output(options, {
        json: () => ({ success: true, file: options.output }),
        human: () => success(`Wrote ${options.output}`),
      });
    } else {
      console.log(content.trimEnd());
    }
  } catch (err) {
    handleCommandError(err);
  }
}
