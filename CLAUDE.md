# cadcli

<mental>
LibreDWG is the application backend. Prefer SDK-first architecture: core domain logic returns typed data, commands only adapt CLI options and format output. Keep expected user errors friendly and machine output parseable.
</mental>

## Commands

```bash
bun install
bun run dev -- --help
bun test
bun run build
bunx biome check src/
bunx biome format --write src/
```

## Architecture

`cadcli` is both a CLI and SDK for CAD inspection, viewing, and editing. `src/core/*` owns file loading, LibreDWG adapter boundaries, native LibreDWG tool wrappers, normalization, filtering, MiniSearch-backed entity search, SVG rendering, and write helpers. `src/sdk.ts` exposes the ergonomic `Dwg` class. `src/index.ts` is the public package surface. `src/commands/*` are thin Commander adapters for output and errors. `src/main.ts` wires subcommands only.

## Key patterns

All TypeScript imports use `.js` extensions. The npm CLI entry uses `#!/usr/bin/env node`, not Bun. Human output is concise, JSON output is stable, and diagnostics go to stderr. Every command follows the output triple: human, `--json`, and `--quiet` where relevant. Exit codes live in `src/utils/exit-codes.ts`.

`.cadcli/` is git-native local project state for config/cache. `init` creates it idempotently. `onboard` appends an idempotent `<cadcli>` block to `CLAUDE.md` or `AGENTS.md`.

## LibreDWG backend

Use native LibreDWG tools for features that require CAD-kernel file output: `dwgread` for viewing/SVG, `dwgfilter` for jq-backed edits, and `dwgadd`/`dwgwrite`/`dwgrewrite` for create/rewrite workflows. The WebAssembly parser from `@mlightcad/libredwg-web` remains the Node-readable LibreDWG path for inspection/search.

## Adding a new command

Create `src/commands/name.ts`, implement a function that accepts parsed options, calls `Dwg` or `src/core/*`, and formats through `output()`. Import it in `src/main.ts`, add a Commander subcommand with useful help, and add tests for human/JSON/error behavior.
