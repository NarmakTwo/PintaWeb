import type { Editor } from './document.ts';
import { resolveKeyIndex, tipOf, type EaseName } from './animation.ts';

export function mountTimeline(editor: Editor, openContext: (x: number, y: number, entries: Array<{ label?: string; action?: () => void; separator?: boolean; checked?: boolean }>) => void): void {
  const root = document.getElementById('timeline');
  if (!root) return;

  const render = () => {
    const doc = editor.doc;
    const open = !!editor.show.timeline && !!doc;
    root.hidden = !open;
    document.getElementById('app')!.dataset.timeline = open ? '1' : '0';
    if (!open || !doc) {
      root.innerHTML = '';
      return;
    }
    const anim = doc.anim;
    const cellW = Math.max(10, Math.round(18 * anim.timelineZoom));
    const playing = anim.playing;
    const rows = doc.layers.map((layer, layerIndex) => {
      const cells = Array.from({ length: anim.frameCount }, (_, frame) => {
        const cell = layer.frames[frame];
        const kind = !cell ? 'hold' : cell.kind === 'key' ? 'key' : 'hold';
        const current = frame === anim.frame ? ' current' : '';
        return `<button type="button" class="tl-cell ${kind}${current}" data-layer="${layerIndex}" data-frame="${frame}" style="width:${cellW}px" aria-label="Frame ${frame + 1}"></button>`;
      }).join('');
      const instances = anim.instances.filter(item => item.layerId === layer.id);
      const tweenMarks = instances.flatMap(instance => instance.tweens.map(tween => {
        const left = tween.from * cellW;
        const width = Math.max(cellW, (tween.to - tween.from) * cellW);
        return `<div class="tl-tween" data-instance="${instance.id}" data-from="${tween.from}" data-to="${tween.to}" style="left:${left}px;width:${width}px"></div>`;
      })).join('');
      return `<div class="tl-row" data-layer-id="${layer.id}"><div class="tl-name">${escape(layer.name)}</div><div class="tl-cells" style="width:${anim.frameCount * cellW}px">${cells}${tweenMarks}</div></div>`;
    }).join('');

    root.innerHTML = `
      <div class="tl-bar">
        <button type="button" id="tl-play" aria-pressed="${playing}">${playing ? 'Stop' : 'Play'}</button>
        <button type="button" id="tl-loop" aria-pressed="${anim.loop}">Loop</button>
        <button type="button" id="tl-prev" aria-label="Previous frame">,</button>
        <button type="button" id="tl-next" aria-label="Next frame">.</button>
        <label class="tl-field">Frame <input id="tl-frame" type="number" min="1" max="${anim.frameCount}" value="${anim.frame + 1}" /></label>
        <label class="tl-field">FPS <input id="tl-fps" type="number" min="1" max="60" value="${anim.fps}" /></label>
        <button type="button" id="tl-blank" title="Insert blank keyframe">+</button>
        <button type="button" id="tl-dup" title="Duplicate frame">Dup</button>
        <label class="tl-field check"><input id="tl-onion" type="checkbox" ${anim.onion ? 'checked' : ''} /> Onion</label>
        <label class="tl-field">Onion <input id="tl-onion-count" type="number" min="1" max="5" value="${anim.onionCount}" /></label>
        <label class="tl-field">Zoom <input id="tl-zoom" type="range" min="0.5" max="3" step="0.1" value="${anim.timelineZoom}" /></label>
        <button type="button" id="tl-bone" aria-pressed="${editor.tool === 'move-selection' && !!anim.editingObject}">Bone</button>
        <button type="button" id="tl-bone-weight" ${editor.boneMode === 'weight' ? 'aria-pressed="true"' : ''}>Weights</button>
      </div>
      <div class="tl-body">
        <div class="tl-playhead" style="left:${120 + anim.frame * cellW + cellW / 2}px"></div>
        ${rows}
      </div>
      <div id="tl-breadcrumb" class="tl-breadcrumb" ${anim.editingObject == null ? 'hidden' : ''}>
        <button type="button" data-leave-object>Stage</button>
        <span>/</span>
        <span>${escape(anim.objects.find(item => item.id === anim.editingObject)?.name ?? 'Object')}</span>
      </div>
    `;
  };

  const refresh = () => {
    render();
    renderLibrary(editor, openContext);
  };
  (editor as Editor & { refreshTimeline?: () => void }).refreshTimeline = refresh;

  root.addEventListener('click', event => {
    const target = event.target as HTMLElement;
    if (target.id === 'tl-play') editor.togglePlayback();
    else if (target.id === 'tl-loop' && editor.doc) {
      editor.doc.anim.loop = !editor.doc.anim.loop;
      editor.notify();
    } else if (target.id === 'tl-prev' && editor.doc) editor.setFrame(editor.doc.anim.frame - 1);
    else if (target.id === 'tl-next' && editor.doc) editor.setFrame(editor.doc.anim.frame + 1);
    else if (target.id === 'tl-blank') editor.insertBlankKeyframe();
    else if (target.id === 'tl-dup') editor.duplicateKeyframe();
    else if (target.id === 'tl-bone') {
      if (!editor.doc?.anim.editingObject) editor.convertSelectionToObject();
      else editor.toast('Drag on the canvas to lay a bone.');
    } else if (target.id === 'tl-bone-weight') {
      editor.boneMode = editor.boneMode === 'weight' ? 'pose' : 'weight';
      if (editor.boneMode === 'weight') editor.toast('Painting bone weights');
      editor.notify();
    } else if (target.dataset.leaveObject != null) editor.leaveObjectEdit();
    else if (target.classList.contains('tl-cell')) {
      const frame = Number(target.dataset.frame);
      const layer = Number(target.dataset.layer);
      if (Number.isFinite(layer) && editor.doc) editor.doc.active = layer;
      if (Number.isFinite(frame)) editor.setFrame(frame);
    } else if (target.classList.contains('tl-tween')) {
      editor.selectedTween = {
        instanceId: Number(target.dataset.instance),
        from: Number(target.dataset.from),
        to: Number(target.dataset.to),
      };
      editor.notify();
    }
  });

  root.addEventListener('change', event => {
    const target = event.target as HTMLInputElement;
    if (target.id === 'tl-frame') editor.setFrame(Number(target.value) - 1);
    else if (target.id === 'tl-fps') editor.setFps(Number(target.value));
    else if (target.id === 'tl-onion') editor.setOnion(target.checked);
    else if (target.id === 'tl-onion-count') editor.setOnion(editor.doc?.anim.onion ?? false, Number(target.value));
    else if (target.id === 'tl-zoom' && editor.doc) {
      editor.doc.anim.timelineZoom = Number(target.value);
      editor.notify();
    }
  });

  root.addEventListener('contextmenu', event => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>('.tl-cell');
    if (!cell || !editor.doc) return;
    event.preventDefault();
    const frame = Number(cell.dataset.frame);
    const layerIndex = Number(cell.dataset.layer);
    editor.doc.active = layerIndex;
    editor.setFrame(frame);
    const layer = editor.doc.layers[layerIndex];
    const instances = editor.doc.anim.instances.filter(item => item.layerId === layer?.id);
    const entries: Array<{ label?: string; action?: () => void; separator?: boolean }> = [
      { label: 'Insert Keyframe', action: () => editor.insertKeyframeAt(frame) },
      { label: 'Insert Blank Keyframe', action: () => editor.insertBlankKeyframe(frame) },
      { label: 'Duplicate', action: () => editor.duplicateKeyframe(frame) },
      { label: 'Delete', action: () => editor.deleteKeyframe(frame) },
      { separator: true },
      { label: 'Copy', action: () => editor.copyFrameCell(frame) },
      { label: 'Paste', action: () => editor.pasteFrameCell(frame) },
    ];
    if (instances.length) {
      const instance = instances[0];
      const keys = instance.keys.map(key => key.frame).sort((a, b) => a - b);
      const prev = [...keys].reverse().find(key => key <= frame);
      const next = keys.find(key => key > frame);
      entries.push({ separator: true });
      if (prev != null && next != null) {
        entries.push({
          label: 'Create Motion Tween',
          action: () => editor.createMotionTween(instance.id, prev, next),
        });
      }
      const tween = instance.tweens.find(item => frame >= item.from && frame <= item.to);
      if (tween) {
        entries.push({
          label: 'Clear Tween',
          action: () => editor.clearMotionTween(instance.id, tween.from, tween.to),
        });
      }
      entries.push({ label: 'Remove Instance', action: () => editor.removeInstance(instance.id) });
      entries.push({ label: 'Break Apart', action: () => editor.breakApartInstance(instance.id) });
    }
    openContext(event.clientX, event.clientY, entries);
  });

  let scrubbing = false;
  root.addEventListener('pointerdown', event => {
    const playhead = (event.target as HTMLElement).closest('.tl-playhead, .tl-cells');
    if (!playhead || !editor.doc) return;
    if (editor.doc.anim.playing) editor.stopPlayback();
    scrubbing = true;
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    scrubTo(event.clientX);
  });
  root.addEventListener('pointermove', event => {
    if (!scrubbing) return;
    scrubTo(event.clientX);
  });
  root.addEventListener('pointerup', () => { scrubbing = false; });
  root.addEventListener('pointercancel', () => { scrubbing = false; });

  function scrubTo(clientX: number): void {
    const doc = editor.doc;
    const host = document.getElementById('timeline');
    const cells = host?.querySelector('.tl-cells');
    if (!doc || !cells) return;
    const box = cells.getBoundingClientRect();
    const cellW = Math.max(10, Math.round(18 * doc.anim.timelineZoom));
    const frame = Math.max(0, Math.min(doc.anim.frameCount - 1, Math.floor((clientX - box.left) / cellW)));
    editor.setFrame(frame);
  }

  render();
}

