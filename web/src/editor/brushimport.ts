import { warmImage, type BrushPreset, type BrushBlend, type GrainBlend, type RotationMode } from './brushes.ts';

// Layouts checked against the files in proc/. Procreate bundles are zip files.
// Brush.archive is an NSKeyedArchiver binary plist. Shape and grain files use
// the names stored in the archive, not a fixed Shape.png. Photoshop .abr here
// is version 6: 8BIM samp holds the tip bitmaps, 8BIM desc holds the names.
// Generic zip/tar/tar.gz packs may nest .brushset / .abr sets and loose .brush
// files; sets keep their own category names, loose brushes share the pack name.

type Uid = { uid: number };
type Archive = Record<string, unknown>;

const MAX_SIDE = 128;
const SET_NAME = /\.(brushset|abr)$/i;
const SINGLE_NAME = /\.brush$/i;
const NESTED_ARCHIVE = /\.(zip|tar|tgz|tar\.gz|bundle)$/i;
const STEM_EXT = /\.(brushset|brush|abr|zip|tar\.gz|tgz|tar|bundle)$/i;

export interface BrushImportBatch {
  title: string;
  presets: BrushPreset[];
}

export async function readBrushFile(file: File): Promise<BrushImportBatch[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    return await readBrushBytes(bytes, file.name, stemName(file.name), 0);
  } catch {
    return [];
  }
}

function stemName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  return base.replace(STEM_EXT, '').trim() || base;
}

function baseName(path: string): string {
  return path.split('/').pop() ?? path;
}

async function readBrushBytes(bytes: Uint8Array, fileName: string, title: string, depth: number): Promise<BrushImportBatch[]> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.abr') || (bytes.length > 4 && !isZip(bytes) && !isGzip(bytes) && !looksLikeTar(bytes) && bytes[1] === 6)) {
    const presets = await readAbr(bytes);
    return presets.length ? [{ title, presets }] : [];
  }

  const files = await unpackArchive(bytes);
  if (!files) return [];

  const sets: { name: string; data: Uint8Array }[] = [];
  const singles: Uint8Array[] = [];
  const nested: { name: string; data: Uint8Array }[] = [];
  for (const [path, data] of files) {
    const name = baseName(path);
    const copy = data.slice();
    if (SET_NAME.test(name)) sets.push({ name, data: copy });
    else if (SINGLE_NAME.test(name)) singles.push(copy);
    else if (depth < 1 && NESTED_ARCHIVE.test(name)) nested.push({ name, data: copy });
  }

  if (sets.length || singles.length || nested.length) {
    const batches: BrushImportBatch[] = [];
    const loose: BrushPreset[] = [];
    for (const set of sets) {
      batches.push(...await readBrushBytes(set.data, set.name, stemName(set.name), depth + 1));
    }
    for (const data of singles) {
      try { loose.push(...await readProcreate(data)); } catch { /* skip a bad brush */ }
    }
    for (const pack of nested) {
      batches.push(...await readBrushBytes(pack.data, pack.name, stemName(pack.name), depth + 1));
    }
    if (loose.length) batches.push({ title, presets: loose });
    return batches.filter(batch => batch.presets.length);
  }

  const presets = await readProcreate(bytes);
  return presets.length ? [{ title, presets }] : [];
}

function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

function looksLikeTar(bytes: Uint8Array): boolean {
  if (bytes.length < 512) return false;
  const magic = String.fromCharCode(...bytes.subarray(257, 262));
  return magic === 'ustar' || tarSize(bytes, 0) >= 0;
}

async function unpackArchive(bytes: Uint8Array): Promise<Map<string, Uint8Array> | null> {
  if (isZip(bytes)) return unzip(bytes);
  if (isGzip(bytes)) {
    const raw = await gunzip(bytes);
    if (isZip(raw)) return unzip(raw);
    if (looksLikeTar(raw)) return untar(raw);
    return null;
  }
  if (looksLikeTar(bytes)) return untar(bytes);
  return null;
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function tarSize(bytes: Uint8Array, offset: number): number {
  if (offset + 512 > bytes.length) return -1;
  let size = 0;
  for (let index = 0; index < 11; index++) {
    const code = bytes[offset + 124 + index];
    if (code === 0) break;
    if (code === 32) continue;
    if (code < 0x30 || code > 0x37) return -1;
    size = size * 8 + (code - 0x30);
  }
  return size;
}

function untar(bytes: Uint8Array): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  let offset = 0;
  while (offset + 512 <= bytes.length) {
    if (bytes.subarray(offset, offset + 512).every(byte => byte === 0)) break;
    const size = tarSize(bytes, offset);
    if (size < 0) break;
    let name = '';
    for (let index = 0; index < 100; index++) {
      const code = bytes[offset + index];
      if (!code) break;
      name += String.fromCharCode(code);
    }
    const prefix = bytes[offset + 345] ? (() => {
      let text = '';
      for (let index = 0; index < 155; index++) {
        const code = bytes[offset + 345 + index];
        if (!code) break;
        text += String.fromCharCode(code);
      }
      return text;
    })() : '';
    const path = prefix ? `${prefix}/${name}` : name;
    const type = bytes[offset + 156];
    const start = offset + 512;
    const end = start + size;
    offset = start + Math.ceil(size / 512) * 512;
    if (!path || path.endsWith('/') || path.startsWith('__MACOSX/') || (type !== 0 && type !== 48 /* '0' */)) continue;
    if (end <= bytes.length) files.set(path, bytes.subarray(start, end));
  }
  return files;
}

