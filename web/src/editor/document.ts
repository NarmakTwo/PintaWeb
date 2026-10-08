import { PixelEngine, rgba, type Rgba } from '../wasm/engine.ts';
import { canvasToPng, clearSession, encodeBmp, loadSession, saveSession, type SessionRecord } from './storage.ts';
import {
  boundsOf, combineMask, DEFAULT_PALETTE, MAX_PIXELS, shiftMask,
  type Bounds, type BrushId, type GradientKind, type Point, type SelectMode, type ShapeStyle, type ToolId, type Unit,
} from './types.ts';

export interface Layer {
  id: number;
  name: string;
  visible: boolean;
  opacity: number;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

interface SnapshotLayer {
  name: string;
  visible: boolean;
  opacity: number;
  data: ImageData;
}

interface Snapshot {
  width: number;
  height: number;
  active: number;
  selection: Uint8Array | null;
  layers: SnapshotLayer[];
}

export interface Doc {
  name: string;
  width: number;
  height: number;
  layers: Layer[];
  active: number;
  selection: Uint8Array | null;
  zoom: number;
  snapshots: Snapshot[];
  labels: string[];
  cursor: number;
  savedCursor: number;
  fileBase: string;
  fileMime: string | null;
}

export interface FloatState {
  sprite: HTMLCanvasElement;
  x: number;
  y: number;
  before: ImageData;
  mask: Uint8Array | null;
  frame: HTMLCanvasElement | null;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not create a drawing surface.');
  return ctx;
}

export class Editor {
  readonly engine = new PixelEngine();
  tool: ToolId = 'brush';
  primary = '#000000';
  secondary = '#ffffff';
  size = 8;
  opacity = 100;
  tolerance = 0;
  brush: BrushId = 'plain';
  shape: ShapeStyle = 'outline';
  selectionMode: SelectMode = 'replace';
  antialias = true;
  lineMode: 'straight' | 'curve' = 'straight';
  gradient: GradientKind = 'linear';
  corner = 16;
  eraser: 'hard' | 'soft' = 'hard';
  font = 'sans-serif';
  palette = [...DEFAULT_PALETTE];
  unit: Unit = 'px';
  show = { rulers: true, status: true, tools: true, toolbar: true, docks: true, tabs: true, grid: false };
  gridSize = 16;
  docs: Doc[] = [];
  index = -1;
  space = false;
  cloneMarker: Point | null = null;
  float: FloatState | null = null;
  ants = 0;
  edges: Int32Array | null = null;
  onChanged: (() => void) | null = null;
  onScene: (() => void) | null = null;
  onToast: ((message: string) => void) | null = null;
  onSave: ((state: string) => void) | null = null;
  clipboard: HTMLCanvasElement | null = null;

  view!: HTMLCanvasElement;
  preview!: HTMLCanvasElement;
  overlay!: HTMLCanvasElement;
  paper!: HTMLElement;
  stage!: HTMLElement;

  saveSerial = 0;
  private previewBase: ImageData | null = null;
  private saveTimer = 0;
  private saveToken = 0;
  private saveQueue: Promise<void> = Promise.resolve();
  private layerSerial = 1;
  private restoring = false;

  get doc(): Doc | null {
    return this.docs[this.index] ?? null;
  }

  get layer(): Layer | null {
    const doc = this.doc;
    return doc?.layers[doc.active] ?? null;
  }

  get dirty(): boolean {
    return !!this.doc && this.doc.cursor !== this.doc.savedCursor;
  }

  async init(): Promise<void> {
    await this.engine.init();
  }

  attach(view: HTMLCanvasElement, preview: HTMLCanvasElement, overlay: HTMLCanvasElement, paper: HTMLElement, stage: HTMLElement): void {
    this.view = view;
    this.preview = preview;
    this.overlay = overlay;
    this.paper = paper;
    this.stage = stage;
  }

  toast(message: string): void {
    this.onToast?.(message);
  }

  notify(): void {
    this.onChanged?.();
  }

  color(button: number): string {
    return button === 2 ? this.secondary : this.primary;
  }

  ink(button: number): Rgba {
    return rgba(this.color(button), Math.round(this.opacity * 255 / 100));
  }

  imagePoint(event: { clientX: number; clientY: number }): Point | null {
    const doc = this.doc;
    if (!doc) return null;
    const rect = this.paper.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: Math.min(doc.width, Math.max(0, (event.clientX - rect.left) / rect.width * doc.width)),
      y: Math.min(doc.height, Math.max(0, (event.clientY - rect.top) / rect.height * doc.height)),
    };
  }

  private makeLayer(name: string, visible: boolean, opacity: number, data?: ImageData): Layer {
    const doc = this.doc;
    const canvas = document.createElement('canvas');
    canvas.width = data?.width ?? doc?.width ?? 1;
    canvas.height = data?.height ?? doc?.height ?? 1;
    const ctx = context2d(canvas);
    if (data) ctx.putImageData(data, 0, 0);
    return { id: this.layerSerial++, name, visible, opacity, canvas, ctx };
  }

