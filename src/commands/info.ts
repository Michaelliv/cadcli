import { bold, dim, output } from "../utils/output.js";
import {
  type DrawingCommandOptions,
  drawingFor,
  handleCommandError,
} from "./shared.js";

export async function info(
  file: string,
  options: DrawingCommandOptions,
): Promise<void> {
  try {
    const summary = await drawingFor(file, options).info();
    output(options, {
      json: () => summary,
      human: () => {
        console.log(
          `${bold(summary.file)} ${dim(summary.format)}${summary.version ? ` ${dim(summary.version)}` : ""}`,
        );
        console.log(`  entities  ${summary.counts.entities}`);
        console.log(`  layers    ${summary.counts.layers}`);
        console.log(`  blocks    ${summary.counts.blocks}`);
        console.log(`  unsupported ${summary.counts.unsupported}`);
        if (summary.bounds)
          console.log(
            `  bounds    ${summary.bounds.minX},${summary.bounds.minY} → ${summary.bounds.maxX},${summary.bounds.maxY}`,
          );
      },
    });
  } catch (err) {
    handleCommandError(err);
  }
}
