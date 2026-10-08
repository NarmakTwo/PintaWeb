import { createIcons, icons } from 'lucide';
import { ADJUSTMENTS, ALL_EFFECTS, EFFECTS, performEffect, valuesFrom, type AdjustValues, type Field } from './commands.ts';
import { Editor } from './document.ts';
import { canvasToPng, downloadBlob, parsePalette, serializePalette } from './storage.ts';
import { ToolController } from './tools.ts';
import { boundsOf, DEFAULT_PALETTE, TOOLS, toolFromShortcut, type ToolId, type Unit } from './types.ts';

const $ = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
};

const EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
};

function editing(): boolean {
  const tag = document.activeElement?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!document.querySelector('dialog[open]');
}

function ask(id: string): Promise<string> {
  const dialog = $<HTMLDialogElement>(id);
  if (dialog.open) dialog.close('cancel');
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true }));
}

export async function start(): Promise<void> {
  const editor = new Editor();
  const tools = new ToolController(editor);
  const status = $<HTMLElement>('engine-status');
  buildChrome(editor, tools);
  editor.attach($('image-canvas'), $('preview-canvas'), $('overlay-canvas'), $('paper'), $('stage'));
  editor.onChanged = () => sync(editor);
  editor.onScene = () => paintRulers(editor);
  editor.onToast = message => showToast(message);
  editor.onSave = state => {
    const label = $<HTMLElement>('save-state');
    label.textContent = state;
    label.dataset.serial = String(editor.saveSerial);
  };
  wire(editor, tools);
  try {
    await editor.init();
    const fresh = new URLSearchParams(location.search).has('fresh');
    const restored = fresh ? false : await editor.restore();
    if (!restored) editor.newDocument(800, 600, 'white');
    status.dataset.state = 'ready';
    status.textContent = 'Pixel engine ready';
    requestAnimationFrame(() => editor.doc && editor.fit());
  } catch (error) {
    status.dataset.state = 'error';
    status.textContent = error instanceof Error ? error.message : 'Pixel engine failed';
  }
  sync(editor);
  window.setInterval(() => {
    if (!editor.doc?.selection) return;
    editor.ants = (editor.ants + 1) % 8;
    editor.paintOverlay();
  }, 120);
}

function buildChrome(editor: Editor, tools: ToolController): void {
  const menus: { id: string; label: string; items: string }[] = [
    { id: 'file', label: 'File', items: fileMenu() },
    { id: 'edit', label: 'Edit', items: editMenu() },
    { id: 'view', label: 'View', items: viewMenu() },
    { id: 'image', label: 'Image', items: imageMenu() },
    { id: 'layers', label: 'Layers', items: layerMenu() },
    { id: 'adjustments', label: 'Adjustments', items: effectButtons(ADJUSTMENTS) },
    { id: 'effects', label: 'Effects', items: effectGroups() },
    { id: 'window', label: 'Window', items: windowMenu() },
    { id: 'help', label: 'Help', items: helpMenu() },
  ];
  const bar = $('menubar');
  for (const menu of menus) {
    const wrap = document.createElement('div');
    wrap.className = 'menu-wrap';
    wrap.innerHTML = `<button type="button" class="menu-open" id="menu-${menu.id}" aria-haspopup="true" aria-expanded="false">${menu.label}</button><div class="menu-panel" id="panel-${menu.id}" hidden role="menu">${menu.items}</div>`;
    bar.append(wrap);
  }
  const list = $('tool-list');
  for (const tool of TOOLS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tool-button';
    button.dataset.tool = tool.id;
    button.title = `${tool.label} (${tool.shortcut})`;
    button.setAttribute('aria-label', tool.label);
    button.setAttribute('aria-pressed', String(tool.id === editor.tool));
    button.innerHTML = `<i data-lucide="${tool.icon}"></i>`;
    button.addEventListener('click', () => {
      tools.commitText();
      editor.tool = tool.id;
      editor.notify();
    });
    list.append(button);
  }
  const shortcuts = $('shortcuts-list');
  const rows = [
    ['New', 'Ctrl+N'], ['Open', 'Ctrl+O'], ['Save', 'Ctrl+S'], ['Save As', 'Ctrl+Shift+S'], ['Close', 'Ctrl+W'],
    ['Undo', 'Ctrl+Z'], ['Redo', 'Ctrl+Y'], ['Cut', 'Ctrl+X'], ['Copy', 'Ctrl+C'], ['Copy merged', 'Ctrl+Shift+C'],
    ['Paste', 'Ctrl+V'], ['Select all', 'Ctrl+A'], ['Deselect', 'Escape'], ['Add layer', 'Ctrl+Shift+N'],
    ['Delete layer', 'Ctrl+Shift+Delete'], ['Duplicate layer', 'Ctrl+Shift+D'], ['Merge down', 'Ctrl+M'],
    ['Brush size', '[ ]'], ['Swap colors', 'X'], ['Pan', 'Space'],
    ...TOOLS.map(tool => [tool.label, tool.shortcut]),
  ];
  shortcuts.innerHTML = rows.map(([name, keys]) => `<dt>${name}</dt><dd>${keys}</dd>`).join('');
  createIcons({ icons });
  document.querySelectorAll<HTMLButtonElement>('[data-category-toggle]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      const sub = button.nextElementSibling as HTMLElement | null;
      if (!sub) return;
      sub.hidden = !sub.hidden;
      button.classList.toggle('open', !sub.hidden);
      button.setAttribute('aria-expanded', String(!sub.hidden));
    });
  });
}

