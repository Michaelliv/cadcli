#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const targets = [
  join(root, "node_modules"),
  dirname(dirname(root)),
].map((nodeModulesRoot) =>
  join(
    nodeModulesRoot,
    "@node-projects",
    "acad-ts",
    "dist",
    "IO",
    "DWG",
    "DwgStreamReaders",
    "DwgObjectReader.js",
  ),
);

const copied = "new Uint8Array(this._memoryStream)";
const reused = "this._memoryStream";

for (const target of targets) {
  let source;
  try {
    source = readFileSync(target, "utf8");
  } catch {
    continue;
  }

  const matches = source.split(copied).length - 1;
  if (matches === 0) process.exit(0);

  writeFileSync(target, source.replaceAll(copied, reused));
  console.log(`cadcli: patched acad-ts DwgObjectReader (${matches} buffer copies removed)`);
  process.exit(0);
}
