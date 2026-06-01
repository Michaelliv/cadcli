import {
  Arc,
  type CadDocument,
  Circle,
  Color,
  type Entity,
  Insert,
  Layer,
  Line,
  LineType,
  LineWeightType,
  LwPolyline,
  MText,
  Point,
  TextEntity,
  Transparency,
  XY,
  XYZ,
} from "@node-projects/acad-ts";
import { EXIT_USER_ERROR } from "../utils/exit-codes.js";
import { readAcadFile, writeAcadDocument } from "./acad.js";
import { DwgCliError } from "./errors.js";
import { writeOutput } from "./files.js";

export type AcadPoint = { x: number; y: number; z?: number };
export type AcadColor =
  | { mode: "byLayer" }
  | { mode: "byBlock" }
  | { mode: "index"; index: number }
  | { mode: "rgb"; r: number; g: number; b: number };

export type AcadEditOperation =
  | { kind: "setText"; entityId: string; text: string }
  | { kind: "setLayer"; entityId: string; layer: string }
  | { kind: "setColor"; entityId: string; color: AcadColor }
  | { kind: "setLineType"; entityId: string; lineType: string }
  | { kind: "setLineWeight"; entityId: string; weight: number }
  | { kind: "setTransparency"; entityId: string; alpha: number }
  | { kind: "setVisibility"; entityId: string; visible: boolean }
  | { kind: "move"; entityId: string; dx: number; dy: number; dz?: number }
  | {
      kind: "rotate";
      entityId: string;
      angleDegrees: number;
      origin?: AcadPoint;
    }
  | { kind: "scale"; entityId: string; factor: number; origin?: AcadPoint }
  | { kind: "copy"; entityId: string; dx?: number; dy?: number; dz?: number }
  | { kind: "matchProperties"; entityId: string; sourceId: string }
  | { kind: "setAttribute"; entityId: string; tag: string; value: string }
  | { kind: "delete"; entityId: string }
  | { kind: "addPoint"; at: AcadPoint; layer?: string; color?: AcadColor }
  | {
      kind: "addLine";
      from: AcadPoint;
      to: AcadPoint;
      layer?: string;
      color?: AcadColor;
    }
  | {
      kind: "addCircle";
      center: AcadPoint;
      radius: number;
      layer?: string;
      color?: AcadColor;
    }
  | {
      kind: "addArc";
      center: AcadPoint;
      radius: number;
      startAngleDegrees: number;
      endAngleDegrees: number;
      layer?: string;
      color?: AcadColor;
    }
  | {
      kind: "addText";
      text: string;
      at: AcadPoint;
      height?: number;
      rotationDegrees?: number;
      layer?: string;
      color?: AcadColor;
    }
  | {
      kind: "addMText";
      text: string;
      at: AcadPoint;
      height?: number;
      width?: number;
      rotationDegrees?: number;
      layer?: string;
      color?: AcadColor;
    }
  | {
      kind: "addPolyline";
      points: AcadPoint[];
      closed?: boolean;
      layer?: string;
      color?: AcadColor;
    };

export interface AcadEditResult {
  input: string;
  output: string;
  backend: "acad-ts";
  operations: AcadEditOperation[];
  changed: number;
}

type EditableEntity = Entity & { handle?: unknown; owner?: unknown };

const degreesToRadians = (degrees: number): number => (degrees * Math.PI) / 180;

function xyz(point: AcadPoint): XYZ {
  return new XYZ(point.x, point.y, point.z ?? 0);
}

function xy(point: AcadPoint): XY {
  return new XY(point.x, point.y);
}

function handleMatches(handle: unknown, entityId: string): boolean {
  const expected = entityId.toLowerCase();
  const text = String(handle ?? "").toLowerCase();
  if (text === expected) return true;
  const numeric = Number(handle);
  return (
    Number.isFinite(numeric) && numeric.toString(16).toLowerCase() === expected
  );
}

function modelEntities(doc: CadDocument): EditableEntity[] {
  return [...(doc.modelSpace?.entities ?? [])] as EditableEntity[];
}

function findEntity(doc: CadDocument, entityId: string): EditableEntity {
  const entity = modelEntities(doc).find((item) =>
    handleMatches(item.handle, entityId),
  );
  if (!entity) {
    throw new DwgCliError(
      `Entity not found: ${entityId}`,
      "ENTITY_NOT_FOUND",
      EXIT_USER_ERROR,
    );
  }
  return entity;
}

