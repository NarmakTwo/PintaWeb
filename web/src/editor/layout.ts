import { ADJUSTMENTS, ALL_EFFECTS, EFFECTS } from './commands.ts';
import { TOOLS, toolFromShortcut, type ToolId } from './types.ts';

export type MenuId = 'file' | 'edit' | 'view' | 'image' | 'layers' | 'adjustments' | 'effects' | 'window' | 'help';
export type DockId = 'color' | 'layers' | 'history';
export type DockSide = 'toolbox' | 'docks';

export interface DockEntry {
  id: DockId;
  side: DockSide;
  collapsed: boolean;
}

export interface Layout {
  tools: ToolId[];
  menus: Record<MenuId, string[]>;
  menuCustom: Record<MenuId, boolean>;
  shortcuts: Record<string, string>;
  toolboxSide: 'left' | 'right';
  docks: DockEntry[];
  custom: boolean;
}

export const MENU_IDS: MenuId[] = ['file', 'edit', 'view', 'image', 'layers', 'adjustments', 'effects', 'window', 'help'];
export const MENU_LABELS: Record<MenuId, string> = {
  file: 'File', edit: 'Edit', view: 'View', image: 'Image', layers: 'Layers',
  adjustments: 'Adjustments', effects: 'Effects', window: 'Window', help: 'Help',
};

const KEY = 'pinta-layout';

