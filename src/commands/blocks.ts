import { Dwg } from "../sdk.js";
import type { DrawingReader } from "../types.js";
import type { OutputOptions } from "../utils/output.js";
import { dim, output } from "../utils/output.js";
import { handleCommandError } from "./shared.js";

export async function blocks(
  file: string,
  options: OutputOptions & { reader?: DrawingReader; toolDir?: string } & {
    total?: boolean;
  },
): Promise<void> {
  try {
    const items = await Dwg.open(file, {
      reader: options.reader,
      toolDir: options.toolDir,
    }).blocks();
    output(options, {
      json: () =>
        options.total
          ? { total: items.length, blocks: items }
          : { blocks: items },
      human: () => {
        if (options.total) console.log(String(items.length));
        else
          for (const block of items)
            console.log(
              `${block.name} ${dim(`${block.entityCount} entities`)}`,
            );
      },
    });
  } catch (err) {
    handleCommandError(err);
  }
}