async function unzip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    const compressed = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const start = offset + 30 + nameLength + extraLength;
    const path = new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + nameLength));
    if ((flags & 8) !== 0 || start + compressed > bytes.length) break;
    const slice = bytes.subarray(start, start + compressed);
    offset = start + compressed;
    if (!path || path.endsWith('/') || path.startsWith('__MACOSX/')) continue;
    try {
      const data = method === 0 ? slice : method === 8 ? await inflate(slice) : null;
      if (data) files.set(path, data);
    } catch { /* one bad entry does not reject the bundle */ }
  }
  return files;
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readProcreate(bytes: Uint8Array): Promise<BrushPreset[]> {
  const files = await unzip(bytes);
  const order = brushOrder(files);
  const archives = [...files.keys()].filter(path => {
    const lower = path.toLowerCase();
    return lower.endsWith('/brush.archive') || lower === 'brush.archive';
  }).filter(path => !path.toLowerCase().includes('/sub'));
  archives.sort((a, b) => rank(order, a) - rank(order, b) || a.localeCompare(b));
  const presets: BrushPreset[] = [];
  for (const path of archives) {
    try {
      const preset = await presetFromArchive(files, path);
      if (preset) presets.push(preset);
    } catch { /* skip a brush the archive cannot describe */ }
  }
  return presets;
}

function brushOrder(files: Map<string, Uint8Array>): string[] {
  const entry = [...files.entries()].find(([path]) => /(^|\/)brushset\.plist$/i.test(path) || /(^|\/)metadata\.plist$/i.test(path));
  if (!entry || entry[1][0] !== 0x3c) return [];
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(entry[1]), 'application/xml');
  const key = [...doc.getElementsByTagName('key')].find(node => node.textContent === 'brushes');
  const array = key?.nextElementSibling;
  if (!array) return [];
  return [...array.getElementsByTagName('string')].map(node => node.textContent?.trim() ?? '').filter(Boolean);
}

function rank(order: string[], path: string): number {
  const folder = path.split('/')[0]?.toLowerCase() ?? '';
  const index = order.findIndex(id => id.toLowerCase() === folder);
  return index < 0 ? order.length : index;
}