function item(label: string, command: string, shortcut = ''): string {
  return `<button type="button" data-command="${command}">${label}${shortcut ? `<span class="shortcut">${shortcut}</span>` : ''}</button>`;
}

function fileMenu(): string {
  return [
    item('New…', 'new', 'Ctrl+N'), item('Open…', 'open', 'Ctrl+O'), '<div class="sep"></div>',
    item('Close', 'close', 'Ctrl+W'), item('Close All', 'close-all'), '<div class="sep"></div>',
    item('Save', 'save', 'Ctrl+S'), item('Save As…', 'save-as', 'Ctrl+Shift+S'), item('Save All', 'save-all'), '<div class="sep"></div>',
    item('Import as Layer…', 'import-layer'), '<div class="sep"></div>',
    item('Open Palette…', 'open-palette'), item('Save Palette', 'save-palette'), item('Reset Palette', 'reset-palette'), '<div class="sep"></div>',
    item('Take Screenshot…', 'screenshot'), item('Quit', 'quit'),
  ].join('');
}

function editMenu(): string {
  return [
    item('Undo', 'undo', 'Ctrl+Z'), item('Redo', 'redo', 'Ctrl+Y'), '<div class="sep"></div>',
    item('Cut', 'cut', 'Ctrl+X'), item('Copy', 'copy', 'Ctrl+C'), item('Copy Merged', 'copy-merged', 'Ctrl+Shift+C'),
    item('Paste', 'paste', 'Ctrl+V'), item('Paste Into New Layer', 'paste-layer', 'Ctrl+Shift+V'), item('Paste Into New Image', 'paste-image'), '<div class="sep"></div>',
    item('Erase Selection', 'erase-selection'), item('Fill Selection', 'fill-selection'), item('Invert Selection', 'invert-selection'), item('Offset Selection…', 'offset-selection'), '<div class="sep"></div>',
    item('Select All', 'select-all', 'Ctrl+A'), item('Deselect', 'deselect', 'Escape'),
  ].join('');
}

function viewMenu(): string {
  return [
    item('Zoom In', 'zoom-in'), item('Zoom Out', 'zoom-out'), item('Normal Size', 'zoom-100', 'Ctrl+0'), item('Best Fit', 'zoom-fit'), item('Zoom to Selection', 'zoom-selection'), '<div class="sep"></div>',
    item('Rulers', 'toggle-rulers'), item('Status Bar', 'toggle-status'), item('Tool Box', 'toggle-tools'), item('Tool Options', 'toggle-toolbar'),
    item('Layers and History', 'toggle-docks'), item('Image Tabs', 'toggle-tabs'), item('Pixel Grid', 'toggle-grid'), item('Grid Size…', 'grid-size'), '<div class="sep"></div>',
    item('Pixels', 'unit-px'), item('Inches', 'unit-in'), item('Centimeters', 'unit-cm'), '<div class="sep"></div>', item('Fullscreen', 'fullscreen'),
  ].join('');
}

function imageMenu(): string {
  return [
    item('Crop to Selection', 'crop'), item('Auto Crop', 'auto-crop'), '<div class="sep"></div>',
    item('Resize Image…', 'resize'), item('Canvas Size…', 'canvas-size'), '<div class="sep"></div>',
    item('Flip Horizontal', 'flip-h'), item('Flip Vertical', 'flip-v'), '<div class="sep"></div>',
    item('Rotate 90° Clockwise', 'rotate-cw'), item('Rotate 90° Counter-Clockwise', 'rotate-ccw'), item('Rotate 180°', 'rotate-180'), '<div class="sep"></div>',
    item('Flatten', 'flatten'),
  ].join('');
}

function layerMenu(): string {
  return [
    item('Add New Layer', 'layer-add', 'Ctrl+Shift+N'), item('Delete Layer', 'layer-delete', 'Ctrl+Shift+Del'), item('Duplicate Layer', 'layer-duplicate', 'Ctrl+Shift+D'),
    item('Merge Down', 'layer-merge', 'Ctrl+M'), '<div class="sep"></div>', item('Move Up', 'layer-up'), item('Move Down', 'layer-down'), '<div class="sep"></div>',
    item('Flip Horizontal', 'layer-flip-h', 'Ctrl+F'), item('Flip Vertical', 'layer-flip-v', 'Shift+F'), item('Rotate / Zoom…', 'layer-rotate'), '<div class="sep"></div>',
    item('Properties…', 'layer-properties', 'F4'), item('Import from File…', 'import-layer'),
  ].join('');
}

function windowMenu(): string {
  return [item('Tool Box', 'toggle-tools'), item('Tool Options', 'toggle-toolbar'), item('Layers and History', 'toggle-docks'), item('Image Tabs', 'toggle-tabs'), item('Status Bar', 'toggle-status')].join('');
}

function helpMenu(): string {
  return [item('Keyboard Shortcuts', 'shortcuts'), item('About Pinta', 'about')].join('');
}

function effectButtons(specs: typeof ADJUSTMENTS): string {
  return specs.map(spec => `<button type="button" data-effect="${spec.id}" data-dialog="${spec.fields ? '1' : '0'}"${spec.category ? ` data-category="${spec.category}"` : ''}>${spec.label}</button>`).join('');
}

