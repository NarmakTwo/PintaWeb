export type ToolId =
  | 'move-pixels' | 'move-selection' | 'zoom' | 'pan'
  | 'rect-select' | 'ellipse-select' | 'lasso' | 'lasso-draw' | 'wand'
  | 'brush' | 'pen' | 'pencil' | 'eraser' | 'bucket' | 'gradient' | 'picker' | 'text'
  | 'line' | 'rectangle' | 'rounded' | 'ellipse'
  | 'lighten' | 'darken' | 'dither' | 'recolor' | 'random';

export type BrushId = 'plain' | 'circle' | 'squares' | 'splatter' | 'slash' | 'grid';
export type ShapeStyle = 'outline' | 'fill' | 'both';
export type SelectMode = 'replace' | 'union' | 'exclude' | 'xor' | 'intersect';
export type GradientKind = 'linear' | 'radial' | 'diamond' | 'conical';
export type Unit = 'px' | 'in' | 'cm';

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MAX_PIXELS = 8_000_000;

export const DEFAULT_PALETTE = [
  '#000000', '#404040', '#808080', '#c0c0c0', '#ffffff', '#800000', '#ff0000', '#ff8080',
  '#800080', '#ff00ff', '#ffa500', '#ffff00', '#808000', '#00ff00', '#008000', '#00ffff',
  '#008080', '#0000ff', '#000080', '#8b4513', '#d2691e', '#f5deb3', '#2f4f4f', '#1e90ff',
  '#4169e1', '#9370db', '#ff69b4', '#cd853f', '#6b8e23', '#20b2aa', '#778899', '#a52a2a',
];

export const TOOLS: { id: ToolId; label: string; shortcut: string; icon: string; hint: string }[] = [
  { id: 'move-pixels', label: 'Move Selected Pixels', shortcut: 'M', icon: 'move', hint: 'Drag to move the selection. Ctrl+drag scales it freely and Alt+drag rotates it. Hold Shift during either gesture to scale uniformly or rotate in 15° steps, measured from the image before the drag.' },
  { id: 'move-selection', label: 'Move Selection', shortcut: 'M', icon: 'move-diagonal', hint: 'Drag to move the selection outline. Ctrl+drag scales it and Alt+drag rotates it. Hold Shift during either gesture to scale uniformly or rotate in 15° steps, measured from the selection before the drag.' },
  { id: 'zoom', label: 'Zoom', shortcut: 'Z', icon: 'zoom-in', hint: 'Click to zoom in. Alt-click or right-click to zoom out. Drag to zoom into a rectangle.' },
  { id: 'pan', label: 'Pan', shortcut: 'H', icon: 'hand', hint: 'Drag to move around the canvas. Hold Space to pan with any tool. Two fingers pan, and a pinch zooms.' },
  { id: 'rect-select', label: 'Rectangle Select', shortcut: 'S', icon: 'square-dashed', hint: 'Drag a rectangular selection. Hold Shift for a square.' },
  { id: 'ellipse-select', label: 'Ellipse Select', shortcut: 'S', icon: 'circle-dashed', hint: 'Drag an elliptical selection. Hold Shift for a circle.' },
  { id: 'lasso', label: 'Lasso Select', shortcut: 'S', icon: 'lasso-select', hint: 'Draw around the area you want to select. A loop that crosses itself leaves the overlap unselected. The outline marches while you draw.' },
  { id: 'lasso-draw', label: 'Lasso', shortcut: 'S', icon: 'lasso', hint: 'Draw a closed shape. A loop that crosses itself leaves the overlap unfilled. Fill and outline uses the secondary color for the outline.' },
  { id: 'wand', label: 'Magic Wand', shortcut: 'S', icon: 'wand', hint: 'Click a color to select the connected area. Raise tolerance to include similar colors.' },
  { id: 'brush', label: 'Paintbrush', shortcut: 'B', icon: 'brush', hint: 'Draw with the primary color. Right-click uses the secondary color. Fast strokes are smoothed.' },
  { id: 'pen', label: 'Fountain Pen', shortcut: 'B', icon: 'pen', hint: 'A slow stroke stays thick. A fast stroke thins down. Right-click uses the secondary color.' },
  { id: 'random', label: 'Random Brush', shortcut: 'B', icon: 'random-brush', hint: 'Shift each pixel’s color by a random amount from the range. Rate 0 changes a pixel once. Rate 10 can change it 10 times a second.' },
  { id: 'pencil', label: 'Pencil', shortcut: 'P', icon: 'pencil', hint: 'Draw hard-edged pixels. Right-click uses the secondary color.' },
  { id: 'eraser', label: 'Eraser', shortcut: 'E', icon: 'eraser', hint: 'Erase to transparent. Right-click paints the secondary color.' },
  { id: 'bucket', label: 'Paint Bucket', shortcut: 'F', icon: 'paint-bucket', hint: 'Fill a connected area of similar color.' },
  { id: 'gradient', label: 'Gradient', shortcut: 'G', icon: 'blend', hint: 'Drag to blend from the primary color to the secondary color.' },
  { id: 'picker', label: 'Color Picker', shortcut: 'K', icon: 'pipette', hint: 'Click to choose the primary color and its transparency. Right-click chooses the secondary color.' },
  { id: 'text', label: 'Text', shortcut: 'T', icon: 'type', hint: 'Click to place text. Enter commits it. Shift+Enter adds a line.' },
  { id: 'line', label: 'Line/Curve', shortcut: 'O', icon: 'spline', hint: 'Drag a straight line. In curve mode, move after releasing to bend it, then click to commit.' },
  { id: 'rectangle', label: 'Rectangle', shortcut: 'O', icon: 'square', hint: 'Drag a rectangle. Hold Shift for a square.' },
  { id: 'rounded', label: 'Rounded Rectangle', shortcut: 'O', icon: 'rectangle-horizontal', hint: 'Drag a rounded rectangle. Hold Shift for a square.' },
  { id: 'ellipse', label: 'Ellipse', shortcut: 'O', icon: 'circle', hint: 'Drag an ellipse. Hold Shift for a circle.' },
  { id: 'lighten', label: 'Lighten', shortcut: 'L', icon: 'sun', hint: 'Paint to lighten existing colors. Amount 100% turns a color white. Rate 0 changes each pixel once.' },
  { id: 'darken', label: 'Darken', shortcut: 'D', icon: 'moon', hint: 'Paint to darken existing colors. Amount 100% turns a color black. Rate 0 changes each pixel once.' },
  { id: 'dither', label: 'Dither', shortcut: 'D', icon: 'grid-3x3', hint: 'Paint a stippled pattern. Right-click paints the opposite cells in the secondary color. Hold both buttons for both colors.' },
  { id: 'recolor', label: 'Recolor', shortcut: 'R', icon: 'paintbrush', hint: 'Paint over a color to replace it. Turn on Global to replace that color everywhere on the layer.' },
];

