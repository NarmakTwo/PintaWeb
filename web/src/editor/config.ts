import { confirmChoice } from './customize.ts';
import type { Editor } from './document.ts';
import { exportBrushRecord, importBrushRecord, refreshBrushLibrary } from './brushes.ts';
import { adoptLayout, getLayout } from './layout.ts';
import { clearDatabase, deleteDatabase, downloadBlob } from './storage.ts';
import { unzip, zipStore } from './zip.ts';

export interface ConfigAppearance {
  theme: 'dark' | 'light' | null;
  brushCursor: boolean;
  fileAccess: boolean;
  mixer: string | null;
}

export interface ConfigHost {
  applyAppearance(appearance: ConfigAppearance): void;
}

function text(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function json(bytes: Uint8Array | undefined): unknown {
  if (!bytes) return null;
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { return null; }
}

function configFilename(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}.pintaconfig`;
}

function stored(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

export async function exportConfig(editor: Editor): Promise<void> {
  const documents: string[] = [];
  const entries: { name: string; data: Uint8Array }[] = [];
  for (let index = 0; index < editor.docs.length; index++) {
    const archive = await editor.archiveDocument(index);
    if (!archive) continue;
    const name = `documents/${String(documents.length).padStart(2, '0')}.pinta`;
    documents.push(name);
    entries.push({ name, data: new Uint8Array(await archive.arrayBuffer()) });
  }
  const theme = stored('pinta-theme');
  entries.push(
    { name: 'manifest.json', data: text({ format: 'pintaconfig', version: 1, active: editor.index, documents }) },
    { name: 'brushes.json', data: text(exportBrushRecord()) },
    { name: 'layout.json', data: text(getLayout()) },
    { name: 'settings.json', data: text(editor.settingsRecord()) },
    { name: 'appearance.json', data: text({ theme: theme === 'dark' || theme === 'light' ? theme : null, brushCursor: stored('pinta-brush-cursor') === '1', fileAccess: stored('pinta-file-access') === '1' }) },
    { name: 'mixer.json', data: text({ image: stored('pinta-mixer') }) },
  );
  downloadBlob(zipStore(entries), configFilename());
  editor.toast('Exported the config.');
}

export async function importConfigFile(editor: Editor, file: File, host: ConfigHost): Promise<void> {
  const packed = await readConfig(file);
  if (!packed) {
    editor.toast('Could not read that config.');
    return;
  }
  const ok = await confirmChoice('Import config', 'Replace the images, brushes, and settings on this site with this file?', 'Import', 'Cancel');
  if (!ok) return;
  await importBrushRecord(packed.brushes);
  adoptLayout(packed.layout);
  editor.applySettings(packed.settings);
  await editor.installArchives(packed.documents, packed.active);
  host.applyAppearance(packed.appearance);
  refreshBrushLibrary(editor);
  editor.notify();
  editor.toast('Imported the config.');
}

async function readConfig(file: File): Promise<{ brushes: unknown; layout: unknown; settings: unknown; appearance: ConfigAppearance; documents: Uint8Array[]; active: number } | null> {
  const files = await unzip(new Uint8Array(await file.arrayBuffer()));
  const manifest = json(files.get('manifest.json')) as { format?: string; active?: number; documents?: unknown } | null;
  if (!manifest || manifest.format !== 'pintaconfig' || !Array.isArray(manifest.documents)) return null;
  const brushes = json(files.get('brushes.json')) as { presets?: unknown } | null;
  if (!brushes || !Array.isArray(brushes.presets)) return null;
  const layout = json(files.get('layout.json'));
  const settings = json(files.get('settings.json'));
  const appearanceRaw = json(files.get('appearance.json')) as { theme?: unknown; brushCursor?: unknown; fileAccess?: unknown } | null;
  const mixer = json(files.get('mixer.json')) as { image?: unknown } | null;
  const documents: Uint8Array[] = [];
  for (const name of manifest.documents) {
    if (typeof name !== 'string') continue;
    const bytes = files.get(name);
    if (bytes) documents.push(bytes);
  }
  const theme = appearanceRaw?.theme === 'dark' || appearanceRaw?.theme === 'light' ? appearanceRaw.theme : null;
  return {
    brushes,
    layout,
    settings,
    appearance: {
      theme,
      brushCursor: appearanceRaw?.brushCursor === true,
      fileAccess: appearanceRaw?.fileAccess === true,
      mixer: typeof mixer?.image === 'string' ? mixer.image : null,
    },
    documents,
    active: Number(manifest.active) || 0,
  };
}

export async function restoreDefaults(): Promise<void> {
  const ok = await confirmChoice('Restore to default', 'Delete the images, brushes, settings, and cached files saved in this browser?', 'Restore', 'Cancel');
  if (!ok) return;
  try { localStorage.clear(); } catch { /* storage unavailable */ }
  try { sessionStorage.clear(); } catch { /* storage unavailable */ }
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    }
  } catch { /* cache unavailable */ }
  try {
    const regs = await navigator.serviceWorker?.getRegistrations() ?? [];
    await Promise.all(regs.map(reg => reg.unregister()));
  } catch { /* no service worker */ }
  try { await clearDatabase(); } catch { /* database unavailable */ }
  await deleteDatabase();
  location.reload();
}