async function presetFromArchive(files: Map<string, Uint8Array>, path: string): Promise<BrushPreset | null> {
  const root = unarchive(files.get(path) ?? new Uint8Array());
  if (!root) return null;
  const shapeName = text(root.bundledShapePath);
  const grainName = text(root.bundledGrainPath);
  const shapeBytes = namedFile(files, path, shapeName) ?? (shapeName ? null : namedFile(files, path, 'Shape.png'));
  const grainBytes = grainName && !/blank/i.test(grainName) && number(root.grainDepth, 1) >= 0.01
    ? namedFile(files, path, grainName)
    : null;
  let tipImage: string | null = null;
  let tipMissing = false;
  if (shapeBytes) {
    tipImage = await imageMask(shapeBytes, false);
    tipMissing = !tipImage;
  } else if (shapeName && !/blank|\$null/i.test(shapeName)) {
    tipImage = proceduralShape(shapeName);
  } else if (!shapeName || /\$null/i.test(shapeName)) {
    tipImage = proceduralShape('Brush-Preset-Soft.png');
  }
  const bright = number(root.textureBrightness, 0);
  const contrast = number(root.textureContrast, 0);
  const grain = grainBytes
    ? await imageMask(grainBytes, flag(root.textureInverted), true, bright, contrast)
    : proceduralGrain(grainName, bright, contrast);
  const spin = rotationOf(root);
  const orientation = number(root.grainOrientation, number(root.textureOrientation, 1));
  const wet = unit(root.dynamicsWetAccumulation);
  const brush = makePreset({
    name: text(root.name) || 'Imported brush',
    tip: tipImage ? 'image' : 'plain',
    tipImage,
    tipMissing,
    spacing: spacingOf(root.plotSpacing),
    scatter: scatterOf(root),
    twist: twistOf(root),
    rotation: spin.rotation,
    angle: spin.angle,
    hardness: 100,
    flow: clamp(Math.round(unit(root.paintOpacity, 1) * 100), 1, 100),
    blend: blendOf(number(root.blendMode, 0)),
    wetMix: clamp(Math.round(unit(root.dynamicsMix) * 100), 0, 100),
    hueJitter: pct(root.dynamicsJitterHue),
    satJitter: pct(root.dynamicsJitterSaturation),
    lightJitter: pct(root.dynamicsJitterLightness),
    darkJitter: pct(root.dynamicsJitterDarkness),
    strokeHue: pct(root.dynamicsJitterStrokeHue),
    strokeSat: pct(root.dynamicsJitterStrokeSaturation),
    strokeLight: pct(root.dynamicsJitterStrokeLightness),
    strokeDark: pct(root.dynamicsJitterStrokeDarkness),
    opacityJitter: pct(root.dynamicsJitterOpacity),
    minOpacity: unit(root.minOpacity) >= 0.02 ? pct(root.minOpacity) : 0,
    maxOpacity: unit(root.maxOpacity, 1) >= 0.995 ? 100 : pct(root.maxOpacity, 1),
    sizeJitter: pct(root.dynamicsJitterSize),
    speedSize: signedPct(root.dynamicsSpeedSize),
    speedOpacity: signedPct(root.dynamicsSpeedOpacity),
    stamps: clamp(Math.round(1 + number(root.shapeCount, 0) * 15), 1, 16),
    carry: unit(root.dynamicsMix) > 0.05 || wet > 0.72 ? pct(wet) : 0,
    secondaryMix: pct(Math.max(unit(root.jitterSecondary), unit(root.jitterStrokeSecondary))),
    buildup: flag(root.renderingRecursiveMixing),
    glaze: pct(root.dynamicsGlazedFlow ?? 1),
    heavy: flag(root.renderingMaxTransfer),
    flipX: flag(root.shapeFlipXJitter),
    flipY: flag(root.shapeFlipYJitter),
    filtered: root.shapeFilter !== false && root.shapeFilter !== 0,
    wetEdge: pct(root.wetEdgesAmount),
    grain,
    grainLock: orientation >= 3 ? 'canvas' : 'move',
    grainBlend: grainBlendOf(number(root.grainBlendMode, 1)),
    grainScale: clamp(Math.round(number(root.textureScale, 1) * 100), 25, 800),
    grainDepth: pct(root.grainDepth ?? 1),
    grainMove: pct(root.textureMovement ?? 1),
    grainJitter: flag(root.textureOffsetJitter),
    taperIn: clamp(Math.round(unit(root.taperStartLength) * 100), 0, 100),
    taperOut: clamp(Math.round(unit(root.taperEndLength) * 100), 0, 100),
    taperSize: number(root.taperSize, 0) > 0.05,
    taperOpacity: number(root.taperOpacity, 0) > 0.05,
    stabilizer: clamp(Math.round(unit(root.plotMovingAverageStabilization) * 100), 0, 100),
  });
  if (tipImage) await warmImage(tipImage);
  if (grain) await warmImage(grain);
  return brush;
}

function namedFile(files: Map<string, Uint8Array>, archivePath: string, fileName: string | null): Uint8Array | null {
  if (!fileName || /blank/i.test(fileName)) return null;
  const base = fileName.split('/').pop()?.toLowerCase();
  if (!base) return null;
  const folder = archivePath.includes('/') ? archivePath.slice(0, archivePath.lastIndexOf('/') + 1) : '';
  for (const [path, bytes] of files) {
    if (!path.toLowerCase().startsWith(folder.toLowerCase())) continue;
    const rest = path.slice(folder.length);
    if (!rest.includes('/') && rest.toLowerCase() === base) return bytes;
  }
  return null;
}

function rotationOf(root: Archive): { rotation: RotationMode; angle: number } {
  const raw = number(root.shapeRotation, 0);
  const degrees = raw >= 0 && raw <= 1.001 ? raw * 360 : raw;
  let angle = degrees % 360;
  if (angle > 180) angle -= 360;
  if (angle < -180) angle += 360;
  const rounded = Math.round(angle * 10) / 10;
  if (flag(root.shapeRandomise)) return { rotation: 'jitter', angle: rounded };
  if (flag(root.oriented)) return { rotation: 'follow', angle: rounded };
  return { rotation: 'fixed', angle: rounded };
}

