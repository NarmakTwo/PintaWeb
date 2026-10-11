import {
  applyWorkspace, catalogForMenu, commandLabel, commandSentence, effectiveShortcut, getLayout, MENU_IDS, MENU_LABELS,
  menuEntries, onLayout, ownerOf, resetLayout, setDocks, setMenu, setShortcut, setToolboxSide, setTools, shortcutLabel,
  toolById, toolSentence, type DockEntry, type MenuId,
} from './layout.ts';
import { TOOLS, type ToolId } from './types.ts';

type Tab = 'toolbox' | 'menus' | 'shortcuts' | 'docks';
let tab: Tab = 'toolbox';
let menu: MenuId = 'file';
let pendingShortcut: { id: string; combo: string } | null = null;

function dialog(): HTMLDialogElement {
  return document.getElementById('customize-dialog') as HTMLDialogElement;
}

export function confirmChoice(title: string, body: string, ok: string, cancel: string): Promise<boolean> {
  const host = document.getElementById('confirm-dialog') as HTMLDialogElement;
  const heading = document.getElementById('confirm-title');
  const copy = document.getElementById('confirm-body');
  const yes = document.getElementById('confirm-ok');
  const no = document.getElementById('confirm-cancel');
  if (heading) heading.textContent = title;
  if (copy) copy.textContent = body;
  if (yes) yes.textContent = ok;
  if (no) no.textContent = cancel;
  if (host.open) host.close('cancel');
  host.returnValue = '';
  host.showModal();
  return new Promise(resolve => host.addEventListener('close', () => resolve(host.returnValue === 'ok'), { once: true }));
}

function row(id: string, title: string, sentence: string, actions: string): string {
  return `<div class="customize-row" draggable="true" data-id="${id}" tabindex="0"><span>${title}</span><span class="customize-sentence">${sentence}</span>${actions}</div>`;
}

