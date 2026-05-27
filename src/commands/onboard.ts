import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { OutputOptions } from "../utils/output.js";
import { output, success } from "../utils/output.js";

const INSTRUCTIONS = `
<dwg>
Use \`dwg\` for DWG/DXF inspection and conversion. Prefer \`dwg --json ...\` for structured output that agents can parse.

<commands>
- \`dwg info <file> --json\` - summarize format, version, counts, layers, blocks, and bounds
- \`dwg layers <file> --json\` - list layers and entity counts
- \`dwg entities <file> --json --type LINE --layer 0\` - inspect/filter entities
- \`dwg json <file> -o drawing.json\` - export normalized JSON
- \`dwg svg <file> -o drawing.svg\` - render best-effort SVG
</commands>

<rules>
- ALWAYS use \`--json\` when another tool or agent needs to parse output.
- Diagnostics and errors are on stderr; primary data is on stdout.
- Project config/cache lives in \`.dwg/\` and can be committed when useful.
</rules>
</dwg>
`.trim();

const MARKER = "<dwg>";

export async function onboard(
  options: OutputOptions & { cwd?: string },
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const claudeMd = join(cwd, "CLAUDE.md");
  const agentsMd = join(cwd, "AGENTS.md");
  const targetFile = existsSync(claudeMd)
    ? claudeMd
    : existsSync(agentsMd)
      ? agentsMd
      : claudeMd;
  const existing = existsSync(targetFile)
    ? readFileSync(targetFile, "utf-8")
    : "";

  if (existing.includes(MARKER)) {
    output(options, {
      json: () => ({
        success: true,
        file: targetFile,
        message: "already_onboarded",
      }),
      human: () => success(`Already onboarded (${targetFile})`),
    });
    return;
  }

  writeFileSync(
    targetFile,
    existing
      ? `${existing.trimEnd()}\n\n${INSTRUCTIONS}\n`
      : `${INSTRUCTIONS}\n`,
  );
  output(options, {
    json: () => ({ success: true, file: targetFile }),
    human: () => success(`Added dwg instructions to ${targetFile}`),
  });
}
