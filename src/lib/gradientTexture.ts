// Canvas-generated gradient textures (data URLs) for overlay Views.
//
// Why not the linearGradient/radialGradient shaders? Lightning's gradient
// shaders blend the gradient against the node's own color and emit the
// node's alpha (`gl_FragColor = vec4(blended, color.a)`). On a transparent
// overlay View that degenerates into additive blending, so a dark fade is
// effectively invisible. A real texture goes through the normal premultiplied
// pipeline and composites correctly — and identical data URLs share one GPU
// texture across every consumer.

export type GradientStop = [offset: number, color: string];

interface LinearGradientOptions {
  /** Canvas size; small is fine, the GPU stretches with linear filtering. */
  width?: number;
  height?: number;
  /** Gradient line start/end in relative [0..1] coords. Default: top → bottom. */
  from?: [number, number];
  to?: [number, number];
}

const cache = new Map<string, string>();

function makeCanvas(width: number, height: number): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas.getContext("2d");
}

/** Linear gradient texture. Stretch it over any View via `src`. */
export function linearGradientTexture(stops: GradientStop[], options: LinearGradientOptions = {}): string {
  const { width = 2, height = 256, from = [0, 0], to = [0, 1] } = options;
  const key = `l:${width}x${height}:${from}:${to}:${stops.flat().join(",")}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const ctx = makeCanvas(width, height);
  if (!ctx) return "";

  const gradient = ctx.createLinearGradient(from[0] * width, from[1] * height, to[0] * width, to[1] * height);
  for (const [offset, color] of stops) {
    gradient.addColorStop(offset, color);
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const url = ctx.canvas.toDataURL("image/png");
  cache.set(key, url);
  return url;
}

/**
 * Soft radial glow texture (bright center fading to transparent edges).
 * `rgb` is a CSS triplet like "229, 9, 20"; `alpha` is the center opacity.
 */
export function radialGlowTexture(rgb: string, alpha = 0.5, size = 128): string {
  const key = `r:${size}:${rgb}:${alpha}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const ctx = makeCanvas(size, size);
  if (!ctx) return "";

  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  // Full-strength plateau out to ~72% so the glow stays bright at the edge of
  // whatever sits on top of it (a focused card covers the texture center);
  // only the outer ring fades out.
  gradient.addColorStop(0, `rgba(${rgb}, ${alpha})`);
  gradient.addColorStop(0.72, `rgba(${rgb}, ${alpha})`);
  gradient.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const url = ctx.canvas.toDataURL("image/png");
  cache.set(key, url);
  return url;
}
