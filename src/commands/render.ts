import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseRasterSize, parseStrokeWidth } from "../core/raster.js";
import { renderDrawing } from "../core/render.js";
import { output, success } from "../utils/output.js";
import {
  type DrawingCommandOptions,
  handleCommandError,
  type OutputFileOptions,
  userError,
  writeCommandOutput,
} from "./shared.js";

export interface RenderCommandOptions
  extends DrawingCommandOptions,
    OutputFileOptions {
  width?: string;
  background?: string;
  radius?: string;
  around?: string;
  aroundLabel?: string;
  aroundBlock?: string;
  ink?: boolean;
  stroke?: string;
  strokeWidth?: string;
  fit?: "bounds" | "content";
  layers?: string;
  hideLayers?: string;
  markLabel?: string;
  markBlock?: string;
  expandInserts?: boolean;
  diagnose?: boolean;
}

export async function render(
  file: string,
  options: RenderCommandOptions,
): Promise<void> {
  try {
    if (!options.output) {
      throw userError("Render output file is required. Use -o/--output.");
    }
    if (options.diagnose) {
      await renderDiagnosticBundle(file, options);
      return;
    }

    const result = await renderDrawing(file, {
      reader: options.reader,
      output: options.output,
      width: parseRasterSize(options.width, "width"),
      background: options.background,
      radius: parseRasterSize(options.radius, "radius"),
      around: options.around,
      aroundLabel: options.aroundLabel,
      aroundBlock: options.aroundBlock,
      ink: options.ink,
      stroke: options.stroke,
      strokeWidth: parseStrokeWidth(options.strokeWidth),
      fit: options.fit,
      layers: parseLayerList(options.layers),
      hideLayers: parseLayerList(options.hideLayers),
      markLabels: parseLayerList(options.markLabel),
      markBlocks: parseLayerList(options.markBlock),
      expandInserts: options.expandInserts,
    });

    writeCommandOutput(
      options,
      result.content,
      () => ({
        success: true,
        file: options.output,
        format: result.format,
        width: result.width,
        height: result.height,
        rendered: result.rendered,
        unsupported: result.unsupported,
        target: result.target,
        crop: result.crop,
        viewport: result.viewport,
      }),
      `Wrote ${options.output} (${result.format}, ${result.rendered} rendered, ${result.unsupported} unsupported)`,
    );
  } catch (err) {
    handleCommandError(err);
  }
}

async function renderDiagnosticBundle(
  file: string,
  options: RenderCommandOptions,
): Promise<void> {
  if (!options.output) {
    throw userError(
      "Diagnostic render output directory is required. Use -o/--output.",
    );
  }
  mkdirSync(options.output, { recursive: true });
  const width = parseRasterSize(options.width, "width") ?? 2400;
  const common = {
    reader: options.reader,
    width,
    background: options.background,
    ink: options.ink,
    stroke: options.stroke,
    strokeWidth: parseStrokeWidth(options.strokeWidth),
    fit: options.fit,
    expandInserts: options.expandInserts ?? true,
  };
  const jobs = [
    {
      name: "overview",
      description: "All expanded renderable CAD geometry, content-fitted.",
      options: {},
    },
    {
      name: "architecture",
      description: "Wall/core/background layers with expanded block geometry.",
      options: {
        layers: ["wall", "binuy", "גרעין", "wall - hidden", "background"],
      },
    },
    {
      name: "no-furniture",
      description: "Everything except furniture, plants, and people.",
      options: { hideLayers: ["ריהוט", "furniture", "צמחיה", "אנשים"] },
    },
    {
      name: "furniture",
      description: "Furniture, plant, people, and furniture-label evidence.",
      options: { layers: ["ריהוט", "furniture", "צמחיה", "אנשים"] },
    },
    {
      name: "evidence-marked",
      description:
        "Overview with common service/kitchen/core evidence markers.",
      options: {
        markLabels: ["חדר תקשורת", "ארון חשמל", "מקרר"],
        markBlocks: ["k r", "kior", "copier"],
      },
    },
  ];

  const manifest = [];
  for (const job of jobs) {
    const out = join(options.output, `${job.name}.png`);
    const result = await renderDrawing(file, {
      ...common,
      ...job.options,
      output: out,
    });
    writeFileSync(out, result.content);
    manifest.push({
      name: job.name,
      description: job.description,
      file: out,
      format: result.format,
      width: result.width,
      height: result.height,
      rendered: result.rendered,
      unsupported: result.unsupported,
      viewport: result.viewport,
    });
  }
  const payload = { file, width, renders: manifest };
  const manifestPath = join(options.output, "evidence.json");
  writeFileSync(manifestPath, JSON.stringify(payload, null, 2));
  output(options, {
    json: () => ({ success: true, directory: options.output, ...payload }),
    human: () =>
      success(
        `Wrote diagnostic render bundle to ${options.output} (${jobs.length} images)`,
      ),
  });
}

function parseLayerList(value?: string): string[] | undefined {
  return value
    ?.split(",")
    .map((layer) => layer.trim())
    .filter(Boolean);
}
