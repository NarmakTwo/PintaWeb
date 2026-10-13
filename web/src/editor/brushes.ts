import { readBrushFile } from './brushimport.ts';
import { confirmChoice } from './customize.ts';
import type { Editor } from './document.ts';
import { loadBrushRecord, saveBrushRecord } from './storage.ts';
import type { Point, ToolId } from './types.ts';

export type BrushTab = 'paint' | 'smudge' | 'erase';
export type TipId = 'plain' | 'circle' | 'squares' | 'splatter' | 'slash' | 'grid' | 'image';
export type BrushBlend = 'normal' | 'multiply' | 'screen' | 'add' | 'overlay' | 'lighten' | 'darken' | 'behind';
export type GrainBlend = 'multiply' | 'screen' | 'add' | 'overlay' | 'lighten' | 'darken' | 'soft-light' | 'color-dodge' | 'color-burn';
export type RotationMode = 'fixed' | 'follow' | 'jitter';
export type SpeedMode = 'off' | 'light' | 'heavy';

export interface BrushPreset {
  id: string;
  name: string;
  builtin: boolean;
  tab: BrushTab;
  tip: TipId;
  tipImage: string | null;
  tipMissing: boolean;
  spacing: number;
  scatter: number;
  twist: number;
  rotation: RotationMode;
  angle: number;
  hardness: number;
  flow: number;
  blend: BrushBlend;
  wetMix: number;
  hueJitter: number;
  satJitter: number;
  lightJitter: number;
  darkJitter: number;
  strokeHue: number;
  strokeSat: number;
  strokeLight: number;
  strokeDark: number;
  opacityJitter: number;
  minOpacity: number;
  maxOpacity: number;
  sizeJitter: number;
  speedSize: number;
  speedOpacity: number;
  stamps: number;
  carry: number;
  secondaryMix: number;
  buildup: boolean;
  glaze: number;
  heavy: boolean;
  flipX: boolean;
  flipY: boolean;
  filtered: boolean;
  wetEdge: number;
  grain: string | null;
  grainLock: 'move' | 'canvas';
  grainBlend: GrainBlend;
  grainScale: number;
  grainDepth: number;
  grainMove: number;
  grainJitter: boolean;
  taperIn: number;
  taperOut: number;
  taperSize: boolean;
  taperOpacity: boolean;
  speed: SpeedMode;
  streamline: number;
  stabilizer: number;
  settle: boolean;
  category: string | null;
  pinned: boolean;
}

export interface StrokeSample {
  x: number;
  y: number;
  t: number;
}

const TABS: BrushTab[] = ['paint', 'smudge', 'erase'];
const imageCache = new Map<string, HTMLImageElement | 'missing'>();
let onImageReady: (() => void) | null = null;

function preset(partial: Pick<BrushPreset, 'id' | 'name' | 'tab' | 'tip'> & Partial<BrushPreset>): BrushPreset {
  return {
    builtin: true,
    tipImage: null,
    tipMissing: false,
    spacing: 25,
    scatter: 0,
    twist: 0,
    rotation: 'fixed',
    angle: 0,
    hardness: 100,
    flow: 100,
    blend: 'normal',
    wetMix: 0,
    hueJitter: 0,
    satJitter: 0,
    lightJitter: 0,
    darkJitter: 0,
    strokeHue: 0,
    strokeSat: 0,
    strokeLight: 0,
    strokeDark: 0,
    opacityJitter: 0,
    minOpacity: 0,
    maxOpacity: 100,
    sizeJitter: 0,
    speedSize: 0,
    speedOpacity: 0,
    stamps: 1,
    carry: 0,
    secondaryMix: 0,
    buildup: false,
    glaze: 0,
    heavy: false,
    flipX: false,
    flipY: false,
    filtered: true,
    wetEdge: 0,
    grain: null,
    grainLock: 'move',
    grainBlend: 'multiply',
    grainScale: 100,
    grainDepth: 100,
    grainMove: 100,
    grainJitter: false,
    taperIn: 0,
    taperOut: 0,
    taperSize: false,
    taperOpacity: false,
    speed: 'off',
    streamline: 70,
    stabilizer: 0,
    settle: false,
    category: null,
    pinned: false,
    ...partial,
  };
}

interface BrushCategory {
  id: string;
  name: string;
  tab: BrushTab;
  openByDefault: boolean;
}

function factories(): BrushPreset[] {
  const paint: Array<[string, TipId]> = [
    ['Plain', 'plain'], ['Circle', 'circle'], ['Squares', 'squares'],
    ['Splatter', 'splatter'], ['Slash', 'slash'], ['Grid', 'grid'],
  ];
  return [
    ...paint.map(([name, tip]) => preset({ id: `factory-${tip}`, name, tab: 'paint', tip })),
    preset({ id: 'factory-smudge', name: 'Smudge', tab: 'smudge', tip: 'plain', wetMix: 100 }),
    preset({ id: 'factory-hard', name: 'Hard', tab: 'erase', tip: 'plain', hardness: 100 }),
    preset({ id: 'factory-soft', name: 'Soft', tab: 'erase', tip: 'plain', hardness: 0 }),
  ];
}

let presets: BrushPreset[] = factories();
let libraryPruned = false;
let categories: BrushCategory[] = [];
let categoryOpen: Record<string, boolean> = {};
let selected: Record<BrushTab, string> = { paint: 'factory-plain', smudge: 'factory-smudge', erase: 'factory-hard' };
let recent: Record<BrushTab, string[]> = { paint: [], smudge: [], erase: [] };
let tab: BrushTab = 'paint';
let editing = false;
let serial = 0;
let saveTimer = 0;
let settleTimer = 0;
let settleFrame = 0;

interface RememberedStroke {
  before: ImageData;
  points: StrokeSample[];
  tool: ToolId;
  button: number;
  preset: BrushPreset;
  size: number;
  opacity: number;
}
let lastStroke: RememberedStroke | null = null;
let handles: StrokeSample[] | null = null;
let dragHandle = -1;

function clonePreset(source: BrushPreset): BrushPreset {
  return { ...source };
}

export function strokeSerial(): number {
  return serial;
}

export function brushTab(): BrushTab {
  return tab;
}

export function activePreset(tool: ToolId): BrushPreset {
  const which: BrushTab = tool === 'eraser' ? 'erase' : tool === 'brush' && tab === 'smudge' ? 'smudge' : 'paint';
  return presets.find(item => item.id === selected[which]) ?? presets.find(item => item.tab === which) ?? presets[0];
}

export function legacyPencil(editor: Editor): boolean {
  const brush = activePreset('pencil');
  const smooth = editor.unserrate.pencil && editor.smoothing.pencil > 0;
  return (editor.size | 0) <= 1 && brush.hardness >= 100 && !smooth && brush.speed === 'off' && brush.taperIn === 0 && brush.taperOut === 0;
}

function mark(): void {
  serial += 1;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    void saveBrushRecord(exportBrushRecord()).catch(() => undefined);
  }, 200);
}

export function exportBrushRecord(): unknown {
  return { presets, selected, tab, categories, recent, prunedLoose: libraryPruned };
}

export async function importBrushRecord(record: unknown): Promise<void> {
  window.clearTimeout(saveTimer);
  await saveBrushRecord(record);
  await loadBrushes();
}

export function refreshBrushLibrary(editor: Editor): void {
  const panel = document.getElementById('brush-panel');
  if (panel && !panel.hidden) {
    editing = false;
    renderPanel();
  }
  refreshBrushPreview(editor);
  paintBrushMark(editor);
}

function factoryBrush(item: BrushPreset): boolean {
  return item.id.startsWith('factory-');
}

export async function loadBrushes(): Promise<void> {
  try {
    const raw = await loadBrushRecord() as { presets?: BrushPreset[]; selected?: Record<BrushTab, string>; tab?: BrushTab; categories?: BrushCategory[]; prunedLoose?: boolean; recent?: Partial<Record<BrushTab, string[]>> } | null;
    if (!raw?.presets?.length) {
      libraryPruned = true;
      return;
    }
    presets = raw.presets.map(item => ({ ...preset({ id: item.id, name: item.name, tab: item.tab, tip: item.tip }), ...item, category: item.category ?? null }));
    categories = Array.isArray(raw.categories) ? raw.categories.filter(item => item && (item.tab === 'paint' || item.tab === 'smudge' || item.tab === 'erase') && item.id && item.name).map(item => ({ id: item.id, name: item.name, tab: item.tab, openByDefault: item.openByDefault === true })) : [];
    let changed = false;
    for (const factory of factories()) {
      if (presets.some(item => item.id === factory.id)) continue;
      presets.push(factory);
      changed = true;
    }
    if (!raw.prunedLoose) {
      const kept = presets.filter(item => factoryBrush(item) || categories.some(category => category.id === item.category && category.tab === item.tab));
      changed = changed || kept.length !== presets.length;
      presets = kept;
      libraryPruned = true;
      changed = true;
    } else {
      libraryPruned = true;
    }
    if (raw.selected) selected = { ...selected, ...raw.selected };
    if (raw.tab) tab = raw.tab;
    if (raw.recent) {
      for (const name of TABS) {
        const ids = raw.recent[name];
        if (Array.isArray(ids)) recent[name] = ids.filter(id => typeof id === 'string' && presets.some(item => item.id === id)).slice(0, 8);
      }
    }
    for (const name of TABS) {
      if (!presets.some(item => item.id === selected[name] && item.tab === name)) {
        const fallback = presets.find(item => item.tab === name);
        if (fallback) selected[name] = fallback.id;
      }
    }
    if (changed) mark();
  } catch { /* factory presets remain */ }
}

function knot(a: StrokeSample, b: StrokeSample, t: number): number {
  return t + Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y));
}

function mix(a: StrokeSample, b: StrokeSample, t0: number, t1: number, t: number): StrokeSample {
  const span = t1 - t0 || 1;
  const amount = (t - t0) / span;
  return { x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount, t: a.t + (b.t - a.t) * amount };
}

function centripetal(p0: StrokeSample, p1: StrokeSample, p2: StrokeSample, p3: StrokeSample, amount: number): StrokeSample {
  const t0 = 0;
  const t1 = knot(p0, p1, t0);
  const t2 = knot(p1, p2, t1);
  const t3 = knot(p2, p3, t2);
  const t = t1 + (t2 - t1) * amount;
  const a1 = mix(p0, p1, t0, t1, t);
  const a2 = mix(p1, p2, t1, t2, t);
  const a3 = mix(p2, p3, t2, t3, t);
  const b1 = mix(a1, a2, t0, t2, t);
  const b2 = mix(a2, a3, t1, t3, t);
  return mix(b1, b2, t1, t2, t);
}

function sampleCurve(points: StrokeSample[], spacing: number): StrokeSample[] {
  if (points.length <= 2) return resample(points, spacing);
  const out: StrokeSample[] = [];
  const push = (point: StrokeSample) => {
    const last = out[out.length - 1];
    if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= spacing * 0.5) out.push(point);
  };
  for (let index = 0; index < points.length - 1; index++) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const steps = Math.min(64, Math.max(1, Math.ceil(distance / spacing)));
    for (let step = index === 0 ? 0 : 1; step <= steps; step++) push(centripetal(p0, p1, p2, p3, step / steps));
  }
  return out.length ? out : points.slice(0, 1);
}

