# cadcli

Agent-friendly CAD inspection, search, viewing, and editing for DWG/DXF files.

```bash
npm install -g @miclivs/cadcli
```

Common inspection/search commands use a pure TypeScript parser by default. Native LibreDWG tools are only needed for high-fidelity `view` and jq-backed `edit`.

## Why cadcli

CAD files are hard to inspect from scripts. `cadcli` gives agents and developers a predictable interface over DWG/DXF drawings: structured JSON for automation, concise human output in the terminal, SVG previews for visual checks, and safe copy-first editing.

```bash
cadcli info floorplan.dwg --json
cadcli overview floorplan.dwg
cadcli search floorplan.dwg "conference" --layer A-TEXT --json
cadcli view floorplan.dwg -o preview.svg
cadcli edit floorplan.dwg --jq '.OBJECTS[]' -o edited.dwg
```

## Workflow

```txt
info → overview → layers/blocks/entities → search → view → edit
```

Start with `info` to understand the drawing, use `overview` to see the searchable vocabulary, narrow down with `layers`, `blocks`, `entities`, and `search`, render an SVG with `view`, then write edits to a new file with `edit -o`.

## Commands

```bash
cadcli info <file>                       # metadata, version, counts, bounds
cadcli overview <file>                   # search vocabulary by layer/type/block/text
  --keywords 12 --samples 8
cadcli layers <file> [--total]           # layers and entity counts
cadcli blocks <file> [--total]           # block names and entity counts
cadcli entities <file>                   # entities, optionally filtered
  --type LINE --layer A-WALL --limit 20 --total

cadcli search <file> [query]             # search IDs, types, layers, text, raw fields
  --query "door" --type TEXT --layer A-TEXT --limit 10 --score --no-snippets

cadcli view <file> [-o preview.svg]      # high-fidelity SVG preview
cadcli edit <file> --jq <expr> -o out.dwg
cadcli json <file> [-o drawing.json]     # normalized JSON
cadcli svg <file> [-o sketch.svg]        # best-effort SVG from normalized JSON
cadcli thumbnail <file> [-o thumb.png]   # embedded thumbnail when available
```

All commands support `--json` for structured output and `-q, --quiet` where useful. Primary data goes to stdout; diagnostics and errors go to stderr.

## Overview

`cadcli overview` is the map before the search. It shows the drawing's useful vocabulary broken down by layer, entity type, block, text keyword, and search hint so agents do not have to guess what to query.

```txt
WORKFLOW: overview (you are here) → search/entities → view/edit

SUMMARY
  DWG · 1906 entities · 33 layers · 42 blocks

LAYERS
A-TEXT
  entities: 88
  types: TEXT, MTEXT
  keywords: conference room, office, lobby

SEARCH HINTS
  conference room, office, A-TEXT, DOOR_SINGLE, TEXT
```


## Viewing vs SVG export

`cadcli view` is the high-fidelity SVG path.

`cadcli svg` renders a lightweight SVG from cadcli’s normalized JSON model. It is useful for quick agent previews and debugging, but it is not a replacement for `view`.

## Editing

Editing is intentionally copy-first:

```bash
cadcli edit drawing.dwg --jq '.OBJECTS[]' -o edited.dwg
```

In-place edits are refused unless you explicitly pass `--overwrite`:

```bash
cadcli edit drawing.dwg --jq '.OBJECTS[]' --overwrite
```

## SDK

```ts
import { Dwg } from "@miclivs/cadcli";

const drawing = Dwg.open("floorplan.dwg");

console.log(await drawing.info());
console.log(await drawing.layers());
console.log(await drawing.search({ query: "conference", layer: "A-TEXT" }));

const preview = drawing.view();
console.log(preview.svg);
```

The public SDK is intentionally small: `Dwg` plus stable CAD/result types. Native tool details stay behind the SDK methods.

## Cache

Search indexes are cached automatically in the platform-standard cache directory. On Node.js installs, `cadcli search` uses a disk-backed SQLite FTS index when the optional SQLite dependency is available; otherwise it falls back to a low-memory scan.

```txt
macOS    ~/Library/Caches/cadcli
Linux    $XDG_CACHE_HOME/cadcli or ~/.cache/cadcli
Windows  %LOCALAPPDATA%\cadcli\Cache
```

Set `CADCLI_CACHE_DIR` to override this location.

## Requirements

Inspection, overview, layers, blocks, entities, search, JSON, and lightweight SVG export work through the default pure TypeScript parser.

Install native LibreDWG tools for advanced workflows: `dwgread` for high-fidelity `view`, and `dwgfilter` for edits.

## License

MIT
