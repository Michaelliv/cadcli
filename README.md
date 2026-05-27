# cadcli

CAD inspection, viewing, and editing tools backed by LibreDWG.

```bash
npm install -g cadcli
```

## Quick start

```bash
cadcli info drawing.dwg
cadcli layers drawing.dwg --json
cadcli entities drawing.dwg --type LINE --limit 20
cadcli search drawing.dwg "conference" --layer A-TEXT --json
cadcli view drawing.dwg -o drawing.svg
cadcli edit drawing.dwg --jq '.OBJECTS[]' -o edited.dwg
```

Workflow: **info → search/entities → view/edit**.

## Commands

- `cadcli info <file>` — metadata, version, counts, layers, blocks, bounds.
- `cadcli layers <file>` — list layers and entity counts.
- `cadcli blocks <file>` — list blocks.
- `cadcli entities <file>` — list entities; supports `--type`, `--layer`, `--limit`, `--total`.
- `cadcli search <file> [query]` — MiniSearch-backed entity search over IDs, types, layers, text, block names, and raw fields.
- `cadcli view <file>` — render SVG with native LibreDWG `dwgread`.
- `cadcli edit <file> --jq <expression>` — edit via native LibreDWG `dwgfilter`; use `-o` for safe copy output or `--overwrite` for in-place edits.
- `cadcli json <file>` — print normalized JSON or write with `-o`.
- `cadcli svg <file>` — print/write best-effort SVG with libredwg-web for common entities.
- `cadcli thumbnail <file>` — extract an embedded thumbnail when available.

All commands support `--json` for structured output and `-q, --quiet` for scripts. Search indexes are cached automatically in the platform-standard cache directory (`~/Library/Caches/cadcli` on macOS, `$XDG_CACHE_HOME/cadcli` or `~/.cache/cadcli` on Linux, and `%LOCALAPPDATA%\\cadcli\\Cache` on Windows). Set `CADCLI_CACHE_DIR` to override it.

## SDK

```ts
import { Dwg } from "cadcli";

const drawing = Dwg.open("drawing.dwg");
console.log(await drawing.info());
console.log(await drawing.layers());
console.log((await drawing.svg()).svg);
```

The SDK exports `Dwg`, LibreDWG helpers, core helpers, and consumer-facing types from `cadcli`.

## LibreDWG backend

`cadcli` uses LibreDWG only. The bundled `@mlightcad/libredwg-web` package handles inspection/search in Node. Native LibreDWG tools unlock file-output workflows: `dwgread` for SVG output, `dwgfilter` for jq-style modifications, and `dwgadd`/`dwgwrite`/`dwgrewrite` for create/rewrite workflows.

## For agents

Agents should prefer `--json` and treat stdout as primary data; diagnostics and errors are written to stderr.

## License

MIT