const COMMANDS: { id: string; label: string; shortcut: string; sentence: string }[] = [
  { id: 'new', label: 'New…', shortcut: 'ctrl+n', sentence: 'Open a blank image.' },
  { id: 'open', label: 'Open…', shortcut: 'ctrl+o', sentence: 'Open an image from this computer.' },
  { id: 'close', label: 'Close', shortcut: 'ctrl+w', sentence: 'Close the current image.' },
  { id: 'close-all', label: 'Close All', shortcut: '', sentence: 'Close every open image.' },
  { id: 'save', label: 'Save', shortcut: 'ctrl+s', sentence: 'Save the current image.' },
  { id: 'save-as', label: 'Save As…', shortcut: 'ctrl+shift+s', sentence: 'Save the current image under a new name.' },
  { id: 'save-all', label: 'Save All', shortcut: '', sentence: 'Save every open image.' },
  { id: 'import-layer', label: 'Import as Layer…', shortcut: '', sentence: 'Add an image file as a layer.' },
  { id: 'open-palette', label: 'Open Palette…', shortcut: '', sentence: 'Load a palette file.' },
  { id: 'save-palette', label: 'Save Palette', shortcut: '', sentence: 'Save the palette to a file.' },
  { id: 'reset-palette', label: 'Reset Palette', shortcut: '', sentence: 'Put the original swatches back.' },
  { id: 'screenshot', label: 'Take Screenshot…', shortcut: '', sentence: 'Copy the window as an image.' },
  { id: 'quit', label: 'Quit', shortcut: '', sentence: 'Close Pinta.' },
  { id: 'undo', label: 'Undo', shortcut: 'ctrl+z', sentence: 'Undo the last change.' },
  { id: 'redo', label: 'Redo', shortcut: 'ctrl+y', sentence: 'Redo the change you undid.' },
  { id: 'cut', label: 'Cut', shortcut: 'ctrl+x', sentence: 'Cut the selection to the clipboard.' },
  { id: 'copy', label: 'Copy', shortcut: 'ctrl+c', sentence: 'Copy the selection.' },
  { id: 'copy-merged', label: 'Copy Merged', shortcut: 'ctrl+shift+c', sentence: 'Copy the flattened selection.' },
  { id: 'paste', label: 'Paste', shortcut: 'ctrl+v', sentence: 'Paste the clipboard onto this layer.' },
  { id: 'paste-layer', label: 'Paste Into New Layer', shortcut: 'ctrl+shift+v', sentence: 'Paste the clipboard as a new layer.' },
  { id: 'paste-image', label: 'Paste Into New Image', shortcut: '', sentence: 'Paste the clipboard as a new image.' },
  { id: 'erase-selection', label: 'Erase Selection', shortcut: '', sentence: 'Clear the pixels inside the selection.' },
  { id: 'fill-selection', label: 'Fill Selection', shortcut: '', sentence: 'Fill the selection with the primary color.' },
  { id: 'invert-selection', label: 'Invert Selection', shortcut: '', sentence: 'Select everything outside the selection.' },
  { id: 'offset-selection', label: 'Offset Selection…', shortcut: '', sentence: 'Move the selection by a typed amount.' },
  { id: 'select-all', label: 'Select All', shortcut: 'ctrl+a', sentence: 'Select the whole image.' },
  { id: 'deselect', label: 'Deselect', shortcut: 'ctrl+d', sentence: 'Clear the selection.' },
  { id: 'adjust-stroke', label: 'Adjust Last Stroke', shortcut: '', sentence: 'Drag the points of the last freehand stroke.' },
  { id: 'zoom-in', label: 'Zoom In', shortcut: '', sentence: 'Zoom the canvas in.' },
  { id: 'zoom-out', label: 'Zoom Out', shortcut: '', sentence: 'Zoom the canvas out.' },
  { id: 'zoom-100', label: 'Normal Size', shortcut: 'ctrl+0', sentence: 'Show the image at 100%.' },
  { id: 'zoom-fit', label: 'Best Fit', shortcut: '', sentence: 'Fit the image in the window.' },
  { id: 'zoom-selection', label: 'Zoom to Selection', shortcut: '', sentence: 'Fit the selection in the window.' },
  { id: 'toggle-rulers', label: 'Rulers', shortcut: '', sentence: 'Show or hide the rulers.' },
  { id: 'toggle-status', label: 'Status Bar', shortcut: '', sentence: 'Show or hide the status bar.' },
  { id: 'toggle-tools', label: 'Tool Box', shortcut: '', sentence: 'Show or hide the toolbox.' },
  { id: 'toggle-toolbar', label: 'Tool Options', shortcut: '', sentence: 'Show or hide the tool options.' },
  { id: 'toggle-docks', label: 'Layers and History', shortcut: '', sentence: 'Show or hide the side docks.' },
  { id: 'toggle-tabs', label: 'Image Tabs', shortcut: '', sentence: 'Show or hide the image tabs.' },
  { id: 'toggle-timeline', label: 'Timeline', shortcut: '', sentence: 'Show or hide the animation timeline.' },
  { id: 'convert-object', label: 'Convert to Object', shortcut: '', sentence: 'Turn the selection into a reusable object.' },
  { id: 'toggle-grid', label: 'Pixel Grid', shortcut: '', sentence: 'Show or hide the pixel grid.' },
  { id: 'grid-size', label: 'Grid Size…', shortcut: '', sentence: 'Set the grid spacing.' },
  { id: 'grid-square', label: 'Square Grid', shortcut: '', sentence: 'Use a square grid.' },
  { id: 'grid-iso', label: 'Isometric Grid', shortcut: '', sentence: 'Use an isometric grid.' },
  { id: 'toggle-snap', label: 'Snap to Grid', shortcut: '', sentence: 'Pull strokes onto the grid.' },
  { id: 'reset-view', label: 'Reset View', shortcut: '', sentence: 'Clear the view rotation.' },
  { id: 'assist-none', label: 'Assistant: None', shortcut: '', sentence: 'Turn the drawing assistant off.' },
  { id: 'assist-parallel', label: 'Parallel Lines', shortcut: '', sentence: 'Stick strokes to parallel lines.' },
  { id: 'assist-ellipse', label: 'Ellipse Guide', shortcut: '', sentence: 'Stick strokes to an ellipse.' },
  { id: 'assist-vanish', label: 'Vanishing Point', shortcut: '', sentence: 'Stick strokes to a vanishing point.' },
  { id: 'toggle-cursor', label: 'Brush Cursor', shortcut: '', sentence: 'Show the brush size under the pointer.' },
  { id: 'live-stroke-render', label: 'Live Stroke Render', shortcut: '', sentence: 'Paint full brush dynamics while dragging. Off keeps a lightweight preview until you release.' },
  { id: 'unit-px', label: 'Pixels', shortcut: '', sentence: 'Show measurements in pixels.' },
  { id: 'unit-in', label: 'Inches', shortcut: '', sentence: 'Show measurements in inches.' },
  { id: 'unit-cm', label: 'Centimeters', shortcut: '', sentence: 'Show measurements in centimeters.' },
  { id: 'theme-dark', label: 'Dark Mode', shortcut: '', sentence: 'Switch between light and dark.' },
  { id: 'fullscreen', label: 'Fullscreen', shortcut: '', sentence: 'Fill the screen.' },
  { id: 'crop', label: 'Crop to Selection', shortcut: '', sentence: 'Crop the image to the selection.' },
  { id: 'auto-crop', label: 'Auto Crop', shortcut: '', sentence: 'Crop away empty edges.' },
  { id: 'resize', label: 'Resize Image…', shortcut: '', sentence: 'Resize the image.' },
  { id: 'canvas-size', label: 'Canvas Size…', shortcut: '', sentence: 'Change the canvas size.' },
  { id: 'flip-h', label: 'Flip Horizontal', shortcut: '', sentence: 'Flip the image left to right.' },
  { id: 'flip-v', label: 'Flip Vertical', shortcut: '', sentence: 'Flip the image top to bottom.' },
  { id: 'rotate-cw', label: 'Rotate 90° Clockwise', shortcut: '', sentence: 'Rotate the image a quarter turn clockwise.' },
  { id: 'rotate-ccw', label: 'Rotate 90° Counter-Clockwise', shortcut: '', sentence: 'Rotate the image a quarter turn counter-clockwise.' },
  { id: 'rotate-180', label: 'Rotate 180°', shortcut: '', sentence: 'Turn the image upside down.' },
  { id: 'flatten', label: 'Flatten', shortcut: '', sentence: 'Merge every layer into one.' },
  { id: 'layer-add', label: 'Add New Layer', shortcut: 'ctrl+shift+n', sentence: 'Add a transparent layer.' },
  { id: 'layer-delete', label: 'Delete Layer', shortcut: 'ctrl+shift+delete', sentence: 'Delete the active layer.' },
  { id: 'layer-duplicate', label: 'Duplicate Layer', shortcut: 'ctrl+shift+d', sentence: 'Copy the active layer.' },
  { id: 'layer-merge', label: 'Merge Down', shortcut: 'ctrl+m', sentence: 'Merge the active layer into the one below.' },
  { id: 'layer-up', label: 'Move Up', shortcut: '', sentence: 'Move the active layer up.' },
  { id: 'layer-down', label: 'Move Down', shortcut: '', sentence: 'Move the active layer down.' },
  { id: 'layer-flip-h', label: 'Flip Horizontal', shortcut: 'ctrl+f', sentence: 'Flip the active layer left to right.' },
  { id: 'layer-flip-v', label: 'Flip Vertical', shortcut: 'shift+f', sentence: 'Flip the active layer top to bottom.' },
  { id: 'layer-rotate', label: 'Rotate / Zoom…', shortcut: '', sentence: 'Rotate or scale the active layer.' },
  { id: 'layer-mask', label: 'Add Mask', shortcut: '', sentence: 'Add a white mask to the active layer.' },
  { id: 'layer-unmask', label: 'Remove Mask', shortcut: '', sentence: 'Remove the mask and keep the pixels.' },
  { id: 'layer-properties', label: 'Properties…', shortcut: 'f4', sentence: 'Rename the layer and set its options.' },
  { id: 'customize', label: 'Customize', shortcut: '', sentence: 'Rearrange the toolbox, menus, shortcuts, and docks.' },
  { id: 'file-access', label: 'Give File Access', shortcut: '', sentence: 'Save later changes straight into the opened or saved file.' },
  { id: 'install', label: 'Install Pinta', shortcut: '', sentence: 'Install Pinta on this device.' },
  { id: 'import-config', label: 'Import Config', shortcut: '', sentence: 'Load images, brushes, and settings from a config file.' },
  { id: 'export-config', label: 'Export Config', shortcut: '', sentence: 'Save images, brushes, and settings to a config file.' },
  { id: 'restore-defaults', label: 'Restore to default', shortcut: '', sentence: 'Erase saved images, brushes, settings, and cached files on this site.' },
  { id: 'shortcuts', label: 'Keyboard Shortcuts', shortcut: '', sentence: 'Show the shortcut list.' },
  { id: 'about', label: 'About Pinta', shortcut: '', sentence: 'Show what this app is.' },
];