async function readAbr(bytes: Uint8Array): Promise<BrushPreset[]> {
  const version = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(0);
  const subversion = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(2);
  if (version !== 6) return [];
  const sampled = section(bytes, 'samp');
  const described = section(bytes, 'desc');
  const tips = sampled ? readTips(sampled, subversion) : [];
  const rows = described ? readDescriptors(described) : [];
  const byId = new Map(tips.map(tip => [tip.id, tip]));
  const used = new Set<string>();
  const presets: BrushPreset[] = [];
  for (const row of rows) {
    const tip = row.sampledId ? byId.get(row.sampledId.replace(/^\$/, '')) : undefined;
    if (tip) used.add(tip.id);
    const tipImage = tip ? rasterUrl(tip.width, tip.height, tip.pixels) : null;
    const soft = /soft/i.test(row.name);
    presets.push(makePreset({
      name: row.name,
      tip: tipImage ? 'image' : 'plain',
      tipImage,
      spacing: clamp(Math.round(row.spacing), 1, 200),
      hardness: soft ? 0 : 100,
    }));
  }
  tips.forEach((tip, index) => {
    if (used.has(tip.id)) return;
    const tipImage = rasterUrl(tip.width, tip.height, tip.pixels);
    if (!tipImage) return;
    presets.push(makePreset({ name: `Brush ${index + 1}`, tip: 'image', tipImage, spacing: 25, hardness: 100 }));
  });
  return presets;
}

interface Tip {
  id: string;
  width: number;
  height: number;
  pixels: Uint8Array;
}

function readTips(samp: Uint8Array, subversion: number): Tip[] {
  const view = new DataView(samp.buffer, samp.byteOffset, samp.byteLength);
  const tips: Tip[] = [];
  let pos = 0;
  const skip = subversion === 1 ? 47 : 301;
  while (pos + 4 < samp.length) {
    const size = view.getUint32(pos);
    if (size < skip + 19 || pos + 4 + size > samp.length) break;
    const payload = samp.subarray(pos + 4, pos + 4 + size);
    const padded = size + (4 - (size % 4)) % 4;
    pos += 4 + padded;
    const tip = decodeTip(payload, skip);
    if (tip) tips.push(tip);
  }
  return tips;
}

function decodeTip(payload: Uint8Array, skip: number): Tip | null {
  if (payload.length < skip + 19) return null;
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const top = view.getInt32(skip);
  const left = view.getInt32(skip + 4);
  const bottom = view.getInt32(skip + 8);
  const right = view.getInt32(skip + 12);
  const depth = view.getInt16(skip + 16);
  const compress = payload[skip + 18];
  const width = right - left;
  const height = bottom - top;
  if (width < 1 || height < 1 || width > 4096 || height > 4096 || (depth !== 8 && depth !== 16)) return null;
  const body = payload.subarray(skip + 19);
  const pixels = compress === 0 ? rawPixels(body, width, height, depth >> 3) : compress === 1 ? unpackRows(body, width, height) : null;
  if (!pixels) return null;
  return { id: tipId(payload), width, height, pixels };
}

function tipId(payload: Uint8Array): string {
  if (payload[0] !== 36) return '';
  let end = 1;
  while (end < payload.length && payload[end] !== 0 && end < 80) end += 1;
  return new TextDecoder().decode(payload.subarray(1, end));
}

function rawPixels(body: Uint8Array, width: number, height: number, channels: number): Uint8Array | null {
  const out = new Uint8Array(width * height);
  if (body.length < width * height * channels) return null;
  for (let index = 0; index < out.length; index++) out[index] = body[index * channels];
  return out;
}

function unpackRows(body: Uint8Array, width: number, height: number): Uint8Array | null {
  if (body.length < height * 2) return null;
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const out = new Uint8Array(width * height);
  let pos = height * 2;
  for (let row = 0; row < height; row++) {
    const end = pos + view.getUint16(row * 2);
    if (end > body.length) return null;
    let x = 0;
    while (pos < end && x < width) {
      const control = body[pos++];
      if (control === 128) continue;
      if (control > 128) {
        const value = body[pos++] ?? 0;
        const count = Math.min(257 - control, width - x);
        out.fill(value, row * width + x, row * width + x + count);
        x += count;
      } else {
        const count = control + 1;
        const take = Math.min(count, width - x, end - pos);
        out.set(body.subarray(pos, pos + take), row * width + x);
        pos += count;
        x += take;
      }
    }
    pos = end;
  }
  return out;
}

interface DescribedBrush {
  name: string;
  spacing: number;
  sampledId: string | null;
}

function readDescriptors(desc: Uint8Array): DescribedBrush[] {
  const rows: DescribedBrush[] = [];
  try {
    const reader = new AbrReader(desc);
    reader.u32();
    collect(reader, rows, 0);
  } catch { /* names that parsed stay; tips still import */ }
  return rows;
}