  private capture(): Snapshot {
    const doc = this.doc;
    if (!doc) throw new Error('No image is open.');
    return {
      width: doc.width,
      height: doc.height,
      active: doc.active,
      selection: doc.selection ? new Uint8Array(doc.selection) : null,
      layers: doc.layers.map(layer => ({
        name: layer.name,
        visible: layer.visible,
        opacity: layer.opacity,
        data: layer.ctx.getImageData(0, 0, doc.width, doc.height),
      })),
    };
  }

  private restoreSnapshot(snapshot: Snapshot): void {
    const doc = this.doc;
    if (!doc) return;
    this.float = null;
    doc.width = snapshot.width;
    doc.height = snapshot.height;
    doc.active = Math.max(0, Math.min(snapshot.active, snapshot.layers.length - 1));
    doc.selection = snapshot.selection ? new Uint8Array(snapshot.selection) : null;
    doc.layers = snapshot.layers.map(layer => this.makeLayer(layer.name, layer.visible, layer.opacity, layer.data));
    this.syncSize();
    this.rebuildEdges();
    this.renderScene();
  }

  checkpoint(label: string): void {
    const doc = this.doc;
    if (!doc) return;
    doc.snapshots.length = doc.cursor + 1;
    doc.labels.length = doc.cursor + 1;
    doc.snapshots.push(this.capture());
    doc.labels.push(label);
    doc.cursor++;
    while (doc.snapshots.length > 21) {
      doc.snapshots.shift();
      doc.labels.shift();
      doc.cursor--;
    }
    this.renderScene();
    this.scheduleSave();
    this.notify();
  }

  undo(): void {
    const doc = this.doc;
    if (!doc || doc.cursor <= 0) return;
    this.cancelFloat();
    doc.cursor--;
    this.restoreSnapshot(doc.snapshots[doc.cursor]);
    this.scheduleSave();
    this.notify();
  }

  redo(): void {
    const doc = this.doc;
    if (!doc || doc.cursor >= doc.snapshots.length - 1) return;
    this.cancelFloat();
    doc.cursor++;
    this.restoreSnapshot(doc.snapshots[doc.cursor]);
    this.scheduleSave();
    this.notify();
  }

  jump(cursor: number): void {
    const doc = this.doc;
    if (!doc || cursor < 0 || cursor >= doc.snapshots.length || cursor === doc.cursor) return;
    this.cancelFloat();
    doc.cursor = cursor;
    this.restoreSnapshot(doc.snapshots[cursor]);
    this.scheduleSave();
    this.notify();
  }

  private blank(width: number, height: number, name: string): Doc {
    return {
      name,
      width,
      height,
      layers: [],
      active: 0,
      selection: null,
      zoom: 1,
      snapshots: [],
      labels: [],
      cursor: 0,
      savedCursor: 0,
      fileBase: name.replace(/\.[^.]+$/, '') || 'pinta-image',
      fileMime: null,
    };
  }

  private finishNew(doc: Doc, label: string): void {
    this.docs.push(doc);
    this.index = this.docs.length - 1;
    this.syncSize();
    doc.snapshots = [this.capture()];
    doc.labels = [label];
    doc.cursor = 0;
    this.rebuildEdges();
    this.fit();
    this.renderScene();
    this.scheduleSave();
    this.notify();
  }

  newDocument(width: number, height: number, background: string, name = 'Untitled'): boolean {
    if (width < 1 || height < 1 || width * height > MAX_PIXELS) {
      this.toast('Choose dimensions up to 8 megapixels.');
      return false;
    }
    const doc = this.blank(width, height, name);
    this.docs.push(doc);
    this.index = this.docs.length - 1;
    const layer = this.makeLayer('Layer 1', true, 100);
    if (background !== 'transparent') {
      layer.ctx.fillStyle = background === 'secondary' ? this.secondary : '#ffffff';
      layer.ctx.fillRect(0, 0, width, height);
    }
    doc.layers = [layer];
    this.docs.pop();
    this.index = this.docs.length - 1;
    this.finishNew(doc, 'New');
    return true;
  }

