import { describe, expect, test } from "bun:test";
import {
  parseStrokeWidth,
  parseViewBox,
  rasterizeSvg,
  viewBoxAround,
} from "./raster.js";

describe("SVG rasterization", () => {
  test("converts SVG to PNG with requested width", () => {
    const result = rasterizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect width="100" height="50" fill="white"/><circle cx="50" cy="25" r="20" fill="red"/></svg>',
      { width: 400 },
    );

    expect(result.width).toBe(400);
    expect(result.height).toBe(200);
    expect(Buffer.from(result.png.subarray(0, 8)).toString("hex")).toBe(
      "89504e470d0a1a0a",
    );
  });

  test("crops by replacing the SVG viewBox", () => {
    const result = rasterizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="40" y="40" width="20" height="20" fill="black"/></svg>',
      { viewBox: { x: 25, y: 25, width: 50, height: 50 }, width: 500 },
    );

    expect(result.width).toBe(500);
    expect(result.height).toBe(500);
  });

  test("applies high-contrast diagnostic rendering", () => {
    const result = rasterizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><line x1="0" y1="25" x2="100" y2="25" stroke="#ddd" stroke-width="0.2"/></svg>',
      { ink: true, width: 400 },
    );

    expect(result.width).toBe(400);
    expect(result.height).toBe(200);
  });

  test("parses explicit and radius-based crop boxes", () => {
    expect(parseViewBox("10 20 30 40")).toEqual({
      x: 10,
      y: 20,
      width: 30,
      height: 40,
    });
    expect(viewBoxAround("100,200", "50")).toEqual({
      x: 50,
      y: 150,
      width: 100,
      height: 100,
    });
    expect(parseStrokeWidth("2.5")).toBe(2.5);
  });
});