function collect(reader: AbrReader, rows: DescribedBrush[], depth: number): { name: string | null; spacing: number | null; classId: string; sampledId: string | null } {
  if (depth > 12) throw new Error('deep');
  reader.unicode();
  const classId = reader.asciiId();
  const count = reader.u32();
  let name: string | null = null;
  let spacing: number | null = null;
  let sampledId: string | null = null;
  let brushClass = '';
  for (let index = 0; index < count; index++) {
    const key = reader.asciiId().trim();
    const kind = reader.latin(4);
    if (key === 'Nm' && kind === 'TEXT') name = reader.unicode();
    else if (key === 'Spcn' && kind === 'UntF') {
      reader.latin(4);
      spacing = reader.f64();
    } else if (key === 'Spcn' && kind === 'doub') spacing = reader.f64();
    else if (key === 'sampledData' && kind === 'TEXT') sampledId = reader.unicode();
    else if (kind === 'Objc' || kind === 'GlbO') {
      const child = collect(reader, rows, depth + 1);
      if (child.name && !name) name = child.name;
      if (child.spacing != null && spacing == null) spacing = child.spacing;
      if (key === 'Brsh') {
        brushClass = child.classId;
        if (child.sampledId) sampledId = child.sampledId;
      }
    } else skipValue(reader, kind, rows, depth);
  }
  if (classId === 'brushPreset' && (brushClass === 'sampledBrush' || brushClass === 'computedBrush' || name)) {
    rows.push({ name: name?.trim() || 'Brush', spacing: spacing ?? 25, sampledId });
  }
  return { name, spacing, classId, sampledId };
}

function skipValue(reader: AbrReader, kind: string, rows: DescribedBrush[], depth: number): void {
  if (kind === 'Objc' || kind === 'GlbO') collect(reader, rows, depth + 1);
  else if (kind === 'VlLs') {
    const count = reader.u32();
    for (let index = 0; index < count; index++) skipValue(reader, reader.latin(4), rows, depth + 1);
  } else if (kind === 'TEXT') reader.unicode();
  else if (kind === 'doub') reader.f64();
  else if (kind === 'long') reader.latin(4);
  else if (kind === 'comp') reader.latin(8);
  else if (kind === 'bool') reader.latin(1);
  else if (kind === 'UntF') {
    reader.latin(4);
    reader.f64();
  } else if (kind === 'enum') {
    reader.asciiId();
    reader.asciiId();
  } else if (kind === 'tdta' || kind === 'alis') reader.latin(reader.u32());
  else throw new Error(`unknown ${kind}`);
}

class AbrReader {
  private readonly view: DataView;
  offset = 0;

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  u32(): number {
    const value = this.view.getUint32(this.offset);
    this.offset += 4;
    return value;
  }

  f64(): number {
    const value = this.view.getFloat64(this.offset);
    this.offset += 8;
    return value;
  }

  latin(length: number): string {
    const bytes = this.take(length);
    let text = '';
    for (const byte of bytes) text += String.fromCharCode(byte);
    return text;
  }

  asciiId(): string {
    const length = this.u32();
    if (length === 0) return this.latin(4);
    if (length > 1024) throw new Error('id');
    return this.latin(length);
  }

  unicode(): string {
    const length = this.u32();
    if (length > 4096) throw new Error('text');
    return new TextDecoder('utf-16be').decode(this.take(length * 2)).replace(/\u0000/g, '');
  }

  private take(length: number): Uint8Array {
    if (length < 0 || this.offset + length > this.bytes.length) throw new Error('short');
    const slice = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }
}

function section(bytes: Uint8Array, key: string): Uint8Array | null {
  const needle = `8BIM${key}`;
  let at = -1;
  for (let index = 0; index + needle.length + 4 <= bytes.length; index++) {
    let match = true;
    for (let step = 0; step < needle.length; step++) {
      if (bytes[index + step] !== needle.charCodeAt(step)) {
        match = false;
        break;
      }
    }
    if (match) {
      at = index;
      break;
    }
  }
  if (at < 0) return null;
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(at + 8);
  if (at + 12 + length > bytes.length) return null;
  return bytes.subarray(at + 12, at + 12 + length);
}

function unarchive(bytes: Uint8Array): Archive | null {
  if (bytes.length < 40 || new TextDecoder().decode(bytes.subarray(0, 6)) !== 'bplist') return null;
  const parsed = parseBplist(bytes);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const root = parsed as Archive;
  const objects = root.$objects;
  const top = root.$top;
  if (!Array.isArray(objects) || !top || typeof top !== 'object') return null;
  const marker = (top as Archive).root ?? Object.values(top as Archive)[0];
  const resolved = resolve(objects, marker, 0);
  return resolved && typeof resolved === 'object' && !Array.isArray(resolved) ? resolved as Archive : null;
}

