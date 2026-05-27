import { Dwg } from "../sdk.js";
import type { DwgParser } from "../types.js";
import type { OutputOptions } from "../utils/output.js";
import { dim, output } from "../utils/output.js";
import { handleCommandError } from "./shared.js";

export async function layers(
  file: string,
  options: OutputOptions & { parser?: DwgParser; toolDir?: string } & {
    total?: boolean;
  },
): Promise<void> {
  try {
    const items = await Dwg.open(file, {
      parser: options.parser,
      toolDir: options.toolDir,
    }).layers();
    output(options, {
      json: () =>
        options.total
          ? { total: items.length, layers: items }
          : { layers: items },
      human: () => {
        if (options.total) console.log(String(items.length));
        else
          for (const layer of items)
            console.log(
              `${layer.name} ${dim(`${layer.entityCount} entities`)}`,
            );
      },
    });
  } catch (err) {
    handleCommandError(err);
  }
}
