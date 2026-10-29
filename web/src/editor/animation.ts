/** Frame-by-frame animation, objects, tweens, and bones for PintaWeb. */

export type EaseName = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'custom';

export type FrameCell =
  | { kind: 'key'; data: ImageData; mask: ImageData | null }
  | { kind: 'hold'; from: number };

export interface InstanceTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
}

export interface ObjectKeyframe {
  frame: number;
  transform: InstanceTransform;
  bones?: BonePose[];
}

export interface MotionTween {
  from: number;
  to: number;
  ease: EaseName;
  /** Custom ease samples 0..1 → 0..1 when ease === 'custom'. */
  curve?: number[];
}

export interface AnimObject {
  id: number;
  name: string;
  width: number;
  height: number;
  /** Own timeline frames (at least one key). */
  frames: FrameCell[];
  bones: Bone[];
}

export interface ObjectInstance {
  id: number;
  objectId: number;
  layerId: number;
  /** Stage frame where the object's frame 0 lines up. */
  startFrame: number;
  keys: ObjectKeyframe[];
  tweens: MotionTween[];
}

export interface Bone {
  id: number;
  parent: number | null;
  x: number;
  y: number;
  length: number;
  angle: number;
  soft: boolean;
  minAngle: number;
  maxAngle: number;
  stiffness: number;
  damping: number;
  mass: number;
  gravity: number;
  bend: number;
  stretch: number;
  squash: number;
  softness: number;
  weightBias: number;
  followThrough: number;
  pinRoot: boolean;
  pinTip: boolean;
}

export interface BonePose {
  id: number;
  angle: number;
  bend: number;
  stretch: number;
}

export interface AnimState {
  frame: number;
  frameCount: number;
  fps: number;
  loop: boolean;
  onion: boolean;
  onionCount: number;
  timelineZoom: number;
  objects: AnimObject[];
  instances: ObjectInstance[];
  objectSerial: number;
  instanceSerial: number;
  boneSerial: number;
  /** Object id when editing in place, else null. */
  editingObject: number | null;
  playing: boolean;
}

export function blankAnim(): AnimState {
  return {
    frame: 0,
    frameCount: 1,
    fps: 12,
    loop: false,
    onion: false,
    onionCount: 1,
    timelineZoom: 1,
    objects: [],
    instances: [],
    objectSerial: 1,
    instanceSerial: 1,
    boneSerial: 1,
    editingObject: null,
    playing: false,
  };
}

export function cloneImage(image: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
}

export function blankImage(width: number, height: number): ImageData {
  return new ImageData(Math.max(1, width), Math.max(1, height));
}

export function resolveKeyIndex(frames: FrameCell[], index: number): number {
  if (index < 0 || index >= frames.length) return 0;
  const cell = frames[index];
  if (cell.kind === 'key') return index;
  return Math.max(0, Math.min(cell.from, frames.length - 1));
}

export function framePixels(frames: FrameCell[], index: number): ImageData | null {
  const key = frames[resolveKeyIndex(frames, index)];
  return key?.kind === 'key' ? key.data : null;
}

export function frameMask(frames: FrameCell[], index: number): ImageData | null {
  const key = frames[resolveKeyIndex(frames, index)];
  return key?.kind === 'key' ? key.mask : null;
}

/** Ensure every layer has `count` cells; new cells hold from the last key. */
export function extendFrames(frames: FrameCell[], count: number, width: number, height: number): FrameCell[] {
  const next = frames.map(cell => (cell.kind === 'key'
    ? { kind: 'key' as const, data: cloneImage(cell.data), mask: cell.mask ? cloneImage(cell.mask) : null }
    : { kind: 'hold' as const, from: cell.from }));
  if (!next.length) next.push({ kind: 'key', data: blankImage(width, height), mask: null });
  while (next.length < count) {
    const lastKey = resolveKeyIndex(next, next.length - 1);
    next.push({ kind: 'hold', from: lastKey });
  }
  if (next.length > count) next.length = count;
  if (next[0]?.kind === 'hold') {
    next[0] = { kind: 'key', data: blankImage(width, height), mask: null };
  }
  return next;
}

export function insertBlankKey(frames: FrameCell[], at: number, width: number, height: number): FrameCell[] {
  const next = extendFrames(frames, Math.max(frames.length, at + 1), width, height);
  next.splice(at, 0, { kind: 'key', data: blankImage(width, height), mask: null });
  return reindexHolds(next);
}

export function insertKeyframe(frames: FrameCell[], at: number, width: number, height: number): FrameCell[] {
  const next = extendFrames(frames, Math.max(frames.length, at), width, height);
  const source = framePixels(next, Math.min(at, next.length - 1));
  const mask = frameMask(next, Math.min(at, next.length - 1));
  const key: FrameCell = {
    kind: 'key',
    data: source ? cloneImage(source) : blankImage(width, height),
    mask: mask ? cloneImage(mask) : null,
  };
  if (at >= next.length) next.push(key);
  else if (next[at].kind === 'hold') next[at] = key;
  else next.splice(at, 0, key);
  return reindexHolds(next);
}

