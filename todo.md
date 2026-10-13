# To implement

Do not implement Animation until the user explicitly asks.

The main goal is that Pinta is easy to learn, and powerful when you go looking. A first visit still looks like Pinta: the same toolbox, the same menus, size where size already is. A fast stroke comes out as a curve, and a fill colors the soft edge, because that is what people expect to happen. The control for a niche feature appears only after you ask for that feature. Asking means opening Edit on a brush, turning symmetry on, or opening a More disclosure. A mouse, a touchpad, and a finger do the same action. Where a mouse would right-click, a finger long-presses. The status bar names the one gesture that is not obvious.

Nothing in this file adds a toolbox icon. The toolbox stays the tools it has. A new control goes in the tool options, a menu that already exists, or a disclosure that starts closed. Input is a mouse, a touchpad, or a finger. There is no stylus pressure, tilt, or azimuth. Speed means how fast that pointer moves.

## Done

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

## Animation

A huge goal. It should feel like Pencil2D if you only draw frame by frame, and like Flash when you reach for objects, tweens, and bones. The canvas stays the stage. The tools stay the tools you already know. Mouse, touchpad, and touchscreen all drive it the same way: click or tap a frame, drag the playhead, pinch and ctrl-wheel still zoom the canvas.

If you never open the library or the bone tool, the extra UI stays out of the way. You draw, add a frame, and draw the next one.

### How the timeline appears

The document you have today is frame 1 of every layer. Nothing about the paint tools changes until a frame exists beyond that. A one-frame document looks like Pinta. No timeline, no frame numbers, no onion skin, no bones.

Window → Timeline toggles the timeline, the same way Window toggles the toolbox and the docks. It is off by default. The first time you insert a frame, the timeline opens and stays until you hide it. Inserting that first frame is the only action that opens it for you. After that, Window → Timeline is the only toggle. Frame commands live on the timeline bar and in the cell menu. The top menu bar does not gain a Frame menu.

Each layer stores its own list of frame bitmaps. The layer you already have is that list with one frame. Undo still records the stroke you just made, on the frame you are looking at. Switching frames swaps which bitmap the tools read and write. The canvas, the toolbox, and the tool options stay where they are. Selection, floating pixels, and an in-progress text edit belong to the frame you started them on. Switching frames commits a text edit and bakes a float, the same way switching documents does, so you do not drag frame 1’s selection around on frame 2.

A `.pinta` file with one frame stays the file it is today. Extra frames are extra images in the zip, one per layer per frame that is not a hold. A hold does not duplicate the bitmap. It points at the key it holds. An older build that does not know frames opens the first frame and ignores the rest, so a one-frame round trip still works.

### Timeline

The timeline docks along the bottom, in the layout Flash and Pencil2D share. Layers are the rows. Frames are the cells. The playhead is a marker on the current frame, and the canvas shows that frame. The timeline’s height is enough for a few rows and then it scrolls. It does not eat the canvas. A drag on the divider between the canvas and the timeline resizes it, with a minimum of one row and a maximum of half the window.

- Play, stop, and loop sit on the timeline bar, with the frame number and the FPS beside them. FPS is one number.
- Previous and next frame are buttons on that bar. Comma and period do the same.
- Drag the playhead to scrub. A finger, a touchpad drag, or a mouse drag all scrub. Timeline zoom is its own slider on that bar, so a pinch does not fight canvas zoom.
- Click or tap a cell to edit that frame. Right-click, or long-press on a touchscreen, opens the frame menu: insert keyframe, insert blank keyframe, duplicate, delete, copy, paste.
- A keyframe is a filled mark in the cell. The cells after it hold that drawing until the next key. A tween span draws an arrow between two keys, the way a classic Flash tween does.
- Onion skin is one toggle on the timeline bar. Previous frames show in one tint, next frames in another. A small count sets how many frames before and after. Turning it off returns the canvas to the current frame only.