const SHORTCUT_GROUPS: Record<string, ToolId[]> = {
  m: ['move-pixels', 'move-selection'],
  z: ['zoom'],
  h: ['pan'],
  s: ['rect-select', 'ellipse-select', 'lasso', 'lasso-draw', 'wand'],
  b: ['brush', 'pen', 'random'],
  p: ['pencil'],
  e: ['eraser'],
  f: ['bucket'],
  g: ['gradient'],
  k: ['picker'],
  t: ['text'],
  o: ['line', 'rectangle', 'rounded', 'ellipse'],
  l: ['lighten'],
  d: ['darken', 'dither'],
  r: ['recolor'],
};

export function toolFromShortcut(key: string, current: ToolId): ToolId | null {
  const group = SHORTCUT_GROUPS[key.toLowerCase()];
  if (!group) return null;
  const index = group.indexOf(current);
  return group[(index + 1) % group.length];
}

export function boundsOf(mask: Uint8Array, width: number, height: number): Bounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] === 0) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export function shiftMask(mask: Uint8Array, width: number, height: number, dx: number, dy: number): Uint8Array {
  const next = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const ny = y + dy;
    if (ny < 0 || ny >= height) continue;
    for (let x = 0; x < width; x++) {
      const nx = x + dx;
      if (nx < 0 || nx >= width) continue;
      next[ny * width + nx] = mask[y * width + x];
    }
  }
  return next;
}

export function combineMask(previous: Uint8Array | null, next: Uint8Array, mode: SelectMode): Uint8Array | null {
  if (!previous || mode === 'replace') return next.some(value => value > 0) ? next : null;
  const out = new Uint8Array(next.length);
  for (let i = 0; i < out.length; i++) {
    if (mode === 'union') out[i] = Math.max(previous[i] ?? 0, next[i]);
    else if (mode === 'intersect') out[i] = Math.min(previous[i] ?? 0, next[i]);
    else if (mode === 'exclude') out[i] = next[i] > 0 ? 0 : previous[i] ?? 0;
    else out[i] = ((previous[i] ?? 0) > 127) === (next[i] > 127) ? 0 : 255;
  }
  return out.some(value => value > 0) ? out : null;
}

export function modeFromPointer(fallback: SelectMode, event: PointerEvent): SelectMode {
  if (event.altKey && event.button === 0) return 'intersect';
  if ((event.ctrlKey || event.metaKey) && event.button === 2) return 'xor';
  if (event.button === 2) return 'exclude';
  if (event.ctrlKey || event.metaKey) return 'union';
  return fallback;
}
