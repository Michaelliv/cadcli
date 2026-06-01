#!/usr/bin/env node

import { createRequire } from "node:module";
import chalk from "chalk";
import { Command } from "commander";
import { blocks } from "./commands/blocks.js";
import { edit } from "./commands/edit.js";
import { entities } from "./commands/entities.js";
import { info } from "./commands/info.js";
import { json } from "./commands/json.js";
import { layers } from "./commands/layers.js";
import { overview } from "./commands/overview.js";
import { search } from "./commands/search.js";
import { svg } from "./commands/svg.js";
import { thumbnail } from "./commands/thumbnail.js";
import { view } from "./commands/view.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

const program = new Command();

function showHelp() {
  console.log(`Usage: cadcli [options] [command]

Agent-friendly CAD inspection, search, viewing, and editing.

Examples:
  $ cadcli info drawing.dwg              Summarize a drawing
  $ cadcli overview drawing.dwg          Show search vocabulary
  $ cadcli layers drawing.dwg --json     List layers for scripts/agents
  $ cadcli entities drawing.dwg --type LINE --limit 20
  $ cadcli search drawing.dwg "conference" --layer A-TEXT
  $ cadcli view drawing.dwg -o drawing.svg
  $ cadcli edit drawing.dwg --set-text "Office" --text-id 2A -o edited.dwg
  $ cadcli edit drawing.dwg --add-line 0,0:10,0 --new-layer A-WALL -o edited.dwg

Workflow: info → overview → search/entities → view/edit

Inspecting:
  info <file>          Drawing metadata and counts
  overview <file>      Search vocabulary by layer/type/block/text
  layers <file>        List layers
  blocks <file>        List blocks
  entities <file>      List/filter entities
  search <file>        Search entities by text, type, layer, and raw fields

Viewing and editing:
  view <file>          Render an SVG preview
  edit <file>          Edit DWG/DXF with acad-ts operations

Conversion:
  json <file>          Export normalized JSON
  svg <file>           Render best-effort SVG from normalized JSON
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
  .description("Agent-friendly CAD inspection, search, viewing, and editing.")
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
  .command("info <file>")
  .description("Show drawing metadata and summary")
  .action(async (file, _opts, cmd) => info(file, cmd.optsWithGlobals()));
program
  .command("overview <file>")
  .description("Show search vocabulary by layer/type/block/text")
  .option("--keywords <n>", "Max keywords/hints returned")
  .option("--samples <n>", "Max text samples returned")
  .action(async (file, opts, cmd) =>
    overview(file, { ...cmd.optsWithGlobals(), ...opts }),
  );
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
  .description("Render an SVG preview")
  .option("-o, --output <path>", "Output SVG file")
  .action(async (file, opts, cmd) =>
    view(file, { ...cmd.optsWithGlobals(), ...opts }),
  );
program
  .command("edit <file>")
  .description("Edit DWG/DXF with acad-ts operations")
  .option("--set-text <text>", "Set TEXT/MTEXT content")
  .option("--text-id <id>", "Entity id/handle for --set-text")
  .option("--set-layer <name>", "Move an entity to a layer")
  .option("--layer-id <id>", "Entity id/handle for --set-layer")
  .option(
    "--set-color <color>",
    "Set entity color: bylayer, byblock, index, #rrggbb, or r,g,b",
  )
  .option("--color-id <id>", "Entity id/handle for --set-color")
  .option("--set-linetype <name>", "Set entity line type")
  .option("--linetype-id <id>", "Entity id/handle for --set-linetype")
  .option("--set-lineweight <n>", "Set entity line weight enum value")
  .option("--lineweight-id <id>", "Entity id/handle for --set-lineweight")
  .option("--set-transparency <alpha>", "Set transparency alpha value")
  .option("--transparency-id <id>", "Entity id/handle for --set-transparency")
  .option("--hide <id>", "Hide an entity")
  .option("--show <id>", "Show an entity")
  .option("--move <id>", "Move an entity by --dx/--dy/--dz")
  .option("--rotate <id>", "Rotate an entity around Z by --angle degrees")
  .option("--scale <id>", "Scale an entity by --factor")
  .option("--copy <id>", "Copy an entity, optionally offset by --dx/--dy/--dz")
  .option("--match-properties <id>", "Copy visual properties from --source-id")
  .option("--source-id <id>", "Source entity id for --match-properties")
  .option("--set-attr <tag=value>", "Set a block insert attribute")
  .option("--insert-id <id>", "Block insert id for --set-attr")
  .option("--dx <n>", "X delta")
  .option("--dy <n>", "Y delta")
  .option("--dz <n>", "Z delta")
  .option("--angle <degrees>", "Angle in degrees")
  .option("--origin <x,y,z>", "Origin for rotate/scale")
  .option("--factor <n>", "Scale factor")
  .option("--add-point <x,y,z>", "Add a POINT")
  .option("--add-line <from:to>", "Add a LINE, e.g. 0,0:10,0")
  .option("--add-circle <center:radius>", "Add a CIRCLE, e.g. 5,5:2")
  .option(
    "--add-arc <center:radius:start:end>",
    "Add an ARC with degree angles",
  )
  .option("--add-text <text>", "Add TEXT at --at")
  .option("--add-mtext <text>", "Add MTEXT at --at")
  .option("--points <p1;p2[;p3]>", "Add an LWPOLYLINE from x,y points")
  .option("--closed", "Close a polyline added with --points")
  .option("--at <x,y,z>", "Insertion point for text")
  .option("--height <n>", "Text height")
  .option("--width <n>", "MText width")
  .option("--new-layer <name>", "Layer for add-* entities")
  .option("--new-color <color>", "Color for add-* entities")
  .option("--delete <id>", "Delete an entity")
  .option(
    "-o, --output <path>",
    "Write edited copy to this file; required unless --overwrite",
  )
  .option("--overwrite", "Allow editing the input file in place")
  .addHelpText(
    "after",
    `

Examples:
  Find ids first:
    $ cadcli entities drawing.dwg --type TEXT --json
    $ cadcli search drawing.dwg "office" --json

  Update existing entities:
    $ cadcli edit drawing.dwg --set-text "Office" --text-id 2A -o edited.dwg
    $ cadcli edit drawing.dwg --set-color '#ff0000' --color-id 2A -o edited.dwg
    $ cadcli edit drawing.dwg --move 2A --dx 10 --dy 0 -o edited.dwg
    $ cadcli edit drawing.dwg --rotate 2A --angle 90 --origin 0,0 -o edited.dwg
    $ cadcli edit drawing.dwg --copy 2A --dx 10 --dy 0 -o edited.dwg
    $ cadcli edit drawing.dwg --delete 2A -o edited.dwg

  Add new entities:
    $ cadcli edit drawing.dwg --add-line 0,0:10,0 --new-layer A-WALL -o edited.dwg
    $ cadcli edit drawing.dwg --add-circle 5,5:2 -o edited.dwg
    $ cadcli edit drawing.dwg --add-text "Label" --at 5,5 --height 2.5 -o edited.dwg
    $ cadcli edit drawing.dwg --points '0,0;10,0;10,5' --closed -o edited.dwg

Formats:
  points:       x,y or x,y,z
  line:         from:to, e.g. 0,0:10,0
  circle:       center:radius, e.g. 5,5:2
  arc:          center:radius:startAngle:endAngle, e.g. 5,5:2:0:90
  color:        bylayer, byblock, AutoCAD color index, #rrggbb, or r,g,b

Safety:
  cadcli refuses to modify the input file by default.
  Use -o/--output to write an edited copy.
  Use --overwrite only when you intentionally want to edit the input file in place.
`,
  )
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
  .description("Render best-effort SVG from normalized JSON")
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
