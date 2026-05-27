import { dim, output } from "../utils/output.js";
import {
  type DrawingCommandOptions,
  drawingFor,
  handleCommandError,
} from "./shared.js";

export async function layers(
  file: string,
  options: DrawingCommandOptions & { total?: boolean },
): Promise<void> {
  try {
    const items = await drawingFor(file, options).layers();
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
