import {
  Blend, Brush, Circle, CircleDashed, Eraser, Grid3x3, Hand, Lasso, Moon, Move, MoveDiagonal,
  PaintBucket, Paintbrush, Pencil, Pipette, Plus, RectangleHorizontal, Redo2, Spline, Square,
  SquareDashed, Sun, Type, Undo2, Wand, X, ZoomIn,
  createIcons,
} from 'lucide';
import { ADJUSTMENTS, ALL_EFFECTS, EFFECTS, performEffect, valuesFrom, type AdjustValues, type Field } from './commands.ts';
import { BLEND_MODES, DEFAULT_TAG, Editor, LAYER_TAGS, type BlendMode } from './document.ts';
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
  'application/pinta': '.pinta',
};

function editing(): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (!active) return false;
  if (active.closest('dialog[open]')) return true;
  if (active.isContentEditable) return true;
  if (active.tagName === 'TEXTAREA') return true;
  if (active instanceof HTMLInputElement) {
    return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(active.type);
  }
  return false;
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
  buildChrome(editor, tools);
  editor.attach($('image-canvas'), $('preview-canvas'), $('overlay-canvas'), $('paper'), $('stage'));
  editor.onChanged = () => sync(editor);
  editor.onScene = () => paintRulers(editor);
  editor.onToast = message => showToast(message);
  editor.onSave = state => {
    const app = $('app');
    app.dataset.saveState = state;
    app.dataset.saveSerial = String(editor.saveSerial);
  };
  wire(editor, tools);
  try {
    await editor.init();
    const fresh = new URLSearchParams(location.search).has('fresh');
    const restored = fresh ? false : await editor.restore();
    if (!restored) editor.newDocument(800, 600, 'white');
    document.documentElement.dataset.engine = 'ready';
    requestAnimationFrame(() => editor.doc && editor.fit());
  } catch (error) {
    document.documentElement.dataset.engine = 'error';
    editor.toast(error instanceof Error ? error.message : 'Pixel engine failed');
  }
  sync(editor);
  window.setInterval(() => {
    if (!editor.doc?.selection && !editor.draftEdges) return;
    editor.ants = (editor.ants + 1) % 8;
    editor.paintOverlay();
  }, 120);
}

const CUSTOM_ICONS: Record<string, string> = {
  pen: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M 15.54,3.5 20.5,8.47 19.07,9.88 14.12,4.93 15.54,3.5 M 3.5,19.78 10,13.31 C 9.9,13 9.97,12.61 10.23,12.35 c 0.39,-0.39 1.03,-0.39 1.42,0 0.39,0.4 0.39,1.03 0,1.42 C 11.39,14.03 11,14.1 10.69,14 L 4.22,20.5 14.83,16.95 18.36,10.59 13.42,5.64 7.05,9.17 Z"/></svg>',
  'lasso-select': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.704 14.467a10 8 0 1 1 3.115 2.375" stroke-dasharray="2 4"/><path d="M7 22a5 5 0 0 1-2-3.994" stroke-dasharray="2 4"/><circle cx="5" cy="16" r="2"/></svg>',
  'random-brush': '<svg viewBox="0 -2 32 32" fill="currentColor" fill-rule="evenodd" aria-hidden="true"><path d="M 15.627783,17.324677 12.812427,27.831726 2.3053781,25.016371 5.120734,14.509321 Z m -1.665301,0.961462 -7.8802862,-2.111517 -2.1115167,7.880287 7.8802859,2.111516 z m -3.049404,4.813626 c 0.54402,0.145769 0.866865,0.704955 0.721096,1.248975 -0.14577,0.54402 -0.704955,0.866866 -1.248974,0.721096 C 9.8411793,24.924067 9.5183336,24.364881 9.6641032,23.820861 9.8098728,23.276841 10.369059,22.953995 10.913078,23.099765 Z M 9.2305206,20.185488 c 0.5440213,0.14577 0.8668664,0.704955 0.7210963,1.248976 C 9.8058474,21.978485 9.2466627,22.30133 8.7026414,22.15556 8.1586213,22.00979 7.8357756,21.450605 7.9815451,20.906584 8.1273158,20.362564 8.6865005,20.039717 9.2305206,20.185488 Z m -1.682558,-2.914276 c 0.5440213,0.14577 0.866867,0.704955 0.7210963,1.248975 -0.1457696,0.54402 -0.7049553,0.866866 -1.2489755,0.721096 C 6.4760632,19.095514 6.1532175,18.536328 6.2989871,17.992308 6.4447566,17.448288 7.0039424,17.125442 7.5479626,17.271212 Z M 29.03703,-0.02953 c -0.75825,0 -1.5165,0.28556 -2.095,0.85656 l -15.34851,15.15453 2.20718,0.57813 0.45328,-0.44766 0.78024,0.7707 0.85226,0.22321 -1.02781,3.92445 16.27336,-16.06641 c 1.157,-1.143 1.157,-2.99495 0,-4.13695 -0.5785,-0.571 -1.33675,-0.85656 -2.095,-0.85656 z m 3.1e-4,1.94976 c 0.25263,0 0.50516,0.09529 0.69766,0.28579 0.386,0.381 0.386,0.99798 0,1.37898 L 17.04703,16.11203 15.65,14.73297 28.33898,2.20602 c 0.193,-0.1905 0.44574,-0.28579 0.69836,-0.28579 z M 2.45414,23.91102 C 1.3515,24.72979 0,24.67102 0,24.67102 c 3.62802,4.02445 7.70344,3.69433 10.3432,2.6332 L 6.09242,26.19086 c -5e-5,0 -10e-5,0 -1.5e-4,0 C 5.30334,26.17377 4.53165,26.0041 3.85539,25.605 l -1.6e-4,-8e-5 -1.72632,-0.45211 z"/></svg>',
};

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
    button.innerHTML = CUSTOM_ICONS[tool.icon] ?? `<i data-lucide="${tool.icon}"></i>`;
    button.addEventListener('click', () => {
      tools.commitText();
      if (tool.id === 'picker') editor.rememberTool();
      editor.tool = tool.id;
      editor.notify();
    });
    list.append(button);
  }
  const shortcuts = $('shortcuts-list');
  const rows = [
    ['New', 'Ctrl+N'], ['Open', 'Ctrl+O'], ['Save', 'Ctrl+S'], ['Save As', 'Ctrl+Shift+S'], ['Close', 'Ctrl+W'],
    ['Undo', 'Ctrl+Z'], ['Redo', 'Ctrl+Y'], ['Cut', 'Ctrl+X'], ['Copy', 'Ctrl+C'], ['Copy merged', 'Ctrl+Shift+C'],
    ['Paste', 'Ctrl+V'], ['Select all', 'Ctrl+A'], ['Deselect', 'Ctrl+D'], ['Add layer', 'Ctrl+Shift+N'],
    ['Delete layer', 'Ctrl+Shift+Delete'], ['Duplicate layer', 'Ctrl+Shift+D'], ['Merge down', 'Ctrl+M'],
    ['Brush size', '[ ]'], ['Swap colors', 'X'], ['Pan', 'Space'],
    ...TOOLS.map(tool => [tool.label, tool.shortcut]),
  ];
  shortcuts.innerHTML = rows.map(([name, keys]) => `<dt>${name}</dt><dd>${keys}</dd>`).join('');
  createIcons({
    icons: {
      Blend, Brush, Circle, CircleDashed, Eraser, Grid3x3, Hand, Lasso, Moon, Move, MoveDiagonal,
      PaintBucket, Paintbrush, Pencil, Pipette, Plus, RectangleHorizontal, Redo2, Spline, Square,
      SquareDashed, Sun, Type, Undo2, Wand, X, ZoomIn,
    },
  });
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
    item('Select All', 'select-all', 'Ctrl+A'), item('Deselect', 'deselect', 'Ctrl+D'),
  ].join('');
}