function effectGroups(): string {
  const categories = [...new Set(EFFECTS.map(effect => effect.category))];
  return categories.map(category => {
    const items = EFFECTS.filter(effect => effect.category === category);
    return `<button type="button" data-category-toggle="${category}" aria-expanded="false">${category}</button><div class="menu-sub" hidden>${effectButtons(items)}</div>`;
  }).join('');
}

function wire(editor: Editor, tools: ToolController): void {
  const paper = $('paper');
  paper.addEventListener('pointerdown', event => {
    if (event.button === 2) event.preventDefault();
    tools.down(event);
  });
  paper.addEventListener('pointermove', event => {
    tools.move(event);
    const point = editor.imagePoint(event);
    if (!point || !editor.doc) return;
    $('cursor-pos').textContent = `${formatUnit(point.x, editor.unit)}, ${formatUnit(point.y, editor.unit)}`;
  });
  paper.addEventListener('pointerup', event => tools.up(event));
  paper.addEventListener('pointercancel', event => tools.up(event));
  paper.addEventListener('contextmenu', event => event.preventDefault());
  paper.addEventListener('wheel', event => {
    if (!event.ctrlKey || !editor.doc) return;
    event.preventDefault();
    editor.zoomAt(editor.doc.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1), event.clientX, event.clientY);
  }, { passive: false });

  document.addEventListener('pointerdown', event => {
    const target = event.target as HTMLElement;
    if (!target.closest('.menu-wrap')) closeMenus();
  });
  document.querySelectorAll<HTMLButtonElement>('.menu-open').forEach(button => {
    button.addEventListener('click', () => {
      const panel = button.nextElementSibling as HTMLElement;
      const open = panel.hidden;
      closeMenus();
      panel.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
    });
  });
  document.body.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest('button');
    if (!button || button.dataset.categoryToggle) return;
    if (button.dataset.effect) {
      closeMenus();
      const spec = ALL_EFFECTS.find(effect => effect.id === button.dataset.effect);
      if (spec) void performEffect(editor, spec, (title, fields, preview) => askAdjust(title, fields, preview));
      return;
    }
    if (!button.dataset.command || button.classList.contains('menu-open')) return;
    closeMenus();
    void run(editor, tools, button.dataset.command);
  });

  $<HTMLInputElement>('size-slider').addEventListener('input', event => {
    editor.size = Number((event.target as HTMLInputElement).value);
    $('size-value').textContent = String(editor.size);
  });
  $<HTMLInputElement>('primary-input').addEventListener('input', event => {
    editor.primary = (event.target as HTMLInputElement).value;
    editor.notify();
  });
  $<HTMLInputElement>('secondary-input').addEventListener('input', event => {
    editor.secondary = (event.target as HTMLInputElement).value;
    editor.notify();
  });
  $('swap-colors').addEventListener('click', () => swapColors(editor));
  $('undo').addEventListener('click', () => editor.undo());
  $('redo').addEventListener('click', () => editor.redo());
  $('zoom-label').addEventListener('click', () => editor.fit());
  $('empty-new').addEventListener('click', () => void run(editor, tools, 'new'));
  $<HTMLTextAreaElement>('text-editor').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      tools.commitText();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      const field = $<HTMLTextAreaElement>('text-editor');
      field.value = '';
      field.hidden = true;
    }
  });
  $<HTMLInputElement>('file-input').addEventListener('change', () => void takeFile(editor, 'file-input', false));
  $<HTMLInputElement>('layer-input').addEventListener('change', () => void takeFile(editor, 'layer-input', true));
  $<HTMLInputElement>('palette-input').addEventListener('change', () => void takePalette(editor));
  document.addEventListener('paste', event => {
    if (editing()) return;
    const file = [...(event.clipboardData?.files ?? [])].find(item => item.type.startsWith('image/'));
    if (file) {
      event.preventDefault();
      void file.arrayBuffer().then(buffer => createImageBitmap(new Blob([buffer], { type: file.type }))).then(bitmap => pasteBitmap(editor, bitmap, 'layer'));
      return;
    }
    if (editor.clipboard) {
      event.preventDefault();
      void pasteBitmap(editor, editor.clipboard, 'layer');
    }
  });
  window.addEventListener('keydown', event => onKey(event, editor, tools));
  window.addEventListener('keyup', event => {
    if (event.key === ' ') editor.space = false;
  });
  window.addEventListener('resize', () => paintRulers(editor));
  $('palette').addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest('button');
    if (!button?.dataset.color) return;
    editor.primary = button.dataset.color;
    editor.notify();
  });
  $('palette').addEventListener('contextmenu', event => {
    const button = (event.target as HTMLElement).closest('button');
    if (!button?.dataset.color) return;
    event.preventDefault();
    editor.secondary = button.dataset.color;
    editor.notify();
  });
  $('layer-list').addEventListener('click', event => {
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-layer]');
    if (!row || !editor.doc) return;
    const index = Number(row.dataset.layer);
    if ((event.target as HTMLElement).closest('[data-visible]')) {
      editor.doc.layers[index].visible = !editor.doc.layers[index].visible;
      editor.checkpoint(editor.doc.layers[index].visible ? 'Show Layer' : 'Hide Layer');
      return;
    }
    editor.doc.active = index;
    editor.renderScene();
    editor.notify();
  });
  $('history-list').addEventListener('click', event => {
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-cursor]');
    if (row) editor.jump(Number(row.dataset.cursor));
  });
  $('tabs').addEventListener('click', event => {
    const tab = (event.target as HTMLElement).closest<HTMLElement>('[data-tab]');
    if (!tab) return;
    const index = Number(tab.dataset.tab);
    if ((event.target as HTMLElement).closest('[data-tab-close]')) void closeAt(editor, index);
    else editor.activate(index);
  });
}

