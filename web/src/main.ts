import { createIcons, icons } from 'lucide';
import './style.css';

type Tool = 'brush' | 'eraser' | 'line' | 'rectangle' | 'ellipse';
type Point = { x: number; y: number };
type Snapshot = ImageData;

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element as T;
};

const canvas = byId<HTMLCanvasElement>('image-canvas');
const preview = byId<HTMLCanvasElement>('preview-canvas');
const context = canvas.getContext('2d', { willReadFrequently: true })!;
const previewContext = preview.getContext('2d')!;
const paper = byId<HTMLDivElement>('paper');
const stage = byId<HTMLDivElement>('stage');
const paperWrap = byId<HTMLDivElement>('paper-wrap');
const emptyState = byId<HTMLDivElement>('empty-state');
const fileInput = byId<HTMLInputElement>('file-input');
const nameLabel = byId<HTMLDivElement>('document-name');
const dimensionsLabel = byId<HTMLSpanElement>('image-dimensions');
const zoomLabel = byId<HTMLButtonElement>('zoom-fit');
const colorPicker = byId<HTMLInputElement>('color-picker');
const brushSize = byId<HTMLInputElement>('brush-size');
const sizeOutput = byId<HTMLOutputElement>('brush-size-value');
const undoButton = byId<HTMLButtonElement>('undo');
const redoButton = byId<HTMLButtonElement>('redo');
const exportDialog = byId<HTMLDialogElement>('export-dialog');
const exportForm = byId<HTMLFormElement>('export-form');
const toastElement = byId<HTMLDivElement>('toast');

const MAX_IMAGE_PIXELS = 24_000_000;
const HISTORY_LIMIT = 20;
const undoStack: Snapshot[] = [];
const redoStack: Snapshot[] = [];
let tool: Tool = 'brush';
let zoom = 1;
let color = colorPicker.value;
let drawing = false;
let startPoint: Point | null = null;
let lastPoint: Point | null = null;
let beforeStroke: Snapshot | null = null;
let fileName = 'pinta-image';
let toastTimer = 0;

createIcons({ icons });

function showToast(message: string): void {
  toastElement.textContent = message;
  toastElement.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastElement.classList.remove('visible'), 2600);
}

function updateHistoryButtons(): void {
  undoButton.disabled = undoStack.length === 0;
  redoButton.disabled = redoStack.length === 0;
}

function takeSnapshot(): Snapshot {
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function recordSnapshot(): void {
  undoStack.push(takeSnapshot());
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack.length = 0;
  updateHistoryButtons();
}

function restoreSnapshot(snapshot: Snapshot): void {
  context.putImageData(snapshot, 0, 0);
  previewContext.clearRect(0, 0, preview.width, preview.height);
}

function setZoom(value: number): void {
  zoom = Math.max(0.08, Math.min(4, value));
  paper.style.width = `${canvas.width * zoom}px`;
  paper.style.height = `${canvas.height * zoom}px`;
  paper.style.setProperty('--zoom', String(zoom));
  zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
}

function fitCanvas(): void {
  if (!canvas.width || !canvas.height) return;
  const availableWidth = Math.max(80, stage.clientWidth - 100);
  const availableHeight = Math.max(80, stage.clientHeight - 100);
  setZoom(Math.min(1, availableWidth / canvas.width, availableHeight / canvas.height));
}

function updateDocument(width: number, height: number, name: string): void {
  canvas.width = width;
  canvas.height = height;
  preview.width = width;
  preview.height = height;
  fileName = name.replace(/\.[^.]+$/, '') || 'pinta-image';
  nameLabel.textContent = name;
  dimensionsLabel.textContent = `${width.toLocaleString()} × ${height.toLocaleString()} px`;
  emptyState.hidden = true;
  paperWrap.hidden = false;
  undoStack.length = 0;
  redoStack.length = 0;
  updateHistoryButtons();
  fitCanvas();
}

function openFilePicker(): void {
  fileInput.value = '';
  fileInput.click();
}

async function loadFile(file: File): Promise<void> {
  if (!file.type.startsWith('image/') && !/\.(bmp|gif|ico|jpe?g|png|webp)$/i.test(file.name)) {
    showToast('Choose a supported image file.');
    return;
  }

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) {
      bitmap.close();
      showToast('This image is too large to edit safely in a browser.');
      return;
    }
    updateDocument(bitmap.width, bitmap.height, file.name);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    fitCanvas();
  } catch {
    showToast('This image could not be opened by your browser.');
  }
}

function pointFromEvent(event: PointerEvent): Point {
  const bounds = paper.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(canvas.width, (event.clientX - bounds.left) / zoom)),
    y: Math.max(0, Math.min(canvas.height, (event.clientY - bounds.top) / zoom)),
  };
}

