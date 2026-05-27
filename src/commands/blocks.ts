import { dim, output } from "../utils/output.js";
import {
  type DrawingCommandOptions,
  drawingFor,
  handleCommandError,
} from "./shared.js";

export async function blocks(
  file: string,
  options: DrawingCommandOptions & { total?: boolean },
): Promise<void> {
  try {
    const items = await drawingFor(file, options).blocks();
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