async function run(editor: Editor, tools: ToolController, command: string): Promise<void> {
  const doc = editor.doc;
  if (command === 'new') {
    const answer = await ask('new-dialog');
    if (answer !== 'ok') return;
    const width = Number($<HTMLInputElement>('new-width').value);
    const height = Number($<HTMLInputElement>('new-height').value);
    editor.newDocument(width, height, $<HTMLSelectElement>('new-background').value);
    return;
  }
  if (command === 'open') $<HTMLInputElement>('file-input').click();
  else if (command === 'import-layer') $<HTMLInputElement>('layer-input').click();
  else if (command === 'close') await closeAt(editor, editor.index);
  else if (command === 'close-all') {
    while (editor.docs.length) {
      const closed = await closeAt(editor, 0);
      if (!closed) return;
    }
  } else if (command === 'save') await save(editor, false);
  else if (command === 'save-as') await save(editor, true);
  else if (command === 'save-all') await saveAll(editor);
  else if (command === 'open-palette') $<HTMLInputElement>('palette-input').click();
  else if (command === 'save-palette') downloadBlob(new Blob([serializePalette(editor.palette)], { type: 'text/plain' }), 'palette.txt');
  else if (command === 'reset-palette') {
    editor.palette = [...DEFAULT_PALETTE];
    editor.notify();
  } else if (command === 'screenshot') await screenshot(editor);
  else if (command === 'quit') await editor.quit();
  else if (command === 'undo') editor.undo();
  else if (command === 'redo') editor.redo();
  else if (command === 'cut') cut(editor);
  else if (command === 'copy') await copy(editor, false);
  else if (command === 'copy-merged') await copy(editor, true);
  else if (command === 'paste') await pasteBitmap(editor, editor.clipboard, 'layer');
  else if (command === 'paste-layer') await pasteBitmap(editor, editor.clipboard, 'new-layer');
  else if (command === 'paste-image') await pasteBitmap(editor, editor.clipboard, 'new-image');
  else if (command === 'erase-selection') editor.eraseSelection();
  else if (command === 'fill-selection') editor.fillSelection();
  else if (command === 'invert-selection') editor.invertSelection();
  else if (command === 'offset-selection') {
    const answer = await ask('offset-dialog');
    if (answer === 'ok') editor.offsetSelection(Number($<HTMLInputElement>('offset-x').value), Number($<HTMLInputElement>('offset-y').value));
  } else if (command === 'select-all') editor.selectAll();
  else if (command === 'deselect') editor.deselect();
  else if (command === 'zoom-in' && doc) editor.setZoom(doc.zoom * 1.25);
  else if (command === 'zoom-out' && doc) editor.setZoom(doc.zoom / 1.25);
  else if (command === 'zoom-100') editor.setZoom(1);
  else if (command === 'zoom-fit') editor.fit();
  else if (command === 'zoom-selection' && doc?.selection) {
    const bounds = boundsOf(doc.selection, doc.width, doc.height);
    if (bounds) editor.fit(bounds);
  } else if (command === 'toggle-rulers') toggleShow(editor, 'rulers');
  else if (command === 'toggle-status') toggleShow(editor, 'status');
  else if (command === 'toggle-tools') toggleShow(editor, 'tools');
  else if (command === 'toggle-toolbar') toggleShow(editor, 'toolbar');
  else if (command === 'toggle-docks') toggleShow(editor, 'docks');
  else if (command === 'toggle-tabs') toggleShow(editor, 'tabs');
  else if (command === 'toggle-grid') {
    editor.show.grid = !editor.show.grid;
    editor.paintOverlay();
    editor.notify();
  } else if (command === 'grid-size') {
    $<HTMLInputElement>('grid-size').value = String(editor.gridSize);
    const answer = await ask('grid-dialog');
    if (answer !== 'ok') return;
    editor.gridSize = Math.max(2, Number($<HTMLInputElement>('grid-size').value) || 16);
    editor.show.grid = true;
    editor.paintOverlay();
    editor.notify();
  } else if (command === 'unit-px') setUnit(editor, 'px');
  else if (command === 'unit-in') setUnit(editor, 'in');
  else if (command === 'unit-cm') setUnit(editor, 'cm');
  else if (command === 'fullscreen') {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } else if (command === 'crop') editor.crop();
  else if (command === 'auto-crop') editor.autoCrop();
  else if (command === 'resize' && doc) {
    $<HTMLInputElement>('resize-width').value = String(doc.width);
    $<HTMLInputElement>('resize-height').value = String(doc.height);
    if (await ask('resize-dialog') === 'ok') editor.resize(Number($<HTMLInputElement>('resize-width').value), Number($<HTMLInputElement>('resize-height').value));
  } else if (command === 'canvas-size' && doc) {
    $<HTMLInputElement>('canvas-width').value = String(doc.width);
    $<HTMLInputElement>('canvas-height').value = String(doc.height);
    if (await ask('canvas-dialog') === 'ok') editor.resizeCanvas(Number($<HTMLInputElement>('canvas-width').value), Number($<HTMLInputElement>('canvas-height').value), $<HTMLSelectElement>('canvas-anchor').value);
  } else if (command === 'flip-h') editor.flip(true, 'image');
  else if (command === 'flip-v') editor.flip(false, 'image');
  else if (command === 'rotate-cw') editor.rotate(1);
  else if (command === 'rotate-ccw') editor.rotate(-1);
  else if (command === 'rotate-180') editor.rotate(2);
  else if (command === 'flatten') editor.flatten();
  else if (command === 'layer-add') editor.addLayer();
  else if (command === 'layer-delete') editor.deleteLayer();
  else if (command === 'layer-duplicate') editor.duplicateLayer();
  else if (command === 'layer-merge') editor.mergeDown();
  else if (command === 'layer-up') editor.moveLayer(1);
  else if (command === 'layer-down') editor.moveLayer(-1);
  else if (command === 'layer-flip-h') editor.flip(true, 'layer');
  else if (command === 'layer-flip-v') editor.flip(false, 'layer');
  else if (command === 'layer-rotate') {
    if (await ask('rotate-dialog') === 'ok') editor.rotateZoomLayer(Number($<HTMLInputElement>('rotate-degrees').value), Number($<HTMLInputElement>('rotate-scale').value));
  } else if (command === 'layer-properties' && editor.layer) {
    $<HTMLInputElement>('layer-name').value = editor.layer.name;
    $<HTMLInputElement>('layer-opacity').value = String(editor.layer.opacity);
    $<HTMLInputElement>('layer-visible').checked = editor.layer.visible;
    if (await ask('layer-dialog') === 'ok') editor.setLayerProperties($<HTMLInputElement>('layer-name').value, Number($<HTMLInputElement>('layer-opacity').value), $<HTMLInputElement>('layer-visible').checked);
  } else if (command === 'shortcuts' || command === 'about') await ask(`${command}-dialog`);
  tools.commitText();
}

