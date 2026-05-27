import { Dwg } from "../sdk.js";
import type { DwgParser } from "../types.js";
import type { OutputOptions } from "../utils/output.js";
import { dim, output } from "../utils/output.js";
import { handleCommandError, parseLimit } from "./shared.js";

export async function entities(
  file: string,
  options: OutputOptions & { parser?: DwgParser } & {
    type?: string;
    layer?: string;
    limit?: string;
    total?: boolean;
  },
): Promise<void> {
  try {
    const items = await Dwg.open(file, { parser: options.parser }).entities({
      type: options.type,
      layer: options.layer,
      limit: parseLimit(options.limit),
    });
    output(options, {
      json: () =>
        options.total
          ? { total: items.length, entities: items }
          : { entities: items },
      human: () => {
        if (options.total) console.log(String(items.length));
        else
          for (const entity of items)
            console.log(
              `${entity.id} ${entity.type}${entity.layer ? ` ${dim(entity.layer)}` : ""}`,
            );
      },
    });
  } catch (err) {
    handleCommandError(err);
  }
}