export function duplicateFrame(frames: FrameCell[], at: number, width: number, height: number): FrameCell[] {
  const next = extendFrames(frames, Math.max(frames.length, at + 1), width, height);
  const source = framePixels(next, at);
  const mask = frameMask(next, at);
  next.splice(at + 1, 0, {
    kind: 'key',
    data: source ? cloneImage(source) : blankImage(width, height),
    mask: mask ? cloneImage(mask) : null,
  });
  return reindexHolds(next);
}

export function deleteFrame(frames: FrameCell[], at: number, width: number, height: number): FrameCell[] {
  if (frames.length <= 1) {
    return [{ kind: 'key', data: blankImage(width, height), mask: null }];
  }
  const next = frames.slice();
  next.splice(at, 1);
  return reindexHolds(next.length ? next : [{ kind: 'key', data: blankImage(width, height), mask: null }]);
}

function reindexHolds(frames: FrameCell[]): FrameCell[] {
  return frames.map((cell, index) => {
    if (cell.kind === 'key') return cell;
    let from = cell.from;
    if (from >= frames.length) from = frames.length - 1;
    while (from > 0 && frames[from]?.kind === 'hold') from = (frames[from] as { from: number }).from;
    if (frames[from]?.kind !== 'key') {
      const fallback = frames.findIndex(item => item.kind === 'key');
      from = fallback >= 0 ? fallback : 0;
      if (frames[from]?.kind !== 'key' && index === 0) {
        return { kind: 'key', data: blankImage(1, 1), mask: null };
      }
    }
    return { kind: 'hold', from };
  });
}

/** Split a hold at `at` into a key copying the held bitmap (for painting). */
export function ensureKeyAt(frames: FrameCell[], at: number, width: number, height: number): { frames: FrameCell[]; created: boolean } {
  const list = extendFrames(frames, Math.max(frames.length, at + 1), width, height);
  if (list[at]?.kind === 'key') return { frames: list, created: false };
  const source = framePixels(list, at);
  const mask = frameMask(list, at);
  list[at] = {
    kind: 'key',
    data: source ? cloneImage(source) : blankImage(width, height),
    mask: mask ? cloneImage(mask) : null,
  };
  return { frames: reindexHolds(list), created: true };
}

export function easeT(name: EaseName, t: number, curve?: number[]): number {
  const x = Math.min(1, Math.max(0, t));
  if (name === 'custom' && curve && curve.length >= 2) {
    const pos = x * (curve.length - 1);
    const i = Math.floor(pos);
    const f = pos - i;
    const a = curve[Math.min(i, curve.length - 1)];
    const b = curve[Math.min(i + 1, curve.length - 1)];
    return a + (b - a) * f;
  }
  if (name === 'ease-in') return x * x;
  if (name === 'ease-out') return 1 - (1 - x) * (1 - x);
  if (name === 'ease-in-out') return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  return x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpAngle(a: number, b: number, t: number): number {
  let delta = ((b - a + 180) % 360) - 180;
  if (delta < -180) delta += 360;
  return a + delta * t;
}

export function interpolateTransform(a: InstanceTransform, b: InstanceTransform, t: number): InstanceTransform {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    scaleX: lerp(a.scaleX, b.scaleX, t),
    scaleY: lerp(a.scaleY, b.scaleY, t),
    rotation: lerpAngle(a.rotation, b.rotation, t),
    opacity: lerp(a.opacity, b.opacity, t),
  };
}

export function transformAt(instance: ObjectInstance, frame: number): InstanceTransform {
  const keys = [...instance.keys].sort((left, right) => left.frame - right.frame);
  if (!keys.length) {
    return { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 100 };
  }
  if (frame <= keys[0].frame) return { ...keys[0].transform };
  if (frame >= keys[keys.length - 1].frame) return { ...keys[keys.length - 1].transform };
  let prev = keys[0];
  let next = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    if (frame >= keys[i].frame && frame <= keys[i + 1].frame) {
      prev = keys[i];
      next = keys[i + 1];
      break;
    }
  }
  const tween = instance.tweens.find(item => item.from === prev.frame && item.to === next.frame);
  if (!tween || next.frame === prev.frame) return { ...prev.transform };
  const raw = (frame - prev.frame) / (next.frame - prev.frame);
  const t = easeT(tween.ease, raw, tween.curve);
  return interpolateTransform(prev.transform, next.transform, t);
}