Play and Stop are one button that changes label. Loop is a separate toggle, default off. FPS is a number field, default 12, range 1 to 60. Comma and period move a frame when you are not typing in a field. They repeat if held, the way arrow keys repeat, so you can walk the clip.

Scrubbing does not paint. It only moves the playhead. A drag that starts on the playhead scrubs. A drag that starts on a cell and moves onto another cell selects a range, for delete and tween. Timeline zoom changes the width of a cell. It does not change the canvas zoom. Pinch on the canvas still zooms the canvas. Pinch on the timeline changes timeline zoom. The two regions are separate so a sloppy pinch does not do the wrong one.

The cell menu is the right-click menu, and the long-press menu on a finger. Insert keyframe copies the held drawing into a new key at that cell, splitting the hold. Insert blank keyframe puts an empty bitmap there. Duplicate copies the current key into the next cell and shifts the later frames right. Delete removes the key. If it was the only key on that layer, the layer keeps one blank frame so a layer is never frameless. Copy and paste copy the bitmap, not the tween.

A hold cell is drawn empty, with no mark. A key is a small filled square. A tween span is an arrow from key to key. You can read the row without a legend. The current frame’s column is highlighted the way the active layer row is highlighted.

Onion skin draws the previous frames in one tint and the next frames in another, both faint, behind or mixed over the current frame in the view only. The count is a single number, 1 to 5, default 1, meaning that many frames on each side. The tints are fixed. There is no color picker for them. Onion skin is off by default. Turning it off returns the canvas to the current frame only. It never becomes part of the drawing, and it is left out of export, playback composites, and thumbnails.

### Drawing on frames

The frame you select is the document. Pencil, brush, bucket, selection, and the rest work on it with no new gestures. Size, color, Unserrate, symmetry, and Smooth edges all behave as they do on a still image. A stroke’s undo step is on that frame. Undoing does not jump you to another frame.

Insert frame extends the hold. The new cell shows the same drawing until you insert a blank key or draw in a way that creates a key. Drawing on a hold cell creates a key at that cell first, then paints, so you do not silently change every held frame. That split is part of the same undo step as the stroke. One undo removes the stroke and the new key, and the hold returns.

Insert blank keyframe gives an empty frame to draw the next pose. Duplicate frame copies the current drawing so you can change it. Both are on the cell menu and as buttons on the timeline bar: a plus for a blank key, and duplicate next to it. The plus is the one a finger will use. The cell menu has the rest.

A drawn layer is frame-by-frame. What you paint lives on that frame of that layer. Adding a layer still means adding a layer. Each layer has its own row of frames. A new layer starts with one blank frame that holds for the length of the clip, so the clip does not gain a hole. Hiding a layer hides it on every frame. The eye is not per frame. Opacity and blend are not per frame. A mask, when masks exist, is per frame only if you paint it on that frame. A new frame’s mask starts as a copy of the held mask, the same way the pixels hold.

### Objects

Objects are Flash symbols, kept in a library next to the layers.

- Convert a drawing to an object and it lands in the library. Drag it onto a frame to place an instance.
- An instance moves, scales, rotates, and changes opacity with the same handles a selection already uses.
- Double-click an instance to edit the object in place. A clear way back returns you to the stage. Editing the object updates every instance.
- An object can be a single drawing, or it can have its own short timeline (a walk cycle, a blink). Placing it reuses that animation. The instance’s first frame on the stage lines up with the stage frame under it.
- Keyframes on an object track store the instance transform. The cells between keys hold the last transform until you tween them.

The library is a second tab on the layer dock, and the tab appears once the first object exists. Until then the dock is only Layers. There is no empty library tab on a still drawing. Convert to object is on the selection menu and in the Edit menu, next to the copy and paste commands. It is enabled when a selection float or a selection of pixels exists. Choosing it takes those pixels, cuts them from the frame, and stores them as an object named Object, Object 2, and so on. The instance sits where the pixels were, so the picture does not jump. One undo puts the pixels back and removes the object if no other instance uses it.

