import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { OutputOptions } from "../utils/output.js";
import { output, success } from "../utils/output.js";

const INSTRUCTIONS = `
<cadcli>
Use \`cadcli\` for CAD/DWG/DXF inspection, viewing, and LibreDWG-backed editing. Prefer \`cadcli --json ...\` for structured output that agents can parse.

<commands>
- \`cadcli backend --json\` - inspect LibreDWG native tool availability
- \`cadcli info <file> --json\` - summarize format, version, counts, layers, blocks, and bounds
- \`cadcli layers <file> --json\` - list layers and entity counts
- \`cadcli entities <file> --json --type LINE --layer 0\` - inspect/filter entities
- \`cadcli search <file> "text or block" --json --layer A-TEXT\` - search IDs, types, layers, text, block names, and raw fields
- \`cadcli view <file> -o drawing.svg\` - render SVG with native LibreDWG dwgread
- \`cadcli edit <file> --jq <expression> -o edited.dwg\` - edit through native LibreDWG dwgfilter
- \`cadcli json <file> -o drawing.json\` - export normalized JSON
</commands>

<rules>
- ALWAYS use \`--json\` when another tool or agent needs to parse output.
- Diagnostics and errors are on stderr; primary data is on stdout.
- Project config/cache lives in \`.cadcli/\` and can be committed when useful.
- Prefer \`cadcli edit ... -o <new-file>\` over in-place edits unless explicitly asked to overwrite.
</rules>
</cadcli>
`.trim();

const MARKER = "<cadcli>";

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
    human: () => success(`Added cadcli instructions to ${targetFile}`),
  });
}
