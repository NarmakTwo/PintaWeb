# To implement

The main goal is that Pinta is easy to learn, and powerful when you go looking. A first visit still looks like Pinta: the same toolbox, the same menus, size where size already is. A fast stroke comes out as a curve, and a fill colors the soft edge, because that is what people expect to happen. The control for a niche feature appears only after you ask for that feature. Asking means opening Edit on a brush, turning symmetry on, or opening a More disclosure. A mouse, a touchpad, and a finger do the same action. Where a mouse would right-click, a finger long-presses. The status bar names the one gesture that is not obvious.

Nothing in this file adds a toolbox icon. The toolbox stays the tools it has. A new control goes in the tool options, a menu that already exists, or a disclosure that starts closed. Input is a mouse, a touchpad, or a finger. There is no stylus pressure, tilt, or azimuth. Speed means how fast that pointer moves.

## Done

### Animation

Frame-by-frame timeline (Window → Timeline; first inserted frame opens it), holds/keys per layer, onion skin (view-only), play/stop/loop/FPS, comma/period step, space plays only while the timeline is open. Objects library, convert selection to object, instances, motion tweens with ease list + optional curve, bone laying (Shift-drag in object edit) with rigid/soft data, GIF / PNG sequence / sprite sheet export when `frameCount > 1`. `.pinta` stores extra frame PNGs; one-frame docs stay unchanged. Code: `animation.ts`, `timeline.ts`, `gif.ts`, `document.ts`, `app.ts`, `tools.ts`, `layout.ts`, `index.html`, `style.css`. Tests: `animation timeline…`, `animation export formats…`.

### Archive brush packs (zip, tar, tar.gz)

Brush upload accepts archives (`.zip`, `.tar`, `.tar.gz` / `.tgz`, sniffed by magic). Nested **sets** (`.brushset`, `.abr`) each become a category named after that set file; **loose** individual brushes (`.brush`) share a category named after the archive, so the pack itself works as a set. Nested archives open one level deep. Native Procreate `.brush` / `.brushset` zips (Brush.archive, no nested set files) still import as one category named after the file. Code: `web/src/editor/brushimport.ts` (`BrushImportBatch`, archive walk), `#brush-import-file` accept list and batch categories in `brushes.ts`. Later GIMP/Krita/MyPaint extensions plug into the same walker.

### Undo with custom / dynamic brushes

`finishPatch` used to prefer the dirty-rect `cover` snapshot over the stroke `holdStroke` image. Soft tips, scatter, wet-edge blur, and some blend composites can paint outside that rect, so Undo left ink behind. Stroke holds are now authoritative: at checkpoint, diff the hold against the layer and patch every changed pixel. Settle redraws re-hold the stroke `before`. `paintPresetStroke` blits only the covered region (with blur-aware pad). Regression: `undoes strokes from dynamic custom brushes` (P5_Luminance Lightleak with scatter/stamps).

### Remove `#status-note`

Deleted `#status-note` from `web/index.html` (replaced with the forbid-comment), `#status-note` CSS, and `statusNote()` / writers in `app.ts`. Playwright expectations that only checked that hint text now assert absence of `#status-note` or the underlying UI state (mask thumb, smooth edges checkbox).

### Lightweight live stroke + finalize render

Default mid-stroke path is lightweight (`paintPresetStroke` with `live: true`: no wet/carry, no multi-stamp/scatter/jitter). Pointer up always runs one seeded full pass (`seed` from stroke start). View → **Live Stroke Render** (`live-stroke-render`, `pinta-live-stroke-render` in localStorage, default off) restores full dynamics while dragging. Taper uses `taperZone(length, %, size) = min(length×%, size×%)` with a 0.12 scale/fade floor. Code: `brushes.ts` (`taperZone`, `PaintStrokeOptions`), `tools.ts` (`replayCurve`), `layout.ts` / `app.ts`. Test: `caps brush taper by brush size and toggles live stroke render`.

### Heavily dynamic brush performance

Addressed primarily by the lightweight live stroke path (no wet-mix canvas sampling or multi-stamp scatter while dragging; one full pass on release). Batched `renderScene()` remains. Remaining headroom (incremental dab append without full `putImageData(before)` rewind, settle incremental morph) can follow if profiling still shows move-bound lag with Live Stroke Render off.

### Incremental, non-blocking autosave

Session autosave is version-2 split storage: metadata in `session` (`SessionRecordV2`), PNG blobs in a `layers` store keyed `${docId}:${layerId}:pixels|mask`. Layer `revision` / `lastSavedRevision` (and mask twins) skip unchanged encodes. Persist yields between surfaces, cancels on token bump, coalesces to one running + one pending, defers while `strokeHold` is active, and flushes on `visibilitychange`/`pagehide`. v1 inline-PNG sessions migrate on restore. Cleanup deletes blobs on layer delete, mask remove, doc close, and quit. Tests: incremental puts, mask/group restore, v1→v2 migration, key cleanup, latest-edit wins.

### Fast-stroke dab interpolation

`planStroke` / `paintPresetStroke` densify path samples with `interpolateDabs` so consecutive dabs are at most spacing times size apart (cap 4096 steps per segment). Removed the old 64/500 step caps that left gaps on fast flicks. `tools.walk` raised to the same cap. Test: interpolates dabs on fast spaced strokes.

### OpenRaster (.ora) import and export

OpenRaster is a first-class save/open format beside `.pinta`. Export writes a legal ORA zip (`mimetype`, `stack.xml`, `data/layer-*.png`, `mergedimage.png`) plus Pinta XMP at `data/pinta/metadata.xmp`. Open restores XMP when present; plain ORA stacks still load as layered docs. Code: `ora.ts`, `document.ts`, `app.ts` / `index.html`. Test: `round-trips OpenRaster with stack, xmp, and undo`.

### Import GIMP, Krita, and MyPaint brushes

Brush upload accepts `.gbr`, `.gih`, `.vbr`, `.gbp`, `.kpp`, `.myb`, and sniffed `.bundle` / zip packs alongside Procreate/ABR. Category naming stays “named after the file.” Engine: GIH multi-cell pipes (`tipImages` + `pipeSelect`: incremental/angular/random/speed), VBR parametric tip rasters (spikes/aspect/hardness), KPP as gzip XML or PNG `zTXt preset` with tip resolve from bundle `brushes/`, MyPaint text + JSON `.myb` (pressure curve deltas → speed size/opacity; smudge/scatter/jitter/elliptical). Tilt-only sensors stay inert (no stylus). Edit → Pipe tip disclosure. Tests: synthetic gbr/myb; proc `pack01_cloud.gbr`, `pack01-leaf-anim2.gih`, `Ink_Pen_Texturized.kpp`, `Airbrush_Round.myb`, `tone_v2.zip`, Puplaroid Krita `.bundle`; Procreate/ABR/archive still green.

# Plans

# Big goals

## Delta history

Bring back delta/patch-based undo (memory-efficient history) after standard full-snapshot undo is solid again. Pixel patches for strokes, structural/canvas entries for layer stack and size changes, with correct coverage for soft tips, settle, imported brushes, and masks. Until then, history stays full document snapshots.