const commandById = new Map(COMMANDS.map(command => [command.id, command]));

function effectTokens(specs: typeof ADJUSTMENTS): string[] {
  return specs.map(spec => `effect:${spec.id}`);
}

function effectMenuTokens(): string[] {
  const categories = [...new Set(EFFECTS.map(effect => effect.category))];
  const tokens: string[] = [];
  for (const category of categories) {
    if (tokens.length) tokens.push('sep');
    for (const effect of EFFECTS.filter(item => item.category === category)) tokens.push(`effect:${effect.id}`);
  }
  return tokens;
}

function defaultMenus(): Record<MenuId, string[]> {
  return {
    file: ['new', 'open', 'sep', 'close', 'close-all', 'sep', 'save', 'save-as', 'save-all', 'sep', 'import-layer', 'sep', 'open-palette', 'save-palette', 'reset-palette', 'sep', 'screenshot', 'quit'],
    edit: ['undo', 'redo', 'sep', 'cut', 'copy', 'copy-merged', 'paste', 'paste-layer', 'paste-image', 'sep', 'convert-object', 'sep', 'erase-selection', 'fill-selection', 'invert-selection', 'offset-selection', 'sep', 'select-all', 'deselect', 'sep', 'adjust-stroke'],
    view: ['zoom-in', 'zoom-out', 'zoom-100', 'zoom-fit', 'zoom-selection', 'sep', 'toggle-rulers', 'toggle-status', 'toggle-tools', 'toggle-toolbar', 'toggle-docks', 'toggle-tabs', 'toggle-grid', 'grid-size', 'grid-square', 'grid-iso', 'toggle-snap', 'reset-view', 'assist-none', 'assist-parallel', 'assist-ellipse', 'assist-vanish', 'toggle-cursor', 'live-stroke-render', 'sep', 'unit-px', 'unit-in', 'unit-cm', 'sep', 'theme-dark', 'sep', 'fullscreen'],
    image: ['crop', 'auto-crop', 'sep', 'resize', 'canvas-size', 'sep', 'flip-h', 'flip-v', 'sep', 'rotate-cw', 'rotate-ccw', 'rotate-180', 'sep', 'flatten'],
    layers: ['layer-add', 'layer-delete', 'layer-duplicate', 'layer-merge', 'sep', 'layer-up', 'layer-down', 'sep', 'layer-flip-h', 'layer-flip-v', 'layer-rotate', 'sep', 'layer-mask', 'layer-unmask', 'layer-properties', 'import-layer'],
    adjustments: effectTokens(ADJUSTMENTS),
    effects: effectMenuTokens(),
    window: ['toggle-tools', 'toggle-toolbar', 'toggle-docks', 'toggle-tabs', 'toggle-timeline', 'toggle-status', 'customize', 'sep', 'file-access', 'install', 'sep', 'import-config', 'export-config', 'sep', 'restore-defaults'],
    help: ['shortcuts', 'about'],
  };
}

