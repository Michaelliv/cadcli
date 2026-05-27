import { initStore } from "../store.js";
import type { OutputOptions } from "../utils/output.js";
import { cmd, hint, output, success } from "../utils/output.js";

export async function init(
  options: OutputOptions & { cwd?: string },
): Promise<void> {
  const result = initStore(options.cwd ?? process.cwd());
  output(options, {
    json: () => result,
    human: () => {
      success(
        result.created
          ? `Initialized .cadcli/ in ${options.cwd ?? process.cwd()}`
          : `Already initialized .cadcli/ in ${options.cwd ?? process.cwd()}`,
      );
      hint("Next: inspect a drawing");
      console.log(`  ${cmd("cadcli info drawing.dwg")}`);
    },
  });
}
