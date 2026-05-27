import { editWithLibreDwgFilter } from "../core/libredwg.js";
import type { OutputOptions } from "../utils/output.js";
import { output, success } from "../utils/output.js";
import { handleCommandError } from "./shared.js";

export interface EditOptions extends OutputOptions {
  jq?: string;
  output?: string;
  overwrite?: boolean;
}

export async function edit(file: string, options: EditOptions): Promise<void> {
  try {
    if (!options.jq)
      throw new Error("No edit expression specified. Use --jq <expression>.");
    const result = editWithLibreDwgFilter({
      input: file,
      output: options.output ?? file,
      expression: options.jq,
      overwrite: options.overwrite,
    });
    output(options, {
      json: () => ({ success: true, ...result }),
      human: () => success(`Edited ${result.output} with LibreDWG dwgfilter`),
    });
  } catch (err) {
    handleCommandError(err);
  }
}
