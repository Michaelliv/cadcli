#!/usr/bin/env node

import { createRequire } from "node:module";
import chalk from "chalk";
import { Command } from "commander";
import { backend } from "./commands/backend.js";
import { blocks } from "./commands/blocks.js";
import { edit } from "./commands/edit.js";
import { entities } from "./commands/entities.js";
import { info } from "./commands/info.js";
import { init } from "./commands/init.js";
import { json } from "./commands/json.js";
import { layers } from "./commands/layers.js";
import { onboard } from "./commands/onboard.js";
import { search } from "./commands/search.js";
import { svg } from "./commands/svg.js";
import { thumbnail } from "./commands/thumbnail.js";
import { view } from "./commands/view.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

const program = new Command();

function showHelp() {
  console.log(`Usage: cadcli [options] [command]

CAD inspection, viewing, and editing tools backed by LibreDWG.

Examples:
  $ cadcli info drawing.dwg              Summarize a drawing
  $ cadcli layers drawing.dwg --json     List layers for scripts/agents
  $ cadcli entities drawing.dwg --type LINE --limit 20
  $ cadcli search drawing.dwg "conference" --layer A-TEXT
  $ cadcli view drawing.dwg -o drawing.svg
  $ cadcli edit drawing.dwg --jq '.OBJECTS[]' -o edited.dwg

Workflow: info → search/entities → view/edit

Getting started:
  init                 Create .cadcli/ config/cache directory
  onboard              Add agent instructions to CLAUDE.md or AGENTS.md
  backend              Show LibreDWG backend/tool availability

Inspecting:
  info <file>          Drawing metadata and counts
  layers <file>        List layers
  blocks <file>        List blocks
  entities <file>      List/filter entities
  search <file>        Search entities by text, type, layer, and raw fields

Viewing and editing:
  view <file>          Render SVG with native LibreDWG dwgread
  edit <file>          Edit with native LibreDWG dwgfilter

Conversion:
  json <file>          Export normalized JSON
  svg <file>           Render best-effort SVG with libredwg-web
  thumbnail <file>     Extract embedded thumbnail when available

Options:
  --json               Output as JSON
  -q, --quiet          Suppress non-essential output
  --no-color           Disable color
  -v, --version        Show version
  -h, --help           Show this help

Docs: https://github.com/Michaelliv/cadcli`);
}

program
  .name("cadcli")
  .description("CAD inspection, viewing, and editing tools backed by LibreDWG.")
  .version(`cadcli ${version}`, "-v, --version")
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
  .description("Create .cadcli/ in current directory")
  .action(async (_opts, cmd) => init(cmd.optsWithGlobals()));
program
  .command("onboard")
  .description("Add cadcli instructions to CLAUDE.md or AGENTS.md")
  .action(async (_opts, cmd) => onboard(cmd.optsWithGlobals()));
program
  .command("backend")
  .description("Show LibreDWG backend and native tool availability")
  .action(async (_opts, cmd) => backend(cmd.optsWithGlobals()));
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
  .command("view <file>")
  .description("Render SVG with native LibreDWG dwgread")
  .option("-o, --output <path>", "Output SVG file")
  .action(async (file, opts, cmd) =>
    view(file, { ...cmd.optsWithGlobals(), ...opts }),
  );
program
  .command("edit <file>")
  .description("Edit DWG/DXF with native LibreDWG dwgfilter")
  .requiredOption("--jq <expression>", "dwgfilter jq expression")
  .option(
    "-o, --output <path>",
    "Output file; defaults to input with --overwrite",
  )
  .option("--overwrite", "Allow editing the input file in place")
  .action(async (file, opts, cmd) =>
    edit(file, { ...cmd.optsWithGlobals(), ...opts }),
  );
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
