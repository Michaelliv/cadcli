# dwgcli

DWG/DXF inspection and conversion tools for the terminal and TypeScript.

```bash
npm install -g dwgcli
```

## Quick start

```bash
dwg init
dwg info drawing.dwg
dwg layers drawing.dwg --json
dwg entities drawing.dwg --type LINE --limit 20
dwg search drawing.dwg "conference" --layer A-TEXT --json
dwg json drawing.dwg -o drawing.json
dwg svg drawing.dwg -o drawing.svg
```

Workflow: **info → layers/entities → json/svg**.

## Commands

- `dwg init` — create `.dwg/` config/cache directory.
- `dwg onboard` — add agent instructions to `CLAUDE.md` or `AGENTS.md`.
- `dwg info <file>` — metadata, version, counts, layers, blocks, bounds.
- `dwg layers <file>` — list layers and entity counts.
- `dwg blocks <file>` — list blocks.
- `dwg entities <file>` — list entities; supports `--type`, `--layer`, `--limit`, `--total`.
- `dwg search <file> [query]` — MiniSearch-backed entity search over IDs, types, layers, text, block names, and raw fields; supports `--type`, `--layer`, `--limit`, `--total`, `--score`, `--no-snippets`.
- `dwg json <file>` — print normalized JSON or write with `-o`.
- `dwg svg <file>` — print/write best-effort SVG for common entities.
- `dwg thumbnail <file>` — extract an embedded thumbnail when available.

All commands support `--json` for structured output and `-q, --quiet` for scripts.

## SDK

```ts
import { Dwg } from "dwgcli";

const drawing = Dwg.open("drawing.dwg");
console.log(await drawing.info());
console.log(await drawing.layers());
console.log((await drawing.svg()).svg);
```

The SDK exports `Dwg`, core helpers, and consumer-facing types from `dwgcli`.

## For agents

Run `dwg onboard` in a repository to add durable instructions. Agents should prefer `--json` and treat stdout as primary data; diagnostics and errors are written to stderr.

## License

MIT
