import { readFileSync } from "node:fs";
import { queryDrawing, querySchema, querySchemaTables } from "../core/query.js";
import { output } from "../utils/output.js";
import type { DrawingCommandOptions } from "./shared.js";
import { drawingFor, handleCommandError, userError } from "./shared.js";

export interface QueryOptions extends DrawingCommandOptions {
  sql?: string;
  file?: string;
  schema?: boolean;
}

function querySql(options: QueryOptions): string {
  if (options.schema) return "";
  if (options.sql && options.file) {
    throw userError(
      "Use either --sql or --file, not both.",
      "QUERY_SOURCE_CONFLICT",
    );
  }
  if (options.sql) return options.sql;
  if (options.file) return readFileSync(options.file, "utf8");
  throw userError(
    "Provide --sql <query>, --file <path>, or --schema.",
    "MISSING_QUERY",
  );
}

function printRows(rows: Record<string, unknown>[]): void {
  for (const row of rows) {
    console.log(
      Object.values(row)
        .map((value) => value ?? "")
        .join("\t"),
    );
  }
}

export async function query(
  file: string,
  options: QueryOptions,
): Promise<void> {
  try {
    if (options.schema) {
      output(options, {
        json: () => ({ tables: querySchemaTables() }),
        human: () => console.log(querySchema()),
      });
      return;
    }

    const sql = querySql(options);
    const doc = await drawingFor(file, options).document();
    const result = await queryDrawing(doc, sql);

    output(options, {
      json: () => result,
      human: () => printRows(result.rows),
      quiet: () => console.log(String(result.rows.length)),
    });
  } catch (err) {
    handleCommandError(err);
  }
}