function viewMenu(): string {
  return [
    item('Zoom In', 'zoom-in'), item('Zoom Out', 'zoom-out'), item('Normal Size', 'zoom-100', 'Ctrl+0'), item('Best Fit', 'zoom-fit'), item('Zoom to Selection', 'zoom-selection'), '<div class="sep"></div>',
    item('Rulers', 'toggle-rulers'), item('Status Bar', 'toggle-status'), item('Tool Box', 'toggle-tools'), item('Tool Options', 'toggle-toolbar'),
    item('Layers and History', 'toggle-docks'), item('Image Tabs', 'toggle-tabs'), item('Pixel Grid', 'toggle-grid'), item('Grid Size…', 'grid-size'), '<div class="sep"></div>',
    item('Pixels', 'unit-px'), item('Inches', 'unit-in'), item('Centimeters', 'unit-cm'), '<div class="sep"></div>',
    '<button type="button" data-command="theme-dark" aria-checked="false">Dark Mode<span class="shortcut" id="theme-mark">Off</span></button>',
    '<div class="sep"></div>', item('Fullscreen', 'fullscreen'),
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
  $('document-name').addEventListener('dblclick', () => {
    const doc = editor.doc;
    const host = $('document-name');
    if (!doc || host.querySelector('input')) return;
    const input = document.createElement('input');
    input.className = 'document-rename';
    input.value = doc.name;
    input.maxLength = 120;
    input.setAttribute('aria-label', 'Image title');
    host.textContent = '';
    host.append(input);
    input.focus();
    input.select();
    let done = false;
    const close = (commit: boolean) => {
      if (done) return;
      done = true;
      const next = input.value;
      input.remove();
      if (commit) editor.renameDocument(next);
      editor.notify();
    };
    input.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        close(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        close(false);
      }
    });
    input.addEventListener('blur', () => close(true));
  });

  const paper = $('paper');
  const contacts = new Map<number, { x: number; y: number }>();
  let pinch: { distance: number; cx: number; cy: number; zoom: number } | null = null;

  const measure = () => {
    const points = [...contacts.values()];
    if (points.length < 2) return null;
    const [a, b] = points;
    return {
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
    };
  };

  paper.addEventListener('pointerdown', event => {
    if (event.cancelable) event.preventDefault();
    contacts.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try { paper.setPointerCapture(event.pointerId); } catch { /* already captured */ }
    if (contacts.size > 1) {
      tools.abandon();
      const span = measure();
      if (span && editor.doc) pinch = { ...span, zoom: editor.doc.zoom };
      return;
    }
    tools.down(event);
  });
  paper.addEventListener('pointermove', event => {
    if (contacts.has(event.pointerId)) contacts.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch && contacts.size > 1) {
      const span = measure();
      if (span && editor.doc) {
        editor.zoomAt(pinch.zoom * (span.distance / pinch.distance), pinch.cx, pinch.cy);
        editor.stage.scrollLeft -= span.cx - pinch.cx;
        editor.stage.scrollTop -= span.cy - pinch.cy;
      }
      return;
    }
    tools.move(event);
    const point = editor.imagePoint(event);
    if (!point || !editor.doc) return;
    $('cursor-pos').textContent = `${formatUnit(point.x, editor.unit)}, ${formatUnit(point.y, editor.unit)}`;
  });
  const release = (event: PointerEvent) => {
    const pinching = pinch !== null;
    contacts.delete(event.pointerId);
    if (pinching) {
      if (contacts.size < 2) pinch = null;
      return;
    }
    if (event.type === 'pointercancel') tools.abandon();
    else tools.up(event);
  };
  paper.addEventListener('pointerup', release);
  paper.addEventListener('pointercancel', release);
  paper.addEventListener('contextmenu', event => {
    event.preventDefault();
  });
  paper.addEventListener('wheel', event => {
    if (!event.ctrlKey || !editor.doc) return;
    event.preventDefault();
    editor.zoomAt(editor.doc.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1), event.clientX, event.clientY);
  }, { passive: false });

  $('context-menu').addEventListener('pointerover', event => {
    const host = (event.target as HTMLElement).closest<HTMLElement>('.menu-sub');
    if (!host || host.contains(event.relatedTarget as Node)) return;
    placeSubmenu(host);
  });
  $('context-menu').addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
    if (!button) return;
    const action = menuActions[Number(button.dataset.action)];
    closeContext();
    action?.();
  });
  $('context-menu').addEventListener('input', event => {
    const input = event.target as HTMLInputElement;
    if (!input.dataset.slider) return;
    menuActions[Number(input.dataset.slider)]?.(Number(input.value));
  });
  $('context-menu').addEventListener('change', event => {
    const input = event.target as HTMLInputElement;
    if (!input.dataset.commit) return;
    const action = menuActions[Number(input.dataset.commit)];
    closeContext();
    action?.(Number(input.value));
  });
  document.addEventListener('pointerdown', event => {
    const target = event.target as HTMLElement;
    if (!target.closest('.menu-wrap')) closeMenus();
    if (!target.closest('#context-menu')) closeContext();
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
  document.addEventListener('change', event => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.closest('dialog')) return;
    const release = target instanceof HTMLSelectElement
      || (target instanceof HTMLInputElement && ['range', 'color', 'checkbox', 'radio'].includes(target.type));
    if (release) target.blur();
  });
  $<HTMLInputElement>('primary-input').addEventListener('input', event => {
    editor.colorSlot = 'primary';
    editor.primary = withAlpha((event.target as HTMLInputElement).value, alphaOf(editor.primary));
    editor.notify();
  });
  $<HTMLInputElement>('secondary-input').addEventListener('input', event => {
    editor.colorSlot = 'secondary';
    editor.secondary = withAlpha((event.target as HTMLInputElement).value, alphaOf(editor.secondary));
    editor.notify();
  });
  $<HTMLInputElement>('alpha-slider').addEventListener('input', event => {
    const alpha = Number((event.target as HTMLInputElement).value);
    editor[editor.colorSlot] = withAlpha(editor[editor.colorSlot], alpha);
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
  window.addEventListener('keydown', event => onKey(event, editor, tools), true);
  window.addEventListener('keyup', event => {
    tools.syncConstraint(event);
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'd') event.preventDefault();
    if (event.key === ' ') editor.space = false;
  }, true);
  window.addEventListener('resize', () => paintRulers(editor));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (localStorage.getItem('pinta-theme')) return;
    applyTheme(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    editor.notify();
  });
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
    const color = button.dataset.color;
    openContext(event.clientX, event.clientY, [
      { label: 'Use as primary', action: () => { editor.colorSlot = 'primary'; editor.primary = color; editor.notify(); } },
      { label: 'Use as secondary', action: () => { editor.colorSlot = 'secondary'; editor.secondary = color; editor.notify(); } },
      { label: 'Remove', action: () => { editor.palette = editor.palette.filter(item => item !== color); editor.notify(); } },
    ]);
  });
  let layerDrag: { from: number; x: number; y: number; pointer: number; active: boolean } | null = null;
  let suppressLayerClick = false;
  const clearDragOver = () => document.querySelectorAll('.layer-row.drag-over').forEach(row => row.classList.remove('drag-over'));
  const rowAt = (y: number) => [...document.querySelectorAll<HTMLElement>('#layer-list .layer-row')].find(row => {
    const box = row.getBoundingClientRect();
    return y >= box.top && y <= box.bottom;
  }) ?? null;
  const placeLayer = (from: number, row: HTMLElement) => {
    if (!editor.doc || Number.isNaN(from)) return;
    if (row.dataset.group && !row.dataset.layer) {
      const id = Number(row.dataset.group);
      const last = editor.doc.layers.reduce((found, layer, index) => layer.parent === id ? index : found, -1);
      editor.reorderLayer(from, last < 0 ? editor.doc.layers.length : last + 1, id);
      return;
    }
    if (!row.dataset.layer) return;
    const to = Number(row.dataset.layer);
    editor.reorderLayer(from, to, editor.doc.layers[to]?.parent ?? null);
  };
  $('layer-list').addEventListener('click', event => {
    if (suppressLayerClick) {
      suppressLayerClick = false;
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest('[data-visible], [data-group-visible]')) return;
    const collapse = target.closest<HTMLElement>('[data-collapse]');
    if (collapse?.dataset.collapse) {
      editor.toggleGroupCollapsed(Number(collapse.dataset.collapse));
      return;
    }
    const row = target.closest<HTMLElement>('[data-layer]');
    if (!row?.dataset.layer || !editor.doc) return;
    editor.doc.active = Number(row.dataset.layer);
    editor.renderScene();
    editor.notify();
  });
  $('layer-list').addEventListener('change', event => {
    const input = event.target as HTMLInputElement;
    if (input.dataset.visible != null && input.dataset.layer) editor.setLayerVisible(Number(input.dataset.layer), input.checked);
    if (input.dataset.groupVisible) editor.setGroupVisible(Number(input.dataset.groupVisible), input.checked);
  });
  $('layer-list').addEventListener('contextmenu', event => {
    event.preventDefault();
    const group = (event.target as HTMLElement).closest<HTMLElement>('[data-group]');
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-layer]');
    if (row?.dataset.layer) openContext(event.clientX, event.clientY, layerContext(editor, Number(row.dataset.layer)));
    else if (group?.dataset.group) openContext(event.clientX, event.clientY, groupContext(editor, Number(group.dataset.group)));
    else openContext(event.clientX, event.clientY, [
      { label: 'Add layer', action: () => editor.addLayer() },
      { label: 'Flatten image', action: () => editor.flatten() },
    ]);
  });
  $('layer-list').addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('input, [data-collapse], .layer-rename')) return;
    const row = target.closest<HTMLElement>('.layer-row[data-layer]');
    if (!row?.dataset.layer) return;
    layerDrag = { from: Number(row.dataset.layer), x: event.clientX, y: event.clientY, pointer: event.pointerId, active: false };
    row.setPointerCapture(event.pointerId);
  });
  $('layer-list').addEventListener('pointermove', event => {
    if (!layerDrag || event.pointerId !== layerDrag.pointer) return;
    if (!layerDrag.active && Math.hypot(event.clientX - layerDrag.x, event.clientY - layerDrag.y) < 5) return;
    layerDrag.active = true;
    clearDragOver();
    rowAt(event.clientY)?.classList.add('drag-over');
  });
  $('layer-list').addEventListener('pointerup', event => {
    if (!layerDrag || event.pointerId !== layerDrag.pointer) return;
    const drag = layerDrag;
    layerDrag = null;
    clearDragOver();
    if (!drag.active) return;
    suppressLayerClick = true;
    const hit = rowAt(event.clientY);
    if (hit) placeLayer(drag.from, hit);
  });
  $('layer-list').addEventListener('pointercancel', () => {
    layerDrag = null;
    clearDragOver();
  });
  $('history-list').addEventListener('click', event => {
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-cursor]');
    if (row) editor.jump(Number(row.dataset.cursor));
  });
  $('history-list').addEventListener('contextmenu', event => {
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-cursor]');
    if (!row) return;
    event.preventDefault();
    const cursor = Number(row.dataset.cursor);
    openContext(event.clientX, event.clientY, [
      { label: 'Revert to here', action: () => editor.jump(cursor) },
    ]);
  });
  $('tabs').addEventListener('contextmenu', event => {
    const tab = (event.target as HTMLElement).closest<HTMLElement>('[data-tab]');
    if (!tab?.dataset.tab) return;
    event.preventDefault();
    const index = Number(tab.dataset.tab);
    openContext(event.clientX, event.clientY, [
      { label: 'Close', action: () => editor.close(index) },
      { label: 'Close others', action: () => {
        const keep = editor.docs[index];
        for (let cursor = editor.docs.length - 1; cursor >= 0; cursor--) {
          if (editor.docs[cursor] !== keep) editor.close(cursor);
        }
      } },
    ]);
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
  else if (command === 'theme-dark') toggleTheme(editor);
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

function applyTheme(theme: 'dark' | 'light'): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#242424' : '#fafafa');
}

function toggleTheme(editor: Editor): void {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('pinta-theme', next);
  applyTheme(next);
  editor.notify();
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
  if (mime === 'application/pinta') await editor.exportPinta(filename);
  else await editor.exportImage(mime, filename);
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
  editor.pasteCanvas(source, destination);
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
    editor.pasteCanvas(canvas, 'new-image');
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
  tools.syncConstraint(event);
  const key = event.key.toLowerCase();
  const ctrl = event.ctrlKey || event.metaKey;
  if (ctrl && !event.shiftKey && key === 'd') {
    event.preventDefault();
    event.stopPropagation();
    if (!editing()) editor.deselect();
    return;
  }
  if (event.key === ' ' && !editing()) {
    editor.space = true;
    event.preventDefault();
  }
  if (editing() && event.key !== 'Escape') return;
  if (event.target instanceof HTMLSelectElement && !ctrl && event.key !== 'Escape') return;
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
    if (document.activeElement?.classList.contains('document-rename')) return;
    if (!$('context-menu').hidden) closeContext();
    else if (editor.float) editor.cancelFloat();
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
    if (next === 'picker') editor.rememberTool();
    editor.tool = next;
    editor.notify();
  }
  if (event.key === '[' || event.key === ']' || key === 'x') editor.notify();
}

