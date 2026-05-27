import chalk from "chalk";

export interface OutputOptions {
  json?: boolean;
  quiet?: boolean;
}

export const success = (msg: string) => console.log(chalk.green("✓"), msg);
export const info = (msg: string) => console.error(chalk.blue("ℹ"), msg);
export const warn = (msg: string) => console.error(chalk.yellow("⚠"), msg);
export const error = (msg: string) => console.error(chalk.red("✗"), msg);
export const bold = (s: string) => chalk.bold(s);
export const dim = (s: string) => chalk.dim(s);
export const cmd = (s: string) => chalk.cyan(s);
export const hint = (msg: string) => console.log(chalk.dim(`  ${msg}`));

export function stringifyJson(data: unknown): string {
  return JSON.stringify(
    data,
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );
}

export function jsonOutput(data: unknown): void {
  console.log(stringifyJson(data));
}

export function output(
  options: OutputOptions,
  handlers: { json?: () => unknown; quiet?: () => void; human: () => void },
): void {
  if (options.json && handlers.json) {
    jsonOutput(handlers.json());
  } else if (options.quiet && handlers.quiet) {
    handlers.quiet();
  } else if (!options.quiet) {
    handlers.human();
  }
}