Drag an object from the library onto a frame to place another instance. The drag is a mouse drag or a finger drag. Dropping on the canvas uses the frame under the playhead. Dropping on a timeline cell uses that cell.

An instance moves, scales, rotates, and changes opacity with the same handles a selection already uses, including Shift for a uniform scale and the 15° snap. Those handles write a key on the current frame if one is not there, or update the key if you are already on one. Opacity is a field in the tool options while an instance is selected, 0 to 100, default 100.

Double-click an instance to edit the object in place. The rest of the stage dims. A breadcrumb above the canvas names the object you are inside, and clicking the stage name in that breadcrumb brings you back. The breadcrumb is hidden while you are on the stage. Editing the object updates every instance. There is no “edit a copy” unless you duplicate the object in the library first. Duplicate is on the library row’s menu.

An object can be a single drawing, or it can have its own short timeline. The object’s timeline is the same timeline control, shown in place of the stage timeline while you are inside the object. A walk cycle or a blink is just frames on that object. Placing the instance on the stage lines its first frame up with the stage frame under it. You can slide that alignment by dragging the instance’s span in the timeline. The stage does not bake the object’s frames into pixels until export or until you choose Break apart on the instance menu. Break apart writes the current frame’s appearance into the layer as pixels and removes that instance. Other instances remain.

Keyframes on an object track store the instance transform: position, scale, rotation, opacity. The cells between keys hold the last transform until you tween them. They do not interpolate until a tween exists. That hold is how Flash reads, and it is the default so a person who only wanted a new pose on a new key does not get a surprise slide.

### Tweens and easing

- A tween is a command on the span between two keys: Motion. The in-between is generated for position, scale, rotation, and opacity.
- Easing is a short list on that span: linear, ease in, ease out, ease in and out. Ease in slows into the next key. Ease out starts fast and settles. The names and the feel match Flash.
- A custom curve stays behind that list, closed until you open it. The default path is picking a named ease.
- Frame-by-frame layers and tweened object tracks share one timeline. A painted character can sit on one row while a tweened prop sits on another.
- Clearing a tween leaves the keys and removes the generated in-between.

Create Motion Tween is on the cell menu when two keys are selected or when you right-click the span between them. It is disabled on a frame-by-frame paint layer. Paint layers do not tween their pixels. If you want a drawing to move, convert it to an object first. The command does not offer to convert for you in a dialog. The menu item is simply disabled, and the status bar says “Convert to an object to tween it” when you invoke it anyway from a shortcut.

The ease list appears in the tool options while that span is selected, the same way text options appear when the text tool is active. The default ease is ease in and out. Linear is in the list for a mechanical move. Ease in slows into the next key. Ease out starts fast and settles. Changing the ease updates the in-between immediately. Playback uses it. The canvas, while you sit on a frame inside the span, shows the interpolated transform.

A custom curve stays behind that list, a disclosure labeled Curve, closed until you open it. The curve is a single ease from the first key to the second, drawn as a small plot you drag. Opening it does not change the named ease until you actually drag. The named ease remains the default path. Most spans never open the disclosure.

Clear tween is on the same cell menu. It leaves the keys and removes the generated in-between, so the hold returns. The keys stay where you put them.

Frame-by-frame layers and tweened object tracks share one timeline. A painted character can sit on one row while a tweened prop sits on another. Playback composites both. Onion skin can show both. Nothing in the row chrome says “this one is special” beyond the arrow of a tween and the filled mark of a key.

### Bones

Bones are the Flash bone tool, used on an object when you want to pose a drawing instead of redrawing it. Lay a bone by dragging from the joint to the tip. Select a bone and rotate it the way you rotate a selection. Drag the tip and the chain follows back to the root. Children follow their parent.