function toggleShow(editor: Editor, key: 'rulers' | 'status' | 'tools' | 'toolbar' | 'docks' | 'tabs'): void {
  editor.show[key] = !editor.show[key];
  editor.notify();
}

function setUnit(editor: Editor, unit: Unit): void {
  editor.unit = unit;
  editor.notify();
  paintRulers(editor);
}

function swapColors(editor: Editor): void {
  const next = editor.primary;
  editor.primary = editor.secondary;
  editor.secondary = next;
  editor.notify();
}

async function save(editor: Editor, saveAs: boolean): Promise<boolean> {
  const doc = editor.doc;
  if (!doc) return false;
  let mime = doc.fileMime ?? 'image/png';
  let filename = doc.name.includes('.') ? doc.name : `${doc.fileBase}${EXT[mime]}`;
  if (saveAs || !doc.fileMime) {
    $<HTMLInputElement>('export-name').value = doc.fileBase;
    $<HTMLSelectElement>('export-format').value = mime;
    if (await ask('export-dialog') !== 'ok') return false;
    mime = $<HTMLSelectElement>('export-format').value;
    const base = $<HTMLInputElement>('export-name').value.trim() || 'Untitled';
    filename = base.toLowerCase().endsWith(EXT[mime]) ? base : `${base}${EXT[mime]}`;
  }
  await editor.exportImage(mime, filename);
  return true;
}

async function saveAll(editor: Editor): Promise<void> {
  const start = editor.index;
  let saved = 0;
  for (let index = 0; index < editor.docs.length; index++) {
    editor.activate(index);
    if (!editor.doc?.fileMime) continue;
    await save(editor, false);
    saved++;
  }
  if (start >= 0) editor.activate(start);
  if (!saved) editor.toast('Use Save As to name an image. Open images stay in this browser.');
}

async function closeAt(editor: Editor, index: number): Promise<boolean> {
  const doc = editor.docs[index];
  if (!doc) return false;
  if (doc.cursor !== doc.savedCursor) {
    $('close-message').textContent = `${doc.name} has unsaved changes.`;
    const answer = await ask('close-dialog');
    if (answer === 'cancel' || answer === '') return false;
    if (answer === 'save') {
      editor.activate(index);
      const saved = await save(editor, !doc.fileMime);
      if (!saved) return false;
    }
  }
  editor.close(index);
  return true;
}

async function copy(editor: Editor, merged: boolean): Promise<void> {
  const canvas = editor.copy(merged);
  if (!canvas) {
    editor.toast('Nothing to copy.');
    return;
  }
  try {
    const blob = await canvasToPng(canvas);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  } catch {
    editor.toast(merged ? 'Copied the merged image.' : 'Copied.');
  }
}

function cut(editor: Editor): void {
  const had = !!editor.doc?.selection;
  void copy(editor, false);
  if (had) editor.eraseSelection();
}

async function pasteBitmap(editor: Editor, source: HTMLCanvasElement | ImageBitmap | null, destination: 'layer' | 'new-layer' | 'new-image'): Promise<void> {
  if (!source) {
    editor.toast('The clipboard is empty.');
    return;
  }
  const doc = editor.doc;
  let overflow: 'expand' | 'clip' = 'clip';
  if (destination !== 'new-image' && doc && (source.width > doc.width || source.height > doc.height)) {
    const answer = await ask('paste-dialog');
    if (answer !== 'expand' && answer !== 'clip') return;
    overflow = answer;
  }
  editor.pasteCanvas(source, destination, overflow);
  if (source instanceof ImageBitmap) source.close();
}

