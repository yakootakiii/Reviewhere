import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { encodePng, toDataUrl } from "./png";

/**
 * The encoder is hand-written, so these decode what it produced rather than
 * comparing against a golden blob — a wrong CRC or a missing filter byte would
 * still match a blob recorded from the same bug.
 */

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Walks the chunk list the way a real decoder does, verifying every CRC. */
function readChunks(png: Buffer) {
  expect(png.subarray(0, 8)).toEqual(SIGNATURE);
  const chunks: { type: string; data: Buffer }[] = [];
  let at = 8;
  while (at < png.length) {
    const length = png.readUInt32BE(at);
    const type = png.subarray(at + 4, at + 8).toString("ascii");
    const data = png.subarray(at + 8, at + 8 + length);
    const stored = png.readUInt32BE(at + 8 + length);
    expect(crc32(png.subarray(at + 4, at + 8 + length))).toBe(stored);
    chunks.push({ type, data });
    at += 12 + length;
  }
  return chunks;
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function rgb(width: number, height: number, fill: [number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 3] = fill[0];
    data[i * 3 + 1] = fill[1];
    data[i * 3 + 2] = fill[2];
  }
  return { data, width, height, channels: 3 as const };
}

describe("encodePng", () => {
  it("writes a signature, IHDR, IDAT and IEND with valid CRCs", () => {
    const chunks = readChunks(encodePng(rgb(4, 3, [10, 20, 30])));
    expect(chunks.map((chunk) => chunk.type)).toEqual(["IHDR", "IDAT", "IEND"]);
  });

  it("records the dimensions and colour type in IHDR", () => {
    const [ihdr] = readChunks(encodePng(rgb(7, 5, [0, 0, 0])));
    expect(ihdr.data.readUInt32BE(0)).toBe(7);
    expect(ihdr.data.readUInt32BE(4)).toBe(5);
    expect(ihdr.data[8]).toBe(8); // bit depth
    expect(ihdr.data[9]).toBe(2); // colour type 2 = RGB
    expect(ihdr.data[12]).toBe(0); // not interlaced
  });

  it("round-trips the exact pixels, one filter byte per scanline", () => {
    const source = rgb(3, 2, [200, 30, 40]);
    const [, idat] = readChunks(encodePng(source));
    const raw = inflateSync(idat.data);

    // 3 px * 3 channels + 1 filter byte = 10 bytes a row.
    expect(raw.length).toBe(10 * 2);
    for (let y = 0; y < 2; y += 1) {
      expect(raw[y * 10]).toBe(0);
      expect([...raw.subarray(y * 10 + 1, y * 10 + 10)]).toEqual([
        200, 30, 40, 200, 30, 40, 200, 30, 40,
      ]);
    }
  });

  it("maps channel counts to the right colour types", () => {
    const grey = { data: new Uint8ClampedArray(4), width: 2, height: 2, channels: 1 as const };
    const rgba = { data: new Uint8ClampedArray(16), width: 2, height: 2, channels: 4 as const };
    expect(readChunks(encodePng(grey))[0].data[9]).toBe(0);
    expect(readChunks(encodePng(rgba))[0].data[9]).toBe(6);
  });

  it("refuses pixel data that is shorter than the stated size", () => {
    const truncated = { data: new Uint8ClampedArray(5), width: 4, height: 4, channels: 3 as const };
    expect(() => encodePng(truncated)).toThrow(/expected 48/);
  });

  it("builds a data URL the model can accept", () => {
    const url = toDataUrl(encodePng(rgb(2, 2, [1, 2, 3])));
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
    // Decoding the tail must give back the bytes we encoded.
    const decoded = Buffer.from(url.slice("data:image/png;base64,".length), "base64");
    expect(decoded.subarray(0, 8)).toEqual(SIGNATURE);
  });
});