let optionTool: ToolId | null = null;

interface ContextEntry {
  label?: string;
  checked?: boolean;
  action?: () => void;
  children?: ContextEntry[];
  separator?: boolean;
  slider?: { value: number; min: number; max: number; live: (value: number) => void; commit: (value: number) => void };
}

let menuActions: Array<((value?: number) => void) | undefined> = [];

function closeContext(): void {
  const menu = document.getElementById('context-menu');
  if (menu) menu.hidden = true;
  menuActions = [];
}

function openContext(x: number, y: number, entries: ContextEntry[]): void {
  const menu = $('context-menu');
  menuActions = [];
  menu.innerHTML = contextHtml(entries);
  menu.hidden = false;
  placeOnScreen(menu, x, y);
}

function viewSize(): { width: number; height: number } {
  const view = window.visualViewport;
  return {
    width: view?.width ?? document.documentElement.clientWidth,
    height: view?.height ?? document.documentElement.clientHeight,
  };
}

function placeOnScreen(menu: HTMLElement, x: number, y: number): void {
  const margin = 8;
  const size = viewSize();
  menu.style.left = `${margin}px`;
  menu.style.top = `${margin}px`;
  const left = Math.min(Math.max(margin, x), Math.max(margin, size.width - menu.offsetWidth - margin));
  const top = Math.min(Math.max(margin, y), Math.max(margin, size.height - menu.offsetHeight - margin));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  const box = menu.getBoundingClientRect();
  const fitted = viewSize();
  if (box.right > fitted.width - margin) menu.style.left = `${Math.max(margin, fitted.width - box.width - margin)}px`;
  if (box.bottom > fitted.height - margin) menu.style.top = `${Math.max(margin, fitted.height - box.height - margin)}px`;
}

