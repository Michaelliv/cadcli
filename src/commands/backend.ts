import { getLibreDwgStatus } from "../core/libredwg.js";
import type { OutputOptions } from "../utils/output.js";
import { bold, dim, output } from "../utils/output.js";

export async function backend(
  options: OutputOptions & { toolDir?: string },
): Promise<void> {
  const status = getLibreDwgStatus(options.toolDir);
  output(options, {
    json: () => status,
    human: () => {
      console.log(`${bold(status.backend)} ${dim(status.mode)}`);
      console.log(`  viewing  ${status.viewing}`);
      console.log(`  editing  ${status.editing}`);
      for (const tool of status.tools) {
        console.log(
          `  ${tool.available ? "✓" : "-"} ${tool.name}${tool.path ? ` ${dim(tool.path)}` : ""}`,
        );
      }
    },
  });
}
