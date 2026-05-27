# cadcli

<mental>
acad-ts is the default parser for DWG/DXF inspection and search. Native LibreDWG tools are optional boundaries for high-fidelity viewing and jq-backed editing. Prefer SDK-first architecture: core domain logic returns typed data, commands only adapt CLI options and format output. Keep expected user errors friendly and machine output parseable.
</mental>

## Commands

```bash
bun install
bun run dev -- --help
bun test
bun run ci
bun run build
bunx biome check src/
bunx biome format --write src/
```

## Architecture

`cadcli` is both a CLI and SDK for CAD inspection, viewing, and editing. `src/core/*` owns file loading, parser adapter boundaries, native LibreDWG tool wrappers, normalization, overview vocabulary extraction, filtering, MiniSearch-backed entity search, SVG rendering, and write helpers. `src/sdk.ts` exposes the ergonomic `Dwg` class. `src/index.ts` is the curated public package surface: export `Dwg` and stable result/domain types, not internal core helpers. `src/commands/*` are thin Commander adapters for output and errors. `src/main.ts` wires subcommands only.

## Key patterns

All TypeScript imports use `.js` extensions. The npm CLI entry uses `#!/usr/bin/env node`, not Bun. Human output is concise, JSON output is stable, and diagnostics go to stderr. Every command follows the output triple: human, `--json`, and `--quiet` where relevant. Exit codes live in `src/utils/exit-codes.ts`.

Search indexes are cached automatically in the platform-standard cache directory. Use `CADCLI_CACHE_DIR` to override it during tests or one-off runs.

## Parser and native tools

Use `AcadTsReader` as the default reader for inspection/search/overview/JSON/SVG. Keep `NativeLibreDwgReader` available for explicit native parsing boundaries and tests. Native LibreDWG tools remain optional advanced paths: `dwgread` powers high-fidelity `view`, and `dwgfilter` handles jq-backed edits.

## Adding a new command

Create `src/commands/name.ts`, implement a function that accepts parsed options, calls `Dwg` or `src/core/*`, and formats through `output()`. Import it in `src/main.ts`, add a Commander subcommand with useful help, and add tests for human/JSON/error behavior. For agent-discovery features, follow the `overview → search/entities → view/edit` progressive-disclosure pattern.