async function takeFile(editor: Editor, id: string, asLayer: boolean): Promise<void> {
  const input = $<HTMLInputElement>(id);
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    await editor.openFile(file, asLayer);
  } catch {
    editor.toast('This file could not be opened.');
  }
}

async function takePalette(editor: Editor): Promise<void> {
  const input = $<HTMLInputElement>('palette-input');
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const colors = parsePalette(await file.text());
  if (!colors.length) {
    editor.toast('That palette file has no colors.');
    return;
  }
  editor.palette = colors;
  editor.notify();
}

async function screenshot(editor: Editor): Promise<void> {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const video = document.createElement('video');
    video.srcObject = stream;
    await video.play();
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 800;
    canvas.height = video.videoHeight || 600;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    stream.getTracks().forEach(track => track.stop());
    editor.pasteCanvas(canvas, 'new-image', 'clip');
  } catch {
    editor.toast('Screenshot was cancelled.');
  }
}

function askAdjust(title: string, fields: Field[], preview: ((values: AdjustValues) => void) | null): Promise<AdjustValues | null> {
  $('adjust-title').textContent = title;
  const box = $('adjust-fields');
  box.innerHTML = fields.map(field => `<label>${field.label}<input type="range" data-key="${field.key}" min="${field.min}" max="${field.max}" value="${field.value}" /><input type="number" data-key="${field.key}" min="${field.min}" max="${field.max}" value="${field.value}" /></label>`).join('');
  const read = (): AdjustValues => {
    const values = valuesFrom(fields);
    box.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach(input => {
      values[input.dataset.key as 'a' | 'b' | 'c'] = Number(input.value);
    });
    return values;
  };
  box.oninput = event => {
    const target = event.target as HTMLInputElement;
    const pair = box.querySelectorAll<HTMLInputElement>(`input[data-key="${target.dataset.key}"]`);
    pair.forEach(input => { input.value = target.value; });
    preview?.(read());
  };
  return ask('adjust-dialog').then(answer => (answer === 'ok' ? read() : null));
}

function onKey(event: KeyboardEvent, editor: Editor, tools: ToolController): void {
  if (event.key === ' ' && !editing()) {
    editor.space = true;
    event.preventDefault();
  }
  if (editing() && event.key !== 'Escape') return;
  const key = event.key.toLowerCase();
  const ctrl = event.ctrlKey || event.metaKey;
  if (ctrl && key === 'n') { event.preventDefault(); void run(editor, tools, 'new'); }
  else if (ctrl && key === 'o') { event.preventDefault(); void run(editor, tools, 'open'); }
  else if (ctrl && event.shiftKey && key === 's') { event.preventDefault(); void run(editor, tools, 'save-as'); }
  else if (ctrl && key === 's') { event.preventDefault(); void run(editor, tools, 'save'); }
  else if (ctrl && key === 'w') { event.preventDefault(); void run(editor, tools, 'close'); }
  else if (ctrl && !event.shiftKey && key === 'z') { event.preventDefault(); editor.undo(); }
  else if (ctrl && (key === 'y' || (event.shiftKey && key === 'z'))) { event.preventDefault(); editor.redo(); }
  else if (ctrl && key === 'x') { event.preventDefault(); cut(editor); }
  else if (ctrl && event.shiftKey && key === 'c') { event.preventDefault(); void copy(editor, true); }
  else if (ctrl && key === 'c') { event.preventDefault(); void copy(editor, false); }
  else if (ctrl && key === 'a') { event.preventDefault(); editor.selectAll(); }
  else if (ctrl && event.shiftKey && key === 'n') { event.preventDefault(); editor.addLayer(); }
  else if (ctrl && event.shiftKey && key === 'd') { event.preventDefault(); editor.duplicateLayer(); }
  else if (ctrl && event.shiftKey && key === 'delete') { event.preventDefault(); editor.deleteLayer(); }
  else if (ctrl && key === 'm') { event.preventDefault(); editor.mergeDown(); }
  else if (ctrl && key === 'f') { event.preventDefault(); editor.flip(true, 'layer'); }
  else if (!ctrl && event.shiftKey && key === 'f') { event.preventDefault(); editor.flip(false, 'layer'); }
  else if (event.key === 'F4') { event.preventDefault(); void run(editor, tools, 'layer-properties'); }
  else if (event.key === 'Escape') {
    if (editor.float) editor.cancelFloat();
    else editor.deselect();
  } else if (event.key === 'Delete' || event.key === 'Backspace') editor.eraseSelection();
  else if (event.key === '[') editor.size = Math.max(1, editor.size - 1);
  else if (event.key === ']') editor.size = Math.min(200, editor.size + 1);
  else if (!ctrl && !event.altKey && key === 'x') swapColors(editor);
  else if (!ctrl && !event.altKey && key.length === 1) {
    const next = toolFromShortcut(key, editor.tool);
    if (!next) return;
    event.preventDefault();
    tools.commitText();
    editor.tool = next;
    editor.notify();
  }
  if (event.key === '[' || event.key === ']' || key === 'x') editor.notify();
}

let optionTool: ToolId | null = null;