function blankCustom(): Record<MenuId, boolean> {
  return { file: false, edit: false, view: false, image: false, layers: false, adjustments: false, effects: false, window: false, help: false };
}

export function defaultLayout(): Layout {
  return {
    tools: TOOLS.map(tool => tool.id),
    menus: defaultMenus(),
    menuCustom: blankCustom(),
    shortcuts: {},
    toolboxSide: 'left',
    docks: [
      { id: 'color', side: 'toolbox', collapsed: false },
      { id: 'layers', side: 'docks', collapsed: false },
      { id: 'history', side: 'docks', collapsed: false },
    ],
    custom: false,
  };
}

export const WORKSPACES: Record<'draw' | 'pixel' | 'edit', { tools: ToolId[]; docks: DockEntry[] }> = {
  draw: {
    tools: ['brush', 'pencil', 'eraser', 'pen', 'bucket', 'picker'],
    docks: [
      { id: 'color', side: 'toolbox', collapsed: false },
      { id: 'layers', side: 'docks', collapsed: true },
      { id: 'history', side: 'docks', collapsed: true },
    ],
  },
  pixel: {
    tools: ['pencil', 'rect-select', 'ellipse-select', 'lasso', 'wand', 'bucket', 'eraser'],
    docks: [
      { id: 'color', side: 'toolbox', collapsed: true },
      { id: 'layers', side: 'docks', collapsed: false },
      { id: 'history', side: 'docks', collapsed: true },
    ],
  },
  edit: {
    tools: ['rect-select', 'ellipse-select', 'lasso', 'wand', 'move-pixels', 'move-selection'],
    docks: [
      { id: 'color', side: 'toolbox', collapsed: true },
      { id: 'layers', side: 'docks', collapsed: true },
      { id: 'history', side: 'docks', collapsed: false },
    ],
  },
};