function placeSubmenu(host: HTMLElement): void {
  const sub = host.querySelector<HTMLElement>(':scope > .submenu');
  if (!sub) return;
  const margin = 8;
  const shown = sub.style.display;
  sub.style.display = 'block';
  sub.style.left = '0px';
  sub.style.right = 'auto';
  sub.style.top = '0px';
  const parent = host.getBoundingClientRect();
  const width = sub.offsetWidth;
  const height = sub.offsetHeight;
  const view = viewSize();
  const roomRight = view.width - margin - parent.right;
  const roomLeft = parent.left - margin;
  const openLeft = width > roomRight && roomLeft >= roomRight;
  if (openLeft) {
    sub.style.left = 'auto';
    sub.style.right = `${Math.max(0, host.offsetWidth - 4)}px`;
  } else {
    sub.style.left = `${Math.max(0, host.offsetWidth - 4)}px`;
    sub.style.right = 'auto';
  }
  let top = 0;
  if (parent.top + height > view.height - margin) top = view.height - margin - height - parent.top;
  if (parent.top + top < margin) top = margin - parent.top;
  sub.style.top = `${Math.round(top)}px`;
  sub.style.display = shown;
}

function contextHtml(entries: ContextEntry[]): string {
  return entries.map(entry => {
    if (entry.separator) return '<div class="menu-sep"></div>';
    if (entry.slider) {
      const live = menuActions.push(value => entry.slider?.live(value ?? entry.slider.value)) - 1;
      const commit = menuActions.push(value => entry.slider?.commit(value ?? entry.slider.value)) - 1;
      return `<label class="menu-slider">${escapeHtml(entry.label ?? '')}<input type="range" min="${entry.slider.min}" max="${entry.slider.max}" value="${entry.slider.value}" data-slider="${live}" data-commit="${commit}" /></label>`;
    }
    if (entry.children) {
      return `<div class="menu-sub"><button type="button">${escapeHtml(entry.label ?? '')}<span>›</span></button><div class="submenu">${contextHtml(entry.children)}</div></div>`;
    }
    const index = menuActions.push(() => entry.action?.()) - 1;
    return `<button type="button" data-action="${index}"><span>${escapeHtml(entry.label ?? '')}</span><i class="menu-mark${entry.checked ? ' on' : ''}"></i></button>`;
  }).join('');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

function rgbOf(hex: string): string {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map(char => char + char).join('') : value;
  return `#${(full.slice(0, 6) || '000000').padEnd(6, '0')}`;
}

function alphaOf(hex: string): number {
  const value = hex.replace('#', '');
  return value.length >= 8 ? Number.parseInt(value.slice(6, 8), 16) : 255;
}

function withAlpha(hex: string, alpha: number): string {
  const byte = Math.max(0, Math.min(255, Math.round(alpha))).toString(16).padStart(2, '0');
  return `${rgbOf(hex)}${byte}`;
}

function groupDepth(editor: Editor, parent: number | null): number {
  const doc = editor.doc;
  let depth = 0;
  const seen = new Set<number>();
  while (doc && parent != null && !seen.has(parent)) {
    seen.add(parent);
    depth += 1;
    parent = doc.groups.find(group => group.id === parent)?.parent ?? null;
  }
  return depth;
}

function layerMarkup(editor: Editor): string {
  const doc = editor.doc;
  if (!doc) return '';
  const seen = new Set<number>();
  const rows: string[] = [];
  for (let index = doc.layers.length - 1; index >= 0; index--) {
    const layer = doc.layers[index];
    const chain: number[] = [];
    let parent = layer.parent;
    const walked = new Set<number>();
    while (parent != null && !walked.has(parent)) {
      walked.add(parent);
      chain.push(parent);
      parent = doc.groups.find(group => group.id === parent)?.parent ?? null;
    }
    chain.reverse();
    let hidden = false;
    for (const id of chain) {
      const group = doc.groups.find(item => item.id === id);
      if (!group) continue;
      if (!hidden && !seen.has(id)) {
        seen.add(id);
        rows.push(groupRow(group, groupDepth(editor, group.parent)));
      }
      if (group.collapsed) hidden = true;
    }
    if (hidden) continue;
    rows.push(layerRow(layer, index, groupDepth(editor, layer.parent), index === doc.active));
  }
  for (const group of doc.groups) {
    if (seen.has(group.id)) continue;
    rows.push(groupRow(group, groupDepth(editor, group.parent)));
  }
  return rows.join('');
}

function groupRow(group: { id: number; name: string; visible: boolean; collapsed: boolean; tag: string | null }, depth: number): string {
  return `<li class="layer-row group-row" data-group="${group.id}" style="padding-left:${depth * 12}px"><button type="button" class="chevron${group.collapsed ? ' collapsed' : ''}" data-collapse="${group.id}" aria-label="${group.collapsed ? 'Expand group' : 'Collapse group'}"></button><button type="button" class="layer" data-group="${group.id}"><i class="tag" style="background:${group.tag || DEFAULT_TAG}"></i><span class="layer-name">${escapeHtml(group.name)}</span></button><input type="checkbox" data-group-visible="${group.id}" ${group.visible ? 'checked' : ''} aria-label="Group visible" /></li>`;
}

function layerRow(layer: { name: string; visible: boolean; opacity: number; tag: string | null }, index: number, depth: number, active: boolean): string {
  return `<li class="layer-row" data-layer="${index}" style="padding-left:${depth * 12}px"><button type="button" class="layer" data-layer="${index}" data-active="${active}"><i class="tag" style="background:${layer.tag || DEFAULT_TAG}"></i><span class="layer-name">${escapeHtml(layer.name)}</span><span class="layer-meta">${layer.opacity}%</span></button><input type="checkbox" data-visible data-layer="${index}" ${layer.visible ? 'checked' : ''} aria-label="${layer.visible ? 'Hide layer' : 'Show layer'}" /></li>`;
}

function useLayer(editor: Editor, index: number): void {
  if (editor.doc) editor.doc.active = index;
}

function tagMenu(apply: (tag: string | null) => void, current: string | null): ContextEntry {
  const selected = (current || DEFAULT_TAG).toLowerCase();
  return {
    label: 'Color tag',
    children: LAYER_TAGS.map(tag => ({
      label: tag.name,
      checked: selected === tag.color,
      action: () => apply(tag.color),
    })),
  };
}

function layerContext(editor: Editor, index: number): ContextEntry[] {
  const layer = editor.doc?.layers[index];
  if (!layer) return [];
  return [
    { label: 'Rename', action: () => renameInline(editor, index) },
    tagMenu(tag => editor.setLayerTag(index, tag), layer.tag),
    {
      label: 'Blending mode',
      children: BLEND_MODES.map(mode => ({
        label: mode,
        checked: layer.blend === mode,
        action: () => editor.setLayerBlend(index, mode as BlendMode),
      })),
    },
    {
      label: 'Opacity',
      slider: {
        value: layer.opacity,
        min: 0,
        max: 100,
        live: value => editor.setLayerOpacity(index, value, false),
        commit: value => editor.setLayerOpacity(index, value, true),
      },
    },
    { separator: true },
    { label: 'Duplicate layer', action: () => { useLayer(editor, index); editor.duplicateLayer(); } },
    { label: 'Delete layer', action: () => { useLayer(editor, index); editor.deleteLayer(); } },
    { label: 'Add layer above', action: () => { useLayer(editor, index); editor.insertLayer('above'); } },
    { label: 'Add layer below', action: () => { useLayer(editor, index); editor.insertLayer('below'); } },
    { label: 'Merge layer below', action: () => { useLayer(editor, index); editor.mergeDown(); } },
    { label: 'Clipping mask', checked: layer.clip, action: () => editor.setLayerClip(index, !layer.clip) },
    { separator: true },
    { label: 'Group layer', action: () => editor.groupLayer(index) },
    { label: 'Remove from group', action: () => editor.reorderLayer(index, index, null) },
    { separator: true },
    { label: 'Flip horizontal', action: () => { useLayer(editor, index); editor.flip(true, 'layer'); } },
    { label: 'Flip vertical', action: () => { useLayer(editor, index); editor.flip(false, 'layer'); } },
    { label: 'Invert colors', action: () => editor.invertLayer(index) },
    { label: 'Clear layer', action: () => editor.clearLayer(index) },
    { label: 'Select pixels', action: () => editor.selectLayerPixels(index) },
    { separator: true },
    { label: 'Flatten image', action: () => editor.flatten() },
  ];
}

function groupContext(editor: Editor, id: number): ContextEntry[] {
  const group = editor.doc?.groups.find(item => item.id === id);
  if (!group) return [];
  return [
    { label: 'Rename', action: () => renameGroupInline(editor, id) },
    tagMenu(tag => editor.setGroupTag(id, tag), group.tag),
    { label: group.collapsed ? 'Expand group' : 'Collapse group', action: () => editor.toggleGroupCollapsed(id) },
    { label: 'Add layer inside', action: () => editor.addLayerInGroup(id) },
    { separator: true },
    { label: 'Flatten group', action: () => editor.flattenGroup(id) },
    { label: 'Ungroup', action: () => editor.ungroup(id) },
    { separator: true },
    { label: 'Flatten image', action: () => editor.flatten() },
  ];
}

function renameInline(editor: Editor, index: number): void {
  const name = document.querySelector<HTMLElement>(`.layer-row[data-layer="${index}"] .layer-name`);
  const layer = editor.doc?.layers[index];
  if (!name || !layer) return;
  const input = document.createElement('input');
  input.className = 'layer-rename';
  input.value = layer.name;
  name.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const commit = () => {
    if (done) return;
    done = true;
    editor.renameLayer(index, input.value);
  };
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') commit();
    if (event.key === 'Escape') {
      done = true;
      editor.notify();
    }
  });
  input.addEventListener('blur', commit);
}

