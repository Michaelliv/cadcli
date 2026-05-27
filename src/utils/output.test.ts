import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  cmd,
  error,
  hint,
  info,
  jsonOutput,
  output,
  stringifyJson,
  success,
  warn,
} from "./output.js";

let stdout = "";
let stderr = "";
let oldLog: typeof console.log;
let oldError: typeof console.error;

beforeEach(() => {
  stdout = "";
  stderr = "";
  oldLog = console.log;
  oldError = console.error;
  console.log = (...args: unknown[]) => {
    stdout += `${args.join(" ")}\n`;
  };
  console.error = (...args: unknown[]) => {
    stderr += `${args.join(" ")}\n`;
  };
});

afterEach(() => {
  console.log = oldLog;
  console.error = oldError;
});

describe("output helpers", () => {
  test("stringifies BigInt and writes JSON", () => {
    expect(stringifyJson({ id: 1n })).toContain('"1"');
    jsonOutput({ ok: true });
    expect(JSON.parse(stdout).ok).toBe(true);
  });

  test("selects json, quiet, and human handlers", () => {
    output(
      { json: true },
      {
        json: () => ({ mode: "json" }),
        human: () => console.log("human"),
      },
    );
    expect(JSON.parse(stdout).mode).toBe("json");
    stdout = "";

    output(
      { quiet: true },
      {
        quiet: () => console.log("quiet"),
        human: () => console.log("human"),
      },
    );
    expect(stdout.trim()).toBe("quiet");
    stdout = "";

    output(
      {},
      {
        human: () => console.log("human"),
      },
    );
    expect(stdout.trim()).toBe("human");
  });

  test("writes human status helpers to the right streams", () => {
    success("done");
    hint("next");
    expect(stdout).toContain("done");
    expect(stdout).toContain("next");
    expect(cmd("cadcli")).toContain("cadcli");

    info("info");
    warn("warn");
    error("error");
    expect(stderr).toContain("info");
    expect(stderr).toContain("warn");
    expect(stderr).toContain("error");
  });
});
