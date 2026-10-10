import type { ToolId } from './types.ts';

const DB_NAME = 'pinta-web';
const STORE = 'session';

export interface StoredLayer {
  name: string;
  visible: boolean;
  opacity: number;
  blend?: string;
  clip?: boolean;
  tag?: string | null;
  parent?: number | null;
  alphaLock?: boolean;
  png: Blob;
  mask?: Blob;
}

export interface StoredGroup {
  id: number;
  name: string;
  visible: boolean;
  collapsed: boolean;
  tag: string | null;
  parent: number | null;
}

export interface StoredDocument {
  name: string;
  width: number;
  height: number;
  active: number;
  zoom: number;
  selection: Uint8Array | null;
  groups?: StoredGroup[];
  layers: StoredLayer[];
}

export interface SessionRecord {
  version: 1;
  active: number;
  primary: string;
  secondary: string;
  palette: string[];
  tool: ToolId;
  documents: StoredDocument[];
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadSession(): Promise<SessionRecord | null> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get('current');
      request.onsuccess = () => resolve((request.result as SessionRecord | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function saveSession(record: SessionRecord): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(record, 'current');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function clearSession(): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE, 'readwrite').objectStore(STORE).delete('current');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Could not store the image.'))), 'image/png');
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function encodeBmp(image: ImageData): Blob {
  const width = image.width;
  const height = image.height;
  const row = (width * 3 + 3) & ~3;
  const pixels = row * height;
  const buffer = new ArrayBuffer(54 + pixels);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  bytes[0] = 0x42;
  bytes[1] = 0x4d;
  view.setUint32(2, 54 + pixels, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, pixels, true);
  const source = image.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from = ((height - 1 - y) * width + x) * 4;
      const alpha = source[from + 3] / 255;
      const at = 54 + y * row + x * 3;
      bytes[at] = source[from + 2] * alpha + 255 * (1 - alpha);
      bytes[at + 1] = source[from + 1] * alpha + 255 * (1 - alpha);
      bytes[at + 2] = source[from] * alpha + 255 * (1 - alpha);
    }
  }
  return new Blob([buffer], { type: 'image/bmp' });
}

export function parsePalette(text: string): string[] {
  const colors: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';')) continue;
    const hex = trimmed.replace('#', '');
    if (/^[0-9a-fA-F]{6}$/.test(hex)) colors.push(`#${hex.toLowerCase()}`);
    else if (/^[0-9a-fA-F]{8}$/.test(hex)) colors.push(`#${hex.slice(2).toLowerCase()}`);
  }
  return colors;
}

export function serializePalette(colors: string[]): string {
  const lines = ['; paint.net Palette File', '; Exported from Pinta'];
  for (const color of colors) lines.push(`FF${color.replace('#', '').toUpperCase()}`);
  return `${lines.join('\n')}\n`;
}
