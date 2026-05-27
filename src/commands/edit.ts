import { editWithLibreDwgFilter } from "../core/libredwg.js";
import type { OutputOptions } from "../utils/output.js";
import { output, success } from "../utils/output.js";
import { handleCommandError, userError } from "./shared.js";

export interface EditOptions extends OutputOptions {
  jq?: string;
  output?: string;
  overwrite?: boolean;
  toolDir?: string;
}

export async function edit(file: string, options: EditOptions): Promise<void> {
  try {
    if (!options.jq) {
      throw userError(
        "No edit expression specified. Use --jq <expression>.",
        "MISSING_EDIT_EXPRESSION",
      );
    }
    const result = editWithLibreDwgFilter({
      input: file,
      output: options.output ?? file,
      expression: options.jq,
      overwrite: options.overwrite,
      toolDir: options.toolDir,
    });
    output(options, {
      json: () => ({ success: true, ...result }),
      human: () => success(`Edited ${result.output} with LibreDWG dwgfilter`),
    });
  } catch (err) {
    handleCommandError(err);
  }
}