function drawSegment(from: Point, to: Point): void {
  context.save();
  context.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
  context.strokeStyle = color;
  context.lineWidth = Number(brushSize.value);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
  context.restore();
}

function drawShape(target: CanvasRenderingContext2D, from: Point, to: Point): void {
  target.save();
  target.strokeStyle = color;
  target.lineWidth = Number(brushSize.value);
  target.lineCap = 'round';
  target.lineJoin = 'round';
  target.beginPath();
  if (tool === 'line') {
    target.moveTo(from.x, from.y);
    target.lineTo(to.x, to.y);
  } else if (tool === 'rectangle') {
    target.rect(from.x, from.y, to.x - from.x, to.y - from.y);
  } else {
    const radiusX = Math.abs(to.x - from.x) / 2;
    const radiusY = Math.abs(to.y - from.y) / 2;
    target.ellipse(from.x + (to.x - from.x) / 2, from.y + (to.y - from.y) / 2, Math.max(radiusX, 0.5), Math.max(radiusY, 0.5), 0, 0, Math.PI * 2);
  }
  target.stroke();
  target.restore();
}

function updateToolContext(): void {
  const labels: Record<Tool, string> = { brush: 'Brush', eraser: 'Eraser', line: 'Line', rectangle: 'Rectangle', ellipse: 'Ellipse' };
  byId<HTMLDivElement>('tool-context').innerHTML = `${labels[tool]} <span>•</span> ${brushSize.value} px`;
}

function selectTool(nextTool: Tool): void {
  tool = nextTool;
  document.querySelectorAll<HTMLButtonElement>('.tool-button').forEach(button => {
    button.classList.toggle('selected', button.dataset.tool === nextTool);
  });
  paper.style.cursor = nextTool === 'eraser' ? 'cell' : 'crosshair';
  updateToolContext();
}

paper.addEventListener('pointerdown', event => {
  if (!canvas.width || event.button !== 0) return;
  event.preventDefault();
  paper.setPointerCapture(event.pointerId);
  drawing = true;
  startPoint = pointFromEvent(event);
  lastPoint = startPoint;
  beforeStroke = takeSnapshot();
  if (tool === 'brush' || tool === 'eraser') drawSegment(startPoint, { x: startPoint.x + 0.01, y: startPoint.y + 0.01 });
});

paper.addEventListener('pointermove', event => {
  if (!drawing || !startPoint || !lastPoint) return;
  const point = pointFromEvent(event);
  if (tool === 'brush' || tool === 'eraser') {
    drawSegment(lastPoint, point);
    lastPoint = point;
  } else {
    previewContext.clearRect(0, 0, preview.width, preview.height);
    drawShape(previewContext, startPoint, point);
  }
});

function finishDrawing(event?: PointerEvent): void {
  if (!drawing || !startPoint || !beforeStroke) return;
  const endPoint = event ? pointFromEvent(event) : lastPoint ?? startPoint;
  if (tool === 'line' || tool === 'rectangle' || tool === 'ellipse') {
    previewContext.clearRect(0, 0, preview.width, preview.height);
    drawShape(previewContext, startPoint, endPoint);
    context.drawImage(preview, 0, 0);
    previewContext.clearRect(0, 0, preview.width, preview.height);
  }
  undoStack.push(beforeStroke);
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack.length = 0;
  updateHistoryButtons();
  drawing = false;
  startPoint = null;
  lastPoint = null;
  beforeStroke = null;
}

paper.addEventListener('pointerup', event => finishDrawing(event));
paper.addEventListener('pointercancel', () => finishDrawing());
paper.addEventListener('lostpointercapture', () => finishDrawing());

byId<HTMLButtonElement>('undo').addEventListener('click', () => {
  if (!undoStack.length) return;
  redoStack.push(takeSnapshot());
  restoreSnapshot(undoStack.pop()!);
  updateHistoryButtons();
});

byId<HTMLButtonElement>('redo').addEventListener('click', () => {
  if (!redoStack.length) return;
  undoStack.push(takeSnapshot());
  restoreSnapshot(redoStack.pop()!);
  updateHistoryButtons();
});

document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(button => {
  button.addEventListener('click', () => selectTool(button.dataset.tool as Tool));
});

colorPicker.addEventListener('input', () => {
  color = colorPicker.value;
  byId<HTMLSpanElement>('color-preview').style.backgroundColor = color;
});

document.querySelectorAll<HTMLButtonElement>('.mini-swatch').forEach(button => {
  button.addEventListener('click', () => {
    colorPicker.value = button.dataset.color!;
    colorPicker.dispatchEvent(new Event('input'));
  });
});

