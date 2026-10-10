import type { AssistantKind, GridKind, Point } from './types.ts';

export interface Guide {
  kind: AssistantKind;
  a: Point;
  b: Point;
}

export function snapPoint(point: Point, grid: number, kind: GridKind): Point {
  const size = Math.max(2, grid);
  if (kind === 'iso') {
    const height = size * Math.sin(Math.PI / 3);
    const row = Math.round(point.y / height);
    const shift = row % 2 ? size / 2 : 0;
    const col = Math.round((point.x - shift) / size);
    return { x: col * size + shift, y: row * height };
  }
  return { x: Math.round(point.x / size) * size, y: Math.round(point.y / size) * size };
}

export function projectPoint(point: Point, origin: Point, guide: Guide): Point {
  if (guide.kind === 'parallel') {
    const dx = guide.b.x - guide.a.x;
    const dy = guide.b.y - guide.a.y;
    const length = Math.hypot(dx, dy) || 1;
    const along = ((point.x - origin.x) * dx + (point.y - origin.y) * dy) / (length * length);
    return { x: origin.x + dx * along, y: origin.y + dy * along };
  }
  if (guide.kind === 'vanish') {
    const dx = origin.x - guide.a.x;
    const dy = origin.y - guide.a.y;
    const length = Math.hypot(dx, dy) || 1;
    const along = ((point.x - guide.a.x) * dx + (point.y - guide.a.y) * dy) / (length * length);
    return { x: guide.a.x + dx * along, y: guide.a.y + dy * along };
  }
  const cx = (guide.a.x + guide.b.x) / 2;
  const cy = (guide.a.y + guide.b.y) / 2;
  const rx = Math.max(1, Math.abs(guide.b.x - guide.a.x) / 2);
  const ry = Math.max(1, Math.abs(guide.b.y - guide.a.y) / 2);
  const angle = Math.atan2((point.y - cy) / ry, (point.x - cx) / rx);
  return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry };
}

interface Pixel {
  r: number;
  g: number;
  b: number;
  a: number;
}

function readPixel(data: Uint8ClampedArray, index: number): Pixel {
  const offset = index * 4;
  return { r: data[offset], g: data[offset + 1], b: data[offset + 2], a: data[offset + 3] };
}

function channelDistance(a: Pixel, b: Pixel): number {
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b), Math.abs(a.a - b.a));
}

function coverageOf(pixel: Pixel, clicked: Pixel): number {
  return 1 - channelDistance(pixel, clicked) / 255;
}

export interface SoftRegion {
  mask: Uint8Array;
  coverage: Float32Array;
}

export function softRegion(image: ImageData, x: number, y: number, tolerance: number, contiguous: boolean): SoftRegion {
  const width = image.width;
  const height = image.height;
  const count = width * height;
  const mask = new Uint8Array(count);
  const coverage = new Float32Array(count);
  const clicked = readPixel(image.data, y * width + x);
  const interior: number[] = [];
  if (contiguous) {
    const seen = new Uint8Array(count);
    const stack = [y * width + x];
    seen[stack[0]] = 1;
    while (stack.length) {
      const index = stack.pop()!;
      if (channelDistance(readPixel(image.data, index), clicked) > tolerance) continue;
      interior.push(index);
      const px = index % width;
      const py = (index / width) | 0;
      if (px > 0 && !seen[index - 1]) { seen[index - 1] = 1; stack.push(index - 1); }
      if (px + 1 < width && !seen[index + 1]) { seen[index + 1] = 1; stack.push(index + 1); }
      if (py > 0 && !seen[index - width]) { seen[index - width] = 1; stack.push(index - width); }
      if (py + 1 < height && !seen[index + width]) { seen[index + width] = 1; stack.push(index + width); }
    }
  } else {
    for (let index = 0; index < count; index++) {
      if (channelDistance(readPixel(image.data, index), clicked) <= tolerance) interior.push(index);
    }
  }
  const distance = new Int16Array(count);
  distance.fill(999);
  const queue = interior.slice();
  for (const index of interior) distance[index] = 0;
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head];
    if (distance[index] >= 2) continue;
    const px = index % width;
    const py = (index / width) | 0;
    const next = [px > 0 ? index - 1 : -1, px + 1 < width ? index + 1 : -1, py > 0 ? index - width : -1, py + 1 < height ? index + width : -1];
    for (const neighbor of next) {
      if (neighbor < 0 || distance[neighbor] <= distance[index] + 1) continue;
      distance[neighbor] = distance[index] + 1;
      queue.push(neighbor);
    }
  }
  let stable = false;
  for (let index = 0; index < count; index++) {
    if (distance[index] === 0 || distance[index] > 2) continue;
    const px = index % width;
    const py = (index / width) | 0;
    for (const neighbor of [px > 0 ? index - 1 : -1, px + 1 < width ? index + 1 : -1, py > 0 ? index - width : -1, py + 1 < height ? index + width : -1]) {
      if (neighbor < 0) continue;
      if (distance[neighbor] > distance[index] && coverageOf(readPixel(image.data, neighbor), clicked) < 0.5) stable = true;
    }
  }
  for (const index of interior) {
    mask[index] = 255;
    coverage[index] = 1;
  }
  if (!stable) return { mask, coverage };
  for (let index = 0; index < count; index++) {
    if (distance[index] < 1 || distance[index] > 2) continue;
    const amount = coverageOf(readPixel(image.data, index), clicked);
    if (amount < 0.08) continue;
    mask[index] = 255;
    coverage[index] = amount;
  }
  return { mask, coverage };
}

export function paintSoft(image: ImageData, region: SoftRegion, fill: Pixel): boolean {
  let changed = false;
  const data = image.data;
  for (let index = 0; index < region.mask.length; index++) {
    if (region.mask[index] === 0) continue;
    const offset = index * 4;
    const amount = region.coverage[index];
    const next = amount >= 0.999
      ? [fill.r, fill.g, fill.b, fill.a]
      : [
        Math.round(data[offset] * (1 - amount) + fill.r * amount),
        Math.round(data[offset + 1] * (1 - amount) + fill.g * amount),
        Math.round(data[offset + 2] * (1 - amount) + fill.b * amount),
        Math.round(data[offset + 3] * (1 - amount) + fill.a * amount),
      ];
    if (data[offset] === next[0] && data[offset + 1] === next[1] && data[offset + 2] === next[2] && data[offset + 3] === next[3]) continue;
    data[offset] = next[0];
    data[offset + 1] = next[1];
    data[offset + 2] = next[2];
    data[offset + 3] = next[3];
    changed = true;
  }
  return changed;
}
