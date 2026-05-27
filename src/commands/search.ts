import { Dwg } from "../sdk.js";
import type { DwgParser } from "../types.js";
import type { OutputOptions } from "../utils/output.js";
import { bold, dim, output } from "../utils/output.js";
import { handleCommandError, parseLimit } from "./shared.js";

export interface SearchOptions extends OutputOptions {
  query?: string;
  type?: string;
  layer?: string;
  limit?: string;
  total?: boolean;
  score?: boolean;
  snippets?: boolean;
  parser?: DwgParser;
}

export async function search(
  file: string,
  options: SearchOptions,
): Promise<void> {
  try {
    const results = await Dwg.open(file, { parser: options.parser }).search({
      query: options.query,
      type: options.type,
      layer: options.layer,
      limit: parseLimit(options.limit),
      snippets: options.snippets,
    });

    output(options, {
      json: () => {
        if (options.total) return { total: results.length };
        return {
          results: results.map((result) => {
            const { score, matches, ...rest } = result;
            return {
              ...rest,
              ...(options.score ? { score } : {}),
              ...(options.snippets === false ? {} : { matches }),
            };
          }),
        };
      },
      human: () => {
        if (options.total) {
          console.log(String(results.length));
          return;
        }
        for (const result of results) {
          console.log(
            `${bold(result.entityId)} ${result.type}${result.layer ? ` ${dim(result.layer)}` : ""}${options.score ? ` ${dim(`score: ${result.score}`)}` : ""}`,
          );
          if (options.snippets !== false) {
            for (const match of result.matches) console.log(`  ${dim(match)}`);
          }
        }
      },
    });
  } catch (err) {
    handleCommandError(err);
  }
}
