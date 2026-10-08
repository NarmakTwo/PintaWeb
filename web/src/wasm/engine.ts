// GTK 4 cannot be shipped as this static site. The browser editor calls this
// module for fills, hard stamps, clipping, and Pinta's adjustments and effects.
import wasmUrl from './pixels.wasm?url';

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface Exports {
  memory: WebAssembly.Memory;
  ping(): number;
  growTo(bytes: number): number;
  setColor(r: number, g: number, b: number): void;
  flood(w: number, h: number, x: number, y: number, r: number, g: number, b: number, a: number, tol: number): void;
  wand(w: number, h: number, x: number, y: number, tol: number): void;
  recolor(w: number, h: number, cx: number, cy: number, radius: number, tr: number, tg: number, tb: number, fr: number, fg: number, fb: number, tol: number): void;
  stamp(w: number, h: number, x0: number, y0: number, x1: number, y1: number, size: number, r: number, g: number, b: number, a: number, erase: number): void;
  paintGradient(w: number, h: number, x0: number, y0: number, x1: number, y1: number, r0: number, g0: number, b0: number, a0: number, r1: number, g1: number, b1: number, a1: number, kind: number): void;
  clip(w: number, h: number): void;
  feather(w: number, h: number, radius: number): void;
  run(id: number, w: number, h: number, p1: number, p2: number, p3: number): void;
}

function parseHex(hex: string): Rgba {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map(ch => ch + ch).join('') : value;
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
    a: 255,
  };
}

export class PixelEngine {
  private ex!: Exports;

  async init(): Promise<void> {
    const response = await fetch(wasmUrl);
    const bytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, {
      env: {
        abort(line: number, column: number) {
          throw new Error(`Pixel engine aborted at ${line}:${column}`);
        },
      },
    });
    this.ex = instance.exports as unknown as Exports;
    if (this.ex.ping() !== 1) throw new Error('Pixel engine failed to start.');
  }

  private prepare(bytes: number): Uint8Array {
    if (this.ex.growTo(bytes) !== 1) throw new Error('This image is too large for the pixel engine.');
    return new Uint8Array(this.ex.memory.buffer);
  }

  private view(): Uint8Array {
    return new Uint8Array(this.ex.memory.buffer);
  }

  run(image: ImageData, id: number, p1: number, p2: number, p3: number): void {
    const n = image.width * image.height;
    const memory = this.prepare(n * 16 + 512);
    memory.set(image.data, 0);
    this.ex.run(id, image.width, image.height, p1 | 0, p2 | 0, p3 | 0);
    image.data.set(this.view().subarray(0, n * 4));
  }

  flood(image: ImageData, x: number, y: number, color: Rgba, tolerance: number): void {
    const n = image.width * image.height;
    const memory = this.prepare(n * 9 + 64);
    memory.set(image.data, 0);
    this.ex.flood(image.width, image.height, x | 0, y | 0, color.r, color.g, color.b, color.a, tolerance | 0);
    image.data.set(this.view().subarray(0, n * 4));
  }

  wand(image: ImageData, x: number, y: number, tolerance: number): Uint8Array {
    const n = image.width * image.height;
    const memory = this.prepare(n * 9 + 64);
    memory.set(image.data, 0);
    this.ex.wand(image.width, image.height, x | 0, y | 0, tolerance | 0);
    return this.view().slice(n * 4, n * 4 + n);
  }

  recolor(image: ImageData, cx: number, cy: number, radius: number, target: Rgba, fill: Rgba, tolerance: number): void {
    const n = image.width * image.height;
    const memory = this.prepare(n * 4 + 32);
    memory.set(image.data, 0);
    this.ex.recolor(image.width, image.height, cx | 0, cy | 0, radius | 0, target.r, target.g, target.b, fill.r, fill.g, fill.b, tolerance | 0);
    image.data.set(this.view().subarray(0, n * 4));
  }

  stamp(image: ImageData, x0: number, y0: number, x1: number, y1: number, size: number, color: Rgba, erase: boolean): void {
    const n = image.width * image.height;
    const memory = this.prepare(n * 4 + 32);
    memory.set(image.data, 0);
    this.ex.stamp(image.width, image.height, x0 | 0, y0 | 0, x1 | 0, y1 | 0, size | 0, color.r, color.g, color.b, color.a, erase ? 1 : 0);
    image.data.set(this.view().subarray(0, n * 4));
  }

  gradient(image: ImageData, x0: number, y0: number, x1: number, y1: number, from: Rgba, to: Rgba, kind: number): void {
    const n = image.width * image.height;
    const memory = this.prepare(n * 4 + 32);
    memory.set(image.data, 0);
    this.ex.paintGradient(
      image.width, image.height, x0 | 0, y0 | 0, x1 | 0, y1 | 0,
      from.r, from.g, from.b, from.a, to.r, to.g, to.b, to.a, kind | 0,
    );
    image.data.set(this.view().subarray(0, n * 4));
  }

  clip(current: ImageData, previous: ImageData, mask: Uint8Array): void {
    const n = current.width * current.height;
    const memory = this.prepare(n * 8 + n + 32);
    memory.set(current.data, 0);
    memory.set(previous.data, n * 4);
    memory.set(mask, n * 8);
    this.ex.clip(current.width, current.height);
    current.data.set(this.view().subarray(0, n * 4));
  }

  feather(mask: Uint8Array, width: number, height: number, radius: number): void {
    const n = width * height;
    const memory = this.prepare(n * 2 + 32);
    memory.set(mask.subarray(0, n), 0);
    this.ex.feather(width, height, radius | 0);
    mask.set(this.view().subarray(0, n));
  }

  setColor(hex: string): void {
    const color = parseHex(hex);
    this.ex.setColor(color.r, color.g, color.b);
  }
}

export function rgba(hex: string, alpha = 255): Rgba {
  const color = parseHex(hex);
  color.a = alpha;
  return color;
}