function renderLibrary(editor: Editor, openContext: (x: number, y: number, entries: Array<{ label?: string; action?: () => void; separator?: boolean }>) => void): void {
  const dock = document.getElementById('dock-layers');
  if (!dock) return;
  let tabs = document.getElementById('library-tabs');
  const doc = editor.doc;
  const hasObjects = !!doc?.anim.objects.length;
  if (!hasObjects) {
    tabs?.remove();
    document.getElementById('library-list')?.remove();
    return;
  }
  if (!tabs) {
    tabs = document.createElement('div');
    tabs.id = 'library-tabs';
    tabs.className = 'library-tabs';
    tabs.innerHTML = `<button type="button" data-lib-tab="layers" aria-pressed="true">Layers</button><button type="button" data-lib-tab="library">Library</button>`;
    dock.insertBefore(tabs, dock.querySelector('.dock-head'));
    tabs.addEventListener('click', event => {
      const tab = (event.target as HTMLElement).dataset.libTab;
      if (!tab) return;
      tabs!.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.getAttribute('data-lib-tab') === tab)));
      const list = document.getElementById('layer-list');
      const library = document.getElementById('library-list');
      if (list) list.hidden = tab !== 'layers';
      if (library) library.hidden = tab !== 'library';
    });
  }
  let library = document.getElementById('library-list');
  if (!library) {
    library = document.createElement('ol');
    library.id = 'library-list';
    library.hidden = true;
    dock.appendChild(library);
    library.addEventListener('dblclick', event => {
      const row = (event.target as HTMLElement).closest<HTMLElement>('[data-object]');
      if (!row) return;
      editor.editObject(Number(row.dataset.object));
    });
    library.addEventListener('dragstart', event => {
      const row = (event.target as HTMLElement).closest<HTMLElement>('[data-object]');
      if (!row || !event.dataTransfer) return;
      event.dataTransfer.setData('pinta/object', row.dataset.object ?? '');
    });
    library.addEventListener('contextmenu', event => {
      const row = (event.target as HTMLElement).closest<HTMLElement>('[data-object]');
      if (!row) return;
      event.preventDefault();
      const id = Number(row.dataset.object);
      openContext(event.clientX, event.clientY, [
        { label: 'Edit', action: () => editor.editObject(id) },
        { label: 'Delete Object', action: () => editor.deleteObject(id) },
      ]);
    });
  }
  library.innerHTML = (doc?.anim.objects ?? []).map(obj => {
    return `<li draggable="true" data-object="${obj.id}" class="library-row"><canvas width="40" height="40" data-thumb="${obj.id}"></canvas><span>${escape(obj.name)}</span></li>`;
  }).join('');
  for (const obj of doc?.anim.objects ?? []) {
    const canvas = library.querySelector(`canvas[data-thumb="${obj.id}"]`) as HTMLCanvasElement | null;
    const pixels = obj.frames[resolveKeyIndex(obj.frames, 0)];
    if (!canvas || pixels.kind !== 'key') continue;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    ctx.clearRect(0, 0, 40, 40);
    const scale = Math.min(40 / pixels.data.width, 40 / pixels.data.height);
    const w = Math.max(1, Math.round(pixels.data.width * scale));
    const h = Math.max(1, Math.round(pixels.data.height * scale));
    const temp = document.createElement('canvas');
    temp.width = pixels.data.width;
    temp.height = pixels.data.height;
    temp.getContext('2d')!.putImageData(pixels.data, 0, 0);
    ctx.drawImage(temp, (40 - w) / 2, (40 - h) / 2, w, h);
  }
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

export function easeOptions(current: EaseName): string {
  return (['linear', 'ease-in', 'ease-out', 'ease-in-out'] as EaseName[]).map(name => {
    const label = name.replace(/-/g, ' ');
    return `<option value="${name}" ${name === current ? 'selected' : ''}>${label}</option>`;
  }).join('');
}

export { tipOf };
