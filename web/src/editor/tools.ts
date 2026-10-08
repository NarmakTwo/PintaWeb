import type { Editor } from './document.ts';
import { rgba } from '../wasm/engine.ts';
import { boundsOf, modeFromPointer, shiftMask, type Point, type SelectMode, type ToolId } from './types.ts';

function clearPreview(editor: Editor): void {
  editor.preview.getContext('2d')?.clearRect(0, 0, editor.preview.width, editor.preview.height);
}

function paintStyle(ctx: CanvasRenderingContext2D, style: Editor['shape']): void {
  if (style === 'fill') ctx.fill();
  else if (style === 'both') {
    ctx.fill();
    ctx.stroke();
  } else ctx.stroke();
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
  ctx.lineWidth = Math.max(1, editor.size);
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
    paintStyle(ctx, editor.shape);
  } else {
    const left = Math.min(a.x, a.x + w);
    const top = Math.min(a.y, a.y + h);
    const width = Math.abs(w);
    const height = Math.abs(h);
    if (tool === 'rounded') ctx.roundRect(left, top, width, height, Math.min(editor.corner, width / 2, height / 2));
    else ctx.rect(left, top, width, height);
    paintStyle(ctx, editor.shape);
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
  const radius = Math.max(0.5, editor.size / 2);
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
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / spacing));
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
  private source: HTMLCanvasElement | null = null;

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
    this.button = event.button;
    this.moved = false;
    this.start = point;
    this.last = point;
    if (editor.space || event.button === 1 || editor.tool === 'pan') {
      this.panning = true;
      this.scroll = { x: editor.stage.scrollLeft, y: editor.stage.scrollTop, cx: event.clientX, cy: event.clientY };
      editor.paper.setPointerCapture(event.pointerId);
      return;
    }
    if (editor.tool === 'picker') {
      const pixel = editor.layer.ctx.getImageData(Math.min(doc.width - 1, Math.floor(point.x)), Math.min(doc.height - 1, Math.floor(point.y)), 1, 1).data;
      const hex = `#${[pixel[0], pixel[1], pixel[2]].map(value => value.toString(16).padStart(2, '0')).join('')}`;
      if (event.button === 2) editor.secondary = hex;
      else editor.primary = hex;
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
    if (editor.tool === 'clone' && event.altKey) {
      editor.cloneMarker = { x: Math.round(point.x), y: Math.round(point.y) };
      editor.paintOverlay();
      editor.toast('Clone source set.');
      return;
    }
    if ((editor.tool === 'move-pixels' || editor.tool === 'move-selection') && !doc.selection && editor.tool === 'move-selection') {
      editor.toast('Draw a selection first.');
      return;
    }
    this.drawing = true;
    this.before = editor.layer.ctx.getImageData(0, 0, doc.width, doc.height);
    editor.paper.setPointerCapture(event.pointerId);
    if (editor.tool === 'move-pixels') this.startMove(point);
    else if (editor.tool === 'move-selection' && doc.selection) this.baseMask = new Uint8Array(doc.selection);
    else if (editor.tool === 'recolor') {
      const pixel = editor.layer.ctx.getImageData(Math.min(doc.width - 1, Math.floor(point.x)), Math.min(doc.height - 1, Math.floor(point.y)), 1, 1).data;
      this.target = { r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] };
      this.recolor(point);
    } else if (editor.tool === 'clone') {
      if (!editor.cloneMarker) {
        editor.toast('Alt-click to set the clone source.');
        this.drawing = false;
        return;
      }
      this.source = document.createElement('canvas');
      this.source.width = doc.width;
      this.source.height = doc.height;
      this.source.getContext('2d')?.drawImage(editor.layer.canvas, 0, 0);
      this.clone(point);
    } else if (editor.tool === 'pencil') this.pencil(point, point);
    else if (editor.tool === 'brush' || editor.tool === 'eraser') this.brush(point, point);
    else if (editor.tool === 'lasso' || editor.tool === 'freeform') {
      this.points = [point];
      this.previewPath(false);
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
    if (Math.hypot(point.x - this.start.x, point.y - this.start.y) > 2) this.moved = true;
    const tool = editor.tool;
    if (tool === 'brush' || tool === 'eraser') this.brush(this.last, point);
    else if (tool === 'pencil') this.pencil(this.last, point);
    else if (tool === 'recolor') this.recolor(point);
    else if (tool === 'clone') this.clone(point);
    else if (tool === 'move-pixels' && editor.float) {
      editor.float.x = Math.round(point.x - this.start.x);
      editor.float.y = Math.round(point.y - this.start.y);
      editor.renderScene();
    } else if (tool === 'move-selection' && this.baseMask && editor.doc) {
      editor.doc.selection = shiftMask(this.baseMask, editor.doc.width, editor.doc.height, Math.round(point.x - this.start.x), Math.round(point.y - this.start.y));
      editor.rebuildEdges();
      editor.paintOverlay();
    } else if (tool === 'lasso' || tool === 'freeform') {
      this.points.push(point);
      this.previewPath(tool === 'freeform');
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
    this.last = point;
  }

  up(event: PointerEvent): void {
    const editor = this.editor;
    if (this.panning) {
      this.panning = false;
      return;
    }
    if (!this.drawing || !this.start) return;
    this.drawing = false;
    const point = editor.imagePoint(event) ?? this.last ?? this.start;
    const tool = editor.tool;
    clearPreview(editor);
    if (tool === 'brush' || tool === 'eraser' || tool === 'pencil' || tool === 'recolor' || tool === 'clone') {
      if (this.before) editor.applyClip(this.before);
      editor.checkpoint(tool === 'eraser' ? 'Eraser' : tool === 'pencil' ? 'Pencil' : tool === 'recolor' ? 'Recolor' : tool === 'clone' ? 'Clone Stamp' : 'Paintbrush');
    } else if (tool === 'move-pixels') this.finishMove();
    else if (tool === 'move-selection') {
      editor.rebuildEdges();
      editor.checkpoint('Move Selection');
    } else if (tool === 'zoom') this.finishZoom(point, event);
    else if (tool === 'rect-select' || tool === 'ellipse-select') this.finishSelect(point, event);
    else if (tool === 'lasso') this.finishLasso(modeFromPointer(editor.selectionMode, event));
    else if (tool === 'freeform') this.finishFreeform();
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
    editor.engine.recolor(image, point.x | 0, point.y | 0, Math.max(1, editor.size / 2), target, editor.ink(this.button), Math.round(editor.tolerance * 2.55));
    layer.ctx.putImageData(image, 0, 0);
    editor.renderScene();
  }

  private clone(point: Point): void {
    const editor = this.editor;
    const layer = editor.layer;
    const marker = editor.cloneMarker;
    if (!layer || !this.source || !this.start || !marker) return;
    const radius = Math.max(1, editor.size / 2);
    const dx = point.x - this.start.x;
    const dy = point.y - this.start.y;
    layer.ctx.save();
    layer.ctx.beginPath();
    layer.ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    layer.ctx.clip();
    layer.ctx.drawImage(this.source, marker.x + dx - radius, marker.y + dy - radius, radius * 2, radius * 2, point.x - radius, point.y - radius, radius * 2, radius * 2);
    layer.ctx.restore();
    editor.renderScene();
  }

  private startMove(point: Point): void {
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
    editor.float = { sprite, x: 0, y: 0, before: this.before, mask: doc.selection ? new Uint8Array(doc.selection) : null };
    this.start = point;
    editor.renderScene();
  }

  private finishMove(): void {
    const editor = this.editor;
    const doc = editor.doc;
    const layer = editor.layer;
    const float = editor.float;
    if (!doc || !layer || !float) return;
    layer.ctx.drawImage(float.sprite, float.x, float.y);
    if (float.mask) {
      doc.selection = shiftMask(float.mask, doc.width, doc.height, float.x, float.y);
      editor.rebuildEdges();
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
    editor.setSelection(mask, modeFromPointer(editor.selectionMode, event));
    editor.checkpoint(editor.tool === 'ellipse-select' ? 'Ellipse Select' : 'Rectangle Select');
  }

  private finishLasso(mode: SelectMode): void {
    const editor = this.editor;
    const doc = editor.doc;
    if (!doc || this.points.length < 3) return;
    const mask = maskFromShape(doc.width, doc.height, ctx => {
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.moveTo(this.points[0].x, this.points[0].y);
      for (const point of this.points.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.closePath();
      ctx.fill();
    });
    editor.setSelection(mask, mode);
    editor.checkpoint('Lasso Select');
  }

  private finishFreeform(): void {
    const editor = this.editor;
    const layer = editor.layer;
    if (!layer || this.points.length < 2 || !this.before) return;
    layer.ctx.save();
    layer.ctx.lineWidth = Math.max(1, editor.size);
    layer.ctx.strokeStyle = editor.color(this.button);
    layer.ctx.fillStyle = editor.color(this.button);
    layer.ctx.globalAlpha = editor.opacity / 100;
    layer.ctx.beginPath();
    layer.ctx.moveTo(this.points[0].x, this.points[0].y);
    for (const point of this.points.slice(1)) layer.ctx.lineTo(point.x, point.y);
    layer.ctx.closePath();
    paintStyle(layer.ctx, editor.shape);
    layer.ctx.restore();
    editor.applyClip(this.before);
    editor.checkpoint('Freeform Shape');
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
    ctx.strokeStyle = editor.primary;
    ctx.fillStyle = editor.primary;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = Math.max(1, editor.size);
    ctx.beginPath();
    ctx.moveTo(this.points[0].x, this.points[0].y);
    for (const point of this.points.slice(1)) ctx.lineTo(point.x, point.y);
    if (close) ctx.closePath();
    ctx.stroke();
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