function resample(points: StrokeSample[], spacing: number): StrokeSample[] {
  if (points.length <= 1) return points.map(point => ({ ...point }));
  const out: StrokeSample[] = [{ ...points[0] }];
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1];
    const to = points[index];
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.min(500, Math.max(1, Math.ceil(distance / spacing)));
    for (let step = 1; step <= steps; step++) {
      const amount = step / steps;
      out.push({
        x: from.x + (to.x - from.x) * amount,
        y: from.y + (to.y - from.y) * amount,
        t: from.t + (to.t - from.t) * amount,
      });
    }
  }
  return out;
}

function oneEuro(points: StrokeSample[]): StrokeSample[] {
  if (points.length < 2) return points.map(point => ({ ...point }));
  const alphaFor = (cutoff: number, dt: number) => 1 / (1 + (1 / (2 * Math.PI * cutoff)) / dt);
  let x = points[0].x;
  let y = points[0].y;
  let dx = 0;
  let dy = 0;
  let previous = points[0].t;
  const out: StrokeSample[] = [{ ...points[0] }];
  for (let index = 1; index < points.length; index++) {
    const dt = Math.max(0.001, (points[index].t - previous) / 1000);
    previous = points[index].t;
    const velocity = alphaFor(1, dt);
    dx += ((points[index].x - x) / dt - dx) * velocity;
    dy += ((points[index].y - y) / dt - dy) * velocity;
    const cutoff = 1 + 0.8 * Math.hypot(dx, dy);
    const amount = alphaFor(cutoff, dt);
    x += (points[index].x - x) * amount;
    y += (points[index].y - y) * amount;
    out.push({ x, y, t: points[index].t });
  }
  return out;
}

function splitCorners(points: StrokeSample[]): StrokeSample[][] {
  if (points.length < 3) return [points.map(point => ({ ...point }))];
  const parts: StrokeSample[][] = [[{ ...points[0] }, { ...points[1] }]];
  let heading = Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x);
  for (let index = 2; index < points.length; index++) {
    const angle = Math.atan2(points[index].y - points[index - 1].y, points[index].x - points[index - 1].x);
    let turn = Math.abs(angle - heading);
    if (turn > Math.PI) turn = Math.PI * 2 - turn;
    const step = Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
    if (turn > (70 * Math.PI) / 180 && step > 0.75) parts.push([{ ...points[index - 1] }]);
    parts[parts.length - 1].push({ ...points[index] });
    heading = angle;
  }
  return parts;
}

function stabilize(points: StrokeSample[], lag: number): StrokeSample[] {
  if (lag <= 0 || points.length < 2) return points;
  const gain = Math.max(0.04, 1 - lag / 100);
  let x = points[0].x;
  let y = points[0].y;
  return points.map(point => {
    x += (point.x - x) * gain;
    y += (point.y - y) * gain;
    return { x, y, t: point.t };
  });
}

function blendToward(raw: StrokeSample[], spacing: number, amount: number): StrokeSample[] {
  const curved = sampleCurve(raw, spacing);
  if (amount >= 100 || raw.length < 3) return curved;
  const straight = resample(raw, spacing);
  const mixAmount = amount >= 70 ? 0.85 + ((amount - 70) / 30) * 0.15 : (amount / 70) * 0.85;
  const count = Math.max(curved.length, straight.length, 1);
  const out: StrokeSample[] = [];
  for (let index = 0; index < count; index++) {
    const curveIndex = Math.min(curved.length - 1, Math.round((index * (curved.length - 1)) / Math.max(1, count - 1)));
    const rawIndex = Math.min(straight.length - 1, Math.round((index * (straight.length - 1)) / Math.max(1, count - 1)));
    const curve = curved[curveIndex];
    const line = straight[rawIndex];
    out.push({ x: line.x + (curve.x - line.x) * mixAmount, y: line.y + (curve.y - line.y) * mixAmount, t: curve.t });
  }
  return out;
}

function catchUp(path: StrokeSample[], end: StrokeSample, spacing: number): StrokeSample[] {
  const last = path[path.length - 1];
  if (!last || Math.hypot(end.x - last.x, end.y - last.y) < 0.75) return path;
  return path.concat(resample([last, end], spacing).slice(1));
}

export function planStroke(points: StrokeSample[], options: { smoothing: number; lag: number; catchUp: boolean; spacing: number }): StrokeSample[] {
  if (!points.length) return [];
  const spacing = Math.max(0.75, options.spacing);
  const end = points[points.length - 1];
  if (options.smoothing <= 0 && options.lag <= 0) {
    const straight = resample(points, spacing);
    return options.catchUp ? catchUp(straight, end, spacing) : straight;
  }
  const filtered = options.smoothing > 0 ? oneEuro(points) : points.map(point => ({ ...point }));
  const pieces = options.smoothing > 0 ? splitCorners(filtered) : [filtered];
  let path: StrokeSample[] = [];
  for (const piece of pieces) {
    const lagged = stabilize(piece, options.lag);
    const blended = blendToward(lagged, spacing, options.smoothing);
    if (path.length && blended.length) path.push(...blended.slice(1));
    else path = blended;
  }
  if (!path.length) path = [{ ...points[0] }];
  return options.catchUp ? catchUp(path, end, spacing) : path;
}

function smoothstep(amount: number): number {
  const t = Math.max(0, Math.min(1, amount));
  return t * t * (3 - 2 * t);
}

function parseColor(color: string): { r: number; g: number; b: number; a: number } {
  const hex = color.replace('#', '');
  const value = hex.length <= 4
    ? hex.split('').map(channel => channel + channel).join('')
    : hex.padEnd(8, hex.length === 6 ? 'f' : '0');
  return {
    r: Number.parseInt(value.slice(0, 2), 16) || 0,
    g: Number.parseInt(value.slice(2, 4), 16) || 0,
    b: Number.parseInt(value.slice(4, 6), 16) || 0,
    a: value.length >= 8 ? Number.parseInt(value.slice(6, 8), 16) : 255,
  };
}

interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function hexColor(color: Rgb): string {
  const channel = (value: number) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}${channel(color.a)}`;
}

function sway(amount: number): number {
  return (Math.random() * 2 - 1) * ((amount || 0) / 100);
}

function colorVaries(brush: BrushPreset): boolean {
  return brush.hueJitter > 0 || brush.satJitter > 0 || brush.lightJitter > 0 || brush.darkJitter > 0
    || brush.strokeHue > 0 || brush.strokeSat > 0 || brush.strokeLight > 0 || brush.strokeDark > 0
    || brush.secondaryMix > 0;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const light = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: light };
  const delta = max - min;
  const sat = light > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;
  if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  return { h: hue / 6, s: sat, l: light };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hue = ((h % 1) + 1) % 1;
  if (s <= 0) {
    const gray = Math.round(l * 255);
    return { r: gray, g: gray, b: gray };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return { r: Math.round(channel(hue + 1 / 3) * 255), g: Math.round(channel(hue) * 255), b: Math.round(channel(hue - 1 / 3) * 255) };
}

function varyColor(ink: Rgb, brush: BrushPreset, stroke: { h: number; s: number; l: number }, secondary: Rgb): Rgb {
  const hsl = rgbToHsl(ink.r, ink.g, ink.b);
  hsl.h += stroke.h + sway(brush.hueJitter);
  hsl.s = clamp01(hsl.s + stroke.s + sway(brush.satJitter));
  hsl.l = clamp01(hsl.l + stroke.l + sway(brush.lightJitter) - Math.random() * ((brush.darkJitter || 0) / 100));
  const next = hslToRgb(hsl.h, hsl.s, hsl.l);
  const mix = Math.random() * ((brush.secondaryMix || 0) / 100);
  return {
    r: Math.round(next.r * (1 - mix) + secondary.r * mix),
    g: Math.round(next.g * (1 - mix) + secondary.g * mix),
    b: Math.round(next.b * (1 - mix) + secondary.b * mix),
    a: ink.a,
  };
}

function mixRgb(from: Rgb, to: Rgb, amount: number): Rgb {
  return {
    r: Math.round(from.r * (1 - amount) + to.r * amount),
    g: Math.round(from.g * (1 - amount) + to.g * amount),
    b: Math.round(from.b * (1 - amount) + to.b * amount),
    a: Math.round(from.a * (1 - amount) + to.a * amount),
  };
}

function strokeComposite(blend: BrushBlend, erase: boolean): GlobalCompositeOperation {
  if (erase) return 'destination-out';
  if (blend === 'multiply') return 'multiply';
  if (blend === 'screen') return 'screen';
  if (blend === 'add') return 'lighter';
  if (blend === 'overlay') return 'overlay';
  if (blend === 'lighten') return 'lighten';
  if (blend === 'darken') return 'darken';
  if (blend === 'behind') return 'destination-over';
  return 'source-over';
}

function loadImage(url: string): HTMLImageElement | null {
  const cached = imageCache.get(url);
  if (cached === 'missing') return null;
  if (cached) return cached.complete && cached.naturalWidth ? cached : null;
  const image = new Image();
  image.onload = () => onImageReady?.();
  image.onerror = () => imageCache.set(url, 'missing');
  image.src = url;
  imageCache.set(url, image);
  return image.complete && image.naturalWidth ? image : null;
}

export function warmImage(url: string): Promise<void> {
  const cached = imageCache.get(url);
  if (cached === 'missing') return Promise.resolve();
  const image = cached ?? new Image();
  if (!cached) {
    imageCache.set(url, image);
    image.src = url;
  }
  if (image.complete && image.naturalWidth) return Promise.resolve();
  if (image.complete) {
    imageCache.set(url, 'missing');
    return Promise.resolve();
  }
  return new Promise(resolve => {
    image.addEventListener('load', () => { onImageReady?.(); resolve(); }, { once: true });
    image.addEventListener('error', () => { imageCache.set(url, 'missing'); resolve(); }, { once: true });
  });
}

function mirrorOf(editor: Editor, point: Point): Point[] {
  const doc = editor.doc;
  const points = [point];
  if (!doc || editor.symmetry === 'off') return points;
  const flip = (flipX: boolean, flipY: boolean): Point => ({
    x: flipX ? doc.width - 1 - point.x : point.x,
    y: flipY ? doc.height - 1 - point.y : point.y,
  });
  if (editor.symmetry === 'vertical' || editor.symmetry === 'orthogonal') points.push(flip(true, false));
  if (editor.symmetry === 'horizontal' || editor.symmetry === 'orthogonal') points.push(flip(false, true));
  if (editor.symmetry === 'orthogonal') points.push(flip(true, true));
  return points;
}

let dabCanvas: HTMLCanvasElement | null = null;
let bufferCanvas: HTMLCanvasElement | null = null;
let sampleCanvas: HTMLCanvasElement | null = null;

function canvasOf(current: HTMLCanvasElement | null, width: number, height: number): HTMLCanvasElement {
  const canvas = current ?? document.createElement('canvas');
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return canvas;
}

function drawTip(ctx: CanvasRenderingContext2D, brush: BrushPreset, radius: number): void {
  const image = brush.tip === 'image' && brush.tipImage ? loadImage(brush.tipImage) : null;
  const cached = brush.tipImage ? imageCache.get(brush.tipImage) : undefined;
  if (brush.tip === 'image' && (!brush.tipImage || cached === 'missing')) brush.tipMissing = true;
  ctx.lineWidth = Math.max(1, radius / 2);
  if (image) {
    ctx.drawImage(image, -radius, -radius, radius * 2, radius * 2);
    return;
  }
  if (brush.tip === 'squares') ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
  else if (brush.tip === 'circle') {
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
  } else if (brush.tip === 'splatter') {
    for (let index = 0; index < 8; index++) {
      ctx.beginPath();
      ctx.arc((Math.random() - 0.5) * radius * 2, (Math.random() - 0.5) * radius * 2, Math.random() * radius * 0.45 + 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (brush.tip === 'slash') {
    ctx.beginPath();
    ctx.moveTo(-radius, radius);
    ctx.lineTo(radius, -radius);
    ctx.stroke();
  } else if (brush.tip === 'grid') {
    ctx.strokeRect(-radius, -radius, radius * 2, radius * 2);
    ctx.beginPath();
    ctx.moveTo(-radius, 0);
    ctx.lineTo(radius, 0);
    ctx.moveTo(0, -radius);
    ctx.lineTo(0, radius);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function grainComposite(blend: GrainBlend | undefined): GlobalCompositeOperation {
  if (blend === 'add') return 'lighter';
  if (blend === 'soft-light') return 'soft-light';
  if (blend === 'color-dodge') return 'color-dodge';
  if (blend === 'color-burn') return 'color-burn';
  if (blend === 'screen' || blend === 'overlay' || blend === 'lighten' || blend === 'darken') return blend;
  return 'multiply';
}

function dabFlow(brush: BrushPreset, flow: number): number {
  const glaze = brush.glaze ?? 0;
  if (glaze <= 0 || (!brush.buildup && !brush.heavy)) return flow;
  const gap = Math.max(0.008, (brush.spacing || 1) / 100);
  const overlaps = Math.max(1, Math.min(40, (brush.heavy ? 0.85 : 0.48) / gap));
  const goal = brush.heavy ? 0.93 : 0.68;
  const alpha = 1 - Math.pow(1 - goal, 1 / overlaps);
  return Math.max(0.04, Math.min(flow, alpha));
}

function paintGrain(dab: CanvasRenderingContext2D, grain: HTMLImageElement, brush: BrushPreset, size: number, x: number, y: number, roll: number): void {
  const scale = Math.max(0.25, (brush.grainScale ?? 100) / 100);
  dab.imageSmoothingEnabled = brush.filtered !== false;
  if (brush.grainLock === 'canvas') {
    const tile = Math.max(32, size * scale);
    const left = x - size / 2;
    const top = y - size / 2;
    const x0 = Math.floor(left / tile) * tile;
    const y0 = Math.floor(top / tile) * tile;
    for (let gy = y0; gy < top + size; gy += tile) {
      for (let gx = x0; gx < left + size; gx += tile) dab.drawImage(grain, gx - left, gy - top, tile, tile);
    }
    return;
  }
  const tile = size * scale;
  const shift = ((roll % tile) + tile) % tile;
  dab.drawImage(grain, (size - tile) / 2 + shift - tile / 2, (size - tile) / 2, tile, tile);
}

function stampDab(ctx: CanvasRenderingContext2D, brush: BrushPreset, x: number, y: number, radius: number, rotation: number, color: string, flow: number, erase: boolean, flipX = false, flipY = false, grainRoll = 0): void {
  const size = Math.max(2, Math.ceil(radius * 2));
  dabCanvas = canvasOf(dabCanvas, size, size);
  const dab = dabCanvas.getContext('2d');
  if (!dab) return;
  dab.clearRect(0, 0, size, size);
  dab.globalCompositeOperation = 'source-over';
  dab.globalAlpha = 1;
  dab.save();
  dab.translate(size / 2, size / 2);
  if (flipX) dab.scale(-1, 1);
  if (flipY) dab.scale(1, -1);
  dab.rotate(rotation);
  dab.imageSmoothingEnabled = brush.filtered !== false;
  const ink = parseColor(color);
  if (erase || ink.a <= 0) {
    dab.globalCompositeOperation = 'source-over';
    dab.fillStyle = '#000';
    dab.strokeStyle = '#000';
  } else {
    dab.fillStyle = `rgb(${ink.r} ${ink.g} ${ink.b})`;
    dab.strokeStyle = dab.fillStyle;
    dab.globalAlpha = ink.a / 255;
  }
  drawTip(dab, brush, radius);
  dab.restore();
  if (brush.tip === 'image' && brush.tipImage) {
    const cached = imageCache.get(brush.tipImage);
    if (cached instanceof HTMLImageElement && cached.naturalWidth) {
      dab.globalCompositeOperation = 'source-in';
      dab.globalAlpha = 1;
      dab.fillStyle = erase || ink.a <= 0 ? '#000' : `rgb(${ink.r} ${ink.g} ${ink.b})`;
      dab.fillRect(0, 0, size, size);
    }
  }
  if (brush.hardness < 100) {
    const solid = (brush.hardness / 100) * radius;
    const fade = dab.createRadialGradient(size / 2, size / 2, solid, size / 2, size / 2, radius);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    dab.globalCompositeOperation = 'destination-in';
    dab.fillStyle = fade;
    dab.fillRect(0, 0, size, size);
  }
  const grain = brush.grain ? loadImage(brush.grain) : null;
  if (grain && (brush.grainDepth ?? 100) > 0) {
    const cover = dab.getImageData(0, 0, size, size);
    dab.globalCompositeOperation = grainComposite(brush.grainBlend);
    dab.globalAlpha = Math.max(0, Math.min(1, (brush.grainDepth ?? 100) / 100));
    paintGrain(dab, grain, brush, size, x, y, grainRoll);
    const mixed = dab.getImageData(0, 0, size, size);
    for (let index = 0; index < mixed.data.length; index += 4) mixed.data[index + 3] = cover.data[index + 3];
    dab.putImageData(mixed, 0, 0);
  }
  ctx.save();
  ctx.globalAlpha = Math.max(0.01, Math.min(1, flow));
  ctx.drawImage(dabCanvas, x - size / 2, y - size / 2);
  ctx.restore();
}

function averageUnder(source: CanvasRenderingContext2D, x: number, y: number, radius: number): { r: number; g: number; b: number; a: number } | null {
  const reach = Math.max(1, Math.min(3, Math.ceil(radius)));
  const left = Math.max(0, Math.floor(x - reach));
  const top = Math.max(0, Math.floor(y - reach));
  const width = reach * 2;
  const height = reach * 2;
  let data: Uint8ClampedArray;
  try { data = source.getImageData(left, top, width, height).data; } catch { return null; }
  let best: { r: number; g: number; b: number; a: number } | null = null;
  let bestScore = -1;
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    if (!alpha) continue;
    const ink = Math.hypot(data[index] - 255, data[index + 1] - 255, data[index + 2] - 255) * alpha;
    if (ink <= bestScore) continue;
    bestScore = ink;
    best = { r: data[index], g: data[index + 1], b: data[index + 2], a: alpha };
  }
  return best;
}

export function paintPresetStroke(editor: Editor, before: ImageData, samples: StrokeSample[], brush: BrushPreset, tool: ToolId, button: number): void {
  const doc = editor.doc;
  const layer = editor.layer;
  if (!doc || !layer || !samples.length) return;
  const erase = tool === 'eraser' && button !== 2;
  const baseColor = button === 2 ? editor.secondary : editor.primary;
  const size = Math.max(1, editor.size);
  const length = samples.reduce((total, point, index) => index === 0 ? 0 : total + Math.hypot(point.x - samples[index - 1].x, point.y - samples[index - 1].y), 0);
  const ignoreTaper = length < 4;
  bufferCanvas = canvasOf(bufferCanvas, doc.width, doc.height);
  const buffer = bufferCanvas.getContext('2d');
  if (!buffer) return;
  buffer.clearRect(0, 0, doc.width, doc.height);
  sampleCanvas = canvasOf(sampleCanvas, doc.width, doc.height);
  const sampler = sampleCanvas.getContext('2d', { willReadFrequently: true });
  const readsCanvas = (brush.wetMix > 0 || brush.carry > 0) && !erase;
  if (sampler && readsCanvas) sampler.putImageData(before, 0, 0);
  let traveled = 0;
  let width = size;
  let clock = samples[0].t;
  let carried = parseColor(baseColor);
  const secondary = parseColor(editor.secondary);
  const strokeShift = {
    h: sway(brush.strokeHue),
    s: sway(brush.strokeSat),
    l: sway(brush.strokeLight) - Math.random() * ((brush.strokeDark || 0) / 100),
  };
  const vary = !erase && colorVaries(brush);
  const places = ignoreTaper ? [samples[0]] : samples;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let grainRoll = brush.grainJitter ? Math.random() * 512 : 0;
  const lightBlend = !erase && (brush.blend === 'add' || brush.blend === 'screen');
  for (let index = 0; index < places.length; index++) {
    const point = places[index];
    const previous = places[Math.max(0, index - 1)];
    const step = Math.hypot(point.x - previous.x, point.y - previous.y);
    traveled += step;
    grainRoll += step * ((brush.grainMove ?? 100) / 100);
    const dt = Math.max(8, Math.min(80, point.t - clock || 16));
    if (index > 0) clock = point.t;
    const velocity = step / dt;
    if (tool === 'pen' && brush.speed === 'off' && !brush.speedSize) {
      const thin = Math.max(0.75, size * 0.12);
      const target = size + (thin - size) * Math.max(0, Math.min(1, velocity / 0.45));
      width = width + (target - width) * 0.72;
    } else if (brush.speedSize) {
      const fast = Math.max(0, Math.min(1, velocity / 0.9));
      const amount = brush.speedSize / 100;
      const target = size * (amount >= 0 ? 1 - amount * fast : 1 - Math.abs(amount) * (1 - fast));
      width = width + (Math.max(0.5, target) - width) * 0.35;
    } else if (brush.speed !== 'off') {
      const floor = brush.speed === 'heavy' ? 0.12 : 0.35;
      const gate = brush.speed === 'heavy' ? 0.45 : 0.8;
      const target = size * (1 - (1 - floor) * smoothstep(velocity / gate));
      width = width + (target - width) * 0.35;
    } else width = size;
    let scale = 1;
    let fade = 1;
    if (!ignoreTaper) {
      const head = length * brush.taperIn / 100;
      const tail = length * brush.taperOut / 100;
      if (head > 0 && traveled < head) scale = smoothstep(traveled / head);
      if (tail > 0 && traveled > length - tail) scale = Math.min(scale, smoothstep((length - traveled) / tail));
      if (!brush.taperSize) scale = 1;
      fade = brush.taperOpacity ? scale || smoothstep(traveled / Math.max(head, 0.001)) : 1;
      if (brush.taperOpacity && !brush.taperSize) {
        fade = 1;
        if (head > 0 && traveled < head) fade = smoothstep(traveled / head);
        if (tail > 0 && traveled > length - tail) fade = Math.min(fade, smoothstep((length - traveled) / tail));
      }
    }
    const angle = Math.atan2(point.y - previous.y, point.x - previous.x);
    const baseRotation = brush.rotation === 'follow' ? angle : brush.rotation === 'jitter' ? 0 : (brush.angle * Math.PI) / 180;
    const side = brush.scatter > 0 ? (Math.random() * 2 - 1) * size * (brush.scatter / 100) : 0;
    const ox = point.x + Math.cos(angle + Math.PI / 2) * side;
    const oy = point.y + Math.sin(angle + Math.PI / 2) * side;
    let flow = (brush.flow / 100) * fade;
    if (brush.speedOpacity) {
      const fast = Math.max(0, Math.min(1, velocity / 0.9));
      const amount = brush.speedOpacity / 100;
      flow *= amount >= 0 ? 1 - amount * fast : 1 - Math.abs(amount) * (1 - fast);
    }
    if (brush.opacityJitter > 0) flow *= 1 - Math.random() * (brush.opacityJitter / 100);
    flow = Math.max((brush.minOpacity || 0) / 100, Math.min((brush.maxOpacity ?? 100) / 100, flow));
    flow = dabFlow(brush, flow);
    const count = Math.max(1, Math.min(16, brush.stamps || 1));
    for (let stamp = 0; stamp < count; stamp++) {
      const along = stamp === 0 ? 0 : (Math.random() * 2 - 1) * size * (0.35 + (brush.scatter || 0) / 200);
      const across = stamp === 0 ? 0 : (Math.random() * 2 - 1) * size * 0.35;
      const jx = ox + Math.cos(angle) * along + Math.cos(angle + Math.PI / 2) * across;
      const jy = oy + Math.sin(angle) * along + Math.sin(angle + Math.PI / 2) * across;
      const swing = brush.sizeJitter > 0 ? Math.max(0.15, 1 + (Math.random() * 2 - 1) * (brush.sizeJitter / 100)) : 1;
      const radius = Math.max(0.5, (width * (brush.taperSize ? scale : 1) * swing) / 2);
      let ink = parseColor(baseColor);
      if (vary) ink = varyColor(ink, brush, strokeShift, secondary);
      if (brush.wetMix > 0 && !erase && sampler) {
        const picked = averageUnder(sampler, jx, jy, radius);
        if (picked) ink = mixRgb(ink, picked, brush.wetMix / 100);
      }
      if (brush.carry > 0 && !erase && sampler) {
        const picked = averageUnder(sampler, jx, jy, radius);
        if (picked) {
          const amount = brush.carry / 100;
          carried = mixRgb(carried, picked, amount * 0.45);
          ink = mixRgb(ink, carried, amount);
        }
      }
      const color = hexColor(ink);
      const dabErase = erase || ink.a <= 0;
      let rotation = brush.rotation === 'jitter' ? Math.random() * Math.PI * 2 : baseRotation;
      if ((brush.twist ?? 0) > 0) rotation += (Math.random() * 2 - 1) * Math.PI * ((brush.twist ?? 0) / 100);
      const flipH = !!brush.flipX && Math.random() < 0.5;
      const flipV = !!brush.flipY && Math.random() < 0.5;
      buffer.save();
      buffer.globalCompositeOperation = lightBlend ? strokeComposite(brush.blend, false) : 'source-over';
      for (const spot of mirrorOf(editor, { x: jx, y: jy })) {
        minX = Math.min(minX, spot.x - radius);
        minY = Math.min(minY, spot.y - radius);
        maxX = Math.max(maxX, spot.x + radius);
        maxY = Math.max(maxY, spot.y + radius);
        stampDab(buffer, brush, spot.x, spot.y, radius, rotation, color, flow, dabErase, flipH, flipV, grainRoll);
      }
      buffer.restore();
    }
    if (sampler && readsCanvas) sampler.drawImage(bufferCanvas, 0, 0);
  }
  layer.ctx.putImageData(before, 0, 0);
  const pad = size * 2 + 8 + size * ((brush.scatter || 0) / 100) + (brush.wetEdge ?? 0);
  if (Number.isFinite(minX)) editor.cover(minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY), layer, pad);
  layer.ctx.save();
  layer.ctx.globalAlpha = Math.max(0, Math.min(1, editor.opacity / 100));
  layer.ctx.globalCompositeOperation = lightBlend ? 'source-over' : strokeComposite(brush.blend, erase || parseColor(baseColor).a <= 0);
  if ((brush.wetEdge ?? 0) > 0) layer.ctx.filter = `blur(${Math.max(0.4, (brush.wetEdge ?? 0) / 40)}px)`;
  layer.ctx.drawImage(bufferCanvas, 0, 0);
  layer.ctx.filter = 'none';
  layer.ctx.restore();
  editor.applyClip(before);
  editor.guardAlpha(before);
}

function pathLength(points: StrokeSample[]): number {
  return points.reduce((total, point, index) => index === 0 ? 0 : total + Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y), 0);
}

function deviation(points: StrokeSample[]): number {
  if (points.length < 3) return 0;
  const start = points[0];
  const end = points[points.length - 1];
  const span = Math.hypot(end.x - start.x, end.y - start.y) || 1;
  let worst = 0;
  for (const point of points) {
    const area = Math.abs((end.x - start.x) * (start.y - point.y) - (start.x - point.x) * (end.y - start.y));
    worst = Math.max(worst, area / span);
  }
  return worst;
}

function fitShape(points: StrokeSample[]): StrokeSample[] | null {
  if (points.length < 4 || pathLength(points) < 8) return null;
  const start = points[0];
  const end = points[points.length - 1];
  if (Math.hypot(end.x - start.x, end.y - start.y) < 8) {
    let cx = 0;
    let cy = 0;
    for (const point of points) { cx += point.x; cy += point.y; }
    cx /= points.length;
    cy /= points.length;
    let rx = 0;
    let ry = 0;
    for (const point of points) {
      rx = Math.max(rx, Math.abs(point.x - cx));
      ry = Math.max(ry, Math.abs(point.y - cy));
    }
    const fitted: StrokeSample[] = [];
    for (let step = 0; step <= 24; step++) {
      const angle = (step / 24) * Math.PI * 2;
      fitted.push({ x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry, t: start.t });
    }
    return fitted;
  }
  if (deviation(points) < 2.5) return [start, end];
  const corners: StrokeSample[] = [start];
  for (let index = 1; index < points.length - 1; index++) {
    const before = points[index - 1];
    const current = points[index];
    const after = points[index + 1];
    const a = Math.atan2(current.y - before.y, current.x - before.x);
    const b = Math.atan2(after.y - current.y, after.x - current.x);
    let turn = Math.abs(b - a);
    if (turn > Math.PI) turn = Math.PI * 2 - turn;
    if (turn > 0.8) corners.push(current);
  }
  corners.push(end);
  if (corners.length >= 3 && corners.length <= 6) return corners;
  return null;
}

function redrawSettled(editor: Editor, stroke: RememberedStroke, from: StrokeSample[], to: StrokeSample[], amount: number): void {
  const mixed = from.map((point, index) => {
    const target = to[Math.min(to.length - 1, Math.round((index * (to.length - 1)) / Math.max(1, from.length - 1)))];
    return { x: point.x + (target.x - point.x) * amount, y: point.y + (target.y - point.y) * amount, t: point.t };
  });
  const spacing = Math.max(1, (stroke.size * stroke.preset.spacing) / 100);
  paintPresetStroke(editor, stroke.before, resample(mixed, spacing), stroke.preset, stroke.tool, stroke.button);
  editor.renderScene();
}

export function rememberStroke(editor: Editor, before: ImageData, points: StrokeSample[], tool: ToolId, button: number): void {
  window.clearTimeout(settleTimer);
  window.cancelAnimationFrame(settleFrame);
  const brush = clonePreset(activePreset(tool));
  lastStroke = { before, points: points.map(point => ({ ...point })), tool, button, preset: brush, size: editor.size, opacity: editor.opacity };
  handles = null;
  editor.strokeHandles = null;
  serial += 1;
  if (!brush.settle) return;
  const snapshot = lastStroke;
  settleTimer = window.setTimeout(() => {
    const fitted = fitShape(snapshot.points);
    if (!fitted || !editor.layer) return;
    const started = performance.now();
    const tick = (now: number) => {
      if (lastStroke !== snapshot) return;
      const amount = Math.min(1, (now - started) / 220);
      redrawSettled(editor, snapshot, snapshot.points, fitted, amount);
      if (amount < 1) settleFrame = window.requestAnimationFrame(tick);
      else editor.rewriteCheckpoint();
    };
    settleFrame = window.requestAnimationFrame(tick);
  }, 340);
}

export function cancelSettle(): void {
  window.clearTimeout(settleTimer);
  window.cancelAnimationFrame(settleFrame);
}

export function closeBrushPanel(): void {
  const panel = document.getElementById('brush-panel');
  const button = document.getElementById('brush-library');
  if (panel) panel.hidden = true;
  button?.setAttribute('aria-pressed', 'false');
  document.getElementById('brush-category-menu')?.remove();
}

let strokeActive = false;

export function beginStrokeUI(editor: Editor): void {
  cancelSettle();
  closeBrushPanel();
  clearAdjust(editor);
  strokeActive = true;
  serial += 1;
}

export function endStrokeUI(): void {
  strokeActive = false;
}

export function hasLastStroke(): boolean {
  return !!lastStroke && !strokeActive;
}

export function startAdjust(editor: Editor): void {
  if (!lastStroke) {
    editor.toast('Draw a stroke first.');
    return;
  }
  cancelSettle();
  const count = Math.min(5, lastStroke.points.length);
  handles = [];
  for (let index = 0; index < count; index++) {
    const source = lastStroke.points[Math.round((index * (lastStroke.points.length - 1)) / Math.max(1, count - 1))];
    handles.push({ ...source });
  }
  editor.strokeHandles = handles.map(point => ({ x: point.x, y: point.y }));
  editor.paintOverlay();
}

export function adjustPointer(editor: Editor, point: Point | null, phase: 'down' | 'move' | 'up'): boolean {
  if (!handles || !lastStroke || !point) return false;
  if (phase === 'down') {
    dragHandle = handles.findIndex(handle => Math.hypot(handle.x - point.x, handle.y - point.y) < 6);
    return dragHandle >= 0;
  }
  if (dragHandle < 0) return false;
  if (phase === 'up') {
    dragHandle = -1;
    editor.rewriteCheckpoint();
    return true;
  }
  handles[dragHandle] = { ...handles[dragHandle], x: point.x, y: point.y };
  editor.strokeHandles = handles.map(handle => ({ x: handle.x, y: handle.y }));
  const spacing = Math.max(1, (lastStroke.size * lastStroke.preset.spacing) / 100);
  paintPresetStroke(editor, lastStroke.before, planStroke(handles, { smoothing: 100, lag: 0, catchUp: true, spacing }), lastStroke.preset, lastStroke.tool, lastStroke.button);
  editor.paintOverlay();
  editor.renderScene();
  return true;
}

export function clearAdjust(editor: Editor): void {
  handles = null;
  dragHandle = -1;
  editor.strokeHandles = null;
}

function currentPreset(): BrushPreset {
  return presets.find(item => item.id === selected[tab]) ?? presets.filter(item => item.tab === tab)[0];
}

function updatePreset(patch: Partial<BrushPreset>, rebuild = false): void {
  const current = currentPreset();
  if (patch.name !== undefined) {
    const name = patch.name.replace(/\s+/g, ' ').trim();
    if (!name) return;
    patch = { ...patch, name };
  }
  Object.assign(current, patch);
  mark();
  if (rebuild) renderPanel();
}

async function scaleFile(file: File): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 128 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

function strokeCurve(width: number, height: number, inset: number, bow: number): StrokeSample[] {
  const points: StrokeSample[] = [];
  for (let step = 0; step <= 20; step++) {
    const amount = step / 20;
    points.push({
      x: width * inset + amount * width * (1 - inset * 2),
      y: height * 0.54 - Math.sin(amount * Math.PI) * height * bow,
      t: step * 14,
    });
  }
  return points;
}

function previewRandom(id: string): () => number {
  let seed = 2166136261;
  for (let index = 0; index < id.length; index++) {
    seed ^= id.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function previewSamples(brush: BrushPreset, curve: StrokeSample[], size: number): StrokeSample[] {
  const stamps = Math.max(1, Math.min(16, brush.stamps || 1));
  const spacing = Math.max(1, brush.spacing || 1);
  const gap = Math.max(size * 0.08, (size * spacing) / 100);
  const samples = resample(curve, gap);
  const limit = Math.max(14, Math.floor(80 / stamps));
  if (samples.length <= limit) return samples;
  return resample(curve, gap * (samples.length / limit));
}

function paintPreviewStroke(ctx: CanvasRenderingContext2D, brush: BrushPreset, samples: StrokeSample[], size: number, pinch: boolean): void {
  const rand = previewRandom(brush.id);
  const length = pathLength(samples);
  let traveled = 0;
  let grainRoll = brush.grainJitter ? rand() * 512 : 0;
  for (let index = 0; index < samples.length; index++) {
    const point = samples[index];
    const previous = samples[Math.max(0, index - 1)];
    const step = Math.hypot(point.x - previous.x, point.y - previous.y);
    traveled += step;
    grainRoll += step * ((brush.grainMove ?? 100) / 100);
    const along = length > 0 ? traveled / length : 0.5;
    const body = pinch ? Math.sin(Math.max(0, Math.min(1, along)) * Math.PI) : 1;
    let scale = body;
    const head = length * brush.taperIn / 100;
    const tail = length * brush.taperOut / 100;
    if (brush.taperSize && head > 0 && traveled < head) scale *= smoothstep(traveled / head);
    if (brush.taperSize && tail > 0 && traveled > length - tail) scale *= smoothstep((length - traveled) / tail);
    if (scale < 0.045) continue;
    const angle = Math.atan2(point.y - previous.y, point.x - previous.x);
    const baseRotation = brush.rotation === 'follow' ? angle : brush.rotation === 'jitter' ? rand() * Math.PI * 2 : (brush.angle * Math.PI) / 180;
    const reach = Math.min(size * ((brush.scatter || 0) / 100), size * 0.55) * Math.max(0.2, body);
    const side = brush.scatter > 0 ? (rand() * 2 - 1) * reach : 0;
    const ox = point.x + Math.cos(angle + Math.PI / 2) * side;
    const oy = point.y + Math.sin(angle + Math.PI / 2) * side;
    let flow = brush.flow / 100;
    if (brush.opacityJitter > 0) flow *= 1 - rand() * (brush.opacityJitter / 100);
    flow = Math.max((brush.minOpacity || 0) / 100, Math.min((brush.maxOpacity ?? 100) / 100, flow));
    flow = Math.max(0.22, dabFlow(brush, flow));
    const count = Math.max(1, Math.min(16, brush.stamps || 1));
    for (let stamp = 0; stamp < count; stamp++) {
      const spread = Math.max(0.2, body);
      const alongJ = stamp === 0 ? 0 : (rand() * 2 - 1) * size * (0.28 + (brush.scatter || 0) / 260) * spread;
      const across = stamp === 0 ? 0 : (rand() * 2 - 1) * size * 0.22 * spread;
      const jx = ox + Math.cos(angle) * alongJ + Math.cos(angle + Math.PI / 2) * across;
      const jy = oy + Math.sin(angle) * alongJ + Math.sin(angle + Math.PI / 2) * across;
      const swing = brush.sizeJitter > 0 ? Math.max(0.15, 1 + (rand() * 2 - 1) * (brush.sizeJitter / 100)) : 1;
      const radius = Math.max(0.6, (size * scale * swing) / 2);
      let rotation = brush.rotation === 'jitter' ? rand() * Math.PI * 2 : baseRotation;
      if ((brush.twist ?? 0) > 0) rotation += (rand() * 2 - 1) * Math.PI * ((brush.twist ?? 0) / 100);
      const flipH = !!brush.flipX && rand() < 0.5;
      const flipV = !!brush.flipY && rand() < 0.5;
      stampDab(ctx, brush, jx, jy, radius, rotation, '#ffffff', flow, false, flipH, flipV, grainRoll);
    }
  }
  const wet = brush.wetEdge ?? 0;
  if (wet <= 0) return;
  const copy = document.createElement('canvas');
  copy.width = ctx.canvas.width;
  copy.height = ctx.canvas.height;
  copy.getContext('2d')?.drawImage(ctx.canvas, 0, 0);
  ctx.filter = `blur(${Math.max(0.4, wet / 40)}px)`;
  ctx.drawImage(copy, 0, 0);
  ctx.filter = 'none';
}

export function refreshBrushPreview(editor: Editor): void {
  const canvas = document.getElementById('brush-preview') as HTMLCanvasElement | null;
  const panel = document.getElementById('brush-panel');
  if (!canvas || !panel || panel.hidden) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const brush = currentPreset();
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const size = canvas.height * 0.62;
  paintPreviewStroke(ctx, brush, previewSamples(brush, strokeCurve(canvas.width, canvas.height, 0.04, 0.2), size), size, false);
  noteSwatches(editor);
}

const SWATCH_W = 312;
const SWATCH_H = 112;
let swatchEditor: Editor | null = null;
let swatchKey = '';
let swatchObserver: IntersectionObserver | null = null;
let swatchPump = 0;
const swatchCache = new Map<string, HTMLCanvasElement>();
const tipCache = new Map<string, HTMLCanvasElement>();
const swatchQueue: HTMLCanvasElement[] = [];
const swatchQueued = new Set<HTMLCanvasElement>();

function swatchSignature(): string {
  return String(serial);
}

function paintSwatchPlate(brush: BrushPreset): HTMLCanvasElement {
  const plate = document.createElement('canvas');
  plate.width = SWATCH_W;
  plate.height = SWATCH_H;
  const ctx = plate.getContext('2d');
  if (!ctx) return plate;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, plate.width, plate.height);
  const size = SWATCH_H * 0.72;
  paintPreviewStroke(ctx, brush, previewSamples(brush, strokeCurve(SWATCH_W, SWATCH_H, 0.08, 0.12), size), size, true);
  return plate;
}

function paintTipPlate(brush: BrushPreset): HTMLCanvasElement {
  const plate = document.createElement('canvas');
  plate.width = 48;
  plate.height = 48;
  const ctx = plate.getContext('2d');
  if (!ctx) return plate;
  ctx.clearRect(0, 0, 48, 48);
  ctx.fillStyle = '#141414';
  ctx.beginPath();
  ctx.arc(24, 24, 23, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(24, 24, 19, 0, Math.PI * 2);
  ctx.clip();
  const angle = brush.rotation === 'fixed' ? (brush.angle * Math.PI) / 180 : 0;
  stampDab(ctx, brush, 24, 24, 15, angle, '#ffffff', 1, false);
  ctx.restore();
  return plate;
}

function enqueueSwatch(canvas: HTMLCanvasElement): void {
  if (swatchQueued.has(canvas) || canvas.dataset.ready === swatchKey) return;
  swatchQueued.add(canvas);
  swatchQueue.push(canvas);
  if (!swatchPump) swatchPump = requestAnimationFrame(pumpSwatches);
}

function pumpSwatches(): void {
  swatchPump = 0;
  const editor = swatchEditor;
  let budget = 3;
  while (budget > 0 && swatchQueue.length && editor) {
    const canvas = swatchQueue.shift();
    if (!canvas) break;
    swatchQueued.delete(canvas);
    if (!canvas.isConnected || canvas.dataset.ready === swatchKey) continue;
    const id = canvas.dataset.swatch ?? '';
    const brush = presets.find(item => item.id === id);
    const ctx = canvas.getContext('2d');
    if (!brush || !ctx) continue;
    let plate = swatchCache.get(id);
    if (!plate) {
      plate = paintSwatchPlate(brush);
      swatchCache.set(id, plate);
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(plate, 0, 0);
    canvas.dataset.ready = swatchKey;
    const tip = canvas.closest('.brush-row')?.querySelector<HTMLCanvasElement>('.brush-tip');
    if (tip && tip.dataset.ready !== swatchKey) {
      let badge = tipCache.get(id);
      if (!badge) {
        badge = paintTipPlate(brush);
        tipCache.set(id, badge);
      }
      const tipCtx = tip.getContext('2d');
      tipCtx?.clearRect(0, 0, tip.width, tip.height);
      tipCtx?.drawImage(badge, 0, 0);
      tip.dataset.ready = swatchKey;
    }
    budget -= 1;
  }
  if (swatchQueue.length) swatchPump = requestAnimationFrame(pumpSwatches);
}

function enqueueVisible(panel: HTMLElement): void {
  const root = panel.getBoundingClientRect();
  panel.querySelectorAll<HTMLCanvasElement>('.brush-swatch').forEach(canvas => {
    if (canvas.dataset.ready === swatchKey) return;
    const box = canvas.getBoundingClientRect();
    if (box.width <= 0 || box.bottom < root.top - 120 || box.top > root.bottom + 120) return;
    enqueueSwatch(canvas);
  });
}

function noteSwatches(editor: Editor | null): void {
  if (!editor) return;
  swatchEditor = editor;
  const panel = document.getElementById('brush-panel');
  if (!panel || panel.hidden || editing) return;
  const key = swatchSignature();
  const changed = key !== swatchKey;
  if (changed) {
    swatchKey = key;
    swatchCache.clear();
    tipCache.clear();
    swatchQueue.length = 0;
    swatchQueued.clear();
    panel.querySelectorAll<HTMLCanvasElement>('.brush-swatch, .brush-tip').forEach(canvas => { delete canvas.dataset.ready; });
  }
  const canvases = [...panel.querySelectorAll<HTMLCanvasElement>('.brush-swatch')];
  if (!swatchObserver || canvases.some(canvas => canvas.dataset.watched !== '1')) {
    swatchObserver?.disconnect();
    swatchObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const canvas = entry.target as HTMLCanvasElement;
        if (!entry.isIntersecting) {
          const index = swatchQueue.indexOf(canvas);
          if (index >= 0) swatchQueue.splice(index, 1);
          swatchQueued.delete(canvas);
          continue;
        }
        enqueueSwatch(canvas);
      }
    }, { root: panel, rootMargin: '120px 0px' });
    canvases.forEach(canvas => {
      canvas.dataset.watched = '1';
      swatchObserver?.observe(canvas);
    });
    enqueueVisible(panel);
    return;
  }
  if (changed) enqueueVisible(panel);
}

const PENCIL = '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M11.4 3.1 14.9 6.6 6.7 14.8 3 15.2 3.4 11.5Z"/><path d="M10 4.5 13.5 8"/></svg>';
const TRASH = '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3.5 5h11"/><path d="M7 5V3.4h4V5"/><path d="M5.2 5l.6 9.2h6.4L12.8 5"/></svg>';
const PLUS = '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M9 3.5v11M3.5 9h11"/></svg>';
const UPLOAD = '<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M9 12.5V4.2"/><path d="M5.6 7.4 9 4l3.4 3.4"/><path d="M3.5 14.5h11"/></svg>';
const CHEVRON = '<svg class="brush-chevron" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6.5 4.2 12 9l-5.5 4.8"/></svg>';

function categoryOf(item: BrushPreset): string | null {
  if (!item.category) return null;
  return categories.some(category => category.id === item.category && category.tab === item.tab) ? item.category : null;
}

function applyCategoryDefaults(): void {
  categoryOpen = Object.fromEntries(categories.map(category => [category.id, category.openByDefault]));
}

function brushQuery(): string {
  return document.querySelector<HTMLInputElement>('#brush-search')?.value.trim().toLowerCase() ?? '';
}

function brushMatches(item: BrushPreset, query: string): boolean {
  return !query || item.name.toLowerCase().includes(query);
}

function rememberBrush(id: string): void {
  const item = presets.find(row => row.id === id);
  if (!item) return;
  recent[item.tab] = [id, ...recent[item.tab].filter(row => row !== id)].slice(0, 8);
}

function forgetBrush(id: string): void {
  for (const name of TABS) recent[name] = recent[name].filter(row => row !== id);
}

function focusBrushSearch(): void {
  if (editing) return;
  const field = document.querySelector<HTMLInputElement>('#brush-search');
  if (!field) return;
  field.focus();
  field.select();
}

function fitBrushNames(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('.brush-name').forEach(name => {
    name.style.fontSize = '';
    if (name.clientWidth < 8) return;
    let size = 13;
    name.style.fontSize = `${size}px`;
    while (size > 9 && name.scrollWidth > name.clientWidth + 1) {
      size -= 0.5;
      name.style.fontSize = `${size}px`;
    }
  });
}

function brushRow(item: BrushPreset, currentId: string, shortcut = false): string {
  const missing = item.tip === 'image' && (item.tipMissing || (item.tipImage ? imageCache.get(item.tipImage) === 'missing' : false));
  const remove = factoryBrush(item) ? '' : `<button type="button" class="brush-icon brush-delete" data-preset-delete="${item.id}" aria-label="Delete brush">${TRASH}</button>`;
  const pressed = !shortcut && item.id === currentId;
  const drop = shortcut ? '' : ` data-drop-category="${escapeHtml(categoryOf(item) ?? '')}"`;
  const name = `${escapeHtml(item.name)}${missing ? ' Missing' : ''}`;
  return `<div class="brush-row${shortcut ? ' brush-shortcut' : ''}" data-preset="${item.id}"${drop} aria-pressed="${pressed}"><button type="button" data-preset-use="${item.id}"><canvas class="brush-swatch" width="312" height="112" data-swatch="${escapeHtml(item.id)}" aria-hidden="true"></canvas><span class="brush-name">${name}</span><canvas class="brush-tip" width="48" height="48" data-tip="${escapeHtml(item.id)}" aria-hidden="true"></canvas></button><button type="button" class="brush-icon" data-preset-edit="${item.id}" aria-label="Edit brush">${PENCIL}</button>${remove}</div>`;
}

function renderPanel(): void {
  const list = document.getElementById('brush-list');
  const edit = document.getElementById('brush-edit');
  if (!list || !edit) return;
  document.querySelectorAll<HTMLButtonElement>('[data-brush-tab]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.brushTab === tab));
  });
  list.hidden = editing;
  edit.hidden = !editing;
  const bar = document.querySelector<HTMLElement>('.brush-list-bar');
  if (bar) bar.hidden = editing;
  const rows = presets.filter(item => item.tab === tab);
  const current = currentPreset();
  const query = brushQuery();
  if (!editing) {
    const visible = (item: BrushPreset) => brushMatches(item, query);
    const loose = rows.filter(item => !categoryOf(item) && visible(item)).map(item => brushRow(item, current.id)).join('');
    const blocks = categories.filter(category => category.tab === tab).map(category => {
      const body = rows.filter(item => categoryOf(item) === category.id && visible(item)).map(item => brushRow(item, current.id)).join('');
      if (query && !body) return '';
      const open = query ? true : (categoryOpen[category.id] ?? category.openByDefault);
      return `<section class="brush-category"><button type="button" class="brush-category-head" data-category-id="${category.id}" data-drop-category="${category.id}" aria-expanded="${open}">${CHEVRON}<span>${escapeHtml(category.name)}</span></button><div class="brush-category-body" data-drop-category="${category.id}" ${open ? '' : 'hidden'}>${body}</div></section>`;
    }).join('');
    const pins = query ? '' : rows.filter(item => item.pinned).map(item => brushRow(item, current.id, true)).join('');
    const lately = query ? '' : recent[tab].map(id => rows.find(item => item.id === id)).filter((item): item is BrushPreset => !!item).map(item => brushRow(item, current.id, true)).join('');
    const pinBlock = pins ? `<div class="brush-section">Pinned</div><div class="brush-pinned">${pins}</div>` : '';
    const recentBlock = lately ? `<div class="brush-section">Recent</div><div class="brush-recent">${lately}</div>` : '';
    const empty = query && !loose && !blocks ? '<p class="brush-empty">No matching brushes.</p>' : '';
    list.innerHTML = `${pinBlock}${recentBlock}${empty}<div class="brush-loose" data-drop-category="">${loose}</div>${blocks}`;
    fitBrushNames(list);
    noteSwatches(swatchEditor);
    return;
  }
  const hideWet = tab === 'erase';
  const hideAngle = current.rotation !== 'fixed';
  const hideGrainLock = !current.grain;
  edit.innerHTML = `
    <button type="button" id="brush-edit-back">Back</button>
    <label>Name <input id="brush-name" type="text" value="${escapeHtml(current.name)}" /></label>
    <label>Tip <select id="brush-tip">${['plain', 'circle', 'squares', 'splatter', 'slash', 'grid'].map(tip => `<option value="${tip}" ${current.tip === tip ? 'selected' : ''}>${tip}</option>`).join('')}<option value="image" ${current.tip === 'image' ? 'selected' : ''}>From image</option></select></label>
    <label>Hardness <input id="brush-hardness" type="range" min="0" max="100" value="${current.hardness}" /></label>
    <label>Rotation <select id="brush-rotation"><option value="fixed" ${current.rotation === 'fixed' ? 'selected' : ''}>Fixed</option><option value="follow" ${current.rotation === 'follow' ? 'selected' : ''}>Follow stroke</option><option value="jitter" ${current.rotation === 'jitter' ? 'selected' : ''}>Jitter</option></select></label>
    <label ${hideAngle ? 'hidden' : ''}>Angle <input id="brush-angle" type="number" min="-180" max="180" value="${current.angle}" /></label>
    <label>Spacing <input id="brush-spacing" type="range" min="1" max="200" value="${current.spacing}" /></label>
    <label>Scatter <input id="brush-scatter" type="range" min="0" max="400" value="${current.scatter}" /></label>
    <label>Twist <input id="brush-twist" type="range" min="0" max="200" value="${current.twist}" /></label>
    <label>Stamps <input id="brush-stamps" type="range" min="1" max="16" value="${current.stamps}" /></label>
    <label>Flow <input id="brush-flow" type="range" min="1" max="100" value="${current.flow}" /></label>
    <label>Minimum opacity <input id="brush-min-opacity" type="range" min="0" max="100" value="${current.minOpacity}" /></label>
    <label>Maximum opacity <input id="brush-max-opacity" type="range" min="0" max="100" value="${current.maxOpacity}" /></label>
    <label>Opacity jitter <input id="brush-opacity-jitter" type="range" min="0" max="100" value="${current.opacityJitter}" /></label>
    <label>Blend <select id="brush-blend">${[['normal', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['add', 'Add'], ['overlay', 'Overlay'], ['lighten', 'Lighten'], ['darken', 'Darken'], ['behind', 'Behind']].map(([value, label]) => `<option value="${value}" ${current.blend === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
    <label class="check"><input id="brush-buildup" type="checkbox" ${current.buildup ? 'checked' : ''}/> Dabs stack</label>
    <label>Hue jitter <input id="brush-hue" type="range" min="0" max="100" value="${current.hueJitter}" /></label>
    <label>Saturation jitter <input id="brush-sat" type="range" min="0" max="100" value="${current.satJitter}" /></label>
    <label>Lightness jitter <input id="brush-light" type="range" min="0" max="100" value="${current.lightJitter}" /></label>
    <label>Darkness jitter <input id="brush-dark" type="range" min="0" max="100" value="${current.darkJitter}" /></label>
    <label>Stroke hue <input id="brush-stroke-hue" type="range" min="0" max="100" value="${current.strokeHue}" /></label>
    <label>Stroke saturation <input id="brush-stroke-sat" type="range" min="0" max="100" value="${current.strokeSat}" /></label>
    <label>Stroke lightness <input id="brush-stroke-light" type="range" min="0" max="100" value="${current.strokeLight}" /></label>
    <label>Stroke darkness <input id="brush-stroke-dark" type="range" min="0" max="100" value="${current.strokeDark}" /></label>
    <label>Secondary mix <input id="brush-secondary" type="range" min="0" max="100" value="${current.secondaryMix}" /></label>
    <label>Size jitter <input id="brush-size-jitter" type="range" min="0" max="100" value="${current.sizeJitter}" /></label>
    <label ${hideWet ? 'hidden' : ''}>Wet mix <input id="brush-wet" type="range" min="0" max="100" value="${current.wetMix}" /></label>
    <label ${hideWet ? 'hidden' : ''}>Carry <input id="brush-carry" type="range" min="0" max="100" value="${current.carry}" /></label>
    <label>Grain <button type="button" id="brush-grain">${current.grain ? 'Replace' : 'Choose'}</button>${current.grain ? '<button type="button" id="brush-grain-clear">Remove</button>' : ''}</label>
    <label ${hideGrainLock ? 'hidden' : ''}>Grain place <select id="brush-grain-lock"><option value="move" ${current.grainLock === 'move' ? 'selected' : ''}>Move with brush</option><option value="canvas" ${current.grainLock === 'canvas' ? 'selected' : ''}>Lock to canvas</option></select></label>
    <label ${hideGrainLock ? 'hidden' : ''}>Grain blend <select id="brush-grain-blend">${[['multiply', 'Multiply'], ['soft-light', 'Soft light'], ['overlay', 'Overlay'], ['screen', 'Screen'], ['add', 'Add'], ['lighten', 'Lighten'], ['darken', 'Darken'], ['color-burn', 'Color burn'], ['color-dodge', 'Color dodge']].map(([value, label]) => `<option value="${value}" ${current.grainBlend === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
    <label ${hideGrainLock ? 'hidden' : ''}>Grain scale <input id="brush-grain-scale" type="range" min="25" max="800" value="${current.grainScale}" /></label>
    <label ${hideGrainLock ? 'hidden' : ''}>Grain depth <input id="brush-grain-depth" type="range" min="0" max="100" value="${current.grainDepth}" /></label>
    <label class="check" ${hideGrainLock ? 'hidden' : ''}><input id="brush-grain-jitter" type="checkbox" ${current.grainJitter ? 'checked' : ''}/> Grain shifts</label>
    <label>Taper in <input id="brush-taper-in" type="range" min="0" max="100" value="${current.taperIn}" /></label>
    <label class="check"><input id="brush-taper-size" type="checkbox" ${current.taperSize ? 'checked' : ''}/> Taper size</label>
    <label>Taper out <input id="brush-taper-out" type="range" min="0" max="100" value="${current.taperOut}" /></label>
    <label class="check"><input id="brush-taper-opacity" type="checkbox" ${current.taperOpacity ? 'checked' : ''}/> Taper opacity</label>
    <label>Speed <select id="brush-speed"><option value="off" ${current.speed === 'off' ? 'selected' : ''}>Off</option><option value="light" ${current.speed === 'light' ? 'selected' : ''}>Light</option><option value="heavy" ${current.speed === 'heavy' ? 'selected' : ''}>Heavy</option></select></label>
    <label>Speed size <input id="brush-speed-size" type="range" min="-100" max="100" value="${current.speedSize}" /></label>
    <label>Speed opacity <input id="brush-speed-opacity" type="range" min="-100" max="100" value="${current.speedOpacity}" /></label>
    <label>Lag <input id="brush-lag" type="range" min="0" max="100" value="${current.stabilizer}" /></label>
    <label class="check"><input id="brush-settle" type="checkbox" ${current.settle ? 'checked' : ''}/> Snap shape when you hold</label>
  `;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

export function appendPresets(items: BrushPreset[]): void {
  if (!items.length) return;
  presets.push(...items);
  tab = items[0].tab;
  selected[tab] = items[0].id;
  mark();
}

function moveBrush(id: string, category: string | null, beforeId: string | null): void {
  const index = presets.findIndex(item => item.id === id);
  if (index < 0) return;
  const [item] = presets.splice(index, 1);
  item.category = category;
  let at = beforeId ? presets.findIndex(row => row.id === beforeId) : -1;
  if (at < 0) {
    let last = -1;
    presets.forEach((row, place) => {
      if (row.tab === item.tab && (category ? categoryOf(row) === category : !categoryOf(row))) last = place;
    });
    at = last + 1;
  }
  presets.splice(at, 0, item);
  mark();
  renderPanel();
}

function addBrush(editor: Editor): void {
  const item = preset({ id: `brush-${Date.now()}`, name: 'New brush', tab, tip: 'plain' });
  item.builtin = false;
  presets.push(item);
  selected[tab] = item.id;
  editing = true;
  mark();
  renderPanel();
  refreshBrushPreview(editor);
  paintBrushMark(editor);
  editor.notify();
}

async function deleteBrush(editor: Editor, id: string): Promise<void> {
  const item = presets.find(row => row.id === id);
  if (!item || factoryBrush(item)) return;
  if (presets.filter(row => row.tab === item.tab).length <= 1) {
    editor.toast('This list needs one brush.');
    return;
  }
  if (!await confirmChoice(`Delete ${item.name}?`, 'Delete this brush?', 'Delete', 'Cancel')) return;
  presets = presets.filter(row => row.id !== id);
  forgetBrush(id);
  if (selected[item.tab] === id) selected[item.tab] = presets.find(row => row.tab === item.tab)?.id ?? selected[item.tab];
  mark();
  renderPanel();
  refreshBrushPreview(editor);
  paintBrushMark(editor);
  editor.notify();
}

async function deleteCategory(editor: Editor, id: string): Promise<void> {
  const category = categories.find(item => item.id === id);
  if (!category) return;
  const kept = presets.filter(item => {
    if (!(item.tab === category.tab && item.category === id)) return true;
    if (!factoryBrush(item)) return false;
    item.category = null;
    return true;
  });
  if (!kept.some(item => item.tab === category.tab)) {
    editor.toast('This list needs one brush.');
    return;
  }
  if (!await confirmChoice(`Delete ${category.name}?`, 'Delete this category?', 'Delete', 'Cancel')) return;
  if (!await confirmChoice(`Delete ${category.name}?`, 'Delete every brush in this category too?', 'Delete', 'Cancel')) return;
  presets = kept;
  categories = categories.filter(item => item.id !== id);
  delete categoryOpen[id];
  for (const name of TABS) recent[name] = recent[name].filter(brushId => presets.some(item => item.id === brushId));
  if (!presets.some(item => item.id === selected[category.tab] && item.tab === category.tab)) {
    selected[category.tab] = presets.find(item => item.tab === category.tab)?.id ?? selected[category.tab];
  }
  mark();
  renderPanel();
  refreshBrushPreview(editor);
  paintBrushMark(editor);
  editor.notify();
}

function newCategory(): void {
  const name = window.prompt('Category name')?.replace(/\s+/g, ' ').trim();
  if (!name) return;
  const id = `category-${Date.now()}`;
  categories.push({ id, name, tab, openByDefault: false });
  categoryOpen[id] = true;
  mark();
  renderPanel();
}

function showCategoryMenu(x: number, y: number, categoryId: string | null, editor: Editor): void {
  document.getElementById('brush-category-menu')?.remove();
  document.getElementById('brush-menu')?.remove();
  const category = categories.find(item => item.id === categoryId);
  const menu = document.createElement('div');
  menu.id = 'brush-category-menu';
  menu.innerHTML = category
    ? `<button type="button" data-category-default="${category.id}">Open by default <span class="menu-mark${category.openByDefault ? ' on' : ''}"></span></button><button type="button" data-category-delete="${category.id}">Delete category</button><button type="button" data-category-new>New category</button>`
    : `<button type="button" data-category-new>New category</button>`;
  document.body.append(menu);
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  const box = menu.getBoundingClientRect();
  if (box.right > window.innerWidth - 8) menu.style.left = `${Math.max(8, window.innerWidth - box.width - 8)}px`;
  if (box.bottom > window.innerHeight - 8) menu.style.top = `${Math.max(8, window.innerHeight - box.height - 8)}px`;
  menu.addEventListener('click', event => {
    const node = (event.target as HTMLElement).closest<HTMLElement>('[data-category-new], [data-category-default], [data-category-delete]');
    menu.remove();
    if (!node) return;
    if (node.hasAttribute('data-category-new')) newCategory();
    else if (node.dataset.categoryDefault) {
      const found = categories.find(item => item.id === node.dataset.categoryDefault);
      if (!found) return;
      found.openByDefault = !found.openByDefault;
      mark();
    } else if (node.dataset.categoryDelete) void deleteCategory(editor, node.dataset.categoryDelete);
  });
}

function showBrushMenu(x: number, y: number, id: string): void {
  document.getElementById('brush-category-menu')?.remove();
  document.getElementById('brush-menu')?.remove();
  const item = presets.find(row => row.id === id);
  if (!item) return;
  const menu = document.createElement('div');
  menu.id = 'brush-menu';
  menu.innerHTML = `<button type="button" data-brush-pin="${item.id}">${item.pinned ? 'Unpin' : 'Pin'}</button>`;
  document.body.append(menu);
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  const box = menu.getBoundingClientRect();
  if (box.right > window.innerWidth - 8) menu.style.left = `${Math.max(8, window.innerWidth - box.width - 8)}px`;
  if (box.bottom > window.innerHeight - 8) menu.style.top = `${Math.max(8, window.innerHeight - box.height - 8)}px`;
  menu.addEventListener('click', () => {
    const found = presets.find(row => row.id === id);
    menu.remove();
    if (!found) return;
    found.pinned = !found.pinned;
    mark();
    renderPanel();
  });
}

function placePanel(): void {
  const panel = document.getElementById('brush-panel');
  const button = document.getElementById('brush-library');
  if (!panel || !button || panel.hidden) return;
  const box = button.getBoundingClientRect();
  panel.style.top = `${box.bottom + 4}px`;
  panel.style.left = `${Math.max(8, box.right - panel.offsetWidth)}px`;
}

export function mountBrushes(editor: Editor): void {
  swatchEditor = editor;
  const actions = document.querySelector('.window-actions');
  if (!actions || document.getElementById('brush-library')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'brush-library';
  button.className = 'icon-button';
  button.setAttribute('aria-label', 'Brushes');
  button.setAttribute('aria-pressed', 'false');
  button.innerHTML = '<canvas id="brush-mark" width="18" height="18"></canvas>';
  actions.prepend(button);
  const panel = document.createElement('div');
  panel.id = 'brush-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="brush-tabs" role="tablist">
      <button type="button" data-brush-tab="paint" aria-pressed="true">Paint</button>
      <button type="button" data-brush-tab="smudge" aria-pressed="false">Smudge</button>
      <button type="button" data-brush-tab="erase" aria-pressed="false">Erase</button>
    </div>
    <canvas id="brush-preview" width="800" height="144" aria-hidden="true"></canvas>
    <div class="brush-list-bar"><input id="brush-search" type="search" placeholder="Search brushes" autocomplete="off" spellcheck="false" aria-label="Search brushes" /><button type="button" id="brush-add" aria-label="New brush">${PLUS}</button><button type="button" id="brush-upload" aria-label="Import brushes">${UPLOAD}</button></div>
    <div id="brush-list"></div>
    <div id="brush-edit" hidden></div>
    <input id="brush-file" type="file" accept="image/*" hidden />
    <input id="brush-import-file" type="file" accept=".brush,.brushset,.abr,.zip,.tar,.tgz,.gz,application/zip,application/x-tar,application/gzip" multiple hidden />
  `;
  document.body.append(panel);
  const file = panel.querySelector<HTMLInputElement>('#brush-file');
  const importFile = panel.querySelector<HTMLInputElement>('#brush-import-file');
  panel.querySelector('#brush-search')?.addEventListener('keydown', event => {
    if ((event as KeyboardEvent).key !== 'Enter') return;
    event.preventDefault();
    if (!brushQuery()) return;
    panel.querySelector<HTMLElement>('#brush-list [data-preset-use]')?.click();
  });
  onImageReady = () => {
    swatchKey = '';
    swatchCache.clear();
    refreshBrushPreview(editor);
    paintBrushMark(editor);
  };
  let fileKind: 'tip' | 'grain' = 'tip';
  const open = () => {
    panel.hidden = false;
    button.setAttribute('aria-pressed', 'true');
    if (editor.tool === 'eraser') tab = 'erase';
    editing = false;
    applyCategoryDefaults();
    const field = document.querySelector<HTMLInputElement>('#brush-search');
    if (field) field.value = '';
    renderPanel();
    refreshBrushPreview(editor);
    placePanel();
    focusBrushSearch();
  };
  button.addEventListener('click', () => {
    if (panel.hidden) open();
    else closeBrushPanel();
  });
  panel.addEventListener('click', event => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const target = event.target as HTMLElement;
    const nextTab = target.closest<HTMLElement>('[data-brush-tab]')?.dataset.brushTab as BrushTab | undefined;
    if (nextTab) {
      tab = nextTab;
      mark();
      renderPanel();
      refreshBrushPreview(editor);
      return;
    }
    const use = target.closest<HTMLElement>('[data-preset-use]')?.dataset.presetUse;
    if (use) {
      selected[tab] = use;
      rememberBrush(use);
      mark();
      closeBrushPanel();
      editor.notify();
      return;
    }
    const editId = target.closest<HTMLElement>('[data-preset-edit]')?.dataset.presetEdit;
    if (editId) {
      selected[tab] = editId;
      editing = true;
      mark();
      renderPanel();
      refreshBrushPreview(editor);
      paintBrushMark(editor);
      editor.notify();
      return;
    }
    const deleteId = target.closest<HTMLElement>('[data-preset-delete]')?.dataset.presetDelete;
    if (deleteId) {
      void deleteBrush(editor, deleteId);
      return;
    }
    if (target.id === 'brush-add' || target.closest('#brush-add')) {
      addBrush(editor);
      return;
    }
    if (target.id === 'brush-upload' || target.closest('#brush-upload')) {
      importFile?.click();
      return;
    }
    const categoryId = target.closest<HTMLElement>('[data-category-id]')?.dataset.categoryId;
    if (categoryId) {
      categoryOpen[categoryId] = !(categoryOpen[categoryId] ?? false);
      renderPanel();
      return;
    }
    else if (target.id === 'brush-edit-back') {
      editing = false;
      renderPanel();
      focusBrushSearch();
    } else if (target.id === 'brush-grain') {
      fileKind = 'grain';
      file?.click();
    } else if (target.id === 'brush-grain-clear') updatePreset({ grain: null }, true);
  });
  panel.addEventListener('change', event => {
    const input = event.target as HTMLInputElement;
    if (input.id === 'brush-tip') {
      if (input.value === 'image') {
        fileKind = 'tip';
        file?.click();
        return;
      }
      updatePreset({ tip: input.value as TipId, tipImage: null, tipMissing: false });
      refreshBrushPreview(editor);
    } else if (input.id === 'brush-rotation') updatePreset({ rotation: input.value as RotationMode }, true);
    else if (input.id === 'brush-blend') updatePreset({ blend: input.value as BrushBlend });
    else if (input.id === 'brush-speed') updatePreset({ speed: input.value as SpeedMode });
    else if (input.id === 'brush-grain-lock') updatePreset({ grainLock: input.value === 'canvas' ? 'canvas' : 'move' });
    else if (input.id === 'brush-grain-blend') updatePreset({ grainBlend: input.value as GrainBlend });
    else if (input.id === 'brush-angle') updatePreset({ angle: Number(input.value) || 0 });
    refreshBrushPreview(editor);
  });
  panel.addEventListener('input', event => {
    const input = event.target as HTMLInputElement;
    if (input.id === 'brush-search') {
      renderPanel();
      return;
    }
    const value = Number(input.value);
    if (input.id === 'brush-hardness') updatePreset({ hardness: value });
    else if (input.id === 'brush-spacing') updatePreset({ spacing: value });
    else if (input.id === 'brush-scatter') updatePreset({ scatter: value });
    else if (input.id === 'brush-twist') updatePreset({ twist: value });
    else if (input.id === 'brush-flow') updatePreset({ flow: value });
    else if (input.id === 'brush-wet') updatePreset({ wetMix: value });
    else if (input.id === 'brush-taper-in') updatePreset({ taperIn: value });
    else if (input.id === 'brush-taper-out') updatePreset({ taperOut: value });
    else if (input.id === 'brush-lag') updatePreset({ stabilizer: value });
    else if (input.id === 'brush-hue') updatePreset({ hueJitter: value });
    else if (input.id === 'brush-sat') updatePreset({ satJitter: value });
    else if (input.id === 'brush-light') updatePreset({ lightJitter: value });
    else if (input.id === 'brush-dark') updatePreset({ darkJitter: value });
    else if (input.id === 'brush-stroke-hue') updatePreset({ strokeHue: value });
    else if (input.id === 'brush-stroke-sat') updatePreset({ strokeSat: value });
    else if (input.id === 'brush-stroke-light') updatePreset({ strokeLight: value });
    else if (input.id === 'brush-stroke-dark') updatePreset({ strokeDark: value });
    else if (input.id === 'brush-opacity-jitter') updatePreset({ opacityJitter: value });
    else if (input.id === 'brush-min-opacity') updatePreset({ minOpacity: value });
    else if (input.id === 'brush-max-opacity') updatePreset({ maxOpacity: value });
    else if (input.id === 'brush-size-jitter') updatePreset({ sizeJitter: value });
    else if (input.id === 'brush-speed-size') updatePreset({ speedSize: value });
    else if (input.id === 'brush-speed-opacity') updatePreset({ speedOpacity: value });
    else if (input.id === 'brush-stamps') updatePreset({ stamps: value });
    else if (input.id === 'brush-carry') updatePreset({ carry: value });
    else if (input.id === 'brush-secondary') updatePreset({ secondaryMix: value });
    else if (input.id === 'brush-grain-scale') updatePreset({ grainScale: value });
    else if (input.id === 'brush-grain-depth') updatePreset({ grainDepth: value });
    else if (input.id === 'brush-taper-size') updatePreset({ taperSize: input.checked });
    else if (input.id === 'brush-taper-opacity') updatePreset({ taperOpacity: input.checked });
    else if (input.id === 'brush-settle') updatePreset({ settle: input.checked });
    else if (input.id === 'brush-buildup') updatePreset({ buildup: input.checked });
    else if (input.id === 'brush-grain-jitter') updatePreset({ grainJitter: input.checked });
    else if (input.id === 'brush-name') updatePreset({ name: input.value });
    refreshBrushPreview(editor);
  });
  importFile?.addEventListener('change', () => {
    const chosen = [...(importFile.files ?? [])];
    importFile.value = '';
    if (!chosen.length) return;
    void (async () => {
      const items: BrushPreset[] = [];
      let failed = false;
      for (const file of chosen) {
        try {
          const batches = await readBrushFile(file);
          if (!batches.length) continue;
          for (const batch of batches) {
            if (!batch.presets.length) continue;
            const groups = new Map<BrushTab, string>();
            for (const item of batch.presets) {
              let id = groups.get(item.tab);
              if (!id) {
                id = `category-${Date.now()}-${categories.length}-${groups.size}`;
                categories.push({ id, name: batch.title, tab: item.tab, openByDefault: false });
                categoryOpen[id] = true;
                groups.set(item.tab, id);
              }
              item.category = id;
            }
            items.push(...batch.presets);
          }
        } catch {
          failed = true;
        }
      }
      if (!items.length) {
        editor.toast(failed ? 'Could not read that brush file.' : 'That file did not contain a brush.');
        return;
      }
      appendPresets(items);
      editing = false;
      renderPanel();
      refreshBrushPreview(editor);
      paintBrushMark(editor);
      editor.toast(items.length === 1 ? `Imported ${items[0].name}.` : `Imported ${items.length} brushes.`);
    })();
  });
  file?.addEventListener('change', () => {
    const chosen = file.files?.[0];
    file.value = '';
    if (!chosen) return;
    void scaleFile(chosen).then(url => {
      if (!url) {
        updatePreset({ tipMissing: true, tip: 'plain' });
        return;
      }
      imageCache.delete(url);
      if (fileKind === 'grain') updatePreset({ grain: url });
      else updatePreset({ tip: 'image', tipImage: url, tipMissing: false });
      refreshBrushPreview(editor);
    });
  });
  let dragId = '';
  let dragX = 0;
  let dragY = 0;
  let dragging = false;
  let suppressClick = false;
  const clearDrag = () => {
    dragId = '';
    dragging = false;
    panel.querySelectorAll('.drag-over').forEach(node => node.classList.remove('drag-over'));
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragUp);
    window.removeEventListener('pointercancel', clearDrag);
  };
  const onDragMove = (event: PointerEvent) => {
    if (!dragId) return;
    if (!dragging && Math.hypot(event.clientX - dragX, event.clientY - dragY) < 6) return;
    dragging = true;
    panel.querySelectorAll('.drag-over').forEach(node => node.classList.remove('drag-over'));
    document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-drop-category]')?.classList.add('drag-over');
  };
  const onDragUp = (event: PointerEvent) => {
    const id = dragId;
    const moved = dragging;
    clearDrag();
    if (!moved || !id) return;
    suppressClick = true;
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const zone = hit?.closest<HTMLElement>('[data-drop-category]');
    if (!zone) return;
    const category = zone.dataset.dropCategory || null;
    const row = hit?.closest<HTMLElement>('.brush-row');
    const beforeId = row && row.dataset.preset !== id ? row.dataset.preset ?? null : null;
    const source = presets.find(item => item.id === id);
    if (!source || ((categoryOf(source) ?? '') === (category ?? '') && !beforeId)) return;
    moveBrush(id, category, beforeId);
  };
  panel.addEventListener('pointerdown', event => {
    suppressClick = false;
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('[data-preset-edit], [data-preset-delete], #brush-add, #brush-upload, #brush-search, .brush-category-head, .brush-shortcut')) return;
    const row = target.closest<HTMLElement>('.brush-row');
    if (!row?.dataset.preset) return;
    dragId = row.dataset.preset;
    dragX = event.clientX;
    dragY = event.clientY;
    dragging = false;
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragUp);
    window.addEventListener('pointercancel', clearDrag);
  });
  panel.addEventListener('contextmenu', event => {
    const target = event.target as HTMLElement;
    if (editing || target.closest('#brush-search')) return;
    const row = target.closest<HTMLElement>('.brush-row');
    if (row?.dataset.preset) {
      event.preventDefault();
      showBrushMenu(event.clientX, event.clientY, row.dataset.preset);
      return;
    }
    const head = target.closest<HTMLElement>('[data-category-id]');
    if (!head && !target.closest('#brush-list, .brush-list-bar')) return;
    event.preventDefault();
    showCategoryMenu(event.clientX, event.clientY, head?.dataset.categoryId ?? null, editor);
  });
  document.addEventListener('pointerdown', event => {
    document.querySelectorAll('#brush-category-menu, #brush-menu').forEach(menu => {
      if (!menu.contains(event.target as Node)) menu.remove();
    });
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) {
      closeBrushPanel();
      event.stopPropagation();
    }
  });
  window.addEventListener('resize', placePanel);
  renderPanel();
}

export function paintBrushMark(editor: Editor): void {
  const mark = document.getElementById('brush-mark') as HTMLCanvasElement | null;
  if (!mark) return;
  const ctx = mark.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, 18, 18);
  ctx.save();
  ctx.translate(9, 9);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ink') || '#241f31';
  ctx.strokeStyle = ctx.fillStyle;
  drawTip(ctx, activePreset(editor.tool), 6);
  ctx.restore();
}
