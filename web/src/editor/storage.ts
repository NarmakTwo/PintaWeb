import type { ToolId } from './types.ts';

const DB_NAME = 'pinta-web';
const STORE = 'session';
const LAYERS_STORE = 'layers';

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

export interface StoredLayerMeta {
  id: number;
  name: string;
  visible: boolean;
  opacity: number;
  blend?: string;
  clip?: boolean;
  tag?: string | null;
  parent?: number | null;
  alphaLock?: boolean;
  hasMask: boolean;
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
  id?: string;
  name: string;
  width: number;
  height: number;
  active: number;
  zoom: number;
  selection: Uint8Array | null;
  groups?: StoredGroup[];
  layers: StoredLayer[];
}

export interface StoredDocumentMeta {
  id: string;
  name: string;
  width: number;
  height: number;
  active: number;
  zoom: number;
  selection: Uint8Array | null;
  groups?: StoredGroup[];
  layers: StoredLayerMeta[];
}

/** Legacy single-record session with inline PNG blobs. */
export interface SessionRecordV1 {
  version: 1;
  active: number;
  primary: string;
  secondary: string;
  palette: string[];
  tool: ToolId;
  documents: StoredDocument[];
}

/** Split session: metadata here, layer pixels in the `layers` store. */
export interface SessionRecordV2 {
  version: 2;
  generation: number;
  active: number;
  primary: string;
  secondary: string;
  palette: string[];
  tool: ToolId;
  documents: StoredDocumentMeta[];
}

export type SessionRecord = SessionRecordV1 | SessionRecordV2;

export function layerPixelsKey(docId: string, layerId: number): string {
  return `${docId}:${layerId}:pixels`;
}

export function layerMaskKey(docId: string, layerId: number): string {
  return `${docId}:${layerId}:mask`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains('brushes')) db.createObjectStore('brushes');
      if (!db.objectStoreNames.contains(LAYERS_STORE)) db.createObjectStore(LAYERS_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadBrushRecord(): Promise<unknown> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('brushes').objectStore('brushes').get('library');
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function saveBrushRecord(record: unknown): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction('brushes', 'readwrite').objectStore('brushes').put(record, 'library');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
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

export async function putLayerBlob(key: string, blob: Blob): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(LAYERS_STORE, 'readwrite').objectStore(LAYERS_STORE).put(blob, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function getLayerBlob(key: string): Promise<Blob | null> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(LAYERS_STORE).objectStore(LAYERS_STORE).get(key);
      request.onsuccess = () => resolve((request.result as Blob | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function deleteLayerBlob(key: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(LAYERS_STORE, 'readwrite').objectStore(LAYERS_STORE).delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function deleteLayerBlobsForDoc(docId: string): Promise<void> {
  const db = await openDb();
  try {
    const prefix = `${docId}:`;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(LAYERS_STORE, 'readwrite');
      const store = tx.objectStore(LAYERS_STORE);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (typeof cursor.key === 'string' && cursor.key.startsWith(prefix)) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function listLayerKeys(): Promise<string[]> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(LAYERS_STORE).objectStore(LAYERS_STORE).getAllKeys();
      request.onsuccess = () => resolve((request.result as IDBValidKey[]).map(String));
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function garbageCollectLayerKeys(keep: Set<string>): Promise<void> {
  const keys = await listLayerKeys();
  for (const key of keys) {
    if (!keep.has(key)) await deleteLayerBlob(key);
  }
}

const HANDLE_KEY = 'handles';

export async function loadFileHandles(): Promise<Record<string, FileSystemFileHandle>> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get(HANDLE_KEY);
      request.onsuccess = () => {
        const value = request.result;
        resolve(value && typeof value === 'object' ? value as Record<string, FileSystemFileHandle> : {});
      };
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function storeFileHandles(handles: Record<string, FileSystemFileHandle>): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(handles, HANDLE_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function saveFileHandle(id: string, handle: FileSystemFileHandle): Promise<void> {
  const handles = await loadFileHandles();
  handles[id] = handle;
  await storeFileHandles(handles);
}

export async function forgetFileHandle(id: string): Promise<void> {
  const handles = await loadFileHandles();
  if (!handles[id]) return;
  delete handles[id];
  await storeFileHandles(handles);
}

export async function clearFileHandles(): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(HANDLE_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function clearDatabase(): Promise<void> {
  const db = await openDb();
  try {
    const names = [...db.objectStoreNames];
    if (!names.length) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(names, 'readwrite');
      for (const name of names) tx.objectStore(name).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function deleteDatabase(): Promise<void> {
  return new Promise(resolve => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

export async function clearSession(): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE, LAYERS_STORE], 'readwrite');
      tx.objectStore(STORE).delete('current');
      tx.objectStore(LAYERS_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
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