brushSize.addEventListener('input', () => {
  sizeOutput.value = brushSize.value;
  updateToolContext();
});

byId<HTMLButtonElement>('open-file').addEventListener('click', openFilePicker);
byId<HTMLButtonElement>('empty-open').addEventListener('click', openFilePicker);
fileInput.addEventListener('change', () => {
  if (fileInput.files?.[0]) void loadFile(fileInput.files[0]);
});

byId<HTMLButtonElement>('new-image').addEventListener('click', () => byId<HTMLDialogElement>('new-dialog').showModal());
byId<HTMLFormElement>('new-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const width = Number((form.elements.namedItem('width') as HTMLInputElement).value);
  const height = Number((form.elements.namedItem('height') as HTMLInputElement).value);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_IMAGE_PIXELS) {
    showToast('Choose dimensions up to 24 megapixels.');
    return;
  }
  updateDocument(width, height, 'Untitled image');
  if ((form.elements.namedItem('background') as HTMLSelectElement).value === 'white') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
  }
  byId<HTMLDialogElement>('new-dialog').close();
});

const exportFormat = exportForm.elements.namedItem('format') as HTMLSelectElement;
const exportName = exportForm.elements.namedItem('filename') as HTMLInputElement;
function updateExportFormat(): void {
  const extension = exportFormat.value === 'image/jpeg' ? 'jpg' : exportFormat.value === 'image/webp' ? 'webp' : 'png';
  byId<HTMLSpanElement>('export-extension').textContent = `.${extension}`;
  byId<HTMLParagraphElement>('format-note').textContent = exportFormat.value === 'image/jpeg'
    ? 'Transparent areas will be filled with white in JPEG.'
    : exportFormat.value === 'image/webp'
      ? 'WebP supports transparency in modern browsers.'
      : 'PNG preserves transparency and image detail.';
}

byId<HTMLButtonElement>('save-file').addEventListener('click', () => {
  if (!canvas.width) {
    showToast('Open an image or create a canvas first.');
    return;
  }
  exportName.value = fileName;
  updateExportFormat();
  exportDialog.showModal();
});

exportFormat.addEventListener('change', updateExportFormat);
exportForm.addEventListener('submit', event => {
  event.preventDefault();
  if (!canvas.width) return;
  const mime = exportFormat.value;
  const extension = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const exportContext = exportCanvas.getContext('2d')!;
  if (mime === 'image/jpeg') {
    exportContext.fillStyle = '#ffffff';
    exportContext.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  }
  exportContext.drawImage(canvas, 0, 0);
  exportCanvas.toBlob(blob => {
    if (!blob) {
      showToast(`Your browser couldn't export this image as ${extension.toUpperCase()}.`);
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const requestedName = exportName.value.trim().replace(/[\\/:*?"<>|]+/g, '-');
    link.download = `${requestedName || 'pinta-image'}.${extension}`;
    link.click();
    URL.revokeObjectURL(url);
    exportDialog.close();
    fileName = requestedName || 'pinta-image';
    showToast(`Downloaded ${link.download}`);
  }, mime, mime === 'image/jpeg' || mime === 'image/webp' ? 0.92 : undefined);
});

stage.addEventListener('dragover', event => {
  event.preventDefault();
  stage.classList.add('drag-over');
});
stage.addEventListener('dragleave', event => {
  if (!stage.contains(event.relatedTarget as Node | null)) stage.classList.remove('drag-over');
});
stage.addEventListener('drop', event => {
  event.preventDefault();
  stage.classList.remove('drag-over');
  const file = event.dataTransfer?.files[0];
  if (file) void loadFile(file);
});

byId<HTMLButtonElement>('zoom-in').addEventListener('click', () => setZoom(zoom * 1.2));
byId<HTMLButtonElement>('zoom-out').addEventListener('click', () => setZoom(zoom / 1.2));
zoomLabel.addEventListener('click', fitCanvas);
window.addEventListener('resize', () => {
  if (!paperWrap.hidden && zoom < 1) fitCanvas();
});

window.addEventListener('keydown', event => {
  const target = event.target;
  const isEditing = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') {
    event.preventDefault();
    openFilePicker();
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    byId<HTMLButtonElement>('save-file').click();
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    byId<HTMLButtonElement>(event.shiftKey ? 'redo' : 'undo').click();
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault();
    byId<HTMLButtonElement>('redo').click();
  } else if (!isEditing && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const shortcuts: Record<string, Tool> = { b: 'brush', e: 'eraser', l: 'line', r: 'rectangle', o: 'ellipse' };
    const nextTool = shortcuts[event.key.toLowerCase()];
    if (nextTool) selectTool(nextTool);
  }
});

byId<HTMLSpanElement>('color-preview').style.backgroundColor = color;
updateToolContext();