function renameGroupInline(editor: Editor, id: number): void {
  const name = document.querySelector<HTMLElement>(`.group-row[data-group="${id}"] .layer-name`);
  const group = editor.doc?.groups.find(item => item.id === id);
  if (!name || !group) return;
  const input = document.createElement('input');
  input.className = 'layer-rename';
  input.value = group.name;
  name.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const commit = () => {
    if (done) return;
    done = true;
    editor.renameGroup(id, input.value);
  };
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') commit();
    if (event.key === 'Escape') {
      done = true;
      editor.notify();
    }
  });
  input.addEventListener('blur', commit);
}

function sync(editor: Editor): void {
  const doc = editor.doc;
  const app = $('app');
  const dark = document.documentElement.dataset.theme === 'dark';
  const themeButton = document.querySelector<HTMLButtonElement>('[data-command="theme-dark"]');
  if (themeButton) themeButton.setAttribute('aria-checked', String(dark));
  const themeMark = document.getElementById('theme-mark');
  if (themeMark) themeMark.textContent = dark ? 'On' : 'Off';
  app.dataset.rulers = editor.show.rulers ? '1' : '0';
  app.dataset.status = editor.show.status ? '1' : '0';
  app.dataset.tools = editor.show.tools ? '1' : '0';
  app.dataset.toolbar = editor.show.toolbar ? '1' : '0';
  app.dataset.docks = editor.show.docks ? '1' : '0';
  app.dataset.tabs = editor.show.tabs ? '1' : '0';
  if (!$('document-name').querySelector('input')) $('document-name').textContent = doc ? `${doc.name}${editor.dirty ? ' •' : ''}` : 'Pinta';
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
  $<HTMLInputElement>('primary-input').value = rgbOf(editor.primary);
  $<HTMLInputElement>('secondary-input').value = rgbOf(editor.secondary);
  const alphaSlider = $<HTMLInputElement>('alpha-slider');
  if (document.activeElement !== alphaSlider) alphaSlider.value = String(alphaOf(editor[editor.colorSlot]));
  $('alpha-preview').style.setProperty('--alpha-color', rgbOf(editor[editor.colorSlot]));
  $('palette').innerHTML = editor.palette.map(color => `<button type="button" data-color="${color}" style="background:${color}" aria-label="${color}"></button>`).join('');
  $('layer-list').innerHTML = layerMarkup(editor);
  $('history-list').innerHTML = doc ? doc.labels.map((label, index) => `<li><button type="button" class="history-item" data-cursor="${index}" ${index === doc.cursor ? 'aria-current="true"' : ''}>${label}</button></li>`).join('') : '';
  $('tabs').innerHTML = editor.docs.map((item, index) => `<div class="tab" data-tab="${index}" role="tab" aria-selected="${index === editor.index}"><span>${item.name}</span><button type="button" data-tab-close aria-label="Close ${item.name}">x</button></div>`).join('');
  paintRulers(editor);
}