function renderBody(): void {
  document.querySelectorAll<HTMLButtonElement>('#customize-dialog [data-tab]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.tab === tab));
  });
  const body = document.getElementById('customize-body');
  const hint = document.getElementById('customize-hint');
  if (!body) return;
  const layout = getLayout();
  const stacked = (dialog()?.clientWidth ?? 800) < 640;
  if (hint) hint.textContent = tab === 'toolbox' ? (stacked ? 'Add places it at the end' : 'Drag a tool onto the toolbox') : '';
  if (tab === 'toolbox') {
    const tools = layout.tools;
    const catalog = TOOLS.filter(tool => !tools.includes(tool.id));
    body.innerHTML = `
      <div class="workspace-row">
        <button type="button" data-workspace="draw">Draw</button>
        <button type="button" data-workspace="pixel">Pixel</button>
        <button type="button" data-workspace="edit">Edit</button>
      </div>
      <div class="customize-lists ${stacked ? 'stacked' : ''}">
        <div><h3>Toolbox</h3><div id="customize-tools" class="customize-list">${tools.length ? tools.map((id, index) => {
          const tool = toolById(id);
          return row(id, tool?.label ?? id, toolSentence(id), `<button type="button" data-move="up" ${index === 0 ? 'disabled' : ''}>Up</button><button type="button" data-move="down" ${index === tools.length - 1 ? 'disabled' : ''}>Down</button><button type="button" data-move="remove">Remove</button>`);
        }).join('') : '<p>The toolbox is empty</p>'}</div></div>
        <div><h3>Catalog</h3><div id="customize-catalog" class="customize-list">${catalog.map(tool => row(tool.id, tool.label, toolSentence(tool.id), '<button type="button" data-move="add">Add</button>')).join('') || '<p>Every tool is on the toolbox.</p>'}</div></div>
      </div>`;
    return;
  }
  if (tab === 'menus') {
    const entries = menuEntries(menu);
    const catalog = catalogForMenu(menu);
    body.innerHTML = `
      <div class="workspace-row">${MENU_IDS.map(id => `<button type="button" data-menu="${id}" aria-pressed="${id === menu}">${MENU_LABELS[id]}</button>`).join('')}</div>
      <div class="customize-lists ${stacked ? 'stacked' : ''}">
        <div><h3>${MENU_LABELS[menu]}</h3><div id="customize-menu" class="customize-list">${entries.map((entry, index) => entry === 'sep'
          ? `<div class="customize-row" data-id="sep:${index}" tabindex="0"><span>Separator</span><button type="button" data-move="remove">Remove</button></div>`
          : row(entry, commandLabel(entry), commandSentence(entry), `<button type="button" data-move="up" ${index === 0 ? 'disabled' : ''}>Up</button><button type="button" data-move="down" ${index === entries.length - 1 ? 'disabled' : ''}>Down</button><button type="button" data-move="remove">Remove</button>`)).join('')}</div></div>
        <div><h3>Catalog</h3><div id="customize-menu-catalog" class="customize-list"><button type="button" data-move="separator">Add separator</button>${catalog.map(id => row(id, commandLabel(id), commandSentence(id), '<button type="button" data-move="add">Add</button>')).join('')}</div></div>
      </div>`;
    return;
  }
  if (tab === 'shortcuts') {
    const tools = layout.tools.map(id => toolById(id)).filter((tool): tool is NonNullable<typeof tool> => !!tool);
    const commands = ['new', 'open', 'save', 'save-as', 'close', 'undo', 'redo', 'cut', 'copy', 'copy-merged', 'paste', 'paste-layer', 'select-all', 'deselect', 'layer-add', 'layer-delete', 'layer-duplicate', 'layer-merge', 'layer-flip-h', 'layer-flip-v', 'layer-properties', 'zoom-100', 'adjust-stroke'];
    const fields = [
      ...tools.map(tool => ({ id: tool.id, label: tool.label })),
      ...commands.map(id => ({ id, label: commandLabel(id) })),
    ];
    body.innerHTML = `<div class="shortcut-fields">${fields.map(field => {
      const combo = effectiveShortcut(field.id);
      const other = ownerOf(combo, field.id);
      return `<label>${field.label}<input data-shortcut="${field.id}" value="${shortcutLabel(combo)}" readonly /></label><p class="shortcut-conflict" data-conflict="${field.id}">${other ? `Also used by ${other}` : ''}</p>`;
    }).join('')}</div>`;
    return;
  }
  body.innerHTML = `
    <div class="workspace-row">
      <button type="button" data-side="left" aria-pressed="${layout.toolboxSide === 'left'}">Left</button>
      <button type="button" data-side="right" aria-pressed="${layout.toolboxSide === 'right'}">Right</button>
    </div>
    <div class="customize-list">${layout.docks.map((dock, index) => `<div class="customize-row" data-id="${dock.id}"><span>${dock.id === 'color' ? 'Color' : dock.id === 'layers' ? 'Layers' : 'History'}</span><label class="check"><input type="checkbox" data-collapse="${dock.id}" ${dock.collapsed ? 'checked' : ''}/> Collapse</label><button type="button" data-move="up" ${index === 0 ? 'disabled' : ''}>Up</button><button type="button" data-move="down" ${index === layout.docks.length - 1 ? 'disabled' : ''}>Down</button></div>`).join('')}</div>`;
}

function moveTools(id: string, action: string): void {
  const tools = getLayout().tools.slice();
  const index = tools.indexOf(id as ToolId);
  if (action === 'add' && index < 0) tools.push(id as ToolId);
  if (action === 'remove' && index >= 0) tools.splice(index, 1);
  if (action === 'up' && index > 0) {
    const [item] = tools.splice(index, 1);
    tools.splice(index - 1, 0, item);
  }
  if (action === 'down' && index >= 0 && index < tools.length - 1) {
    const [item] = tools.splice(index, 1);
    tools.splice(index + 1, 0, item);
  }
  setTools(tools);
}

function moveMenu(id: string, action: string): void {
  const entries = menuEntries(menu).slice();
  if (action === 'separator') {
    entries.push('sep');
    setMenu(menu, entries);
    return;
  }
  if (action === 'add') {
    const from = MENU_IDS.map(name => menuEntries(name).filter(entry => entry === id));
    for (const name of MENU_IDS) {
      if (name === menu) continue;
      const next = menuEntries(name).filter(entry => entry !== id);
      if (next.length !== menuEntries(name).length) setMenu(name, next);
    }
    if (!entries.includes(id)) entries.push(id);
    setMenu(menu, entries);
    return;
  }
  const index = id.startsWith('sep:') ? Number(id.slice(4)) : entries.indexOf(id);
  if (index < 0) return;
  if (action === 'remove') entries.splice(index, 1);
  if (action === 'up' && index > 0) {
    const [item] = entries.splice(index, 1);
    entries.splice(index - 1, 0, item);
  }
  if (action === 'down' && index < entries.length - 1) {
    const [item] = entries.splice(index, 1);
    entries.splice(index + 1, 0, item);
  }
  setMenu(menu, entries);
}