function ensureLayer(doc: CadDocument, name: string): Layer {
  const existing = doc.layers?.tryGetValue(name);
  if (existing) return existing;
  const layer = new Layer(name);
  doc.layers?.add(layer);
  return layer;
}

function ensureLineType(doc: CadDocument, name: string): LineType {
  const existing = doc.lineTypes?.tryGetValue(name);
  if (existing) return existing;
  const lineType = new LineType(name);
  doc.lineTypes?.add(lineType);
  return lineType;
}

function acadColor(color: AcadColor): Color {
  switch (color.mode) {
    case "byLayer":
      return Color.byLayer;
    case "byBlock":
      return Color.byBlock;
    case "index":
      return new Color(color.index);
    case "rgb":
      return new Color(color.r, color.g, color.b);
  }
}

function lineWeight(weight: number): LineWeightType {
  if (!Object.values(LineWeightType).includes(weight)) {
    throw new DwgCliError(
      `Unsupported line weight: ${weight}`,
      "INVALID_LINE_WEIGHT",
      EXIT_USER_ERROR,
    );
  }
  return weight as LineWeightType;
}

function applyCommonOptions(
  doc: CadDocument,
  entity: Entity,
  options: { layer?: string; color?: AcadColor },
): void {
  if (options.layer) entity.layer = ensureLayer(doc, options.layer);
  if (options.color) entity.color = acadColor(options.color);
}

function addEntity(doc: CadDocument, entity: Entity): void {
  if (!doc.modelSpace) {
    throw new DwgCliError(
      "Drawing has no model space to edit.",
      "MODEL_SPACE_NOT_FOUND",
      EXIT_USER_ERROR,
    );
  }
  doc.modelSpace.entities.add(entity);
}

function deleteEntity(entity: EditableEntity, entityId: string): void {
  const owner = entity.owner as {
    entities?: { remove?: (item: EditableEntity) => unknown };
  };
  if (!owner?.entities?.remove) {
    throw new DwgCliError(
      `Entity cannot be deleted: ${entityId}`,
      "ENTITY_NOT_DELETABLE",
      EXIT_USER_ERROR,
    );
  }
  owner.entities.remove(entity);
}

function setAttribute(
  entity: Entity,
  tag: string,
  value: string,
  id: string,
): void {
  if (!(entity instanceof Insert)) {
    throw new DwgCliError(
      `Entity is not a block insert: ${id}`,
      "ENTITY_NOT_INSERT",
      EXIT_USER_ERROR,
    );
  }
  const attr = [...entity.attributes].find(
    (item) => item.tag.toLowerCase() === tag.toLowerCase(),
  );
  if (!attr) {
    throw new DwgCliError(
      `Attribute not found on ${id}: ${tag}`,
      "ATTRIBUTE_NOT_FOUND",
      EXIT_USER_ERROR,
    );
  }
  attr.value = value;
}