function extraOptions(editor: Editor): string {
  const tool = editor.tool;
  const drawing = ['brush', 'pen', 'pencil', 'eraser', 'random', 'recolor', 'line', 'rectangle', 'rounded', 'ellipse', 'lasso-draw', 'text', 'lighten', 'darken', 'dither'].includes(tool);
  const parts: string[] = [];
  if (drawing || tool === 'bucket' || tool === 'gradient') {
    parts.push(`<label class="option">Opacity <input id="opacity-slider" type="range" min="1" max="100" value="${editor.opacity}" /></label>`);
  }
  if (tool === 'brush' || tool === 'eraser') {
    parts.push(`<label class="option">Brush <select id="brush-select">${['plain', 'circle', 'squares', 'splatter', 'slash', 'grid'].map(id => `<option value="${id}" ${id === editor.brush ? 'selected' : ''}>${id}</option>`).join('')}</select></label>`);
  }
  if (tool === 'eraser') parts.push(`<label class="option">Edge <select id="eraser-select"><option value="hard">Hard</option><option value="soft" ${editor.eraser === 'soft' ? 'selected' : ''}>Soft</option></select></label>`);
  if (tool === 'bucket' || tool === 'wand' || tool === 'recolor') parts.push(`<label class="option">Tolerance <input id="tolerance-slider" type="range" min="0" max="100" value="${editor.tolerance}" /></label>`);
  if (tool === 'recolor') parts.push(`<label class="check"><input id="recolor-global" type="checkbox" ${editor.recolorGlobal ? 'checked' : ''}/> Global</label>`);
  if (tool === 'rectangle' || tool === 'rounded' || tool === 'ellipse' || tool === 'lasso-draw') {
    parts.push(`<label class="option">Style <select id="shape-select"><option value="outline">Outline</option><option value="fill" ${editor.shape === 'fill' ? 'selected' : ''}>Fill</option><option value="both" ${editor.shape === 'both' ? 'selected' : ''}>Fill and outline</option></select></label>`);
  }
  if (tool === 'rounded') parts.push(`<label class="option">Corner <input id="corner-slider" type="range" min="0" max="200" value="${editor.corner}" /></label>`);
  if (tool === 'line') {
    parts.push(`<label class="option">Mode <select id="line-select"><option value="straight">Straight</option><option value="curve" ${editor.lineMode === 'curve' ? 'selected' : ''}>Curve</option></select></label>`);
    parts.push(`<label class="check"><input id="alias-check" type="checkbox" ${editor.antialias ? 'checked' : ''}/> Antialias</label>`);
  }
  if (tool === 'gradient') parts.push(`<label class="option">Kind <select id="gradient-select">${['linear', 'radial', 'diamond', 'conical'].map(id => `<option value="${id}" ${id === editor.gradient ? 'selected' : ''}>${id}</option>`).join('')}</select></label>`);
  if (tool === 'text') parts.push(`<label class="option">Font <input id="font-input" type="text" value="${editor.font}" /></label>`);
  if (tool === 'lighten' || tool === 'darken') {
    parts.push(`<label class="option">Amount <input id="tone-amount" type="range" min="1" max="100" value="${editor.toneAmount}" /></label>`);
    parts.push(`<label class="option">Rate <input id="tone-rate" type="range" min="0" max="10" step="1" value="${editor.toneRate}" /></label>`);
  }
  if (tool === 'random') {
    const low = Math.min(editor.randomLow, editor.randomHigh);
    const high = Math.max(editor.randomLow, editor.randomHigh);
    parts.push(`<label class="option">Random <span class="dual-range"><input id="random-low" type="range" min="-255" max="255" value="${low}" aria-label="Random minimum" /><input id="random-high" type="range" min="-255" max="255" value="${high}" aria-label="Random maximum" /></span><span id="random-readout">${low} to ${high}</span></label>`);
    parts.push(`<label class="option">Rate <input id="random-rate" type="range" min="0" max="10" step="1" value="${editor.randomRate}" /></label>`);
    parts.push(`<label class="check"><input id="random-alpha" type="checkbox" ${editor.randomAlpha ? 'checked' : ''}/> Randomize alpha</label>`);
  }
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
  listen('tone-amount', value => { editor.toneAmount = Number(value); });
  listen('tone-rate', value => { editor.toneRate = Number(value); });
  listen('random-rate', value => { editor.randomRate = Number(value); });
  const readRandom = () => {
    const low = document.getElementById('random-low') as HTMLInputElement | null;
    const high = document.getElementById('random-high') as HTMLInputElement | null;
    const readout = document.getElementById('random-readout');
    if (!low || !high) return;
    editor.randomLow = Number(low.value);
    editor.randomHigh = Number(high.value);
    if (readout) {
      const start = Math.min(editor.randomLow, editor.randomHigh);
      const end = Math.max(editor.randomLow, editor.randomHigh);
      readout.textContent = `${start} to ${end}`;
    }
  };
  document.getElementById('random-low')?.addEventListener('input', readRandom);
  document.getElementById('random-high')?.addEventListener('input', readRandom);
  document.getElementById('recolor-global')?.addEventListener('change', event => {
    editor.recolorGlobal = (event.target as HTMLInputElement).checked;
  });
  document.getElementById('random-alpha')?.addEventListener('change', event => {
    editor.randomAlpha = (event.target as HTMLInputElement).checked;
  });
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
  const theme = getComputedStyle(document.documentElement);
  ctx.fillStyle = theme.getPropertyValue('--muted').trim();
  ctx.strokeStyle = theme.getPropertyValue('--tick').trim();
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
