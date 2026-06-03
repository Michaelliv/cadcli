---
name: cadcli
description: Inspect, search, summarize, preview, and safely edit DWG/DXF CAD drawings with the cadcli CLI. Use when the user asks about CAD files, floorplans, DWG/DXF contents, layers, blocks, entities, text, previews, or CAD edits.
---

# cadcli

Use `cadcli` for progressive CAD file discovery. Follow this order when trying to understand a drawing:

```bash
cadcli info <file> --json              # size, format, counts, bounds
cadcli overview <file>                 # human clues: layers, labels, blocks, hints
cadcli layers <file> --json            # major groupings
cadcli blocks <file> --json            # reusable object definitions
cadcli query <file> --schema           # learn query tables before writing SQL
cadcli search <file> "query" --json    # fuzzy discovery from overview terms
cadcli entities <file> --limit 20 --json # raw drilldown only when needed
```

When working with a drawing, build a human-readable understanding of what is in it. Do not stop at listing CAD primitives such as layers, blocks, handles, entity types, or raw coordinates. Use those details as evidence, then explain the drawing in the terms a person would use: rooms, entrances, furniture, doors, fixtures, workstations, corridors, core/service areas, labels, structural elements, mechanical/electrical items, or other project-specific objects.

Do this as evidence-based discovery. Say what the file appears to contain and cite the clues that support it: layer names, block names, text samples, entity counts, and coordinates/handles where useful. Avoid imposing generic assumptions. Different drawings encode meaning differently: one file may identify rooms through text labels, another through room-tag blocks, another through closed polylines, and another not at all. Follow the file's own conventions and translate the underlying CAD structure into concepts users can understand.

Use each command for a different job. `overview` is for clues and vocabulary. `search` is for fuzzy discovery when you have a term from the overview or the user. `query` is for tabular/repeatable questions. `entities` is for raw drilldown after you know what type or layer matters.

Always run `cadcli query <file> --schema` before writing SQL for a file. The query engine exposes narrow in-memory tables: `summary`, `metadata`, `layers`, `blocks`, `entities`, `texts`, and `inserts`.

For a question like "how many rooms are there", use this pattern:

```bash
cadcli overview <file>
cadcli query <file> --schema
cadcli query <file> --sql "select id, text, layer, x, y from texts where text like 'Room%'" --json
```

Adapt the query terms to the drawing's language and labels. For Hebrew drawings, text may already be normalized by cadcli, so a room query may use `text like 'חדר%'`. For drawings where rooms are block tags rather than text labels, query `inserts` instead of `texts`.

If the drawing shows furniture or door layers, inspect their `INSERT` entities and block names. Use `cadcli query` for questions like "where are the inserted chair blocks", "which labels start with room", or "which layers have the most entities". If it shows cryptic layers like `A2` or `A3`, infer cautiously from the entity mix and repeated block/text evidence rather than from the layer name alone.

When answering the user, communicate in ordinary language. Use terms like "rooms", "furniture", "doors", "labels", "support spaces", "architectural linework", and "evidence". Do not lead with implementation details like entity types, raw JSON fields, SQL tables, or file internals unless they are needed to justify the answer or the user asks for them.

For visual checks, render an SVG preview:

```bash
cadcli view <file> -o preview.svg
```

For lightweight previews from the normalized model:

```bash
cadcli svg <file> -o preview.svg
```

For edits, find handles first, then write an edited copy. Never overwrite by default; use `--overwrite` only when the user explicitly asks for in-place edits:

```bash
cadcli entities <file> --type TEXT --json
cadcli search <file> "office" --json

cadcli edit <file> --set-text 'New label' --text-id <id> -o edited.dwg
cadcli edit <file> --set-layer A-TEXT --layer-id <id> -o edited.dwg
cadcli edit <file> --set-color '#ff0000' --color-id <id> -o edited.dwg
cadcli edit <file> --move <id> --dx 10 --dy 0 -o edited.dwg
cadcli edit <file> --rotate <id> --angle 90 --origin 0,0 -o edited.dwg
cadcli edit <file> --scale <id> --factor 2 -o edited.dwg
cadcli edit <file> --copy <id> --dx 10 --dy 0 -o edited.dwg
cadcli edit <file> --delete <id> -o edited.dwg

cadcli edit <file> --add-line 0,0:10,0 --new-layer A-WALL -o edited.dwg
cadcli edit <file> --add-circle 5,5:2 -o edited.dwg
cadcli edit <file> --add-text 'Label' --at 5,5 --height 2.5 -o edited.dwg
cadcli edit <file> --points '0,0;10,0;10,5' --closed -o edited.dwg
```

Edit formats: points are `x,y` or `x,y,z`; line is `from:to`; circle is `center:radius`; arc is `center:radius:startAngle:endAngle`; color is `bylayer`, `byblock`, an AutoCAD color index, `#rrggbb`, or `r,g,b`.
