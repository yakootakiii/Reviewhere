import { describe, expect, it } from "vitest";
import { downscale, MAX_EDGE } from "./downscale";
import type { RawImage } from "./png";

function gradient(width: number, height: number): RawImage {
  const data = new Uint8ClampedArray(width * height);
  for (let i = 0; i < data.length; i += 1) data[i] = i % 256;
  return { data, width, height, channels: 1 };
}

describe("downscale", () => {
  it("leaves an image that is already small enough completely alone", () => {
    const image = gradient(100, 80);
    expect(downscale(image, MAX_EDGE)).toBe(image);
  });

  it("scales the longest edge to the cap and keeps the aspect ratio", () => {
    const result = downscale(gradient(3000, 1500), 1600);
    expect(result.width).toBe(1600);
    expect(result.height).toBe(800);
  });

  it("scales by height when the page is taller than it is wide", () => {
    const result = downscale(gradient(1000, 4000), 1600);
    expect(result.height).toBe(1600);
    expect(result.width).toBe(400);
  });

  it("averages the source box rather than sampling one pixel", () => {
    // Four 2x2 quadrants of known value; halving must give each quadrant's mean.
    const data = new Uint8ClampedArray([
      0, 0, 100, 100, 0, 0, 100, 100, 200, 200, 40, 40, 200, 200, 40, 40,
    ]);
    const result = downscale({ data, width: 4, height: 4, channels: 1 }, 2);
    expect([...result.data]).toEqual([0, 100, 200, 40]);
  });

  it("keeps every channel separate", () => {
    const data = new Uint8ClampedArray([
      10, 20, 30, 10, 20, 30, 10, 20, 30, 10, 20, 30,
    ]);
    const result = downscale({ data, width: 2, height: 2, channels: 3 }, 1);
    expect([...result.data]).toEqual([10, 20, 30]);
  });

  it("never collapses an extreme aspect ratio to zero", () => {
    const result = downscale(gradient(4000, 3), 1600);
    expect(result.height).toBeGreaterThanOrEqual(1);
    expect(result.data.length).toBe(result.width * result.height);
  });
});
