---
name: cadcli
description: Inspect, search, summarize, preview, and safely edit DWG/DXF CAD drawings with the cadcli CLI. Use when the user asks about CAD files, floorplans, DWG/DXF contents, layers, blocks, entities, text, previews, or CAD edits.
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