The bone tool is a button on the timeline bar, shown once the timeline is open. The main toolbox stays as it is. Until you lay a bone, the button is the only sign the feature exists. The button is not in the toolbox and not in a menu. If the timeline is hidden, the button is hidden with it.

A new bone is rigid and holds the pose you set. Soft is a switch on the selected bone. The extra numbers live in the tool options for the selected bone, the same place brush size lives, and their defaults keep a rigid bone still and a soft bone on a light follow-through. You open them when you want the motion, not before.

A skeleton can mix both. An upper arm stays rigid while a sleeve or a strand of hair on the same rig is soft.

You lay bones only while you are inside an object, or on a layer you have converted. Laying a bone on a plain paint layer offers Convert to object as the bone button’s first action, once, and then lays the bone on the new object. That conversion is one undo step. After the object exists, the bone button lays bones directly.

**Rigid.** A straight, solid link. It hinges at its joint and moves the art bound to it as one piece. In the options when a rigid bone is selected:

- Length and pivot. Length is in pixels. Pivot is a percent along the parent, default the parent’s tip, so a new bone chains from where you released. You can drag the joint to somewhere else on the parent afterward.
- Minimum and maximum bend, so a knee cannot flip the wrong way. Defaults are a full turn, which means no limit until you set one. The fields are degrees.
- Stiffness. High holds the keyed pose. Low lets the joint swing with its parent and settle. Default high, so a rigid bone stays where you put it.
- Damping, so a loose joint comes to rest. Default high. A stiff, damped bone does not wobble.
- Mass and gravity scale. Zero gravity follows only the pose. Above zero, the bone can sag or swing inside its angle limits, then return to the keyed pose. Default gravity is zero.

**Soft.** The bone can bend, stretch, and squash, and the art along it deforms with it. The root stays with the parent. The tip lags, then catches up. In the options when a soft bone is selected:

- Bend, stretch, and squash: how far the bone may leave its rest shape. Each is a percent, default small, so the first soft bone is a slight follow-through and not a melted shape.
- Softness: how much of the bound art follows the curve. Low stays close to rigid. High deforms the region. Default in the middle.
- Weight along the bone, root planted and tip taking the deformation. This is one slider from root to tip, default toward the tip.
- Structural stiffness (resistance to stretching) and bend stiffness (resistance to folding). Both default high enough that the bone keeps its length until you lower them.
- Damping and follow-through. Follow-through is how long the tip keeps moving after the root has stopped, in frames, default 4. Damping brings it to rest.
- Pin the root, the tip, or both. The end you leave free is the one that jiggles. Default pin is the root. The tip is free.

**Binding.** By default, the art nearest a bone follows that bone. A rigid region stays solid. You can paint weights when you need a region shared across bones. Weight paint is a mode of the bone tool, a second state of the same button, and leaving it returns you to posing. Weight paint uses the brush you already have. Black is no influence, white is full influence, for the selected bone. Other bones keep their weights. The status bar says “Painting bone weights” in that mode, the same way a layer mask says it is the target.

**Keys.** Posing a bone on a frame sets a key for that object. The key stores each bone’s rotation, and a soft bone’s bend and stretch. A motion tween eases those values with the same ease list as position and scale. Playback shows the deformed drawing. Onion skin can include the bones of the frames beside the playhead, drawn faint, and those bones are not clickable. They disappear when onion skin is off.

The rigid and soft numbers stay collapsed under Motion in the tool options. The row you see first is the switch (Rigid or Soft), the angle limits, and length. Stiffness, damping, mass, gravity, squash, and follow-through are inside that disclosure. A rigid bone with the disclosure closed holds the pose you dragged it to. You never have to open Motion to pose.

Deleting a bone is on the bone’s menu, Delete Bone. Children reparent to the deleted bone’s parent. The art they bound stays bound to them. One undo restores the bone. Deleting the last bone leaves the object as a normal object with no skeleton.

### Playback and export

