import {
  type AcadColor,
  type AcadEditOperation,
  type AcadPoint,
  editWithAcadTs,
} from "../core/acad-edit.js";
import type { OutputOptions } from "../utils/output.js";
import { output, success } from "../utils/output.js";
import { handleCommandError, userError } from "./shared.js";

export interface EditOptions extends OutputOptions {
  output?: string;
  overwrite?: boolean;
  setText?: string;
  textId?: string;
  delete?: string;
  move?: string;
  dx?: string;
  dy?: string;
  dz?: string;
  setLayer?: string;
  layerId?: string;
  setColor?: string;
  colorId?: string;
  setLinetype?: string;
  linetypeId?: string;
  setLineweight?: string;
  lineweightId?: string;
  setTransparency?: string;
  transparencyId?: string;
  hide?: string;
  show?: string;
  rotate?: string;
  angle?: string;
  origin?: string;
  scale?: string;
  factor?: string;
  copy?: string;
  matchProperties?: string;
  sourceId?: string;
  setAttr?: string;
  insertId?: string;
  addPoint?: string;
  addLine?: string;
  addCircle?: string;
  addArc?: string;
  addText?: string;
  addMtext?: string;
  at?: string;
  height?: string;
  width?: string;
  closed?: boolean;
  points?: string;
  newLayer?: string;
  newColor?: string;
}

function numberOption(value: string | undefined, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw userError(`Invalid ${name}: ${value}`, "INVALID_NUMBER");
  }
  return parsed;
}

function pointOption(value: string | undefined, name: string): AcadPoint {
  if (!value) throw userError(`${name} requires x,y[,z].`, "INVALID_POINT");
  const parts = value.split(",").map((part) => numberOption(part, name));
  if (parts.length < 2 || parts.length > 3) {
    throw userError(`${name} requires x,y[,z].`, "INVALID_POINT");
  }
  return { x: parts[0], y: parts[1], z: parts[2] };
}

function pointsOption(value: string | undefined, name: string): AcadPoint[] {
  if (!value) throw userError(`${name} requires x,y pairs.`, "INVALID_POINT");
  const points = value.split(/[;|]/).map((part) => pointOption(part, name));
  if (points.length < 2) {
    throw userError(`${name} requires at least two points.`, "INVALID_POINT");
  }
  return points;
}

function colorOption(value: string | undefined, name: string): AcadColor {
  if (!value) throw userError(`${name} requires a color.`, "INVALID_COLOR");
  const normalized = value.toLowerCase();
  if (normalized === "bylayer") return { mode: "byLayer" };
  if (normalized === "byblock") return { mode: "byBlock" };
  if (/^#?[0-9a-f]{6}$/i.test(value)) {
    const hex = value.replace("#", "");
    return {
      mode: "rgb",
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
    };
  }
  if (value.includes(",")) {
    const [r, g, b] = value.split(",").map((part) => numberOption(part, name));
    return { mode: "rgb", r, g, b };
  }
  return { mode: "index", index: numberOption(value, name) };
}

function createOptions(options: EditOptions): {
  layer?: string;
  color?: AcadColor;
} {
  return {
    layer: options.newLayer,
    color: options.newColor
      ? colorOption(options.newColor, "--new-color")
      : undefined,
  };
}