function applyOperation(doc: CadDocument, operation: AcadEditOperation): void {
  switch (operation.kind) {
    case "addPoint": {
      const point = new Point(xyz(operation.at));
      applyCommonOptions(doc, point, operation);
      addEntity(doc, point);
      return;
    }
    case "addLine": {
      const line = new Line(xyz(operation.from), xyz(operation.to));
      applyCommonOptions(doc, line, operation);
      addEntity(doc, line);
      return;
    }
    case "addCircle": {
      const circle = new Circle();
      circle.center = xyz(operation.center);
      circle.radius = operation.radius;
      applyCommonOptions(doc, circle, operation);
      addEntity(doc, circle);
      return;
    }
    case "addArc": {
      const arc = new Arc(
        xyz(operation.center),
        operation.radius,
        degreesToRadians(operation.startAngleDegrees),
        degreesToRadians(operation.endAngleDegrees),
      );
      applyCommonOptions(doc, arc, operation);
      addEntity(doc, arc);
      return;
    }
    case "addText": {
      const text = new TextEntity();
      text.value = operation.text;
      text.insertPoint = xyz(operation.at);
      if (operation.height !== undefined) text.height = operation.height;
      if (operation.rotationDegrees !== undefined) {
        text.rotation = degreesToRadians(operation.rotationDegrees);
      }
      applyCommonOptions(doc, text, operation);
      addEntity(doc, text);
      return;
    }
    case "addMText": {
      const text = new MText();
      text.value = operation.text;
      text.insertPoint = xyz(operation.at);
      if (operation.height !== undefined) text.height = operation.height;
      if (operation.width !== undefined) text.rectangleWidth = operation.width;
      if (operation.rotationDegrees !== undefined) {
        text.rotation = degreesToRadians(operation.rotationDegrees);
      }
      applyCommonOptions(doc, text, operation);
      addEntity(doc, text);
      return;
    }
    case "addPolyline": {
      const polyline = new LwPolyline(operation.points.map(xy));
      polyline.isClosed = operation.closed ?? false;
      applyCommonOptions(doc, polyline, operation);
      addEntity(doc, polyline);
      return;
    }
  }

  const entity = findEntity(doc, operation.entityId);
  switch (operation.kind) {
    case "setText":
      if (!(entity instanceof TextEntity || entity instanceof MText)) {
        throw new DwgCliError(
          `Entity is not editable text: ${operation.entityId}`,
          "ENTITY_NOT_TEXT",
          EXIT_USER_ERROR,
        );
      }
      entity.value = operation.text;
      return;
    case "setLayer":
      entity.layer = ensureLayer(doc, operation.layer);
      return;
    case "setColor":
      entity.color = acadColor(operation.color);
      return;
    case "setLineType":
      entity.lineType = ensureLineType(doc, operation.lineType);
      return;
    case "setLineWeight":
      entity.lineWeight = lineWeight(operation.weight);
      return;
    case "setTransparency":
      entity.transparency = Transparency.fromAlphaValue(operation.alpha);
      return;
    case "setVisibility":
      entity.isInvisible = !operation.visible;
      return;
    case "move":
      entity.applyTranslation(
        new XYZ(operation.dx, operation.dy, operation.dz ?? 0),
      );
      return;
    case "rotate": {
      const origin = operation.origin ? xyz(operation.origin) : XYZ.zero;
      entity.applyTranslation(new XYZ(-origin.x, -origin.y, -origin.z));
      entity.applyRotation(XYZ.axisZ, degreesToRadians(operation.angleDegrees));
      entity.applyTranslation(origin);
      return;
    }
    case "scale":
      entity.applyScaling(
        new XYZ(operation.factor, operation.factor, operation.factor),
        operation.origin ? xyz(operation.origin) : XYZ.zero,
      );
      return;
    case "copy": {
      const clone = entity.clone() as Entity;
      clone.applyTranslation(
        new XYZ(operation.dx ?? 0, operation.dy ?? 0, operation.dz ?? 0),
      );
      addEntity(doc, clone);
      return;
    }
    case "matchProperties": {
      const source = findEntity(doc, operation.sourceId);
      entity.matchProperties(source);
      return;
    }
    case "setAttribute":
      setAttribute(entity, operation.tag, operation.value, operation.entityId);
      return;
    case "delete":
      deleteEntity(entity, operation.entityId);
      return;
  }
}

export function editWithAcadTs(opts: {
  input: string;
  output: string;
  operations: AcadEditOperation[];
  overwrite?: boolean;
}): AcadEditResult {
  if (opts.operations.length === 0) {
    throw new DwgCliError(
      "No acad-ts edit operation specified.",
      "MISSING_EDIT_OPERATION",
      EXIT_USER_ERROR,
    );
  }
  if (opts.input === opts.output && !opts.overwrite) {
    throw new DwgCliError(
      "Refusing to edit in place without --overwrite. Provide --output or pass --overwrite.",
      "EDIT_REQUIRES_OUTPUT_OR_OVERWRITE",
      EXIT_USER_ERROR,
    );
  }

  const { bytes, doc, format } = readAcadFile(opts.input);
  for (const operation of opts.operations) applyOperation(doc, operation);
  writeOutput(opts.output, writeAcadDocument(doc, format, bytes.length));

  return {
    input: opts.input,
    output: opts.output,
    backend: "acad-ts",
    operations: opts.operations,
    changed: opts.operations.length,
  };
}
