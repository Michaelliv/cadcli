---
name: cadcli
description: Inspect, search, summarize, preview, and safely edit DWG/DXF CAD drawings with the cadcli CLI. Use when the user asks about CAD files, floorplans, DWG/DXF contents, layers, blocks, entities, text, previews, or jq-backed CAD edits.
---

# cadcli

Use `cadcli` for progressive CAD file discovery. Start broad, then narrow down:

```bash
cadcli info <file> --json
cadcli overview <file>
cadcli layers <file> --json
cadcli entities <file> --limit 20 --json
cadcli search <file> "query" --json
```

For visual checks, prefer the high-fidelity native path when available:

```bash
cadcli view <file> -o preview.svg
```

For lightweight previews from the normalized model:

```bash
cadcli svg <file> -o preview.svg
```

For edits, never overwrite by default. Write to a new file unless the user explicitly asks for in-place edits:

```bash
cadcli edit <file> --jq '<jq expression>' -o edited.dwg
```