function acadOperations(options: EditOptions): AcadEditOperation[] {
  const operations: AcadEditOperation[] = [];
  if (options.setText !== undefined) {
    if (!options.textId) {
      throw userError("--set-text requires --text-id <id>.", "MISSING_TEXT_ID");
    }
    operations.push({
      kind: "setText",
      entityId: options.textId,
      text: options.setText,
    });
  }
  if (options.setLayer !== undefined) {
    if (!options.layerId) {
      throw userError(
        "--set-layer requires --layer-id <id>.",
        "MISSING_LAYER_ID",
      );
    }
    operations.push({
      kind: "setLayer",
      entityId: options.layerId,
      layer: options.setLayer,
    });
  }
  if (options.setColor !== undefined) {
    if (!options.colorId) {
      throw userError(
        "--set-color requires --color-id <id>.",
        "MISSING_COLOR_ID",
      );
    }
    operations.push({
      kind: "setColor",
      entityId: options.colorId,
      color: colorOption(options.setColor, "--set-color"),
    });
  }
  if (options.setLinetype !== undefined) {
    if (!options.linetypeId) {
      throw userError(
        "--set-linetype requires --linetype-id <id>.",
        "MISSING_LINETYPE_ID",
      );
    }
    operations.push({
      kind: "setLineType",
      entityId: options.linetypeId,
      lineType: options.setLinetype,
    });
  }
  if (options.setLineweight !== undefined) {
    if (!options.lineweightId) {
      throw userError(
        "--set-lineweight requires --lineweight-id <id>.",
        "MISSING_LINEWEIGHT_ID",
      );
    }
    operations.push({
      kind: "setLineWeight",
      entityId: options.lineweightId,
      weight: numberOption(options.setLineweight, "--set-lineweight"),
    });
  }
  if (options.setTransparency !== undefined) {
    if (!options.transparencyId) {
      throw userError(
        "--set-transparency requires --transparency-id <id>.",
        "MISSING_TRANSPARENCY_ID",
      );
    }
    operations.push({
      kind: "setTransparency",
      entityId: options.transparencyId,
      alpha: numberOption(options.setTransparency, "--set-transparency"),
    });
  }
  if (options.hide !== undefined) {
    operations.push({
      kind: "setVisibility",
      entityId: options.hide,
      visible: false,
    });
  }
  if (options.show !== undefined) {
    operations.push({
      kind: "setVisibility",
      entityId: options.show,
      visible: true,
    });
  }
  if (options.move !== undefined) {
    operations.push({
      kind: "move",
      entityId: options.move,
      dx: numberOption(options.dx ?? "0", "--dx"),
      dy: numberOption(options.dy ?? "0", "--dy"),
      dz:
        options.dz === undefined ? undefined : numberOption(options.dz, "--dz"),
    });
  }
  if (options.rotate !== undefined) {
    operations.push({
      kind: "rotate",
      entityId: options.rotate,
      angleDegrees: numberOption(options.angle, "--angle"),
      origin: options.origin
        ? pointOption(options.origin, "--origin")
        : undefined,
    });
  }
  if (options.scale !== undefined) {
    operations.push({
      kind: "scale",
      entityId: options.scale,
      factor: numberOption(options.factor, "--factor"),
      origin: options.origin
        ? pointOption(options.origin, "--origin")
        : undefined,
    });
  }
  if (options.copy !== undefined) {
    operations.push({
      kind: "copy",
      entityId: options.copy,
      dx:
        options.dx === undefined ? undefined : numberOption(options.dx, "--dx"),
      dy:
        options.dy === undefined ? undefined : numberOption(options.dy, "--dy"),
      dz:
        options.dz === undefined ? undefined : numberOption(options.dz, "--dz"),
    });
  }
  if (options.matchProperties !== undefined) {
    if (!options.sourceId) {
      throw userError(
        "--match-properties requires --source-id <id>.",
        "MISSING_SOURCE_ID",
      );
    }
    operations.push({
      kind: "matchProperties",
      entityId: options.matchProperties,
      sourceId: options.sourceId,
    });
  }
  if (options.setAttr !== undefined) {
    if (!options.insertId) {
      throw userError(
        "--set-attr requires --insert-id <id>.",
        "MISSING_INSERT_ID",
      );
    }
    const [tag, ...valueParts] = options.setAttr.split("=");
    if (!tag || valueParts.length === 0) {
      throw userError(
        "--set-attr requires TAG=VALUE.",
        "INVALID_ATTRIBUTE_EDIT",
      );
    }
    operations.push({
      kind: "setAttribute",
      entityId: options.insertId,
      tag,
      value: valueParts.join("="),
    });
  }
  if (options.delete !== undefined) {
    operations.push({ kind: "delete", entityId: options.delete });
  }

  const common = createOptions(options);
  if (options.addPoint !== undefined) {
    operations.push({
      kind: "addPoint",
      at: pointOption(options.addPoint, "--add-point"),
      ...common,
    });
  }
  if (options.addLine !== undefined) {
    const [from, to] = options.addLine.split(":");
    operations.push({
      kind: "addLine",
      from: pointOption(from, "--add-line"),
      to: pointOption(to, "--add-line"),
      ...common,
    });
  }
  if (options.addCircle !== undefined) {
    const [center, radius] = options.addCircle.split(":");
    operations.push({
      kind: "addCircle",
      center: pointOption(center, "--add-circle"),
      radius: numberOption(radius, "--add-circle radius"),
      ...common,
    });
  }
  if (options.addArc !== undefined) {
    const [center, radius, start, end] = options.addArc.split(":");
    operations.push({
      kind: "addArc",
      center: pointOption(center, "--add-arc"),
      radius: numberOption(radius, "--add-arc radius"),
      startAngleDegrees: numberOption(start, "--add-arc start angle"),
      endAngleDegrees: numberOption(end, "--add-arc end angle"),
      ...common,
    });
  }
  if (options.addText !== undefined) {
    operations.push({
      kind: "addText",
      text: options.addText,
      at: pointOption(options.at, "--at"),
      height: options.height
        ? numberOption(options.height, "--height")
        : undefined,
      rotationDegrees: options.angle
        ? numberOption(options.angle, "--angle")
        : undefined,
      ...common,
    });
  }
  if (options.addMtext !== undefined) {
    operations.push({
      kind: "addMText",
      text: options.addMtext,
      at: pointOption(options.at, "--at"),
      height: options.height
        ? numberOption(options.height, "--height")
        : undefined,
      width: options.width ? numberOption(options.width, "--width") : undefined,
      rotationDegrees: options.angle
        ? numberOption(options.angle, "--angle")
        : undefined,
      ...common,
    });
  }
  if (options.points !== undefined) {
    operations.push({
      kind: "addPolyline",
      points: pointsOption(options.points, "--points"),
      closed: options.closed,
      ...common,
    });
  }
  return operations;
}

export async function edit(file: string, options: EditOptions): Promise<void> {
  try {
    const operations = acadOperations(options);
    if (operations.length === 0) {
      throw userError(
        "No edit operation specified. Use --set-text, --set-layer, --move, --delete, or an add-* operation.",
        "MISSING_EDIT_OPERATION",
      );
    }

    const result = editWithAcadTs({
      input: file,
      output: options.output ?? file,
      operations,
      overwrite: options.overwrite,
    });
    output(options, {
      json: () => ({ success: true, ...result }),
      human: () => success(`Edited ${result.output} with acad-ts`),
    });
  } catch (err) {
    handleCommandError(err);
  }
}
