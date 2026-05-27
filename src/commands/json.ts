import { toJson } from "../core/drawing.js";
import { writeOutput } from "../core/files.js";
import type { DwgParser } from "../types.js";
import type { OutputOptions } from "../utils/output.js";
import { output, success } from "../utils/output.js";
import { handleCommandError } from "./shared.js";

export async function json(
  file: string,
  options: OutputOptions & { output?: string; parser?: DwgParser },
): Promise<void> {
  try {
    const doc = await toJson(file, { parser: options.parser });
    const content = `${JSON.stringify(doc, null, 2)}\n`;
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