function moveDocks(id: string, action: string): void {
  const docks = getLayout().docks.map(dock => ({ ...dock }));
  const index = docks.findIndex(dock => dock.id === id);
  if (index < 0) return;
  const swap = action === 'up' ? index - 1 : index + 1;
  if (swap < 0 || swap >= docks.length) return;
  const current = docks[index];
  const other = docks[swap];
  docks[index] = { ...other, side: current.side };
  docks[swap] = { ...current, side: other.side };
  if (docks[index].side !== docks[swap].side && action === 'up' && docks[swap].side === 'docks') {
    docks[swap] = { ...docks[swap], side: 'toolbox' };
    docks[index] = { ...docks[index], side: 'docks' };
  }
  setDocks(docks);
}

function dropTools(id: string, target: 'tools' | 'catalog', before: string | null): void {
  const tools = getLayout().tools.filter(tool => tool !== id);
  if (target === 'catalog') {
    setTools(tools);
    return;
  }
  const index = before ? tools.indexOf(before as ToolId) : tools.length;
  tools.splice(index < 0 ? tools.length : index, 0, id as ToolId);
  setTools(tools);
}

export function openCustomize(): void {
  tab = 'toolbox';
  dialog()?.showModal();
  renderBody();
}

export function mountCustomize(onWorkspace: (name: 'draw' | 'pixel' | 'edit') => void): void {
  if (document.getElementById('customize-dialog')) return;
  const host = document.createElement('dialog');
  host.id = 'customize-dialog';
  host.innerHTML = `<form><h2>Customize</h2><div class="customize-tabs" role="tablist"><button type="button" data-tab="toolbox">Toolbox</button><button type="button" data-tab="menus">Menus</button><button type="button" data-tab="shortcuts">Shortcuts</button><button type="button" data-tab="docks">Docks</button></div><div id="customize-body"></div><p id="customize-hint"></p><div class="dialog-actions"><button type="button" id="customize-reset">Reset Layout</button><button type="button" id="customize-close">Close</button></div></form>`;
  const confirm = document.createElement('dialog');
  confirm.id = 'confirm-dialog';
  confirm.innerHTML = `<form method="dialog"><h2 id="confirm-title">Confirm</h2><p id="confirm-body"></p><div class="dialog-actions"><button type="submit" id="confirm-cancel" value="cancel">Cancel</button><button type="submit" id="confirm-ok" value="ok" autofocus>OK</button></div></form>`;
  document.body.append(host, confirm);
  host.addEventListener('click', event => {
    const target = event.target as HTMLElement;
    const next = target.closest<HTMLElement>('[data-tab]')?.dataset.tab as Tab | undefined;
    if (next) {
      tab = next;
      renderBody();
      return;
    }
    const picked = target.closest<HTMLElement>('[data-menu]')?.dataset.menu as MenuId | undefined;
    if (picked) {
      menu = picked;
      renderBody();
      return;
    }
    const side = target.closest<HTMLElement>('[data-side]')?.dataset.side;
    if (side === 'left' || side === 'right') setToolboxSide(side);
    const workspace = target.closest<HTMLElement>('[data-workspace]')?.dataset.workspace as 'draw' | 'pixel' | 'edit' | undefined;
    if (workspace) {
      void (async () => {
        if (getLayout().custom) {
          const replace = await confirmChoice(`Replace your layout with ${workspace[0].toUpperCase()}${workspace.slice(1)}?`, 'The toolbox and docks change. Menus and shortcuts stay.', 'Replace', 'Keep mine');
          if (!replace) return;
        }
        applyWorkspace(workspace);
        onWorkspace(workspace);
      })();
      return;
    }
    const move = target.closest<HTMLElement>('[data-move]')?.dataset.move;
    const id = target.closest<HTMLElement>('[data-id]')?.dataset.id;
    if (move === 'separator') moveMenu('', 'separator');
    else if (move && id && tab === 'toolbox') moveTools(id, move);
    else if (move && id && tab === 'menus') moveMenu(id, move);
    else if (move && id && tab === 'docks') moveDocks(id, move);
  });
  host.addEventListener('change', event => {
    const input = event.target as HTMLInputElement;
    if (!input.dataset.collapse) return;
    const docks: DockEntry[] = getLayout().docks.map(dock => dock.id === input.dataset.collapse ? { ...dock, collapsed: input.checked } : dock);
    setDocks(docks);
  });
  host.addEventListener('keydown', event => {
    const field = event.target as HTMLInputElement;
    if (field.dataset?.shortcut) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        pendingShortcut = null;
        field.value = shortcutLabel(effectiveShortcut(field.dataset.shortcut));
        return;
      }
      if (event.key === 'Backspace') {
        setShortcut(field.dataset.shortcut, null);
        return;
      }
      if (event.key === 'Control' || event.key === 'Shift' || event.key === 'Alt' || event.key === 'Meta') return;
      const parts: string[] = [];
      if (event.ctrlKey || event.metaKey) parts.push('ctrl');
      if (event.altKey) parts.push('alt');
      if (event.shiftKey) parts.push('shift');
      parts.push(event.key.toLowerCase());
      const combo = parts.join('+');
      pendingShortcut = { id: field.dataset.shortcut, combo };
      field.value = shortcutLabel(combo);
      const conflict = host.querySelector(`[data-conflict="${field.dataset.shortcut}"]`);
      const other = ownerOf(combo, field.dataset.shortcut);
      if (conflict) conflict.textContent = other ? `Also used by ${other}` : '';
      return;
    }
    const current = document.activeElement as HTMLElement | null;
    const list = current?.closest('.customize-list');
    if (!list || !current?.classList.contains('customize-row')) return;
    const rows = [...list.querySelectorAll<HTMLElement>('.customize-row')];
    const index = rows.indexOf(current);
    if (event.key === 'ArrowDown' && rows[index + 1]) {
      event.preventDefault();
      rows[index + 1].focus();
    } else if (event.key === 'ArrowUp' && rows[index - 1]) {
      event.preventDefault();
      rows[index - 1].focus();
    } else if (event.key === 'Enter' && list.id === 'customize-catalog') {
      event.preventDefault();
      const id = current.dataset.id;
      if (id) moveTools(id, 'add');
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && list.id === 'customize-tools') {
      event.preventDefault();
      const id = current.dataset.id;
      if (id) moveTools(id, 'remove');
    }
  });
  host.addEventListener('focusout', event => {
    const field = event.target as HTMLInputElement;
    if (!field.dataset?.shortcut || !pendingShortcut || pendingShortcut.id !== field.dataset.shortcut) return;
    setShortcut(pendingShortcut.id, pendingShortcut.combo);
    pendingShortcut = null;
  });
  host.addEventListener('dragstart', event => {
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-id]');
    if (!row || !event.dataTransfer) return;
    event.dataTransfer.setData('text/plain', row.dataset.id ?? '');
    event.dataTransfer.effectAllowed = 'move';
  });
  host.addEventListener('dragover', event => {
    const list = (event.target as HTMLElement).closest('.customize-list');
    if (!list) return;
    event.preventDefault();
  });
  host.addEventListener('drop', event => {
    const list = (event.target as HTMLElement).closest<HTMLElement>('.customize-list');
    const id = event.dataTransfer?.getData('text/plain');
    if (!list || !id || tab !== 'toolbox') return;
    event.preventDefault();
    const before = (event.target as HTMLElement).closest<HTMLElement>('[data-id]')?.dataset.id ?? null;
    dropTools(id, list.id === 'customize-catalog' ? 'catalog' : 'tools', before);
  });
  document.getElementById('customize-reset')?.addEventListener('click', () => {
    void confirmChoice('Restore the original layout and shortcuts?', 'Documents and brushes stay as they are.', 'Restore', 'Cancel').then(yes => {
      if (yes) resetLayout();
    });
  });
  document.getElementById('customize-close')?.addEventListener('click', () => host.close());
  host.addEventListener('close', () => { pendingShortcut = null; });
  onLayout(() => { if (host.open) renderBody(); });
}
