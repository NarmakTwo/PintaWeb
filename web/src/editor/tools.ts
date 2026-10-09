import type { Editor } from './document.ts';
import { rgba } from '../wasm/engine.ts';
import { boundsOf, modeFromPointer, shiftMask, type Bounds, type Point, type SelectMode, type ToolId } from './types.ts';

function transformAround(ctx: CanvasRenderingContext2D, gesture: 'scale' | 'uniform' | 'rotate' | 'rotate-step', start: Point, point: Point, bounds: Bounds): void {
  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;
  ctx.translate(cx, cy);
  if (gesture === 'rotate' || gesture === 'rotate-step') {
    let angle = Math.atan2(point.y - cy, point.x - cx) - Math.atan2(start.y - cy, start.x - cx);
    if (gesture === 'rotate-step') {
      const step = Math.PI / 12;
      angle = Math.round(angle / step) * step;
    }
    ctx.rotate(angle);
  } else if (gesture === 'uniform') {
    const origin = Math.hypot(start.x - cx, start.y - cy);
    const scale = origin < 1 ? 1 : Math.hypot(point.x - cx, point.y - cy) / origin;
    ctx.scale(scale, scale);
  } else {
    const ox = start.x - cx;
    const oy = start.y - cy;
    const sx = Math.abs(ox) < 1 ? 1 + (point.x - start.x) / Math.max(1, bounds.w) : (point.x - cx) / ox;
    const sy = Math.abs(oy) < 1 ? 1 + (point.y - start.y) / Math.max(1, bounds.h) : (point.y - cy) / oy;
    ctx.scale(sx, sy);
  }
  ctx.translate(-cx, -cy);
}

function transformMask(mask: Uint8Array, width: number, height: number, kind: 'scale' | 'uniform' | 'rotate' | 'rotate-step', start: Point, point: Point, bounds: Bounds): Uint8Array | null {
  if (!width || !height || width * height > 8_000_000) return null;
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext('2d');
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const outCtx = out.getContext('2d');
  if (!maskCtx || !outCtx) return null;
  const image = maskCtx.createImageData(width, height);
  const length = Math.min(mask.length, width * height);
  for (let i = 0; i < length; i++) {
    if (mask[i] === 0) continue;
    image.data[i * 4 + 3] = 255;
  }
  maskCtx.putImageData(image, 0, 0);
  outCtx.imageSmoothingEnabled = true;
  transformAround(outCtx, kind, start, point, bounds);
  outCtx.drawImage(maskCanvas, 0, 0);
  const sampled = outCtx.getImageData(0, 0, width, height);
  const next = new Uint8Array(width * height);
  for (let i = 0; i < next.length; i++) next[i] = sampled.data[i * 4 + 3] > 128 ? 255 : 0;
  return next.some(value => value > 0) ? next : null;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function edgesAlong(points: Point[], width: number, height: number): Uint16Array | null {
  if (points.length < 2 || !width || !height) return null;
  const loop = points.length > 2 ? [...points, points[0]] : points;
  const edges: number[] = [];
  const seen = new Set<number>();
  for (let i = 1; i < loop.length; i++) {
    const a = loop[i - 1];
    const b = loop[i];
    if (!Number.isFinite(a.x) || !Number.isFinite(b.x)) continue;
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.min(2000, Math.max(1, Math.ceil(distance)));
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const x = Math.round(a.x + (b.x - a.x) * t);
      const y = Math.round(a.y + (b.y - a.y) * t);
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const key = y * width + x;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push(x, y);
      if (edges.length >= 120000) break;
    }
    if (edges.length >= 120000) break;
  }
  return edges.length ? Uint16Array.from(edges) : null;
}

function capturePointer(element: HTMLElement, pointerId: number): void {
  try { element.setPointerCapture(pointerId); } catch { /* The pointer is already captured, or the event is synthetic. */ }
}

function clearPreview(editor: Editor): void {
  editor.preview.getContext('2d')?.clearRect(0, 0, editor.preview.width, editor.preview.height);
}

function paintStyle(ctx: CanvasRenderingContext2D, style: Editor['shape'], fill: string, stroke: string, rule: CanvasFillRule = 'nonzero'): void {
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  if (style === 'fill') ctx.fill(rule);
  else if (style === 'both') {
    ctx.fill(rule);
    ctx.stroke();
  } else ctx.stroke();
}

function brushSize(editor: Editor): number {
  const size = Number.isFinite(editor.size) ? editor.size : 8;
  return Math.max(1, Math.min(400, size));
}

function drawShape(ctx: CanvasRenderingContext2D, editor: Editor, tool: ToolId, a: Point, b: Point, shift: boolean, color: string): void {
  let w = b.x - a.x;
  let h = b.y - a.y;
  if (shift && tool !== 'line') {
    const side = Math.max(Math.abs(w), Math.abs(h));
    w = Math.sign(w || 1) * side;
    h = Math.sign(h || 1) * side;
  }
  ctx.save();
  ctx.lineWidth = brushSize(editor);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = editor.opacity / 100;
  ctx.beginPath();
  if (tool === 'line') {
    const angle = Math.atan2(h, w);
    const snapped = shift ? Math.round(angle / (Math.PI / 12)) * (Math.PI / 12) : angle;
    const length = Math.hypot(w, h);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(a.x + Math.cos(snapped) * length, a.y + Math.sin(snapped) * length);
    ctx.stroke();
  } else if (tool === 'ellipse') {
    ctx.ellipse(a.x + w / 2, a.y + h / 2, Math.max(Math.abs(w) / 2, 0.5), Math.max(Math.abs(h) / 2, 0.5), 0, 0, Math.PI * 2);
    paintStyle(ctx, editor.shape, color, editor.shape === 'both' ? editor.secondary : color);
  } else {
    const left = Math.min(a.x, a.x + w);
    const top = Math.min(a.y, a.y + h);
    const width = Math.abs(w);
    const height = Math.abs(h);
    if (tool === 'rounded') ctx.roundRect(left, top, width, height, Math.min(editor.corner, width / 2, height / 2));
    else ctx.rect(left, top, width, height);
    paintStyle(ctx, editor.shape, color, editor.shape === 'both' ? editor.secondary : color);
  }
  ctx.restore();
}