function sync(editor: Editor): void {
  const doc = editor.doc;
  const app = $('app');
  app.dataset.rulers = editor.show.rulers ? '1' : '0';
  app.dataset.status = editor.show.status ? '1' : '0';
  app.dataset.tools = editor.show.tools ? '1' : '0';
  app.dataset.toolbar = editor.show.toolbar ? '1' : '0';
  app.dataset.docks = editor.show.docks ? '1' : '0';
  app.dataset.tabs = editor.show.tabs ? '1' : '0';
  $('document-name').textContent = doc ? `${doc.name}${editor.dirty ? ' •' : ''}` : 'Pinta';
  document.title = doc ? `${doc.name} — Pinta` : 'Pinta';
  $<HTMLButtonElement>('undo').disabled = !doc || doc.cursor <= 0;
  $<HTMLButtonElement>('redo').disabled = !doc || doc.cursor >= doc.snapshots.length - 1;
  $('selection-status').textContent = editor.selectionLabel();
  $('image-dimensions').textContent = doc ? `${doc.width} × ${doc.height}` : '';
  $('zoom-label').textContent = doc ? `${Math.round(doc.zoom * 100)}%` : '';
  $('empty-state').hidden = !!doc;
  $('paper').hidden = !doc;
  document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.tool === editor.tool));
  });
  const tool = TOOLS.find(item => item.id === editor.tool);
  $('tool-context').textContent = tool ? tool.hint : '';
  const slider = $<HTMLInputElement>('size-slider');
  if (document.activeElement !== slider) {
    slider.value = String(editor.size);
    $('size-value').textContent = String(editor.size);
  }
  if (optionTool !== editor.tool) {
    optionTool = editor.tool;
    $('tool-extra').innerHTML = extraOptions(editor);
    bindExtra(editor);
  }
  paintSwatch('primary-swatch', editor.primary);
  paintSwatch('secondary-swatch', editor.secondary);
  $<HTMLInputElement>('primary-input').value = editor.primary;
  $<HTMLInputElement>('secondary-input').value = editor.secondary;
  $('palette').innerHTML = editor.palette.map(color => `<button type="button" data-color="${color}" style="background:${color}" aria-label="${color}"></button>`).join('');
  $('layer-list').innerHTML = doc ? [...doc.layers].reverse().map(layer => {
    const index = doc.layers.indexOf(layer);
    return `<li><button type="button" class="layer" data-layer="${index}" data-active="${index === doc.active}"><span class="vis${layer.visible ? ' on' : ''}" data-visible aria-label="${layer.visible ? 'Hide layer' : 'Show layer'}"></span><span>${layer.name}</span><span>${layer.opacity}%</span></button></li>`;
  }).join('') : '';
  $('history-list').innerHTML = doc ? doc.labels.map((label, index) => `<li><button type="button" class="history-item" data-cursor="${index}" ${index === doc.cursor ? 'aria-current="true"' : ''}>${label}</button></li>`).join('') : '';
  $('tabs').innerHTML = editor.docs.map((item, index) => `<div class="tab" data-tab="${index}" role="tab" aria-selected="${index === editor.index}"><span>${item.name}</span><button type="button" data-tab-close aria-label="Close ${item.name}">x</button></div>`).join('');
  paintRulers(editor);
}

function extraOptions(editor: Editor): string {
  const tool = editor.tool;
  const drawing = ['brush', 'pencil', 'eraser', 'recolor', 'clone', 'line', 'rectangle', 'rounded', 'ellipse', 'freeform', 'text'].includes(tool);
  const parts: string[] = [];
  if (drawing || tool === 'bucket' || tool === 'gradient') {
    parts.push(`<label class="option">Opacity <input id="opacity-slider" type="range" min="1" max="100" value="${editor.opacity}" /></label>`);
  }
  if (tool === 'brush' || tool === 'clone' || tool === 'eraser') {
    parts.push(`<label class="option">Brush <select id="brush-select">${['plain', 'circle', 'squares', 'splatter', 'slash', 'grid'].map(id => `<option value="${id}" ${id === editor.brush ? 'selected' : ''}>${id}</option>`).join('')}</select></label>`);
  }
  if (tool === 'eraser') parts.push(`<label class="option">Edge <select id="eraser-select"><option value="hard">Hard</option><option value="soft" ${editor.eraser === 'soft' ? 'selected' : ''}>Soft</option></select></label>`);
  if (tool === 'bucket' || tool === 'wand' || tool === 'recolor') parts.push(`<label class="option">Tolerance <input id="tolerance-slider" type="range" min="0" max="100" value="${editor.tolerance}" /></label>`);
  if (tool === 'rectangle' || tool === 'rounded' || tool === 'ellipse' || tool === 'freeform') {
    parts.push(`<label class="option">Style <select id="shape-select"><option value="outline">Outline</option><option value="fill" ${editor.shape === 'fill' ? 'selected' : ''}>Fill</option><option value="both" ${editor.shape === 'both' ? 'selected' : ''}>Fill and outline</option></select></label>`);
  }
  if (tool === 'rounded') parts.push(`<label class="option">Corner <input id="corner-slider" type="range" min="0" max="200" value="${editor.corner}" /></label>`);
  if (tool === 'line') {
    parts.push(`<label class="option">Mode <select id="line-select"><option value="straight">Straight</option><option value="curve" ${editor.lineMode === 'curve' ? 'selected' : ''}>Curve</option></select></label>`);
    parts.push(`<label class="check"><input id="alias-check" type="checkbox" ${editor.antialias ? 'checked' : ''}/> Antialias</label>`);
  }
  if (tool === 'gradient') parts.push(`<label class="option">Kind <select id="gradient-select">${['linear', 'radial', 'diamond', 'conical'].map(id => `<option value="${id}" ${id === editor.gradient ? 'selected' : ''}>${id}</option>`).join('')}</select></label>`);
  if (tool === 'text') parts.push(`<label class="option">Font <input id="font-input" type="text" value="${editor.font}" /></label>`);
  if (tool === 'rect-select' || tool === 'ellipse-select' || tool === 'lasso' || tool === 'wand') {
    parts.push(`<label class="option">Mode <select id="select-mode">${['replace', 'union', 'exclude', 'xor', 'intersect'].map(id => `<option value="${id}" ${id === editor.selectionMode ? 'selected' : ''}>${id}</option>`).join('')}</select></label>`);
  }
  return parts.join('');
}