- Play runs on the stage, in place, at the clip’s FPS. Loop is a toggle. Stop leaves you on the frame where you stopped.
- Export is the familiar set: GIF, a PNG sequence, and a sprite sheet. Onion skin, bone handles, and the timeline stay out of the file.

Play composites each frame through the same view the canvas already uses, at the clip FPS, and leaves the document on the frame where you stopped. Flip view and rotation apply during playback, because they are the view. They are not baked. Stopping on a frame leaves the playhead there so you can draw on the frame you stopped on. Space plays and stops when you are not typing, matching the common animation key, and it does not pan. The existing space-to-pan, if it is the current space behavior, moves to a different key when a timeline exists, or space plays only while the timeline is open and pans only while it is closed. Pick the second: space pans when the timeline is closed, and plays when it is open. A still document does not change.

Export walks those frames and reuses the current export path. GIF, PNG sequence, and sprite sheet are three entries in the existing Export dialog, shown once the document has more than one frame. A one-frame document keeps the export dialog it has today. GIF uses the clip FPS. A PNG sequence is one file per frame, numbered, in a zip. A sprite sheet packs the frames in rows, with the frame size equal to the document size, and transparent pixels stay transparent. Onion skin, bone handles, assistant overlays, the grid, and the timeline stay out of the file. Masks and layer visibility are respected, the same way a still export respects them.

Playback in the editor does not drop frames to catch up. If a frame is late, the next one waits, so a heavy brush document does not skip a pose. Export does not care about lateness. It renders every frame in order.

### Timeline states

A document with one frame and the timeline closed is indistinguishable from Pinta today. Window → Timeline shows an empty-looking bar with frame 1, the transport, and the onion toggle off. No frame was inserted. Closing it returns to the still canvas. Inserting a second frame is what makes the feature real. That insert is undoable. Undoing it back to one frame does not hide the timeline. You opened it by inserting, and hiding it is Window → Timeline. The undo removes the frame and leaves the panel.

The playhead cannot sit past the last frame. Inserting at the end extends the clip. Deleting the last frame moves the playhead left. The frame number in the bar is 1-based. The FPS field rejects 0 and blank by reverting to the last good number. Loop off plays through the last frame and stops there. Loop on returns to frame 1 and continues until Stop.

Scrubbing during playback stops playback first, then scrubs. You do not fight a moving playhead. A finger scrub and a mouse scrub are the same drag.

### Frame menu details

Right-click and long-press open the same menu. The items, in order, are Insert Keyframe, Insert Blank Keyframe, Duplicate, Delete, Copy, Paste, and, when the row is an object track, Create Motion Tween and Clear Tween. Create Motion Tween is hidden on a paint row, not shown disabled, except that a shortcut which would have called it writes the status sentence instead. Paste is disabled when the clipboard has no frame. The clipboard holds one bitmap and, if copied from an object key, the transform. Pasting a transform onto a paint cell pastes only the bitmap.

Copy does not copy onion skin. Delete on a key that later frames hold from asks nothing. Those frames hold from the previous remaining key, or become blank if you deleted the first key. One undo restores the key and the holds.

### Object details

The library lists objects by name. A row has a thumbnail of the object’s first frame. Dragging the row onto the canvas or the timeline creates an instance. Double-clicking the row is the same as double-clicking an instance: you edit the object. The breadcrumb shows the stage name, then the object name. Clicking the stage name commits any in-progress stroke on the object and returns. There is no third level. An object cannot contain another object. Convert to object is disabled while you are already inside an object. If you need a symbol inside a symbol, that waits. One level keeps the breadcrumb a single step back.

An instance that is scaled to zero is allowed and is invisible. The handles still hit if you can find the center. Opacity 0 is the supported way to hide an instance, and it remains selectable from the timeline cell. Deleting an instance does not delete the object while another instance or the library still holds it. Deleting the library row deletes the object and every instance, and it is one undo step. The menu item is Delete Object, on the library row, not on the instance. The instance’s menu says Remove Instance.

### Tween details