function drawCurve(ctx: CanvasRenderingContext2D, editor: Editor, a: Point, control: Point, b: Point, color: string): void {
  ctx.save();
  ctx.lineWidth = Math.max(1, editor.size);
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.globalAlpha = editor.opacity / 100;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.quadraticCurveTo(control.x, control.y, b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

function stampBrush(ctx: CanvasRenderingContext2D, editor: Editor, x: number, y: number, color: string, erase: boolean): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const radius = Math.max(0.5, brushSize(editor) / 2);
  ctx.save();
  ctx.globalAlpha = erase && editor.eraser === 'soft' ? editor.opacity / 200 : editor.opacity / 100;
  ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, editor.size / 4);
  if (editor.brush === 'squares') ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  else if (editor.brush === 'circle') {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
  } else if (editor.brush === 'splatter') {
    for (let i = 0; i < 8; i++) {
      const ox = (Math.random() - 0.5) * radius * 2;
      const oy = (Math.random() - 0.5) * radius * 2;
      ctx.beginPath();
      ctx.arc(x + ox, y + oy, Math.random() * radius * 0.45 + 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (editor.brush === 'slash') {
    ctx.beginPath();
    ctx.moveTo(x - radius, y + radius);
    ctx.lineTo(x + radius, y - radius);
    ctx.stroke();
  } else if (editor.brush === 'grid') {
    ctx.strokeRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.beginPath();
    ctx.moveTo(x - radius, y);
    ctx.lineTo(x + radius, y);
    ctx.moveTo(x, y - radius);
    ctx.lineTo(x, y + radius);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function walk(from: Point, to: Point, spacing: number, visit: (point: Point) => void): void {
  if (!Number.isFinite(from.x) || !Number.isFinite(from.y) || !Number.isFinite(to.x) || !Number.isFinite(to.y)) return;
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const safeSpacing = Math.max(0.5, Number.isFinite(spacing) ? spacing : 1);
  const steps = Math.min(500, Math.max(1, Math.ceil(distance / safeSpacing)));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    visit({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  }
}

function maskFromShape(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new Uint8Array(width * height);
  draw(ctx);
  const data = ctx.getImageData(0, 0, width, height).data;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) if (data[i * 4 + 3] > 0) mask[i] = 255;
  return mask;
}

function commitText(editor: Editor): void {
  const field = document.querySelector<HTMLTextAreaElement>('#text-editor');
  if (!field || field.hidden) return;
  const text = field.value;
  const x = Number(field.dataset.x ?? 0);
  const y = Number(field.dataset.y ?? 0);
  field.hidden = true;
  field.value = '';
  const layer = editor.layer;
  const doc = editor.doc;
  if (!layer || !doc || !text) return;
  const before = layer.ctx.getImageData(0, 0, doc.width, doc.height);
  layer.ctx.save();
  layer.ctx.fillStyle = editor.primary;
  layer.ctx.globalAlpha = editor.opacity / 100;
  const fontSize = Math.max(8, editor.size * 2);
  layer.ctx.font = `${fontSize}px ${editor.font}`;
  layer.ctx.textBaseline = 'top';
  text.split('\n').forEach((line, index) => layer.ctx.fillText(line, x, y + index * fontSize * 1.25));
  layer.ctx.restore();
  editor.applyClip(before);
  editor.checkpoint('Text');
}

export class ToolController {
  private drawing = false;
  private panning = false;
  private start: Point | null = null;
  private last: Point | null = null;
  private before: ImageData | null = null;
  private points: Point[] = [];
  private button = 0;
  private scroll = { x: 0, y: 0, cx: 0, cy: 0 };
  private moved = false;
  private pending: { a: Point; b: Point } | null = null;
  private baseMask: Uint8Array | null = null;
  private target: { r: number; g: number; b: number; a: number } | null = null;
  private gesture: 'move' | 'scale' | 'rotate' = 'move';
  private smooth: Point | null = null;
  private lastRaw: Point | null = null;
  private penWidth = 0;
  private strokeClock = 0;
  private held = 0;
  private touched = new Map<number, number>();
  private rateTimer = 0;

  constructor(private readonly editor: Editor) {}

  commitText(): void {
    commitText(this.editor);
  }

  down(event: PointerEvent): void {
    const editor = this.editor;
    const doc = editor.doc;
    if (!doc || !editor.layer) return;
    if (editor.tool !== 'text') this.commitText();
    if (this.pending && editor.tool === 'line' && editor.lineMode === 'curve') {
      const point = editor.imagePoint(event) ?? this.pending.b;
      const before = editor.layer.ctx.getImageData(0, 0, doc.width, doc.height);
      drawCurve(editor.layer.ctx, editor, this.pending.a, point, this.pending.b, editor.color(event.button));
      editor.applyClip(before);
      clearPreview(editor);
      this.pending = null;
      editor.checkpoint('Line/Curve');
    }
    const point = editor.imagePoint(event);
    if (!point) return;
    if (this.drawing && editor.tool === 'dither') {
      this.held = this.held | (event.buttons || (event.button === 2 ? 2 : 1));
      if (this.last) this.tone(this.last, this.last);
      return;
    }
    this.button = event.button;
    this.held = event.buttons || (event.button === 2 ? 2 : 1);
    this.moved = false;
    this.start = point;
    this.last = point;
    if (editor.space || event.button === 1 || editor.tool === 'pan') {
      this.panning = true;
      this.scroll = { x: editor.stage.scrollLeft, y: editor.stage.scrollTop, cx: event.clientX, cy: event.clientY };
      capturePointer(editor.paper, event.pointerId);
      return;
    }
    if (editor.tool === 'picker') {
      const pixel = editor.layer.ctx.getImageData(Math.min(doc.width - 1, Math.floor(point.x)), Math.min(doc.height - 1, Math.floor(point.y)), 1, 1).data;
      const hex = `#${[pixel[0], pixel[1], pixel[2], pixel[3]].map(value => value.toString(16).padStart(2, '0')).join('')}`;
      if (event.button === 2) editor.secondary = hex;
      else editor.primary = hex;
      editor.tool = editor.toolBeforePicker === 'picker' ? 'brush' : editor.toolBeforePicker;
      editor.notify();
      return;
    }
    if (editor.tool === 'bucket') {
      this.flood(point, event.button);
      return;
    }
    if (editor.tool === 'wand') {
      this.wand(point, modeFromPointer(editor.selectionMode, event));
      return;
    }
    if (editor.tool === 'text') {
      this.placeText(point);
      return;
    }
    if (editor.tool === 'move-selection' && !doc.selection) {
      editor.toast('Draw a selection first.');
      return;
    }
    this.drawing = true;
    this.before = editor.layer.ctx.getImageData(0, 0, doc.width, doc.height);
    capturePointer(editor.paper, event.pointerId);
    if (editor.tool === 'lighten' || editor.tool === 'darken' || editor.tool === 'random') this.beginRate();
    if (editor.tool === 'move-pixels') this.startMove(point, event);
    else if (editor.tool === 'move-selection' && doc.selection) {
      this.baseMask = new Uint8Array(doc.selection);
      this.armGesture(event);
    } else if (editor.tool === 'recolor') {
      const pixel = editor.layer.ctx.getImageData(Math.min(doc.width - 1, Math.floor(point.x)), Math.min(doc.height - 1, Math.floor(point.y)), 1, 1).data;
      this.target = { r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] };
      this.recolor(point);
    } else if (editor.tool === 'pencil') this.pencil(point, point);
    else if (editor.tool === 'brush' || editor.tool === 'eraser') {
      this.resetStroke(point);
      this.brush(point, point);
    } else if (editor.tool === 'pen') {
      this.resetStroke(point);
      this.penWidth = brushSize(editor);
      this.strokeClock = event.timeStamp;
      this.pen(point, point, event.timeStamp);
    } else if (editor.tool === 'lighten' || editor.tool === 'darken' || editor.tool === 'dither' || editor.tool === 'random') this.tone(point, point);
    else if (editor.tool === 'lasso' || editor.tool === 'lasso-draw') {
      this.points = [point];
      if (editor.tool === 'lasso') this.showLasso();
      else this.previewPath(editor.shape !== 'outline');
    }
  }

  move(event: PointerEvent): void {
    const editor = this.editor;
    const point = editor.imagePoint(event);
    if (this.panning) {
      editor.stage.scrollLeft = this.scroll.x - (event.clientX - this.scroll.cx);
      editor.stage.scrollTop = this.scroll.y - (event.clientY - this.scroll.cy);
      return;
    }
    if (this.pending && !this.drawing && point && editor.tool === 'line') {
      clearPreview(editor);
      const ctx = editor.preview.getContext('2d');
      if (ctx) drawCurve(ctx, editor, this.pending.a, point, this.pending.b, editor.color(0));
      return;
    }
    if (!this.drawing || !this.start || !this.last || !point) return;
    if (editor.tool === 'dither' && event.buttons) this.held = event.buttons;
    if (Math.hypot(point.x - this.start.x, point.y - this.start.y) > 2) this.moved = true;
    const tool = editor.tool;
    const sample = tool === 'brush' || tool === 'eraser' || tool === 'pen' ? this.smoothToward(point) : point;
    if (tool === 'brush' || tool === 'eraser') this.brush(this.last, sample);
    else if (tool === 'pen') this.pen(this.last, sample, event.timeStamp, false, this.lastRaw, point);
    else if (tool === 'pencil') this.pencil(this.last, point);
    else if (tool === 'lighten' || tool === 'darken' || tool === 'dither' || tool === 'random') this.tone(this.last, point);
    else if (tool === 'recolor' && !editor.recolorGlobal) this.recolor(point);
    else if (tool === 'move-pixels' && editor.float) this.paintFloat(point, event.shiftKey);
    else if (tool === 'move-selection' && this.baseMask && editor.doc) this.paintSelection(point, event.shiftKey);
    else if (tool === 'lasso' || tool === 'lasso-draw') {
      this.pushPoint(point);
      if (tool === 'lasso') this.showLasso();
      else this.previewPath(editor.shape !== 'outline');
    } else if (tool === 'rect-select' || tool === 'ellipse-select' || tool === 'zoom') {
      this.previewMarquee(point, event.shiftKey, tool === 'ellipse-select' ? 'ellipse' : 'rectangle');
    } else if (tool === 'line' || tool === 'rectangle' || tool === 'rounded' || tool === 'ellipse') {
      clearPreview(editor);
      const ctx = editor.preview.getContext('2d');
      if (ctx) drawShape(ctx, editor, tool, this.start, point, event.shiftKey, editor.color(this.button));
    } else if (tool === 'gradient') {
      clearPreview(editor);
      const ctx = editor.preview.getContext('2d');
      if (ctx) {
        ctx.save();
        ctx.strokeStyle = editor.primary;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(this.start.x, this.start.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
        ctx.restore();
      }
    }
    this.last = sample;
    this.lastRaw = point;
  }

  abandon(): void {
    const editor = this.editor;
    const wasDrawing = this.drawing;
    this.drawing = false;
    this.panning = false;
    if (editor.float) editor.cancelFloat();
    else if (wasDrawing && this.before && editor.layer) editor.layer.ctx.putImageData(this.before, 0, 0);
    if (this.baseMask && editor.doc) {
      editor.doc.selection = new Uint8Array(this.baseMask);
      editor.rebuildEdges();
    }
    this.before = null;
    this.baseMask = null;
    this.points = [];
    this.start = null;
    this.smooth = null;
    this.lastRaw = null;
    this.penWidth = 0;
    this.stopRate();
    editor.draftEdges = null;
    clearPreview(editor);
    if (wasDrawing) {
      editor.paintOverlay();
      editor.renderScene();
    }
  }

  up(event: PointerEvent): void {
    const editor = this.editor;
    if (this.panning) {
      this.panning = false;
      return;
    }
    if (!this.drawing || !this.start) return;
    if (editor.tool === 'dither' && (event.buttons & 3) !== 0) {
      this.held = event.buttons;
      return;
    }
    this.stopRate();
    this.drawing = false;
    const point = editor.imagePoint(event) ?? this.last ?? this.start;
    const tool = editor.tool;
    clearPreview(editor);
    if (tool === 'brush' || tool === 'eraser' || tool === 'pen') this.catchUp(point, tool, event.timeStamp);
    if (tool === 'brush' || tool === 'eraser' || tool === 'pencil' || tool === 'pen' || tool === 'lighten' || tool === 'darken' || tool === 'dither' || tool === 'recolor' || tool === 'random') {
      if (this.before) editor.applyClip(this.before);
      const label = tool === 'eraser' ? 'Eraser' : tool === 'pencil' ? 'Pencil' : tool === 'pen' ? 'Fountain Pen' : tool === 'lighten' ? 'Lighten' : tool === 'darken' ? 'Darken' : tool === 'dither' ? 'Dither' : tool === 'random' ? 'Random Brush' : tool === 'recolor' ? 'Recolor' : 'Paintbrush';
      editor.checkpoint(label);
    } else if (tool === 'move-pixels') this.finishMove();
    else if (tool === 'move-selection') {
      editor.rebuildEdges();
      if (this.moved) editor.checkpoint('Move Selection');
      else editor.paintOverlay();
    } else if (tool === 'zoom') this.finishZoom(point, event);
    else if (tool === 'rect-select' || tool === 'ellipse-select') this.finishSelect(point, event);
    else if (tool === 'lasso') this.finishLasso(modeFromPointer(editor.selectionMode, event));
    else if (tool === 'lasso-draw') this.finishLassoDraw();
    else if (tool === 'line' && editor.lineMode === 'curve') this.pending = { a: this.start, b: point };
    else if (tool === 'line' || tool === 'rectangle' || tool === 'rounded' || tool === 'ellipse') {
      const layer = editor.layer;
      const doc = editor.doc;
      if (layer && doc && this.before) {
        if (tool === 'line' && !editor.antialias) {
          const image = layer.ctx.getImageData(0, 0, doc.width, doc.height);
          editor.engine.stamp(image, this.start.x | 0, this.start.y | 0, point.x | 0, point.y | 0, editor.size | 0, editor.ink(this.button), false);
          layer.ctx.putImageData(image, 0, 0);
        } else drawShape(layer.ctx, editor, tool, this.start, point, event.shiftKey, editor.color(this.button));
        editor.applyClip(this.before);
        editor.checkpoint(tool === 'line' ? 'Line/Curve' : tool === 'rectangle' ? 'Rectangle' : tool === 'rounded' ? 'Rounded Rectangle' : 'Ellipse');
      }
    } else if (tool === 'gradient') this.finishGradient(point);
    this.before = null;
    this.baseMask = null;
    this.points = [];
    this.smooth = null;
    this.lastRaw = null;
    this.penWidth = 0;
    this.stopRate();
    editor.draftEdges = null;
  }

  private flood(point: Point, button: number): void {
    const editor = this.editor;
    const doc = editor.doc;
    const layer = editor.layer;
    if (!doc || !layer) return;
    const image = layer.ctx.getImageData(0, 0, doc.width, doc.height);
    const before = new ImageData(new Uint8ClampedArray(image.data), doc.width, doc.height);
    editor.engine.flood(image, Math.min(doc.width - 1, point.x | 0), Math.min(doc.height - 1, point.y | 0), editor.ink(button), Math.round(editor.tolerance * 2.55));
    if (doc.selection) editor.engine.clip(image, before, doc.selection);
    layer.ctx.putImageData(image, 0, 0);
    editor.checkpoint('Paint Bucket');
  }

  private wand(point: Point, mode: SelectMode): void {
    const editor = this.editor;
    const doc = editor.doc;
    const layer = editor.layer;
    if (!doc || !layer) return;
    const image = layer.ctx.getImageData(0, 0, doc.width, doc.height);
    const mask = editor.engine.wand(image, Math.min(doc.width - 1, point.x | 0), Math.min(doc.height - 1, point.y | 0), Math.round(editor.tolerance * 2.55));
    editor.setSelection(mask, mode);
    if (editor.doc?.selection) editor.tool = 'move-pixels';
    editor.checkpoint('Magic Wand');
  }

  private pencil(from: Point, to: Point): void {
    const editor = this.editor;
    const doc = editor.doc;
    const layer = editor.layer;
    if (!doc || !layer) return;
    const image = layer.ctx.getImageData(0, 0, doc.width, doc.height);
    editor.engine.stamp(image, from.x | 0, from.y | 0, to.x | 0, to.y | 0, Math.max(1, editor.size | 0), editor.ink(this.button), false);
    layer.ctx.putImageData(image, 0, 0);
    editor.renderScene();
  }

  private brush(from: Point, to: Point): void {
    const editor = this.editor;
    const layer = editor.layer;
    if (!layer) return;
    const erase = editor.tool === 'eraser' && this.button !== 2;
    const color = editor.tool === 'eraser' && this.button === 2 ? editor.secondary : editor.color(this.button);
    walk(from, to, Math.max(1, editor.size / 4), point => stampBrush(layer.ctx, editor, point.x, point.y, color, erase));
    editor.renderScene();
  }

  private recolor(point: Point): void {
    const editor = this.editor;
    const doc = editor.doc;
    const layer = editor.layer;
    const target = this.target;
    if (!doc || !layer || !target) return;
    const image = layer.ctx.getImageData(0, 0, doc.width, doc.height);
    const fill = editor.ink(this.button);
    const tolerance = Math.round(editor.tolerance * 2.55);
    if (editor.recolorGlobal) {
      for (let index = 0; index < image.data.length; index += 4) {
        const distance = Math.max(
          Math.abs(image.data[index] - target.r),
          Math.abs(image.data[index + 1] - target.g),
          Math.abs(image.data[index + 2] - target.b),
          Math.abs(image.data[index + 3] - target.a),
        );
        if (distance > tolerance) continue;
        image.data[index] = fill.r;
        image.data[index + 1] = fill.g;
        image.data[index + 2] = fill.b;
      }
    } else editor.engine.recolor(image, point.x | 0, point.y | 0, Math.max(1, editor.size / 2), target, fill, tolerance);
    layer.ctx.putImageData(image, 0, 0);
    editor.renderScene();
  }

  private beginRate(): void {
    this.touched.clear();
    this.stopRate();
    this.rateTimer = window.setInterval(() => this.tickRate(), 50);
  }

  private stopRate(): void {
    if (this.rateTimer) window.clearInterval(this.rateTimer);
    this.rateTimer = 0;
    this.touched.clear();
  }

  private tickRate(): void {
    if (!this.drawing || !this.last) return;
    const tool = this.editor.tool;
    const rate = tool === 'random' ? this.editor.randomRate : this.editor.toneRate;
    if (rate <= 0 || (tool !== 'lighten' && tool !== 'darken' && tool !== 'random')) return;
    this.tone(this.last, this.last);
  }

  private allowPixel(pixel: number, rate: number): boolean {
    const now = performance.now();
    const previous = this.touched.get(pixel);
    if (rate <= 0) {
      if (previous !== undefined) return false;
      this.touched.set(pixel, now);
      return true;
    }
    if (previous !== undefined && now - previous < 1000 / rate) return false;
    this.touched.set(pixel, now);
    return true;
  }

  private resetStroke(point: Point): void {
    this.smooth = null;
    this.lastRaw = point;
    this.smoothToward(point);
  }

  private smoothToward(raw: Point): Point {
    const x = Number.isFinite(raw.x) ? raw.x : this.smooth?.x ?? 0;
    const y = Number.isFinite(raw.y) ? raw.y : this.smooth?.y ?? 0;
    if (!this.smooth || !Number.isFinite(this.smooth.x) || !Number.isFinite(this.smooth.y)) {
      this.smooth = { x, y };
      return { x, y };
    }
    const alpha = 0.42;
    this.smooth = {
      x: this.smooth.x + (x - this.smooth.x) * alpha,
      y: this.smooth.y + (y - this.smooth.y) * alpha,
    };
    return { x: this.smooth.x, y: this.smooth.y };
  }

  private catchUp(point: Point, tool: ToolId, time: number): void {
    let cursor = this.last ?? point;
    for (let i = 0; i < 6; i++) {
      const next = this.smoothToward(point);
      if (tool === 'pen') this.pen(cursor, next, time, true);
      else this.brush(cursor, next);
      cursor = next;
      if (Math.hypot(next.x - point.x, next.y - point.y) < 0.35) break;
    }
    this.last = cursor;
  }

  private pen(from: Point, to: Point, time: number, holdWidth = false, rawFrom?: Point | null, rawTo?: Point | null): void {
    const editor = this.editor;
    const layer = editor.layer;
    if (!layer) return;
    const size = brushSize(editor);
    if (!holdWidth) {
      const stamp = Number.isFinite(time) ? time : this.strokeClock;
      const elapsed = stamp - this.strokeClock;
      const dt = Math.max(8, Math.min(80, elapsed > 0 ? elapsed : 16));
      this.strokeClock = stamp;
      const origin = rawFrom ?? from;
      const destination = rawTo ?? to;
      const distance = Math.hypot(destination.x - origin.x, destination.y - origin.y);
      const speed = distance / dt;
      const min = Math.max(0.75, size * 0.12);
      const target = size + (min - size) * Math.max(0, Math.min(1, speed / 0.45));
      this.penWidth = this.penWidth > 0 ? this.penWidth + (target - this.penWidth) * 0.72 : target;
    }
    const radius = Math.max(0.5, Math.min(size, this.penWidth) / 2);
    const color = editor.color(this.button);
    walk(from, to, Math.max(0.75, radius / 2), mark => {
      layer.ctx.save();
      layer.ctx.globalAlpha = Math.max(0, Math.min(1, editor.opacity / 100));
      layer.ctx.fillStyle = color;
      layer.ctx.beginPath();
      layer.ctx.arc(mark.x, mark.y, radius, 0, Math.PI * 2);
      layer.ctx.fill();
      layer.ctx.restore();
    });
    editor.renderScene();
  }

  private tone(from: Point, to: Point): void {
    const editor = this.editor;
    const doc = editor.doc;
    const layer = editor.layer;
    if (!doc || !layer) return;
    if (editor.tool === 'random') {
      this.randomBrush(from, to);
      return;
    }
    const mode = editor.tool;
    const radius = Math.max(1, brushSize(editor) / 2);
    const amount = Math.max(1, Math.min(100, Number.isFinite(editor.toneAmount) ? editor.toneAmount : 50)) / 100;
    const rate = Math.max(0, Math.min(10, Number.isFinite(editor.toneRate) ? editor.toneRate : 0));
    const image = layer.ctx.getImageData(0, 0, doc.width, doc.height);
    const primary = editor.ink(0);
    const secondary = editor.ink(2);
    const left = (this.held & 1) !== 0;
    const right = (this.held & 2) !== 0;
    const paint = (x: number, y: number) => {
      const leftEdge = Math.max(0, Math.floor(x - radius));
      const top = Math.max(0, Math.floor(y - radius));
      const rightEdge = Math.min(doc.width - 1, Math.ceil(x + radius));
      const bottom = Math.min(doc.height - 1, Math.ceil(y + radius));
      for (let py = top; py <= bottom; py++) {
        for (let px = leftEdge; px <= rightEdge; px++) {
          if ((px - x) ** 2 + (py - y) ** 2 > radius * radius) continue;
          const pixel = py * doc.width + px;
          const index = pixel * 4;
          if (mode === 'dither') {
            const cell = ((py & 3) << 2) + (px & 3);
            const primaryCell = BAYER[cell] <= 7;
            const color = primaryCell ? (left ? primary : null) : (right ? secondary : null);
            if (!color) continue;
            image.data[index] = color.r;
            image.data[index + 1] = color.g;
            image.data[index + 2] = color.b;
            image.data[index + 3] = Math.max(image.data[index + 3], color.a);
            continue;
          }
          if (image.data[index + 3] === 0 || !this.allowPixel(pixel, rate)) continue;
          for (let channel = 0; channel < 3; channel++) {
            const value = image.data[index + channel];
            image.data[index + channel] = mode === 'lighten'
              ? Math.min(255, Math.round(value + (255 - value) * amount))
              : Math.max(0, Math.round(value * (1 - amount)));
          }
        }
      }
    };
    walk(from, to, Math.max(1, radius / 2), mark => paint(mark.x, mark.y));
    layer.ctx.putImageData(image, 0, 0);
    editor.renderScene();
  }

  private randomBrush(from: Point, to: Point): void {
    const editor = this.editor;
    const doc = editor.doc;
    const layer = editor.layer;
    if (!doc || !layer) return;
    const radius = Math.max(1, brushSize(editor) / 2);
    const rate = Math.max(0, Math.min(10, Number.isFinite(editor.randomRate) ? editor.randomRate : 0));
    const low = Math.max(-255, Math.min(255, Math.round(Math.min(editor.randomLow, editor.randomHigh))));
    const high = Math.max(-255, Math.min(255, Math.round(Math.max(editor.randomLow, editor.randomHigh))));
    const span = high - low + 1;
    const image = layer.ctx.getImageData(0, 0, doc.width, doc.height);
    const paint = (x: number, y: number) => {
      const leftEdge = Math.max(0, Math.floor(x - radius));
      const top = Math.max(0, Math.floor(y - radius));
      const rightEdge = Math.min(doc.width - 1, Math.ceil(x + radius));
      const bottom = Math.min(doc.height - 1, Math.ceil(y + radius));
      for (let py = top; py <= bottom; py++) {
        for (let px = leftEdge; px <= rightEdge; px++) {
          if ((px - x) ** 2 + (py - y) ** 2 > radius * radius) continue;
          const pixel = py * doc.width + px;
          if (!this.allowPixel(pixel, rate)) continue;
          const index = pixel * 4;
          const channels = editor.randomAlpha ? 4 : 3;
          for (let channel = 0; channel < channels; channel++) {
            const delta = low + Math.floor(Math.random() * span);
            image.data[index + channel] = Math.max(0, Math.min(255, image.data[index + channel] + delta));
          }
        }
      }
    };
    walk(from, to, Math.max(1, radius / 2), mark => paint(mark.x, mark.y));
    layer.ctx.putImageData(image, 0, 0);
    editor.renderScene();
  }

  private pushPoint(point: Point): void {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    const last = this.points[this.points.length - 1];
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < 0.6) return;
    if (this.points.length >= 8000) this.points[this.points.length - 1] = point;
    else this.points.push(point);
  }

  private showLasso(): void {
    const editor = this.editor;
    const doc = editor.doc;
    clearPreview(editor);
    editor.draftEdges = doc ? edgesAlong(this.points, doc.width, doc.height) : null;
    editor.paintOverlay();
  }

  private armGesture(event: PointerEvent): void {
    if (event.altKey) this.gesture = 'rotate';
    else if (event.ctrlKey || event.metaKey) this.gesture = 'scale';
    else this.gesture = 'move';
  }

  private paintSelection(point: Point, shift: boolean): void {
    const editor = this.editor;
    const doc = editor.doc;
    const mask = this.baseMask;
    const start = this.start;
    if (!doc || !mask || !start) return;
    if (this.gesture === 'move') {
      doc.selection = shiftMask(mask, doc.width, doc.height, Math.round(point.x - start.x), Math.round(point.y - start.y));
    } else {
      const kind = this.gesture === 'scale' ? (shift ? 'uniform' : 'scale') : (shift ? 'rotate-step' : 'rotate');
      const bounds = boundsOf(mask, doc.width, doc.height);
      doc.selection = bounds ? transformMask(mask, doc.width, doc.height, kind, start, point, bounds) : doc.selection;
    }
    editor.rebuildEdges();
    editor.paintOverlay();
  }

  private startMove(point: Point, event: PointerEvent): void {
    const editor = this.editor;
    const doc = editor.doc;
    const layer = editor.layer;
    if (!doc || !layer || !this.before) return;
    const sprite = document.createElement('canvas');
    sprite.width = doc.width;
    sprite.height = doc.height;
    const ctx = sprite.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(layer.canvas, 0, 0);
    if (doc.selection) {
      const spriteData = ctx.getImageData(0, 0, doc.width, doc.height);
      const base = layer.ctx.getImageData(0, 0, doc.width, doc.height);
      for (let i = 0; i < doc.selection.length; i++) {
        if (doc.selection[i] > 0) base.data[i * 4 + 3] = 0;
        else spriteData.data[i * 4 + 3] = 0;
      }
      ctx.putImageData(spriteData, 0, 0);
      layer.ctx.putImageData(base, 0, 0);
    } else layer.ctx.clearRect(0, 0, doc.width, doc.height);
    this.armGesture(event);
    editor.float = { sprite, x: 0, y: 0, before: this.before, mask: doc.selection ? new Uint8Array(doc.selection) : null, frame: null };
    this.start = point;
    editor.renderScene();
  }

  syncConstraint(event: KeyboardEvent): void {
    if (event.key !== 'Shift' || event.repeat || !this.drawing || !this.last) return;
    if (this.gesture !== 'scale' && this.gesture !== 'rotate') return;
    const shift = event.type === 'keydown';
    if (this.editor.float) this.paintFloat(this.last, shift);
    else if (this.editor.tool === 'move-selection' && this.baseMask) this.paintSelection(this.last, shift);
  }

  private paintFloat(point: Point, shift: boolean): void {
    const editor = this.editor;
    const doc = editor.doc;
    const float = editor.float;
    const start = this.start;
    if (!doc || !float || !start) return;
    if (this.gesture === 'move') {
      float.frame = null;
      float.x = Math.round(point.x - start.x);
      float.y = Math.round(point.y - start.y);
      editor.renderScene();
      return;
    }
    const kind = this.gesture === 'scale' ? (shift ? 'uniform' : 'scale') : (shift ? 'rotate-step' : 'rotate');
    const bounds = float.mask ? boundsOf(float.mask, doc.width, doc.height) : { x: 0, y: 0, w: doc.width, h: doc.height };
    if (!bounds) return;
    const frame = document.createElement('canvas');
    frame.width = doc.width;
    frame.height = doc.height;
    const ctx = frame.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    transformAround(ctx, kind, start, point, bounds);
    ctx.drawImage(float.sprite, 0, 0);
    float.frame = frame;
    float.x = 0;
    float.y = 0;
    if (float.mask) {
      doc.selection = transformMask(float.mask, doc.width, doc.height, kind, start, point, bounds);
      editor.rebuildEdges();
    }
    editor.renderScene();
  }

  private finishMove(): void {
    const editor = this.editor;
    const doc = editor.doc;
    const layer = editor.layer;
    const float = editor.float;
    if (!doc || !layer || !float) return;
    layer.ctx.imageSmoothingEnabled = true;
    if (float.frame) layer.ctx.drawImage(float.frame, 0, 0);
    else {
      layer.ctx.drawImage(float.sprite, float.x, float.y);
      if (float.mask) {
        doc.selection = shiftMask(float.mask, doc.width, doc.height, float.x, float.y);
        editor.rebuildEdges();
      }
    }
    editor.float = null;
    editor.checkpoint('Move Selected Pixels');
  }

  private finishZoom(point: Point, event: PointerEvent): void {
    const editor = this.editor;
    const doc = editor.doc;
    if (!doc || !this.start) return;
    if (!this.moved) {
      const factor = event.altKey || event.button === 2 ? 1 / 1.25 : 1.25;
      editor.zoomAt(doc.zoom * factor, event.clientX, event.clientY);
      return;
    }
    const bounds = boundsOf(maskFromShape(doc.width, doc.height, ctx => {
      ctx.fillStyle = '#000';
      const x = Math.min(this.start!.x, point.x);
      const y = Math.min(this.start!.y, point.y);
      ctx.fillRect(x, y, Math.abs(point.x - this.start!.x), Math.abs(point.y - this.start!.y));
    }), doc.width, doc.height);
    if (bounds && bounds.w > 2 && bounds.h > 2) editor.fit(bounds);
  }

  private finishSelect(point: Point, event: PointerEvent): void {
    const editor = this.editor;
    const doc = editor.doc;
    if (!doc || !this.start) return;
    const mask = maskFromShape(doc.width, doc.height, ctx => {
      ctx.fillStyle = '#000';
      let w = point.x - this.start!.x;
      let h = point.y - this.start!.y;
      if (event.shiftKey) {
        const side = Math.max(Math.abs(w), Math.abs(h));
        w = Math.sign(w || 1) * side;
        h = Math.sign(h || 1) * side;
      }
      if (editor.tool === 'ellipse-select') {
        ctx.beginPath();
        ctx.ellipse(this.start!.x + w / 2, this.start!.y + h / 2, Math.max(Math.abs(w) / 2, 0.5), Math.max(Math.abs(h) / 2, 0.5), 0, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.fillRect(Math.min(this.start!.x, this.start!.x + w), Math.min(this.start!.y, this.start!.y + h), Math.abs(w), Math.abs(h));
    });
    const label = editor.tool === 'ellipse-select' ? 'Ellipse Select' : 'Rectangle Select';
    editor.setSelection(mask, modeFromPointer(editor.selectionMode, event));
    if (editor.doc?.selection) editor.tool = 'move-pixels';
    editor.checkpoint(label);
  }

  private finishLasso(mode: SelectMode): void {
    const editor = this.editor;
    const doc = editor.doc;
    editor.draftEdges = null;
    if (!doc || this.points.length < 3) {
      editor.paintOverlay();
      return;
    }
    const mask = maskFromShape(doc.width, doc.height, ctx => {
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.moveTo(this.points[0].x, this.points[0].y);
      for (const point of this.points.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.closePath();
      ctx.fill('evenodd');
    });
    editor.setSelection(mask, mode);
    if (editor.doc?.selection) editor.tool = 'move-pixels';
    editor.checkpoint('Lasso Select');
  }

  private finishLassoDraw(): void {
    const editor = this.editor;
    const layer = editor.layer;
    if (!layer || this.points.length < 2 || !this.before) return;
    layer.ctx.save();
    const color = editor.color(this.button);
    layer.ctx.lineWidth = brushSize(editor);
    layer.ctx.lineJoin = 'round';
    layer.ctx.lineCap = 'round';
    layer.ctx.globalAlpha = Math.max(0, Math.min(1, editor.opacity / 100));
    layer.ctx.beginPath();
    layer.ctx.moveTo(this.points[0].x, this.points[0].y);
    for (const point of this.points.slice(1)) layer.ctx.lineTo(point.x, point.y);
    layer.ctx.closePath();
    paintStyle(layer.ctx, editor.shape, color, editor.shape === 'both' ? editor.secondary : color, 'evenodd');
    layer.ctx.restore();
    editor.applyClip(this.before);
    editor.checkpoint('Lasso');
  }

  private finishGradient(point: Point): void {
    const editor = this.editor;
    const doc = editor.doc;
    const layer = editor.layer;
    if (!doc || !layer || !this.start || !this.before) return;
    const kinds = { linear: 0, radial: 1, diamond: 2, conical: 3 };
    const image = layer.ctx.getImageData(0, 0, doc.width, doc.height);
    editor.engine.gradient(image, this.start.x | 0, this.start.y | 0, point.x | 0, point.y | 0, editor.ink(0), rgba(editor.secondary, Math.round(editor.opacity * 2.55)), kinds[editor.gradient]);
    if (doc.selection) editor.engine.clip(image, this.before, doc.selection);
    layer.ctx.putImageData(image, 0, 0);
    editor.checkpoint('Gradient');
  }

  private placeText(point: Point): void {
    const field = document.querySelector<HTMLTextAreaElement>('#text-editor');
    const rect = this.editor.paper.getBoundingClientRect();
    if (!field) return;
    field.hidden = false;
    field.value = '';
    field.dataset.x = String(point.x);
    field.dataset.y = String(point.y);
    field.style.left = `${rect.left + point.x / (this.editor.doc?.width ?? 1) * rect.width}px`;
    field.style.top = `${rect.top + point.y / (this.editor.doc?.height ?? 1) * rect.height}px`;
    field.style.fontSize = `${Math.max(12, this.editor.size)}px`;
    field.focus();
  }

  private previewPath(close: boolean): void {
    const editor = this.editor;
    clearPreview(editor);
    const ctx = editor.preview.getContext('2d');
    if (!ctx || !this.points.length) return;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = brushSize(editor);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.points[0].x, this.points[0].y);
    for (const point of this.points.slice(1)) ctx.lineTo(point.x, point.y);
    if (close) ctx.closePath();
    const color = editor.color(this.button);
    paintStyle(ctx, close ? editor.shape : 'outline', color, editor.shape === 'both' ? editor.secondary : color, 'evenodd');
    ctx.restore();
  }

  private previewMarquee(point: Point, shift: boolean, kind: 'rectangle' | 'ellipse'): void {
    const editor = this.editor;
    clearPreview(editor);
    const ctx = editor.preview.getContext('2d');
    if (!ctx || !this.start) return;
    let w = point.x - this.start.x;
    let h = point.y - this.start.y;
    if (shift) {
      const side = Math.max(Math.abs(w), Math.abs(h));
      w = Math.sign(w || 1) * side;
      h = Math.sign(h || 1) * side;
    }
    ctx.save();
    ctx.strokeStyle = '#1c71d8';
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (kind === 'ellipse') ctx.ellipse(this.start.x + w / 2, this.start.y + h / 2, Math.max(Math.abs(w) / 2, 0.5), Math.max(Math.abs(h) / 2, 0.5), 0, 0, Math.PI * 2);
    else ctx.rect(Math.min(this.start.x, this.start.x + w), Math.min(this.start.y, this.start.y + h), Math.abs(w), Math.abs(h));
    ctx.stroke();
    ctx.restore();
  }
}
