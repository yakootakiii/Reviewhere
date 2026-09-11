/**
 * A minimal PNG encoder, built on Node's own zlib.
 *
 * unpdf hands back raw pixels (`Uint8ClampedArray` plus width/height/channels),
 * and the model needs an encoded image. The obvious answers — `sharp` or
 * `@napi-rs/canvas` — are both native modules, which is real build weight on
 * Render for the one job of wrapping bytes in a container. PNG's baseline is
 * small enough to write: signature, IHDR, one deflated IDAT, IEND.
 *
 * Deliberately no interlacing, no palette, no filtering (filter byte 0 on every
 * scanline). Filtering would shrink the file, but the image is transcribed once
 * and thrown away, so bytes on the wire matter less than not having a
 * dependency.
 */

import { deflateSync } from "node:zlib";

export interface RawImage {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
  /** 1 = greyscale, 3 = RGB, 4 = RGBA. */
  channels: 1 | 3 | 4;
}

/** PNG colour-type codes for the channel counts unpdf can produce. */
const COLOR_TYPE: Record<1 | 3 | 4, number> = { 1: 0, 3: 2, 4: 6 };

const CRC_TABLE = buildCrcTable();

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** length + type + payload + CRC(type+payload), which is the PNG chunk shape. */
function chunk(type: string, payload: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), payload]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function encodePng(image: RawImage): Buffer {
  const { width, height, channels } = image;
  if (width <= 0 || height <= 0) throw new Error("Cannot encode a zero-sized image.");

  const stride = width * channels;
  const expected = stride * height;
  if (image.data.length < expected) {
    throw new Error(`Pixel data is ${image.data.length} bytes, expected ${expected}.`);
  }

  // Each scanline is prefixed with its filter byte, hence the +1 per row.
  const raw = Buffer.alloc((stride + 1) * height);
  const source = Buffer.from(image.data.buffer, image.data.byteOffset, expected);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    source.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = COLOR_TYPE[channels];
  // [10] compression, [11] filter, [12] interlace — all 0, which Buffer.alloc gave us.

  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function toDataUrl(png: Buffer): string {
  return `data:image/png;base64,${png.toString("base64")}`;
}
