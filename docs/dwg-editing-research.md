# DWG editing research

Goal: determine what it takes for `cadcli` to edit/create DWG files while using **LibreDWG only**.

## Verdict

`cadcli` is a LibreDWG application. There are no alternate edit backends. The implementation uses two LibreDWG surfaces: native LibreDWG command-line tools when installed, and `@mlightcad/libredwg-web` for the Node/WebAssembly read path. That keeps inspection, search, JSON extraction, SVG rendering, viewing, and edit workflows inside the LibreDWG family.

The practical split is straightforward. `@mlightcad/libredwg-web` is the embedded reader for Node: it parses DWG/DXF data into JavaScript objects for `info`, `layers`, `blocks`, `entities`, `search`, `json`, `svg`, and thumbnail attempts. Native LibreDWG tools are the file-output layer: `dwgread` for high-fidelity LibreDWG conversions, `dwgfilter` for jq-style modifications, and `dwgadd`/`dwgwrite`/`dwgrewrite`/`dwg2dxf`/`dxf2dwg` for create, rewrite, and conversion workflows as those commands are available on the host.

## Evidence

LibreDWG’s official manual says `dwgread` can output JSON/DXF/SVG; `dwgwrite` can create DWG from DXF/JSON but “for now can only create r1.2-r2000 DWG files”; `dxf2dwg` is experimental and “AutoCAD may fail to import it”; `dwgrewrite` defaults to r2000 and can only create r1.2-r2000; `dwgfilter` can “search and modify a single DWG file via jq”; `dwgadd` can create DWG/DXF/JSON from scratch or add entities to an existing DWG. Source: https://www.gnu.org/software/libredwg/manual/html_node/Programs.html

The `libredwg-web` README says the default WASM build disables write, JSON, and DXF functionality to reduce WASM size. It can be rebuilt with those options enabled, but the current package should be treated as the embedded read/inspection path. Source: https://github.com/mlightcad/libredwg-web/tree/master/bindings/javascript

## Product architecture

```txt
DWG/DXF file
  ↓
LibreDWG read path
  ├─ libredwg-web → normalized model → info/search/json/internal SVG
  └─ native dwgread → SVG/DXF/JSON conversion when installed
  ↓
LibreDWG edit/create path
  ├─ dwgfilter → jq-style modifications
  ├─ dwgadd → create/add entities
  ├─ dwgwrite/dwgrewrite → write/rewrite DWG within LibreDWG limits
  └─ dwg2dxf/dxf2dwg → LibreDWG conversion workflows
```

Agents should still avoid mutating binary DWG blindly. The safe editing contract remains: inspect/search first, create a typed edit intent, validate it, preview it, then apply it through LibreDWG commands. The apply layer is LibreDWG-only.

## Current commands

- `cadcli info <file>` — libredwg-web read path.
- `cadcli layers <file>` — libredwg-web read path.
- `cadcli blocks <file>` — libredwg-web read path.
- `cadcli entities <file>` — libredwg-web read path.
- `cadcli search <file> [query]` — libredwg-web read path plus local MiniSearch index.
- `cadcli json <file>` — normalized JSON from libredwg-web.
- `cadcli svg <file>` — best-effort SVG from normalized libredwg-web data.
- `cadcli view <file>` — native `dwgread -O SVG` when available; libredwg-web renderer otherwise.
- `cadcli edit <file> --jq <expr>` — native `dwgfilter`.
- `cadcli backend` — LibreDWG capability report for native tools and embedded libredwg-web.

## Next implementation step

Add a LibreDWG-only patch layer:

- `cadcli patch create <file> --set-text <handle> <text>`
- `cadcli patch create <file> --set-layer <query> <layer>`
- `cadcli patch validate patch.json`
- `cadcli patch preview <file> patch.json -o preview.svg`
- `cadcli apply <file> patch.json --output edited.dwg`

Internally, `apply` should compile patch operations to LibreDWG `dwgfilter` expressions first. Later create/add workflows can compile to `dwgadd` input files. No AutoCAD, ODA, or DXF-library backend should be introduced unless explicitly added as a separate product.
