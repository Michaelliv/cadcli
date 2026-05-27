#!/usr/bin/env node

import { createRequire } from "node:module";
import chalk from "chalk";
import { Command } from "commander";
import { blocks } from "./commands/blocks.js";
import { entities } from "./commands/entities.js";
import { info } from "./commands/info.js";
import { init } from "./commands/init.js";
import { json } from "./commands/json.js";
import { layers } from "./commands/layers.js";
import { onboard } from "./commands/onboard.js";
import { search } from "./commands/search.js";
import { svg } from "./commands/svg.js";
import { thumbnail } from "./commands/thumbnail.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

const program = new Command();

function showHelp() {
  console.log(`Usage: dwg [options] [command]

DWG/DXF inspection and conversion tools for the terminal and TypeScript.

Examples:
  $ dwg info drawing.dwg              Summarize a drawing
  $ dwg layers drawing.dwg --json     List layers for scripts/agents
  $ dwg entities drawing.dwg --type LINE --limit 20
  $ dwg search drawing.dwg "conference" --layer A-TEXT
  $ dwg json drawing.dwg -o drawing.json
  $ dwg svg drawing.dwg -o drawing.svg

Workflow: info → layers/entities → json/svg

Getting started:
  init                 Create .dwg/ config/cache directory
  onboard              Add agent instructions to CLAUDE.md or AGENTS.md

Inspecting:
  info <file>          Drawing metadata and counts
  layers <file>        List layers
  blocks <file>        List blocks
  entities <file>      List/filter entities
  search <file>        Search entities by text, type, layer, and raw fields

Conversion:
  json <file>          Export normalized JSON
  svg <file>           Render best-effort SVG
  thumbnail <file>     Extract embedded thumbnail when available

Options:
  --json               Output as JSON
  -q, --quiet          Suppress non-essential output
  --no-color           Disable color
  -v, --version        Show version
  -h, --help           Show this help

Docs: https://github.com/Michaelliv/dwgcli`);
}

program
  .name("dwg")
  .description(
    "DWG/DXF inspection and conversion tools for the terminal and TypeScript.",
  )
  .version(`dwg ${version}`, "-v, --version")
  .option("--json", "Output as JSON")
  .option("-q, --quiet", "Suppress output")
  .option("--no-color", "Disable color")
  .showSuggestionAfterError(true)
  .helpCommand(false)
  .addHelpText("before", () => {
    showHelp();
    process.exit(0);
  });

program.hook("preAction", (cmd) => {
  if (cmd.optsWithGlobals().color === false) chalk.level = 0;
});

program
  .command("init")
  .description("Create .dwg/ in current directory")
  .action(async (_opts, cmd) => init(cmd.optsWithGlobals()));
program
  .command("onboard")
  .description("Add dwg instructions to CLAUDE.md or AGENTS.md")
  .action(async (_opts, cmd) => onboard(cmd.optsWithGlobals()));
program
  .command("info <file>")
  .description("Show drawing metadata and summary")
  .action(async (file, _opts, cmd) => info(file, cmd.optsWithGlobals()));
program
  .command("layers <file>")
  .description("List layers")
  .option("--total", "Return layer count")
  .action(async (file, opts, cmd) =>
    layers(file, { ...cmd.optsWithGlobals(), ...opts }),
  );
program
  .command("blocks <file>")
  .description("List blocks")
  .option("--total", "Return block count")
  .action(async (file, opts, cmd) =>
    blocks(file, { ...cmd.optsWithGlobals(), ...opts }),
  );
program
  .command("entities <file>")
  .description("List/filter entities")
  .option("--type <name>", "Filter by entity type")
  .option("--layer <name>", "Filter by layer")
  .option("--limit <n>", "Limit entities returned")
  .option("--total", "Return entity count")
  .action(async (file, opts, cmd) =>
    entities(file, { ...cmd.optsWithGlobals(), ...opts }),
  );
program
  .command("search <file> [query...]")
  .description("Search entities by text, type, layer, and raw fields")
  .option("--query <text>", "Search query")
  .option("--type <name>", "Filter by entity type")
  .option("--layer <name>", "Filter by layer")
  .option("--limit <n>", "Limit results")
  .option("--total", "Return result count")
  .option("--score", "Include relevance scores")
  .option("--no-snippets", "Omit matched snippets")
  .action(async (file, queryWords, opts, cmd) => {
    const root = { ...cmd.optsWithGlobals(), ...opts };
    root.query = root.query || queryWords.join(" ");
    await search(file, root);
  });

program
  .command("json <file>")
  .description("Export normalized JSON")
  .option("-o, --output <path>", "Output file")
  .action(async (file, opts, cmd) =>
    json(file, { ...cmd.optsWithGlobals(), ...opts }),
  );
program
  .command("svg <file>")
  .description("Render best-effort SVG")
  .option("-o, --output <path>", "Output file")
  .action(async (file, opts, cmd) =>
    svg(file, { ...cmd.optsWithGlobals(), ...opts }),
  );
program
  .command("thumbnail <file>")
  .description("Extract embedded thumbnail when available")
  .option("-o, --output <path>", "Output file")
  .action(async (file, opts, cmd) =>
    thumbnail(file, { ...cmd.optsWithGlobals(), ...opts }),
  );

program.parseAsync(process.argv).catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
