# DWG editing research

Goal: determine what it would take for `cadcli` to edit/create DWG files with the same level of fidelity a human CAD user expects.

## Verdict

Real human-grade DWG editing needs a CAD kernel, not just a parser. `@mlightcad/libredwg-web` is good for browser/Node DWG inspection, search, JSON extraction, SVG preview, and agent understanding. It is not enough by itself for safe native DWG editing: its default WebAssembly build disables DWG write, DXF support, and JSON import/export, and the underlying LibreDWG writer is limited compared with commercial DWG SDKs.

The credible routes are:

1. **Autodesk AutoCAD Automation API** for highest fidelity cloud editing. This runs AutoCAD in Autodesk Platform Services and can execute AutoLISP/scripts/add-ins to create, modify, process, purge, plot, and save DWGs.
2. **ODA Drawings SDK / Drawings inWEB SDK** for self-hosted CAD-kernel editing. ODA explicitly positions Drawings inWEB as a JavaScript/WebAssembly SDK for creating, editing, viewing, and incrementally saving DWG files, but it requires ODA membership/licensing.
3. **DXF edit pipeline + DWG conversion** for a practical local MVP. Convert DWG to DXF, edit with a DXF library/model, then export DWG via ODA File Converter or LibreDWG tools. This is less faithful than AutoCAD/ODA SDK but can ship agent-editing workflows quickly.
4. **Native LibreDWG toolchain** for open-source experimentation. LibreDWG includes `dwgfilter`, `dwgadd`, `dwgwrite`, `dwgrewrite`, `dwg2dxf`, and `dxf2dwg`, but DWG writing is constrained to older versions and `dxf2dwg` is experimental; AutoCAD may fail to import its output.

## Evidence

LibreDWG’s official manual says `dwgread` can output JSON/DXF/SVG; `dwgwrite` can create DWG from DXF/JSON but “for now can only create r1.2-r2000 DWG files”; `dxf2dwg` is experimental and “AutoCAD may fail to import it”; `dwgrewrite` defaults to r2000 and can only create r1.2-r2000; `dwgfilter` can “search and modify a single DWG file via jq”; `dwgadd` can create DWG/DXF/JSON from scratch or add entities to an existing DWG. Source: https://www.gnu.org/software/libredwg/manual/html_node/Programs.html

The `libredwg-web` README says the default WASM build disables write, JSON, and DXF functionality to reduce WASM size. It can be rebuilt with those options enabled, but that still inherits LibreDWG’s writer limitations. Source: https://github.com/mlightcad/libredwg-web/tree/master/bindings/javascript

Autodesk Platform Services says the AutoCAD Automation API runs AutoCAD in the cloud and can run add-ins, scripts, and AutoLISP routines to “create, modify or process your DWGs.” This is the highest-fidelity route because it uses the real AutoCAD engine. Source: https://aps.autodesk.com/automation-apis

ODA announced Drawings inWEB SDK as a JavaScript API/WebAssembly SDK for “editing, creating, and viewing DWG files” with features including primitive creation, incremental saving, recover/repair, constraints, dynamic blocks, and fonts. Source: https://www.opendesign.com/blog/2024/october/drawings-inweb-sdk-oda

The ezdxf ODA File Converter integration documents a local workflow where ODA File Converter converts DWG to temporary DXF, lets ezdxf load/edit the DXF document, and exports DWG by converting a temporary DXF back to DWG. Source: https://ezdxf.readthedocs.io/en/stable/addons/odafc.html

## Recommended product architecture

Keep `cadcli` as the agent-facing control plane and add pluggable edit backends. Agents should never directly mutate binary DWG. They should produce a typed patch, validate it, preview/diff it, then apply through a backend.

```txt
DWG/DXF file
  ↓
cadcli inspect/search → normalized model
  ↓
cadcli patch create/edit JSON patch
  ↓
cadcli patch validate + dry-run + preview SVG/PDF
  ↓
cadcli apply --backend <autocad|oda|dxf|libredwg>
  ↓
new DWG/DXF + audit report
```

The patch format should cover CAD-level actions rather than raw binary edits: create entity, delete entity, move/rotate/scale entity, set layer, rename layer, change text, change block attributes, insert block, create layer, update title block, purge unused layers/blocks, and batch operations over `cadcli search` results.

## Backend tradeoffs

**AutoCAD Automation API** is the best answer for “just like a human edits.” It can run AutoLISP/scripts/add-ins against the real AutoCAD engine. Downsides: cloud dependency, Autodesk account/billing, job latency, file upload/download, and credentials.

**ODA Drawings SDK / inWEB** is the best self-hosted answer. It gives a real CAD kernel and browser/server options, including incremental saving. Downsides: commercial licensing, SDK integration, likely native/WASM packaging work, and legal/vendor dependency.

**DXF + ODA File Converter / ezdxf** is the fastest local prototype. It can handle many 2D edits and generate DWG output using ODA File Converter. Downsides: conversion loss risk, external install, not a full native DWG edit engine, and complex DWG features may degrade.

**LibreDWG native tools/custom WASM** is the open-source path. It is useful for research and some transformations (`dwgfilter`, `dwgadd`) but not reliable enough as the sole human-grade editing backend for modern production DWGs.

## Next implementation step for cadcli

Add an explicit patch layer first:

- `cadcli patch create <file> --set-text <handle> <text>`
- `cadcli patch create <file> --set-layer <query> <layer>`
- `cadcli patch validate patch.json`
- `cadcli patch preview <file> patch.json -o preview.svg`
- `cadcli apply <file> patch.json --backend dxf --output out.dxf`
- later: `--backend autocad`, `--backend oda`, `--backend libredwg`

This gives agents a safe editing contract immediately while leaving the actual write engine pluggable. For true parity with human CAD editing, prioritize an AutoCAD Automation backend or ODA Drawings/inWEB backend.
