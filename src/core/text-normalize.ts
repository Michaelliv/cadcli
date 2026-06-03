import hebrewLayout from "convert-layout/he.js";
import type { DwgDocument, DwgEntity } from "../types.js";

type TextNormalizerName = "hebrew-keyboard";

type ScriptName = "hebrew";

interface TextNormalizationRoute {
  name: TextNormalizerName;
  codePages: string[];
  textStyleFiles: string[];
  fromLatinKeyboard: (text: string) => string;
  targetScript: ScriptName;
}

const TEXT_NORMALIZATION_ROUTES: TextNormalizationRoute[] = [
  {
    name: "hebrew-keyboard",
    codePages: ["ansi_1255"],
    textStyleFiles: ["gil.shx", "narkism$.shx", "heb.shx", "oron", "oron1"],
    fromLatinKeyboard: hebrewLayout.fromEn,
    targetScript: "hebrew",
  },
];

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizedToken(value: string | undefined): string | undefined {
  return value?.trim().toLowerCase();
}

function textStyleFile(entity: DwgEntity): string | undefined {
  return normalizedToken(asText(entity.data.textStyleFile));
}

function isTextEntity(entity: DwgEntity): boolean {
  return entity.type === "TEXT" || entity.type === "MTEXT";
}

function hasTargetScript(text: string, script: ScriptName): boolean {
  switch (script) {
    case "hebrew":
      return /[\u0590-\u05ff]/u.test(text);
  }
}

function targetScriptCount(text: string, script: ScriptName): number {
  switch (script) {
    case "hebrew":
      return text.match(/[\u0590-\u05ff]/gu)?.length ?? 0;
  }
}

function mostlyLatinKeyboardText(
  text: string,
  targetScript: ScriptName,
): boolean {
  const latinLetters = text.match(/[A-Za-z]/g)?.length ?? 0;
  return latinLetters > 0 && targetScriptCount(text, targetScript) === 0;
}

function routeMatches(
  route: TextNormalizationRoute,
  doc: DwgDocument,
  entity: DwgEntity,
): boolean {
  const codePage = normalizedToken(doc.metadata.codePage);
  const styleFile = textStyleFile(entity);
  return Boolean(
    codePage &&
      styleFile &&
      route.codePages.includes(codePage) &&
      route.textStyleFiles.includes(styleFile),
  );
}

function routeFor(
  doc: DwgDocument,
  entity: DwgEntity,
): TextNormalizationRoute | undefined {
  return TEXT_NORMALIZATION_ROUTES.find((route) =>
    routeMatches(route, doc, entity),
  );
}

function normalizeEntityText(
  doc: DwgDocument,
  entity: DwgEntity,
): { entity: DwgEntity; normalizer?: TextNormalizerName } {
  if (!isTextEntity(entity)) return { entity };

  const route = routeFor(doc, entity);
  if (!route) return { entity };

  const text = asText(entity.data.text);
  if (!text || !mostlyLatinKeyboardText(text, route.targetScript)) {
    return { entity };
  }

  const normalized = route.fromLatinKeyboard(text);
  if (normalized === text || !hasTargetScript(normalized, route.targetScript)) {
    return { entity };
  }

  return {
    normalizer: route.name,
    entity: {
      ...entity,
      data: {
        ...entity.data,
        text: normalized,
      },
    },
  };
}

export function normalizeHebrewKeyboardText(text: string): string {
  return hebrewLayout.fromEn(text);
}

export function normalizeTextAuto(doc: DwgDocument): DwgDocument {
  const applied = new Set<TextNormalizerName>();
  let entitiesChanged = 0;

  const entities = doc.entities.map((entity) => {
    const result = normalizeEntityText(doc, entity);
    if (!result.normalizer) return entity;

    entitiesChanged++;
    applied.add(result.normalizer);
    return result.entity;
  });

  if (entitiesChanged === 0) return doc;

  const unsupportedIds = new Set(doc.unsupported.map((entity) => entity.id));
  return {
    ...doc,
    entities,
    unsupported: entities.filter((entity) => unsupportedIds.has(entity.id)),
    metadata: {
      ...doc.metadata,
      textNormalization: {
        applied: [...applied],
        entitiesChanged,
      },
    },
  };
}