function bindExtra(editor: Editor): void {
  const listen = (id: string, apply: (value: string) => void) => {
    document.getElementById(id)?.addEventListener('input', event => apply((event.target as HTMLInputElement).value));
    document.getElementById(id)?.addEventListener('change', event => apply((event.target as HTMLInputElement).value));
  };
  listen('opacity-slider', value => { editor.opacity = Number(value); });
  listen('brush-select', value => { editor.brush = value as Editor['brush']; });
  listen('eraser-select', value => { editor.eraser = value === 'soft' ? 'soft' : 'hard'; });
  listen('tolerance-slider', value => { editor.tolerance = Number(value); });
  listen('shape-select', value => { editor.shape = value as Editor['shape']; });
  listen('corner-slider', value => { editor.corner = Number(value); });
  listen('line-select', value => { editor.lineMode = value === 'curve' ? 'curve' : 'straight'; });
  listen('gradient-select', value => { editor.gradient = value as Editor['gradient']; });
  listen('font-input', value => { editor.font = value || 'sans-serif'; });
  listen('select-mode', value => { editor.selectionMode = value as Editor['selectionMode']; });
  document.getElementById('alias-check')?.addEventListener('change', event => {
    editor.antialias = (event.target as HTMLInputElement).checked;
  });
}

function paintSwatch(id: string, color: string): void {
  $(id).style.background = color;
}

function formatUnit(pixels: number, unit: Unit): string {
  if (unit === 'in') return `${(pixels / 96).toFixed(2)} in`;
  if (unit === 'cm') return `${(pixels / 96 * 2.54).toFixed(2)} cm`;
  return `${Math.round(pixels)} px`;
}

function stepFor(zoom: number, unit: Unit): number {
  const target = 72 / Math.max(zoom, 0.05);
  const raw = unit === 'px' ? target : unit === 'in' ? target / 96 : target / 96 * 2.54;
  const power = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-6)));
  const nice = raw / power < 2 ? 1 : raw / power < 5 ? 2 : 5;
  const stepped = nice * power;
  if (unit === 'px') return Math.max(1, Math.round(stepped));
  if (unit === 'in') return Math.max(1, Math.round(stepped * 96));
  return Math.max(1, Math.round(stepped / 2.54 * 96));
}

function paintRulers(editor: Editor): void {
  const doc = editor.doc;
  paintAxis($<HTMLCanvasElement>('ruler-x'), true, doc?.width ?? 0, doc?.zoom ?? 1, editor);
  paintAxis($<HTMLCanvasElement>('ruler-y'), false, doc?.height ?? 0, doc?.zoom ?? 1, editor);
}

function paintAxis(canvas: HTMLCanvasElement, horizontal: boolean, length: number, zoom: number, editor: Editor): void {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#5e5c64';
  ctx.strokeStyle = '#9a9996';
  ctx.font = '10px Cantarell, Segoe UI, sans-serif';
  ctx.lineWidth = 1;
  if (!length || !editor.doc) return;
  const paper = editor.paper.getBoundingClientRect();
  const ruler = canvas.getBoundingClientRect();
  const origin = horizontal ? paper.left - ruler.left : paper.top - ruler.top;
  const scale = (horizontal ? paper.width : paper.height) / length;
  const step = stepFor(zoom, editor.unit);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let pixel = 0; pixel <= length; pixel += step) {
    const at = origin + pixel * scale;
    ctx.beginPath();
    if (horizontal) {
      ctx.moveTo(at, height);
      ctx.lineTo(at, height - 8);
      ctx.stroke();
      if (at > 12 && at < width - 12) ctx.fillText(formatUnit(pixel, editor.unit).replace(' px', ''), at, 8);
    } else {
      ctx.moveTo(width, at);
      ctx.lineTo(width - 8, at);
      ctx.stroke();
    }
  }
}

function showToast(message: string): void {
  const toast = $('toast');
  toast.hidden = false;
  toast.textContent = message;
  window.setTimeout(() => { toast.hidden = true; }, 2600);
}

function closeMenus(): void {
  document.querySelectorAll<HTMLElement>('.menu-panel').forEach(panel => { panel.hidden = true; });
  document.querySelectorAll<HTMLButtonElement>('.menu-open').forEach(button => button.setAttribute('aria-expanded', 'false'));
}