let layout = defaultLayout();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function onLayout(listener: () => void): void {
  listeners.add(listener);
}

export function getLayout(): Layout {
  return layout;
}

export function toolSentence(id: ToolId): string {
  const tool = TOOLS.find(item => item.id === id);
  if (!tool) return '';
  const sentence = tool.hint.split('. ')[0]?.trim() ?? tool.label;
  return sentence.endsWith('.') ? sentence : `${sentence}.`;
}

export function toolById(id: ToolId): (typeof TOOLS)[number] | undefined {
  return TOOLS.find(tool => tool.id === id);
}

export function commandLabel(id: string): string {
  if (id.startsWith('effect:')) return ALL_EFFECTS.find(effect => effect.id === id.slice(7))?.label ?? id;
  return commandById.get(id)?.label ?? id;
}

export function commandSentence(id: string): string {
  if (id.startsWith('effect:')) {
    const label = commandLabel(id);
    return `Apply ${label}.`;
  }
  return commandById.get(id)?.sentence ?? commandLabel(id);
}

function cloneLayout(source: Layout): Layout {
  return JSON.parse(JSON.stringify(source)) as Layout;
}

export function loadLayout(): void {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Layout;
    if (!parsed || !Array.isArray(parsed.tools) || !parsed.menus || !parsed.docks) return;
    const next = defaultLayout();
    next.tools = parsed.tools.filter((id): id is ToolId => TOOLS.some(tool => tool.id === id));
    next.menus = { ...next.menus, ...parsed.menus };
    if (Array.isArray(next.menus.window) && !next.menus.window.includes('file-access')) {
      const installAt = next.menus.window.indexOf('install');
      if (installAt >= 0) next.menus.window.splice(installAt, 0, 'file-access');
      else next.menus.window.push('file-access');
    }
    if (Array.isArray(next.menus.window) && !next.menus.window.includes('import-config')) {
      const installAt = next.menus.window.indexOf('install');
      const tail = ['sep', 'import-config', 'export-config', 'sep', 'restore-defaults'];
      if (installAt >= 0) next.menus.window.splice(installAt + 1, 0, ...tail);
      else next.menus.window.push(...tail);
    }
    next.menuCustom = { ...next.menuCustom, ...parsed.menuCustom };
    next.shortcuts = parsed.shortcuts ?? {};
    next.toolboxSide = parsed.toolboxSide === 'right' ? 'right' : 'left';
    if (Array.isArray(parsed.docks) && parsed.docks.length) next.docks = parsed.docks;
    next.custom = true;
    layout = next;
  } catch { /* keep the default */ }
}

function persist(): void {
  layout.custom = true;
  try { localStorage.setItem(KEY, JSON.stringify(layout)); } catch { /* storage unavailable */ }
  emit();
}

export function adoptLayout(raw: unknown): void {
  if (!raw || typeof raw !== 'object') {
    resetLayout();
    return;
  }
  try { localStorage.setItem(KEY, JSON.stringify(raw)); } catch { /* storage unavailable */ }
  loadLayout();
  emit();
}

export function resetLayout(): void {
  layout = defaultLayout();
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
  emit();
}

export function setTools(tools: ToolId[]): void {
  layout = cloneLayout(layout);
  layout.tools = tools;
  persist();
}

export function setMenu(id: MenuId, entries: string[]): void {
  layout = cloneLayout(layout);
  layout.menus[id] = entries;
  layout.menuCustom[id] = true;
  persist();
}

export function setShortcut(id: string, combo: string | null): void {
  layout = cloneLayout(layout);
  if (!combo) delete layout.shortcuts[id];
  else {
    for (const [owner, value] of Object.entries(layout.shortcuts)) {
      if (value === combo && owner !== id) delete layout.shortcuts[owner];
    }
    layout.shortcuts[id] = combo;
  }
  persist();
}

export function setToolboxSide(side: 'left' | 'right'): void {
  layout = cloneLayout(layout);
  layout.toolboxSide = side;
  persist();
}

