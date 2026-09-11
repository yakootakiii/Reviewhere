/**
 * Box-filter downscaling, so a 3000px scan doesn't go to the model at full size.
 *
 * Why bother: image tokens are charged by area, and a page of handwriting is
 * legible long before 3000px. Halving the longest edge quarters the tile count
 * for no measurable accuracy loss, which matters on a shared free quota.
 *
 * Averaging over the source box rather than sampling the nearest pixel is the
 * whole point — nearest-neighbour on text produces exactly the broken, aliased
 * strokes that make handwriting hard to read.
 */

import type { RawImage } from "./png";

/**
 * Past this, extra pixels cost tokens without buying legibility. Handwriting
 * that is unreadable at 1600px on the longest edge was unreadable in the scan.
 */
export const MAX_EDGE = 1600;

export function downscale(image: RawImage, maxEdge = MAX_EDGE): RawImage {
  const { width, height, channels } = image;
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return image;

  const scale = maxEdge / longest;
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const source = image.data;
  const out = new Uint8ClampedArray(targetWidth * targetHeight * channels);

  // Source box edges are computed per output pixel so rounding error can't
  // accumulate into a drifting, sheared image across a wide page.
  for (let y = 0; y < targetHeight; y += 1) {
    const yStart = Math.floor((y * height) / targetHeight);
    const yEnd = Math.max(yStart + 1, Math.floor(((y + 1) * height) / targetHeight));

    for (let x = 0; x < targetWidth; x += 1) {
      const xStart = Math.floor((x * width) / targetWidth);
      const xEnd = Math.max(xStart + 1, Math.floor(((x + 1) * width) / targetWidth));
      const count = (yEnd - yStart) * (xEnd - xStart);

      for (let c = 0; c < channels; c += 1) {
        let total = 0;
        for (let sy = yStart; sy < yEnd; sy += 1) {
          const row = sy * width * channels;
          for (let sx = xStart; sx < xEnd; sx += 1) {
            total += source[row + sx * channels + c];
          }
        }
        out[(y * targetWidth + x) * channels + c] = Math.round(total / count);
      }
    }
  }

  return { data: out, width: targetWidth, height: targetHeight, channels };
}