  async openFile(file: File, asLayer: boolean): Promise<void> {
    const bitmap = await createImageBitmap(file);
    try {
      if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_PIXELS) {
        this.toast('This image is too large to edit in the browser.');
        return;
      }
      if (asLayer && this.doc) {
        const layer = this.makeLayer(file.name.replace(/\.[^.]+$/, '') || 'Imported', true, 100);
        layer.ctx.drawImage(bitmap, 0, 0);
        this.doc.layers.push(layer);
        this.doc.active = this.doc.layers.length - 1;
        this.checkpoint('Import From File');
        return;
      }
      const doc = this.blank(bitmap.width, bitmap.height, file.name);
      this.docs.push(doc);
      this.index = this.docs.length - 1;
      const layer = this.makeLayer('Background', true, 100);
      layer.ctx.drawImage(bitmap, 0, 0);
      doc.layers = [layer];
      this.docs.pop();
      this.finishNew(doc, 'Open');
    } finally {
      bitmap.close();
    }
  }

  close(index = this.index): void {
    if (index < 0 || index >= this.docs.length) return;
    this.cancelFloat();
    this.docs.splice(index, 1);
    if (!this.docs.length) this.index = -1;
    else if (this.index >= this.docs.length) this.index = this.docs.length - 1;
    else if (index < this.index) this.index--;
    this.syncSize();
    this.rebuildEdges();
    this.renderScene();
    this.scheduleSave();
    this.notify();
  }

  activate(index: number): void {
    if (index < 0 || index >= this.docs.length || index === this.index) return;
    this.cancelFloat();
    this.index = index;
    this.syncSize();
    this.rebuildEdges();
    this.renderScene();
    this.notify();
  }

  async quit(): Promise<void> {
    this.docs = [];
    this.index = -1;
    this.float = null;
    window.clearTimeout(this.saveTimer);
    await clearSession();
    this.syncSize();
    this.renderScene();
    this.onSave?.('Local session cleared');
    this.notify();
  }

  private syncSize(): void {
    const doc = this.doc;
    if (!this.view) return;
    if (!doc) return;
    this.view.width = doc.width;
    this.view.height = doc.height;
    this.preview.width = doc.width;
    this.preview.height = doc.height;
    this.overlay.width = doc.width;
    this.overlay.height = doc.height;
    this.applyZoom();
  }

  applyZoom(): void {
    const doc = this.doc;
    if (!doc || !this.paper) return;
    this.paper.style.width = `${Math.max(1, doc.width * doc.zoom)}px`;
    this.paper.style.height = `${Math.max(1, doc.height * doc.zoom)}px`;
    const overflow = this.paper.offsetWidth > this.stage.clientWidth - 8 || this.paper.offsetHeight > this.stage.clientHeight - 8;
    this.stage.classList.toggle('overflowing', overflow);
  }

  setZoom(next: number): void {
    const doc = this.doc;
    if (!doc) return;
    doc.zoom = Math.min(32, Math.max(0.05, next));
    this.applyZoom();
    this.renderScene();
    this.notify();
  }

  zoomAt(next: number, clientX: number, clientY: number): void {
    const doc = this.doc;
    if (!doc) return;
    const before = this.paper.getBoundingClientRect();
    const px = before.width ? (clientX - before.left) / before.width : 0.5;
    const py = before.height ? (clientY - before.top) / before.height : 0.5;
    doc.zoom = Math.min(32, Math.max(0.05, next));
    this.applyZoom();
    const stageRect = this.stage.getBoundingClientRect();
    const anchorX = this.paper.offsetLeft + px * this.paper.offsetWidth;
    const anchorY = this.paper.offsetTop + py * this.paper.offsetHeight;
    this.stage.scrollLeft = anchorX - (clientX - stageRect.left);
    this.stage.scrollTop = anchorY - (clientY - stageRect.top);
    this.renderScene();
    this.notify();
  }

  fit(bounds?: Bounds): void {
    const doc = this.doc;
    if (!doc) return;
    const target = bounds ?? { x: 0, y: 0, w: doc.width, h: doc.height };
    const availableW = Math.max(40, this.stage.clientWidth - 48);
    const availableH = Math.max(40, this.stage.clientHeight - 48);
    this.setZoom(Math.min(availableW / target.w, availableH / target.h));
  }

  renderScene(): void {
    const doc = this.doc;
    if (!this.view) return;
    const ctx = context2d(this.view);
    ctx.clearRect(0, 0, this.view.width, this.view.height);
    this.preview.getContext('2d')?.clearRect(0, 0, this.preview.width, this.preview.height);
    if (!doc) {
      this.onScene?.();
      return;
    }
    for (const layer of doc.layers) {
      if (!layer.visible) continue;
      ctx.globalAlpha = layer.opacity / 100;
      ctx.drawImage(layer.canvas, 0, 0);
      if (this.float && layer === this.layer) {
        if (this.float.frame) ctx.drawImage(this.float.frame, 0, 0);
        else ctx.drawImage(this.float.sprite, this.float.x, this.float.y);
      }
    }
    ctx.globalAlpha = 1;
    this.paintOverlay();
    this.onScene?.();
  }

  paintOverlay(): void {
    const doc = this.doc;
    if (!doc || !this.overlay) return;
    const ctx = this.overlay.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, doc.width, doc.height);
    if (this.show.grid && this.gridSize >= 2) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(28, 113, 216, 0.35)';
      ctx.lineWidth = 1;
      for (let x = this.gridSize; x < doc.width; x += this.gridSize) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, doc.height);
      }
      for (let y = this.gridSize; y < doc.height; y += this.gridSize) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(doc.width, y + 0.5);
      }
      ctx.stroke();
    }
    if (this.edges) {
      const limit = Math.min(this.edges.length, 200000);
      for (let i = 0; i < limit; i += 2) {
        const x = this.edges[i];
        const y = this.edges[i + 1];
        ctx.fillStyle = ((x + y + this.ants) & 4) === 0 ? '#111' : '#fff';
        ctx.fillRect(x, y, 1, 1);
      }
    }
    if (this.cloneMarker) {
      ctx.strokeStyle = '#1c71d8';
      ctx.lineWidth = 1;
      ctx.strokeRect(this.cloneMarker.x - 4.5, this.cloneMarker.y - 4.5, 9, 9);
      ctx.beginPath();
      ctx.moveTo(this.cloneMarker.x - 7, this.cloneMarker.y);
      ctx.lineTo(this.cloneMarker.x + 7, this.cloneMarker.y);
      ctx.moveTo(this.cloneMarker.x, this.cloneMarker.y - 7);
      ctx.lineTo(this.cloneMarker.x, this.cloneMarker.y + 7);
      ctx.stroke();
    }
  }

  rebuildEdges(): void {
    const doc = this.doc;
    if (!doc?.selection) {
      this.edges = null;
      return;
    }
    const points: number[] = [];
    const { selection, width, height } = doc;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (selection[y * width + x] < 128) continue;
        const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1
          || selection[y * width + x - 1] < 128
          || selection[y * width + x + 1] < 128
          || selection[(y - 1) * width + x] < 128
          || selection[(y + 1) * width + x] < 128;
        if (edge) points.push(x, y);
      }
    }
    this.edges = Int32Array.from(points);
  }

  selectionLabel(): string {
    const doc = this.doc;
    if (!doc?.selection) return 'No selection';
    const bounds = boundsOf(doc.selection, doc.width, doc.height);
    return bounds ? `Selection: ${bounds.x}, ${bounds.y}, ${bounds.w} × ${bounds.h}` : 'No selection';
  }

  setSelection(next: Uint8Array | null, mode: SelectMode): void {
    const doc = this.doc;
    if (!doc) return;
    doc.selection = next ? combineMask(mode === 'replace' ? null : doc.selection, next, mode) : null;
    this.rebuildEdges();
    this.paintOverlay();
  }

  selectAll(): void {
    const doc = this.doc;
    if (!doc) return;
    const mask = new Uint8Array(doc.width * doc.height);
    mask.fill(255);
    this.setSelection(mask, 'replace');
    this.tool = 'move-pixels';
    this.checkpoint('Select All');
  }

  deselect(): void {
    if (!this.doc?.selection) return;
    this.setSelection(null, 'replace');
    this.checkpoint('Deselect');
  }

  invertSelection(): void {
    const doc = this.doc;
    if (!doc) return;
    const mask = new Uint8Array(doc.width * doc.height);
    if (!doc.selection) mask.fill(255);
    else for (let i = 0; i < mask.length; i++) mask[i] = doc.selection[i] > 0 ? 0 : 255;
    this.setSelection(mask, 'replace');
    this.checkpoint('Invert Selection');
  }

  offsetSelection(dx: number, dy: number): void {
    const doc = this.doc;
    if (!doc?.selection) {
      this.toast('There is no selection to offset.');
      return;
    }
    doc.selection = shiftMask(doc.selection, doc.width, doc.height, Math.round(dx), Math.round(dy));
    this.rebuildEdges();
    this.checkpoint('Offset Selection');
  }

  edit(label: string, mutate: (data: ImageData) => void): void {
    const layer = this.layer;
    const doc = this.doc;
    if (!layer || !doc) return;
    const before = layer.ctx.getImageData(0, 0, doc.width, doc.height);
    const copy = new ImageData(new Uint8ClampedArray(before.data), doc.width, doc.height);
    this.engine.setColor(this.primary);
    mutate(copy);
    if (doc.selection) this.engine.clip(copy, before, doc.selection);
    layer.ctx.putImageData(copy, 0, 0);
    this.checkpoint(label);
  }

  applyClip(before: ImageData): void {
    const layer = this.layer;
    const doc = this.doc;
    if (!layer || !doc?.selection) return;
    const after = layer.ctx.getImageData(0, 0, doc.width, doc.height);
    this.engine.clip(after, before, doc.selection);
    layer.ctx.putImageData(after, 0, 0);
  }

  beginPreview(): void {
    const layer = this.layer;
    const doc = this.doc;
    if (!layer || !doc) return;
    this.previewBase = layer.ctx.getImageData(0, 0, doc.width, doc.height);
  }

  previewRun(id: number, p1: number, p2: number, p3: number): void {
    const base = this.previewBase;
    const layer = this.layer;
    const doc = this.doc;
    if (!base || !layer || !doc) return;
    const copy = new ImageData(new Uint8ClampedArray(base.data), doc.width, doc.height);
    this.engine.setColor(this.primary);
    this.engine.run(copy, id, p1, p2, p3);
    if (doc.selection) this.engine.clip(copy, base, doc.selection);
    layer.ctx.putImageData(copy, 0, 0);
    this.renderScene();
  }

  cancelPreview(): void {
    const layer = this.layer;
    if (this.previewBase && layer) layer.ctx.putImageData(this.previewBase, 0, 0);
    this.previewBase = null;
    this.renderScene();
  }

  commitPreview(label: string): void {
    this.previewBase = null;
    this.checkpoint(label);
  }

  cancelFloat(): void {
    const layer = this.layer;
    if (!this.float || !layer) {
      this.float = null;
      return;
    }
    layer.ctx.putImageData(this.float.before, 0, 0);
    if (this.doc) this.doc.selection = this.float.mask ? new Uint8Array(this.float.mask) : null;
    this.float = null;
    this.rebuildEdges();
    this.renderScene();
  }

  feather(radius: number): void {
    const doc = this.doc;
    if (!doc?.selection) {
      this.toast('Select an object to feather.');
      return;
    }
    this.engine.feather(doc.selection, doc.width, doc.height, radius);
    this.rebuildEdges();
    this.checkpoint('Feather Object');
  }

  alignObject(): void {
    const doc = this.doc;
    const layer = this.layer;
    if (!doc || !layer) return;
    const mask = doc.selection;
    let minX = doc.width;
    let minY = doc.height;
    let maxX = -1;
    let maxY = -1;
    const pixels = layer.ctx.getImageData(0, 0, doc.width, doc.height);
    for (let y = 0; y < doc.height; y++) {
      for (let x = 0; x < doc.width; x++) {
        const index = y * doc.width + x;
        const chosen = mask ? mask[index] > 0 : pixels.data[index * 4 + 3] > 0;
        if (!chosen) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) {
      this.toast('There is nothing to align.');
      return;
    }
    const dx = Math.round((doc.width - (maxX - minX + 1)) / 2 - minX);
    const dy = Math.round((doc.height - (maxY - minY + 1)) / 2 - minY);
    if (dx === 0 && dy === 0) {
      this.toast('The object is already centered.');
      return;
    }
    const sprite = document.createElement('canvas');
    sprite.width = doc.width;
    sprite.height = doc.height;
    const spriteCtx = context2d(sprite);
    spriteCtx.drawImage(layer.canvas, 0, 0);
    if (mask) {
      const image = spriteCtx.getImageData(0, 0, doc.width, doc.height);
      for (let i = 0; i < mask.length; i++) if (mask[i] === 0) image.data[i * 4 + 3] = 0;
      spriteCtx.putImageData(image, 0, 0);
      const base = layer.ctx.getImageData(0, 0, doc.width, doc.height);
      for (let i = 0; i < mask.length; i++) if (mask[i] > 0) base.data[i * 4 + 3] = 0;
      layer.ctx.putImageData(base, 0, 0);
      doc.selection = shiftMask(mask, doc.width, doc.height, dx, dy);
      this.rebuildEdges();
    } else layer.ctx.clearRect(0, 0, doc.width, doc.height);
    layer.ctx.drawImage(sprite, dx, dy);
    this.checkpoint('Align Object');
  }

  private replaceLayerCanvas(layer: Layer, canvas: HTMLCanvasElement): void {
    layer.canvas = canvas;
    layer.ctx = context2d(canvas);
  }

  private maskCanvas(mask: Uint8Array, width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = context2d(canvas);
    const image = ctx.createImageData(width, height);
    for (let i = 0; i < mask.length; i++) {
      image.data[i * 4] = 255;
      image.data[i * 4 + 1] = 255;
      image.data[i * 4 + 2] = 255;
      image.data[i * 4 + 3] = mask[i];
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  private readMask(canvas: HTMLCanvasElement): Uint8Array {
    const ctx = context2d(canvas);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const mask = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3];
    return mask;
  }

  private redrawAll(width: number, height: number, draw: (ctx: CanvasRenderingContext2D, source: HTMLCanvasElement) => void): void {
    const doc = this.doc;
    if (!doc) return;
    for (const layer of doc.layers) {
      const next = document.createElement('canvas');
      next.width = width;
      next.height = height;
      draw(context2d(next), layer.canvas);
      this.replaceLayerCanvas(layer, next);
    }
    if (doc.selection) {
      const next = document.createElement('canvas');
      next.width = width;
      next.height = height;
      draw(context2d(next), this.maskCanvas(doc.selection, doc.width, doc.height));
      doc.selection = this.readMask(next);
    }
    doc.width = width;
    doc.height = height;
    this.syncSize();
    this.rebuildEdges();
  }

  flip(horizontal: boolean, scope: 'image' | 'layer'): void {
    const doc = this.doc;
    const layer = this.layer;
    if (!doc || !layer) return;
    const draw = (ctx: CanvasRenderingContext2D, source: HTMLCanvasElement) => {
      if (horizontal) {
        ctx.translate(source.width, 0);
        ctx.scale(-1, 1);
      } else {
        ctx.translate(0, source.height);
        ctx.scale(1, -1);
      }
      ctx.drawImage(source, 0, 0);
    };
    if (scope === 'layer') {
      const next = document.createElement('canvas');
      next.width = doc.width;
      next.height = doc.height;
      draw(context2d(next), layer.canvas);
      this.replaceLayerCanvas(layer, next);
      this.checkpoint(horizontal ? 'Flip Horizontal' : 'Flip Vertical');
      return;
    }
    this.redrawAll(doc.width, doc.height, draw);
    this.checkpoint(horizontal ? 'Flip Horizontal' : 'Flip Vertical');
  }

  rotate(turns: 1 | -1 | 2): void {
    const doc = this.doc;
    if (!doc) return;
    const width = turns === 2 ? doc.width : doc.height;
    const height = turns === 2 ? doc.height : doc.width;
    this.redrawAll(width, height, (ctx, source) => {
      if (turns === 1) {
        ctx.translate(width, 0);
        ctx.rotate(Math.PI / 2);
      } else if (turns === -1) {
        ctx.translate(0, height);
        ctx.rotate(-Math.PI / 2);
      } else {
        ctx.translate(width, height);
        ctx.rotate(Math.PI);
      }
      ctx.drawImage(source, 0, 0);
    });
    this.checkpoint(turns === 1 ? 'Rotate 90° Clockwise' : turns === -1 ? 'Rotate 90° Counter-Clockwise' : 'Rotate 180°');
  }

  resize(width: number, height: number): void {
    const doc = this.doc;
    if (!doc || width < 1 || height < 1 || width * height > MAX_PIXELS) {
      this.toast('Choose dimensions up to 8 megapixels.');
      return;
    }
    this.redrawAll(width, height, (ctx, source) => {
      ctx.imageSmoothingEnabled = this.antialias;
      ctx.drawImage(source, 0, 0, width, height);
    });
    this.checkpoint('Resize Image');
  }

  resizeCanvas(width: number, height: number, anchor: string): void {
    const doc = this.doc;
    if (!doc || width < 1 || height < 1 || width * height > MAX_PIXELS) {
      this.toast('Choose dimensions up to 8 megapixels.');
      return;
    }
    const dx = anchor.includes('w') ? 0 : anchor.includes('e') ? width - doc.width : Math.round((width - doc.width) / 2);
    const dy = anchor.includes('n') ? 0 : anchor.includes('s') ? height - doc.height : Math.round((height - doc.height) / 2);
    this.redrawAll(width, height, (ctx, source) => ctx.drawImage(source, dx, dy));
    this.checkpoint('Resize Canvas');
  }

  crop(): void {
    const doc = this.doc;
    if (!doc?.selection) {
      this.toast('Select an area to crop.');
      return;
    }
    const bounds = boundsOf(doc.selection, doc.width, doc.height);
    if (!bounds) return;
    this.redrawAll(bounds.w, bounds.h, (ctx, source) => ctx.drawImage(source, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, bounds.w, bounds.h));
    doc.selection = null;
    this.edges = null;
    this.checkpoint('Crop to Selection');
  }

  autoCrop(): void {
    const doc = this.doc;
    if (!doc) return;
    const canvas = this.composite();
    const data = context2d(canvas).getImageData(0, 0, doc.width, doc.height).data;
    const corner = [data[0], data[1], data[2], data[3]];
    let minX = doc.width;
    let minY = doc.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < doc.height; y++) {
      for (let x = 0; x < doc.width; x++) {
        const i = (y * doc.width + x) * 4;
        if (data[i] === corner[0] && data[i + 1] === corner[1] && data[i + 2] === corner[2] && data[i + 3] === corner[3]) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) {
      this.toast('The image has no border to crop.');
      return;
    }
    const bounds = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    this.redrawAll(bounds.w, bounds.h, (ctx, source) => ctx.drawImage(source, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, bounds.w, bounds.h));
    this.checkpoint('Auto Crop');
  }

  flatten(): void {
    const doc = this.doc;
    if (!doc) return;
    const flat = this.composite();
    const layer = this.makeLayer('Background', true, 100);
    layer.ctx.drawImage(flat, 0, 0);
    doc.layers = [layer];
    doc.active = 0;
    this.checkpoint('Flatten');
  }

  addLayer(): void {
    const doc = this.doc;
    if (!doc) return;
    const layer = this.makeLayer(`Layer ${doc.layers.length + 1}`, true, 100);
    doc.layers.push(layer);
    doc.active = doc.layers.length - 1;
    this.checkpoint('Add New Layer');
  }

  deleteLayer(): void {
    const doc = this.doc;
    if (!doc || doc.layers.length < 2) {
      this.toast('An image needs at least one layer.');
      return;
    }
    doc.layers.splice(doc.active, 1);
    doc.active = Math.max(0, doc.active - 1);
    this.checkpoint('Delete Layer');
  }

  duplicateLayer(): void {
    const doc = this.doc;
    const layer = this.layer;
    if (!doc || !layer) return;
    const copy = this.makeLayer(`${layer.name} copy`, layer.visible, layer.opacity);
    copy.ctx.drawImage(layer.canvas, 0, 0);
    doc.layers.splice(doc.active + 1, 0, copy);
    doc.active++;
    this.checkpoint('Duplicate Layer');
  }

  mergeDown(): void {
    const doc = this.doc;
    if (!doc || doc.active === 0) {
      this.toast('There is no layer below to merge into.');
      return;
    }
    const upper = doc.layers[doc.active];
    const lower = doc.layers[doc.active - 1];
    lower.ctx.globalAlpha = upper.opacity / 100;
    if (upper.visible) lower.ctx.drawImage(upper.canvas, 0, 0);
    lower.ctx.globalAlpha = 1;
    doc.layers.splice(doc.active, 1);
    doc.active--;
    this.checkpoint('Merge Layer Down');
  }

  moveLayer(direction: -1 | 1): void {
    const doc = this.doc;
    if (!doc) return;
    const next = doc.active + direction;
    if (next < 0 || next >= doc.layers.length) return;
    const [layer] = doc.layers.splice(doc.active, 1);
    doc.layers.splice(next, 0, layer);
    doc.active = next;
    this.checkpoint(direction < 0 ? 'Move Layer Down' : 'Move Layer Up');
  }

  setLayerProperties(name: string, opacity: number, visible: boolean): void {
    const layer = this.layer;
    if (!layer) return;
    layer.name = name.trim() || layer.name;
    layer.opacity = Math.max(0, Math.min(100, opacity));
    layer.visible = visible;
    this.checkpoint('Layer Properties');
  }

  rotateZoomLayer(degrees: number, scale: number): void {
    const doc = this.doc;
    const layer = this.layer;
    if (!doc || !layer) return;
    const next = document.createElement('canvas');
    next.width = doc.width;
    next.height = doc.height;
    const ctx = context2d(next);
    ctx.translate(doc.width / 2, doc.height / 2);
    ctx.rotate(degrees * Math.PI / 180);
    ctx.scale(scale, scale);
    ctx.drawImage(layer.canvas, -doc.width / 2, -doc.height / 2);
    this.replaceLayerCanvas(layer, next);
    this.checkpoint('Rotate / Zoom Layer');
  }

  eraseSelection(): void {
    const doc = this.doc;
    const layer = this.layer;
    if (!doc || !layer) return;
    if (!doc.selection) {
      layer.ctx.clearRect(0, 0, doc.width, doc.height);
    } else {
      const image = layer.ctx.getImageData(0, 0, doc.width, doc.height);
      for (let i = 0; i < doc.selection.length; i++) if (doc.selection[i] > 0) image.data[i * 4 + 3] = 0;
      layer.ctx.putImageData(image, 0, 0);
    }
    this.checkpoint('Erase Selection');
  }

  fillSelection(): void {
    const doc = this.doc;
    const layer = this.layer;
    if (!doc || !layer) return;
    if (!doc.selection) {
      this.toast('Select an area to fill.');
      return;
    }
    const color = rgba(this.primary, 255);
    const image = layer.ctx.getImageData(0, 0, doc.width, doc.height);
    for (let i = 0; i < doc.selection.length; i++) {
      if (doc.selection[i] === 0) continue;
      const o = i * 4;
      image.data[o] = color.r;
      image.data[o + 1] = color.g;
      image.data[o + 2] = color.b;
      image.data[o + 3] = color.a;
    }
    layer.ctx.putImageData(image, 0, 0);
    this.checkpoint('Fill Selection');
  }

  copy(merged: boolean): HTMLCanvasElement | null {
    const doc = this.doc;
    const layer = this.layer;
    if (!doc || !layer) return null;
    const source = merged ? this.composite() : layer.canvas;
    const bounds = doc.selection ? boundsOf(doc.selection, doc.width, doc.height) : { x: 0, y: 0, w: doc.width, h: doc.height };
    if (!bounds) return null;
    const canvas = document.createElement('canvas');
    canvas.width = bounds.w;
    canvas.height = bounds.h;
    const ctx = context2d(canvas);
    ctx.drawImage(source, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, bounds.w, bounds.h);
    if (doc.selection) {
      const image = ctx.getImageData(0, 0, bounds.w, bounds.h);
      for (let y = 0; y < bounds.h; y++) {
        for (let x = 0; x < bounds.w; x++) {
          if (doc.selection[(y + bounds.y) * doc.width + x + bounds.x] === 0) image.data[(y * bounds.w + x) * 4 + 3] = 0;
        }
      }
      ctx.putImageData(image, 0, 0);
    }
    this.clipboard = canvas;
    return canvas;
  }

  pasteCanvas(source: CanvasImageSource & { width: number; height: number }, destination: 'layer' | 'new-layer' | 'new-image'): void {
    if (destination === 'new-image') {
      const doc = this.blank(source.width, source.height, 'Pasted');
      this.docs.push(doc);
      this.index = this.docs.length - 1;
      const layer = this.makeLayer('Background', true, 100);
      layer.ctx.drawImage(source, 0, 0);
      doc.layers = [layer];
      this.docs.pop();
      this.tool = 'move-pixels';
      this.finishNew(doc, 'Paste Into New Image');
      return;
    }
    const doc = this.doc;
    if (!doc) return;
    const current = doc;
    let drawWidth = source.width;
    let drawHeight = source.height;
    const fitted = source.width > current.width || source.height > current.height;
    if (fitted) {
      const scale = Math.min(current.width / source.width, current.height / source.height);
      drawWidth = Math.max(1, Math.round(source.width * scale));
      drawHeight = Math.max(1, Math.round(source.height * scale));
    }
    const origin = !fitted && current.selection ? boundsOf(current.selection, current.width, current.height) : null;
    const x = fitted ? Math.round((current.width - drawWidth) / 2) : origin?.x ?? 0;
    const y = fitted ? Math.round((current.height - drawHeight) / 2) : origin?.y ?? 0;
    if (destination === 'new-layer') this.addLayer();
    const layer = this.layer;
    if (!layer) return;
    layer.ctx.imageSmoothingEnabled = true;
    layer.ctx.drawImage(source, x, y, drawWidth, drawHeight);
    const mask = new Uint8Array(current.width * current.height);
    const right = Math.min(current.width, x + drawWidth);
    const bottom = Math.min(current.height, y + drawHeight);
    for (let py = y; py < bottom; py++) for (let px = x; px < right; px++) mask[py * current.width + px] = 255;
    current.selection = mask;
    this.rebuildEdges();
    this.tool = 'move-pixels';
    if (destination === 'layer') this.checkpoint('Paste');
    else this.checkpoint('Paste Into New Layer');
  }

  composite(matte?: string): HTMLCanvasElement {
    const doc = this.doc;
    if (!doc) throw new Error('No image is open.');
    const canvas = document.createElement('canvas');
    canvas.width = doc.width;
    canvas.height = doc.height;
    const ctx = context2d(canvas);
    if (matte) {
      ctx.fillStyle = matte;
      ctx.fillRect(0, 0, doc.width, doc.height);
    }
    for (const layer of doc.layers) {
      if (!layer.visible) continue;
      ctx.globalAlpha = layer.opacity / 100;
      ctx.drawImage(layer.canvas, 0, 0);
    }
    ctx.globalAlpha = 1;
    return canvas;
  }

  async exportImage(mime: string, filename: string): Promise<void> {
    const doc = this.doc;
    if (!doc) return;
    this.cancelFloat();
    const matte = mime === 'image/jpeg' || mime === 'image/bmp' ? '#ffffff' : undefined;
    const canvas = this.composite(matte);
    const blob = mime === 'image/bmp'
      ? encodeBmp(context2d(canvas).getImageData(0, 0, canvas.width, canvas.height))
      : await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(value => (value ? resolve(value) : reject(new Error('Export failed.'))), mime, mime === 'image/png' ? undefined : 0.92);
      });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    doc.fileBase = filename.replace(/\.[^.]+$/, '') || doc.fileBase;
    doc.fileMime = mime;
    doc.name = filename;
    doc.savedCursor = doc.cursor;
    this.notify();
  }

  scheduleSave(): void {
    if (this.restoring) return;
    const token = ++this.saveToken;
    window.clearTimeout(this.saveTimer);
    this.onSave?.('Saving locally…');
    this.saveTimer = window.setTimeout(() => {
      this.saveQueue = this.saveQueue.then(() => this.persist(token));
    }, 400);
  }

  private async persist(token: number): Promise<void> {
    try {
      if (token !== this.saveToken) return;
      const documents = [];
      for (const doc of this.docs) {
        const layers = [];
        for (const layer of doc.layers) {
          layers.push({ name: layer.name, visible: layer.visible, opacity: layer.opacity, png: await canvasToPng(layer.canvas) });
        }
        documents.push({
          name: doc.name,
          width: doc.width,
          height: doc.height,
          active: doc.active,
          zoom: doc.zoom,
          selection: doc.selection,
          layers,
        });
      }
      if (token !== this.saveToken) return;
      const record: SessionRecord = {
        version: 1,
        active: Math.max(0, this.index),
        primary: this.primary,
        secondary: this.secondary,
        palette: this.palette,
        tool: this.tool,
        documents,
      };
      await saveSession(record);
      if (token !== this.saveToken) return;
      this.saveSerial++;
      this.onSave?.(documents.length ? 'Saved locally' : 'Local session cleared');
    } catch {
      this.onSave?.('Could not save locally');
    }
  }

  async restore(): Promise<boolean> {
    this.restoring = true;
    try {
      const session = await loadSession();
      if (!session?.documents.length) return false;
      this.primary = session.primary || this.primary;
      this.secondary = session.secondary || this.secondary;
      this.palette = session.palette?.length ? session.palette : this.palette;
      this.tool = session.tool || this.tool;
      this.docs = [];
      for (const stored of session.documents) {
        const doc = this.blank(stored.width, stored.height, stored.name);
        this.docs.push(doc);
        this.index = this.docs.length - 1;
        doc.zoom = stored.zoom || 1;
        doc.selection = stored.selection;
        doc.layers = [];
        for (const layer of stored.layers) {
          const bitmap = await createImageBitmap(layer.png);
          const created = this.makeLayer(layer.name, layer.visible, layer.opacity);
          created.canvas.width = stored.width;
          created.canvas.height = stored.height;
          created.ctx = context2d(created.canvas);
          created.ctx.drawImage(bitmap, 0, 0, stored.width, stored.height);
          bitmap.close();
          doc.layers.push(created);
        }
        doc.active = Math.max(0, Math.min(stored.active, doc.layers.length - 1));
        doc.snapshots = [this.capture()];
        doc.labels = ['Restored'];
        doc.cursor = 0;
      }
      this.index = Math.max(0, Math.min(session.active, this.docs.length - 1));
      this.syncSize();
      this.rebuildEdges();
      this.renderScene();
      this.notify();
      this.toast('Restored your last image from this browser.');
      return true;
    } catch {
      return false;
    } finally {
      this.restoring = false;
    }
  }
}
