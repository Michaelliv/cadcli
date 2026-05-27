# dwgcli

<mental>
Prefer the SDK-first architecture: core domain logic returns typed data, commands only adapt CLI options and format output. Keep expected user errors friendly and machine output parseable.
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

`dwgcli` is both a CLI and SDK for DWG/DXF inspection and conversion. `src/core/*` owns file loading, libredwg adapter boundaries, normalization, filtering, SVG rendering, and write helpers. `src/sdk.ts` exposes the ergonomic `Dwg` class. `src/index.ts` is the public package surface. `src/commands/*` are thin Commander adapters for output and errors. `src/main.ts` wires subcommands only.

## Key patterns

All TypeScript imports use `.js` extensions. The npm CLI entry uses `#!/usr/bin/env node`, not Bun. Human output is concise, JSON output is stable, and diagnostics go to stderr. Every command follows the output triple: human, `--json`, and `--quiet` where relevant. Exit codes live in `src/utils/exit-codes.ts`.

`.dwg/` is git-native local project state for config/cache. `init` creates it idempotently. `onboard` appends an idempotent `<dwg>` block to `CLAUDE.md` or `AGENTS.md`.

## Adding a new command

Create `src/commands/name.ts`, implement a function that accepts parsed options, calls `Dwg` or `src/core/*`, and formats through `output()`. Import it in `src/main.ts`, add a Commander subcommand with useful help, and add tests for human/JSON/error behavior.