function resolve(objects: unknown[], value: unknown, depth: number): unknown {
  if (depth > 16) return null;
  if (isUid(value)) return resolve(objects, objects[value.uid], depth + 1);
  if (Array.isArray(value)) return value.map(item => resolve(objects, item, depth + 1));
  if (value && typeof value === 'object') {
    const record = value as Archive;
    if ('NS.keys' in record && 'NS.objects' in record) {
      const keys = resolve(objects, record['NS.keys'], depth + 1);
      const vals = resolve(objects, record['NS.objects'], depth + 1);
      const out: Archive = {};
      if (Array.isArray(keys) && Array.isArray(vals)) {
        keys.forEach((key, index) => {
          if (typeof key === 'string') out[key] = vals[index];
        });
      }
      return out;
    }
    if ('NS.value' in record) return resolve(objects, record['NS.value'], depth + 1);
    const out: Archive = {};
    for (const [key, item] of Object.entries(record)) {
      if (key !== '$class') out[key] = resolve(objects, item, depth + 1);
    }
    return out;
  }
  return value;
}

function parseBplist(bytes: Uint8Array): unknown {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const trailer = bytes.length - 32;
  const offsetSize = bytes[trailer + 6] ?? 0;
  const refSize = bytes[trailer + 7] ?? 0;
  const count = readBE(view, trailer + 8, 8);
  const top = readBE(view, trailer + 16, 8);
  const table = readBE(view, trailer + 24, 8);
  if (!offsetSize || !refSize || count < 1 || table < 0) return null;
  const offsets: number[] = [];
  for (let index = 0; index < count; index++) offsets.push(readBE(view, table + index * offsetSize, offsetSize));
  const cursor = { pos: 0 };

  const readSize = (low: number): number => {
    if (low !== 0x0f) return low;
    const marker = bytes[cursor.pos] ?? 0;
    cursor.pos += 1;
    const length = 1 << (marker & 0x0f);
    const value = readBE(view, cursor.pos, length);
    cursor.pos += length;
    return value;
  };
  const readRefs = (size: number): number[] => {
    const refs: number[] = [];
    for (let index = 0; index < size; index++) {
      refs.push(readBE(view, cursor.pos, refSize));
      cursor.pos += refSize;
    }
    return refs;
  };
  const readObject = (ref: number): unknown => {
    cursor.pos = offsets[ref] ?? 0;
    const token = bytes[cursor.pos] ?? 0;
    cursor.pos += 1;
    const high = token & 0xf0;
    const low = token & 0x0f;
    if (token === 0x00 || token === 0x0f) return null;
    if (token === 0x08) return false;
    if (token === 0x09) return true;
    if (high === 0x10) {
      const length = 1 << low;
      const value = readBE(view, cursor.pos, length);
      cursor.pos += length;
      return value;
    }
    if (high === 0x20) {
      const length = 1 << low;
      const real = new DataView(bytes.buffer, bytes.byteOffset + cursor.pos, length);
      cursor.pos += length;
      return length === 4 ? real.getFloat32(0) : real.getFloat64(0);
    }
    if (high === 0x40) {
      const size = readSize(low);
      const data = bytes.slice(cursor.pos, cursor.pos + size);
      cursor.pos += size;
      return data;
    }
    if (high === 0x50 || high === 0x60) {
      const size = readSize(low);
      const byteLength = high === 0x60 ? size * 2 : size;
      const data = new TextDecoder(high === 0x60 ? 'utf-16be' : 'latin1').decode(bytes.subarray(cursor.pos, cursor.pos + byteLength));
      cursor.pos += byteLength;
      return data;
    }
    if (high === 0x80) {
      const length = 1 + low;
      const value = readBE(view, cursor.pos, length);
      cursor.pos += length;
      return { uid: value } satisfies Uid;
    }
    if (high === 0xa0 || high === 0xc0) {
      const size = readSize(low);
      return readRefs(size).map(item => readObject(item));
    }
    if (high === 0xd0) {
      const size = readSize(low);
      const keys = readRefs(size);
      const values = readRefs(size);
      const record: Archive = {};
      for (let index = 0; index < size; index++) record[String(readObject(keys[index] ?? 0))] = readObject(values[index] ?? 0);
      return record;
    }
    return null;
  };
  return readObject(top);
}

function readBE(view: DataView, offset: number, size: number): number {
  let value = 0;
  for (let index = 0; index < size; index++) value = value * 256 + view.getUint8(offset + index);
  return value;
}

