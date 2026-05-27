import { bold, dim, output } from "../utils/output.js";
import {
  type DrawingCommandOptions,
  drawingFor,
  handleCommandError,
  parseLimit,
} from "./shared.js";

export async function overview(
  file: string,
  options: DrawingCommandOptions & {
    keywords?: string;
    samples?: string;
  },
): Promise<void> {
  try {
    const result = await drawingFor(file, options).overview({
      keywords: parseLimit(options.keywords),
      samples: parseLimit(options.samples),
    });
    output(options, {
      json: () => result,
      human: () => {
        console.log(
          dim(
            "WORKFLOW: overview (you are here) → search/entities → view/edit",
          ),
        );
        console.log("");
        console.log(bold("SUMMARY"));
        console.log(
          `  ${result.summary.format} · ${result.summary.counts.entities} entities · ${result.summary.counts.layers} layers · ${result.summary.counts.blocks} blocks`,
        );
        console.log("");

        if (result.layers.length > 0) {
          console.log(bold("LAYERS"));
          for (const layer of result.layers) {
            console.log(layer.name);
            console.log(`  ${dim("entities:")} ${layer.entities}`);
            if (layer.types.length > 0) {
              console.log(`  ${dim("types:")} ${layer.types.join(", ")}`);
            }
            if (layer.keywords.length > 0) {
              console.log(`  ${dim("keywords:")} ${layer.keywords.join(", ")}`);
            }
          }
          console.log("");
        }

        if (result.blocks.length > 0) {
          console.log(bold("BLOCKS"));
          console.log(
            `  ${result.blocks
              .slice(0, 12)
              .map((block) => block.name)
              .join(", ")}`,
          );
          console.log("");
        }

        if (result.text.keywords.length > 0) {
          console.log(bold("TEXT"));
          console.log(
            `  ${dim("keywords:")} ${result.text.keywords.join(", ")}`,
          );
          if (result.text.samples.length > 0) {
            console.log(
              `  ${dim("samples:")} ${result.text.samples.join(" · ")}`,
            );
          }
          console.log("");
        }

        if (result.searchHints.length > 0) {
          console.log(bold("SEARCH HINTS"));
          console.log(`  ${result.searchHints.join(", ")}`);
          console.log("");
        }

        console.log(
          dim(
            "HINT: Use cadcli search <file> <query> or cadcli entities <file> --layer <name> to drill in.",
          ),
        );
      },
    });
  } catch (err) {
    handleCommandError(err);
  }
}