A motion tween stores the ease and, if you opened the curve and dragged it, the custom curve. The named ease and the custom curve are not both active. Dragging the curve switches the span to custom. Picking a named ease again discards the custom curve. The disclosure can stay open. The span uses the name.

Interpolation is per frame, on the integer frame under the playhead. Position and opacity interpolate. Scale interpolates per axis. Rotation takes the short way around, so a key at 10 degrees and a key at 350 degrees tween across the 20-degree gap, not the long way, unless the keys were set by a drag that passed the long way, in which case the stored rotation is unwrapped and the tween follows the drag. That unwrapped value is what the angle field shows if an instance is selected on that key.

Clear tween removes the ease and the curve and leaves the keys. The picture on the in-between frames snaps back to the hold. Undo restores the tween.

### Bone details

The first bone’s root is wherever you pressed, in the object’s pixel space. The tip is wherever you released. A drag shorter than 4 pixels does not create a bone. The second bone, started on top of the first, parents to it if the press is within 8 pixels of the first bone’s tip or its body. Otherwise it is a new root. Multiple roots are allowed. A character can have two feet.

Selecting a bone draws it in the accent color. Other bones draw in the muted color. Soft bones draw with a slight curve so you can tell them from rigid ones without reading the switch. The curve is the bone’s current bend. A rigid bone is a straight segment.

Dragging a tip rotates that bone and leaves its parent still, unless you are dragging a chain in a way that the parent’s stiffness is low, in which case the parent yields. At the default high stiffness the parent stays. That is the pose you expect from a first drag. Lowering stiffness is how you get the chain to follow.

Weight paint starts from the automatic nearest-bone assignment the moment the first bone is laid. You do not have to paint before the art will move. Painting weights replaces the automatic weight for the pixels you touch, on the selected bone, and the other bones renormalize so the weights on a pixel still sum to one. A pixel painted black on every bone follows no bone and stays with the object’s origin.

Playback of a soft bone runs the follow-through from the keys. It does not simulate a physics world beyond the bone’s own lag, damping, and gravity. Gravity zero and stiffness high means the playback matches the keys. That is the default, so a posed arm does not droop when you press Play.

### Export details

GIF export quantizes from the composited frames. It does not offer a dithering control in this pass. The existing export quality or the default quantizer is enough. PNG sequence names are the document name plus a four-digit frame number starting at 1. The sprite sheet’s row width is the square root of the frame count, rounded up, so a 12-frame clip is 4 columns. Empty cells in the last row are transparent. The sheet has no padding between frames. A separate json of frame counts is not written. The sheet is the image. The FPS is not stored in the sheet. It is stored in the GIF only.

Export while playback is running stops playback first, exports the whole clip, and leaves the playhead where it stopped. Export does not export only the selected range. A selected range is for delete and tween. The whole clip is the export. If a later need is a range export, it is not this task.

### Checks

Animation stays unbuilt until you ask. The check is here so the ask has a finish line.

Animation. A one-frame document looks like Pinta. Window → Timeline toggles the bar. The first inserted frame opens it. Comma and period step frames. Space plays only while the timeline is open, and pans while it is closed. Onion skin is off by default and never exports. Drawing on a hold creates a key as part of that stroke’s undo. The library tab is absent until the first object exists. Convert to object cuts the selection into a symbol and leaves an instance where the pixels were. Double-click edits it. The breadcrumb returns to the stage. A tween is Motion between two object keys, with linear, ease in, ease out, and ease in and out. A custom curve stays closed until you open it. Clear tween leaves the keys. The bone button is on the timeline bar, not in the toolbox. A new bone is rigid, stiffness high, gravity zero. Soft is a switch, and the extra numbers stay under Motion. Weight paint is a mode of that same button. Play stays on the frame where you stop. GIF, a PNG sequence, and a sprite sheet appear in Export only when there is more than one frame. Handles, onion skin, and the timeline are not in the file.