function isUid(value: unknown): value is Uid {
  return !!value && typeof value === 'object' && 'uid' in value && typeof (value as Uid).uid === 'number' && Object.keys(value).length === 1;
}

async function imageMask(bytes: Uint8Array, invert: boolean, gray = false, brightness = 0, contrast = 0): Promise<string | null> {
  const bitmap = await createImageBitmap(new Blob([bytes.slice()]));
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;
    let opaque = false;
    for (let index = 0; index < data.length; index += 4) {
      const luminance = data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
      let alpha = Math.round(luminance * (data[index + 3] / 255));
      if (invert) alpha = 255 - alpha;
      if (gray) {
        let tone = alpha / 255;
        tone = (tone - 0.5) * (1 + contrast * 1.4) + 0.5 + brightness;
        const grayTone = Math.round(Math.max(0, Math.min(1, tone)) * 255);
        data[index] = data[index + 1] = data[index + 2] = grayTone;
        data[index + 3] = 255;
      } else {
        data[index] = data[index + 1] = data[index + 2] = 255;
        data[index + 3] = alpha;
      }
      opaque = opaque || alpha > 0;
    }
    if (!opaque) return null;
    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png');
  } finally {
    bitmap.close();
  }
}

function rasterUrl(width: number, height: number, pixels: Uint8Array): string | null {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const image = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const sourceY = Math.min(height - 1, Math.floor(y / scale));
    for (let x = 0; x < w; x++) {
      const sourceX = Math.min(width - 1, Math.floor(x / scale));
      const index = (y * w + x) * 4;
      image.data[index] = image.data[index + 1] = image.data[index + 2] = 255;
      image.data[index + 3] = pixels[sourceY * width + sourceX] ?? 0;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

function hashName(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function unitRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = Math.imul(state ^ (state >>> 15), state | 1);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
}

function shapeKind(name: string): 'soft' | 'medium' | 'firm' | 'hard' | 'oval' | 'square' | 'spray' | 'streak' | 'noise' {
  const lower = name.toLowerCase();
  if (/ultra-soft|(^|[^a-z])soft/.test(lower) && !/medium/.test(lower)) return 'soft';
  if (/medium-hard/.test(lower)) return 'firm';
  if (/medium/.test(lower)) return 'medium';
  if (/(^|[^a-z])hard/.test(lower)) return 'hard';
  if (/oval|slim/.test(lower)) return 'oval';
  if (/square|hex|brick/.test(lower)) return 'square';
  if (/spray|splatter|flick|splash|burst|bokeh|orbs|dots|star/.test(lower)) return 'spray';
  if (/hair|grass|streak|dash|willow|tendril|rain|flowing|pen-glow|flare/.test(lower)) return 'streak';
  return 'noise';
}

function proceduralShape(name: string): string {
  const kind = shapeKind(name);
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const image = ctx.createImageData(size, size);
  const random = unitRandom(hashName(name));
  const field = kind === 'noise' || kind === 'streak' ? noiseGrid(random, 8) : null;
  const dots = kind === 'spray' ? sprayDots(random) : null;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let nx = (x + 0.5) / size * 2 - 1;
      let ny = (y + 0.5) / size * 2 - 1;
      if (kind === 'oval') nx /= 0.62;
      if (kind === 'streak') nx *= 0.55;
      const round = Math.hypot(nx, ny);
      const box = Math.max(Math.abs(nx), Math.abs(ny));
      const radius = kind === 'square' ? box : round;
      let alpha = 0;
      if (kind === 'soft') alpha = Math.exp(-radius * radius * 2.2);
      else if (kind === 'medium') alpha = Math.exp(-radius * radius * 4.4);
      else if (kind === 'firm') alpha = radius < 0.62 ? 1 : Math.max(0, 1 - (radius - 0.62) / 0.34);
      else if (kind === 'hard') alpha = radius < 0.88 ? 1 : Math.max(0, 1 - (radius - 0.88) / 0.1);
      else if (kind === 'spray') alpha = sprayAlpha(nx, ny, dots);
      else if (kind === 'streak') alpha = Math.exp(-ny * ny * 10) * Math.max(0, 1 - Math.abs(nx)) * (0.45 + 0.55 * sampleGrid(field, (nx + 1) / 2, (ny + 1) / 2));
      else alpha = Math.exp(-radius * radius * 3.1) * (0.35 + 0.65 * sampleGrid(field, (nx + 1) / 2, (ny + 1) / 2));
      const index = (y * size + x) * 4;
      image.data[index] = image.data[index + 1] = image.data[index + 2] = 255;
      image.data[index + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

function sprayDots(random: () => number): { x: number; y: number; r: number }[] {
  const count = 8 + Math.floor(random() * 14);
  const dots = [];
  for (let index = 0; index < count; index++) dots.push({ x: random() * 1.4 - 0.7, y: random() * 1.4 - 0.7, r: 0.04 + random() * 0.12 });
  return dots;
}

function sprayAlpha(nx: number, ny: number, dots: { x: number; y: number; r: number }[] | null): number {
  if (!dots) return 0;
  let alpha = 0;
  for (const dot of dots) {
    const dx = nx - dot.x;
    const dy = ny - dot.y;
    alpha = Math.max(alpha, Math.exp(-(dx * dx + dy * dy) / (dot.r * dot.r)));
  }
  return alpha;
}

function noiseGrid(random: () => number, cells: number): number[] {
  const values = [];
  for (let index = 0; index < (cells + 1) * (cells + 1); index++) values.push(random());
  return values;
}

function sampleGrid(grid: number[] | null, u: number, v: number): number {
  if (!grid) return 1;
  const cells = Math.round(Math.sqrt(grid.length)) - 1;
  const x = Math.max(0, Math.min(cells - 0.001, u * cells));
  const y = Math.max(0, Math.min(cells - 0.001, v * cells));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const at = (px: number, py: number) => grid[py * (cells + 1) + px] ?? 0;
  const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
  const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
  return top * (1 - ty) + bottom * ty;
}

function proceduralGrain(name: string | null, brightness: number, contrast: number): string | null {
  if (!name || /blank|\$null/i.test(name)) return null;
  const lower = name.toLowerCase();
  const kind = /cloud/.test(lower) ? 'cloud' : /grid|cube|lattice|hex/.test(lower) ? 'grid' : /dot|orb|bokeh/.test(lower) ? 'dots' : 'paper';
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const image = ctx.createImageData(size, size);
  const random = unitRandom(hashName(name));
  const coarse = noiseGrid(random, kind === 'cloud' ? 4 : 16);
  const fine = noiseGrid(random, 32);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      let tone = kind === 'grid'
        ? (x % 16 < 2 || y % 16 < 2 ? 0.25 : 0.85)
        : kind === 'dots'
          ? (Math.hypot((x % 18) - 9, (y % 18) - 9) < 3 ? 0.2 : 0.9)
          : sampleGrid(coarse, u, v) * 0.65 + sampleGrid(fine, u, v) * 0.35;
      tone = (tone - 0.5) * (1 + contrast * 1.4) + 0.5 + brightness;
      const gray = Math.round(Math.max(0, Math.min(1, tone)) * 255);
      const index = (y * size + x) * 4;
      image.data[index] = image.data[index + 1] = image.data[index + 2] = gray;
      image.data[index + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

function makePreset(patch: Pick<BrushPreset, 'name'> & Partial<BrushPreset>): BrushPreset {
  return {
    id: `import-${crypto.randomUUID()}`,
    builtin: false,
    tab: 'paint',
    tip: 'plain',
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
    streamline: 0,
    stabilizer: 0,
    settle: false,
    category: null,
    pinned: false,
    ...patch,
  };
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function number(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function flag(value: unknown): boolean {
  return value === true || value === 1;
}

function unit(value: unknown, fallback = 0): number {
  return number(value, fallback);
}

function spacingOf(value: unknown): number {
  const raw = number(value, 0.25);
  const percent = raw <= 2 ? raw * 100 : raw;
  return clamp(Math.round(percent), 1, 200);
}

function pct(value: unknown, fallback = 0): number {
  return clamp(Math.round(unit(value, fallback) * 100), 0, 100);
}

function signedPct(value: unknown): number {
  return clamp(Math.round(unit(value, 0) * 100), -100, 100);
}

function scatterOf(root: Archive): number {
  const value = unit(root.plotJitter);
  const amount = value <= 1.001 ? value * 100 : Math.min(4, value) * 100;
  return clamp(Math.round(amount), 0, 400);
}

function twistOf(root: Archive): number {
  const value = unit(root.shapeScatter);
  const amount = value <= 1.001 ? value * 100 : Math.min(2, value) * 100;
  return clamp(Math.round(amount), 0, 200);
}

function grainBlendOf(mode: number): GrainBlend {
  if (mode === 6) return 'lighten';
  if (mode === 7) return 'screen';
  if (mode === 8) return 'color-dodge';
  if (mode === 9) return 'add';
  if (mode === 10 || mode === 11) return 'overlay';
  if (mode === 20) return 'color-burn';
  if (mode === 27 || mode === 28) return 'soft-light';
  return 'multiply';
}

function blendOf(mode: number): BrushBlend {
  if (mode === 1) return 'multiply';
  if (mode === 2) return 'screen';
  if (mode === 3) return 'add';
  return 'normal';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