export function setDocks(docks: DockEntry[]): void {
  layout = cloneLayout(layout);
  layout.docks = docks;
  persist();
}

export function applyWorkspace(name: 'draw' | 'pixel' | 'edit'): void {
  const preset = WORKSPACES[name];
  layout = cloneLayout(layout);
  layout.tools = preset.tools.slice();
  layout.docks = preset.docks.map(dock => ({ ...dock }));
  persist();
}

function defaultShortcut(id: string): string {
  if (id.startsWith('effect:')) return '';
  const tool = toolById(id as ToolId);
  if (tool) return tool.shortcut.toLowerCase();
  return commandById.get(id)?.shortcut ?? '';
}

function stolenCombos(): Set<string> {
  return new Set(Object.values(layout.shortcuts));
}

export function effectiveShortcut(id: string): string {
  if (layout.shortcuts[id]) return layout.shortcuts[id];
  const fallback = defaultShortcut(id);
  if (!fallback) return '';
  if (stolenCombos().has(fallback)) return '';
  return fallback;
}

export function shortcutLabel(combo: string): string {
  if (!combo) return '';
  return combo.split('+').map(part => {
    if (part === 'ctrl') return 'Ctrl';
    if (part === 'shift') return 'Shift';
    if (part === 'alt') return 'Alt';
    if (part === 'delete') return 'Delete';
    if (part === ' ') return 'Space';
    if (part.length === 1) return part.toUpperCase();
    return part.slice(0, 1).toUpperCase() + part.slice(1);
  }).join('+');
}

export function comboFromEvent(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('ctrl');
  if (event.altKey) parts.push('alt');
  if (event.shiftKey) parts.push('shift');
  const key = event.key === ' ' ? ' ' : event.key.toLowerCase();
  parts.push(key === 'delete' ? 'delete' : key);
  return parts.join('+');
}

export interface ShortcutHit {
  tool?: ToolId;
  command?: string;
}

export function matchShortcut(event: KeyboardEvent, current: ToolId): ShortcutHit | null {
  if (event.key === 'Control' || event.key === 'Shift' || event.key === 'Alt' || event.key === 'Meta') return null;
  const combo = comboFromEvent(event);
  for (const [id, value] of Object.entries(layout.shortcuts)) {
    if (value !== combo) continue;
    if (toolById(id as ToolId)) return { tool: id as ToolId };
    return { command: id.startsWith('effect:') ? id : id };
  }
  if (stolenCombos().has(combo)) return null;
  if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1) {
    const next = toolFromShortcut(event.key, current);
    if (next) return { tool: next };
  }
  const command = COMMANDS.find(item => item.shortcut === combo);
  if (command) return { command: command.id };
  return null;
}

export function menuEntries(id: MenuId): string[] {
  return layout.menus[id] ?? [];
}

export function menuIsCustom(id: MenuId): boolean {
  return layout.menuCustom[id];
}

export function catalogForMenu(id: MenuId): string[] {
  const placed = new Set(layout.menus[id].filter(entry => entry !== 'sep'));
  const pool = id === 'adjustments' || id === 'effects'
    ? ALL_EFFECTS.map(effect => `effect:${effect.id}`)
    : COMMANDS.map(command => command.id);
  return pool.filter(entry => !placed.has(entry));
}

export function allCommands(): { id: string; label: string }[] {
  return [
    ...TOOLS.map(tool => ({ id: tool.id, label: tool.label })),
    ...COMMANDS.map(command => ({ id: command.id, label: command.label })),
    ...ALL_EFFECTS.map(effect => ({ id: `effect:${effect.id}`, label: effect.label })),
  ];
}

export function ownerOf(combo: string, except: string): string {
  if (!combo) return '';
  for (const [id, value] of Object.entries(layout.shortcuts)) {
    if (id !== except && value === combo) return commandLabel(id) || toolById(id as ToolId)?.label || id;
  }
  if (layout.shortcuts[except] === combo) return '';
  for (const tool of TOOLS) {
    if (tool.id === except) continue;
    if (effectiveShortcut(tool.id) === combo) return tool.label;
  }
  for (const command of COMMANDS) {
    if (command.id === except) continue;
    if (effectiveShortcut(command.id) === combo) return command.label;
  }
  return '';
}