export function defaultBone(id: number, x: number, y: number, length: number, angle: number, parent: number | null = null): Bone {
  return {
    id,
    parent,
    x,
    y,
    length,
    angle,
    soft: false,
    minAngle: -180,
    maxAngle: 180,
    stiffness: 100,
    damping: 100,
    mass: 1,
    gravity: 0,
    bend: 10,
    stretch: 10,
    squash: 10,
    softness: 50,
    weightBias: 75,
    followThrough: 4,
    pinRoot: true,
    pinTip: false,
  };
}

export function tipOf(bone: Bone): { x: number; y: number } {
  const rad = bone.angle * Math.PI / 180;
  return { x: bone.x + Math.cos(rad) * bone.length, y: bone.y + Math.sin(rad) * bone.length };
}

/** Nearest-bone soft weights for a bitmap; returns weight maps per bone id. */
export function autoWeights(bones: Bone[], width: number, height: number): Map<number, Float32Array> {
  const maps = new Map<number, Float32Array>();
  for (const bone of bones) maps.set(bone.id, new Float32Array(width * height));
  if (!bones.length) return maps;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let best = bones[0].id;
      let bestDist = Infinity;
      for (const bone of bones) {
        const tip = tipOf(bone);
        const dx = tip.x - bone.x;
        const dy = tip.y - bone.y;
        const len2 = dx * dx + dy * dy || 1;
        let t = ((x - bone.x) * dx + (y - bone.y) * dy) / len2;
        t = Math.min(1, Math.max(0, t));
        const px = bone.x + dx * t;
        const py = bone.y + dy * t;
        const dist = Math.hypot(x - px, y - py);
        if (dist < bestDist) {
          bestDist = dist;
          best = bone.id;
        }
      }
      maps.get(best)![y * width + x] = 1;
    }
  }
  return maps;
}

/** Apply bone angles to warp `source` into `dest` using nearest-bone weights. */
export function deformByBones(
  source: ImageData,
  bones: Bone[],
  poses: BonePose[] | undefined,
  dest: ImageData,
): void {
  dest.data.fill(0);
  if (!bones.length) {
    dest.data.set(source.data);
    return;
  }
  const poseMap = new Map((poses ?? []).map(pose => [pose.id, pose]));
  const width = source.width;
  const height = source.height;
  const weights = autoWeights(bones, width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sx = 0;
      let sy = 0;
      let total = 0;
      for (const bone of bones) {
        const w = weights.get(bone.id)![y * width + x];
        if (w <= 0) continue;
        const pose = poseMap.get(bone.id);
        const angle = (pose?.angle ?? bone.angle) * Math.PI / 180;
        const rest = bone.angle * Math.PI / 180;
        const dx = x - bone.x;
        const dy = y - bone.y;
        const rx = dx * Math.cos(-rest) - dy * Math.sin(-rest);
        const ry = dx * Math.sin(-rest) + dy * Math.cos(-rest);
        const stretch = pose?.stretch ?? 1;
        const bend = (pose?.bend ?? 0) * Math.PI / 180;
        const qx = rx * stretch;
        const qy = ry + qx * Math.sin(bend) * (bone.soft ? bone.softness / 100 : 0);
        const wx = bone.x + qx * Math.cos(angle) - qy * Math.sin(angle);
        const wy = bone.y + qx * Math.sin(angle) + qy * Math.cos(angle);
        sx += wx * w;
        sy += wy * w;
        total += w;
      }
      if (total <= 0) continue;
      const ix = Math.round(sx / total);
      const iy = Math.round(sy / total);
      if (ix < 0 || iy < 0 || ix >= width || iy >= height) continue;
      const from = (iy * width + ix) * 4;
      const to = (y * width + x) * 4;
      dest.data[to] = source.data[from];
      dest.data[to + 1] = source.data[from + 1];
      dest.data[to + 2] = source.data[from + 2];
      dest.data[to + 3] = source.data[from + 3];
    }
  }
}

export function cloneAnim(state: AnimState): AnimState {
  return {
    ...state,
    objects: state.objects.map(obj => ({
      ...obj,
      frames: obj.frames.map(cell => (cell.kind === 'key'
        ? { kind: 'key' as const, data: cloneImage(cell.data), mask: cell.mask ? cloneImage(cell.mask) : null }
        : { kind: 'hold' as const, from: cell.from })),
      bones: obj.bones.map(bone => ({ ...bone })),
    })),
    instances: state.instances.map(item => ({
      ...item,
      keys: item.keys.map(key => ({
        frame: key.frame,
        transform: { ...key.transform },
        bones: key.bones?.map(pose => ({ ...pose })),
      })),
      tweens: item.tweens.map(tween => ({ ...tween, curve: tween.curve ? [...tween.curve] : undefined })),
    })),
    playing: false,
  };
}

export function packFrameCells(frames: FrameCell[]): Array<Record<string, unknown>> {
  return frames.map(cell => {
    if (cell.kind === 'hold') return { kind: 'hold', from: cell.from };
    return { kind: 'key', hasMask: !!cell.mask };
  });
}
