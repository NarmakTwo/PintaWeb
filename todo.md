# To implement

The working list is everything above Big goals. Do not implement Big goals until the user explicitly asks.

The main goal is that Pinta is easy to learn, and powerful when you go looking. A first visit still looks like Pinta: the same toolbox, the same menus, size where size already is. A fast stroke comes out as a curve, and a fill colors the soft edge, because that is what people expect to happen. The control for a niche feature appears only after you ask for that feature. Asking means opening Edit on a brush, turning symmetry on, adding a reference, or opening a More disclosure. Rearranging the toolbox, the menus, the docks, and the shortcuts is the big goal Make the UI your own. Do not build that until the user explicitly asks. A mouse, a touchpad, and a finger do the same action. Where a mouse would right-click, a finger long-presses. The status bar names the one gesture that is not obvious.

## Smoothing

- [ ] One Smoothing slider on the pencil, paintbrush (including smudge), fountain pen, eraser, dither, recolor, random brush, and tone.
- [ ] The slider changes that curve. Off leaves the raw path. The pencil defaults to off.
- [ ] The lag stabilizer lives inside Edit brush. It defaults to off. Higher values lag the cursor and catch up on release.
- [ ] Shift-lock still skips smoothing and the stabilizer.

### How

Smoothing sits next to size, and only while a freehand tool is selected. The same number is the streamline slider inside Edit brush. The lag stabilizer is on that Edit screen, not beside size, because a cursor that trails the pointer is surprising until you turn it on. The status hint says “Smoothing rounds a fast stroke.”

## Anti-aliased flood fill

The bucket currently replaces every pixel inside tolerance with a flat color. On a black shape over white, the gray fringe is either left as a halo or painted solid, so the edge goes hard.

The target look: the white interior becomes the fill color, a solid pixel such as `16,16,16` stays put, and the gray edge pixels are rewritten as the same mix of the new color and the ink. A `60,60,60` fringe becomes a dark red around `108,44,44`. A light fringe such as `207,207,207` becomes a light red around `244,44,44`.

Two approaches, and they can be combined:

- [ ] **Coverage reconstruction.** Treat a fringe pixel as a blend of the clicked color and the neighboring ink. Recover that blend amount, then write the same blend of the fill color and the ink. This is the right mix when the edge really is two colors blended together.
- [ ] **Distance transform plus a one- or two-pixel expansion.** First fill only pixels that clearly match the clicked color. Then step outward into the fringe and blend by distance, so a soft ramp picks up the fill without swallowing the line.
- [ ] Use the distance pass to decide which pixels are fringe and which are real ink, and use the coverage math for the color of the fringe.
- [ ] The wand uses the same fringe rule, so a selection does not leave the gray edge behind.
- [ ] Gap closing stays a separate control from this fringe logic.

### How

The bucket and the wand gain one checkbox in the tool options, beside tolerance: **Smooth edges**. It is on for the bucket. Turn it off and the fill is the hard replace the app does today, including the existing wasm flood when it is a same-layer contiguous fill.

When it is on, the click still means “fill what I clicked.” The tolerance slider still means how far a color may be from that pixel. The steps are:

1. Build the interior with the contiguous walk already used for sample-all fills. A pixel joins when its max channel distance to the clicked color is within tolerance.
2. Run a two-pass distance transform outward from that interior.
3. Take a one- to two-pixel ring around it. A pixel in that ring whose coverage of the clicked color is near zero stays ink. That is the `16,16,16` pixel.
4. For every other pixel in the ring, sample the nearest ink along the distance gradient, recover the blend amount between that ink and the clicked color, and write the same blend of that ink and the fill color.
5. Alpha lock runs after the write, and the whole fill is one undo step.

The wand builds the same interior plus the same ring, and that mask becomes the selection. You see the marching ants include the soft edge, then Fill Selection paints it with the same blend.

The bucket’s visible options stay tolerance, Smooth edges, and Sample all layers. **Close gaps** sits under a More disclosure on the bucket, default 0, so a person filling a shape never has to learn it. The wand uses the same smooth-edge checkbox and has no gap slider.

## Tracing

- [ ] **Reference layer.** Drop or paste a photo and it lands locked, dim, under the ink, left out of export, and ignored by the bucket and wand unless Sample all layers is on.
- [ ] **Edge overlay** of that reference.
- [ ] **Blink or difference view** against the reference.
- [ ] **Gap close** on the bucket, as its own slider, in pixels.
- [ ] **Hold Alt** for a temporary eyedropper, then return to the previous tool.

### How

**Add reference** is in the Layers menu, next to Add layer. Choosing it opens the same file picker as Open. The picture becomes a layer under the one you are drawing on, named with the file name, locked, at 40% opacity. The row shows the word Reference where the blend name would be, so you can see why you cannot paint on it. Unlock and opacity stay the layer controls you already use. Dropping an image onto a canvas that already has a drawing does the same thing. Dropping onto a blank new canvas still opens the picture as the document.

Export, flatten, and copy-merged skip any layer marked reference. The bucket and the wand skip reference pixels. Sample all layers includes them, because that checkbox already means “use what I see.”

**Show edges** and **Compare** are on that reference layer’s own menu, so they exist once a reference exists. Show edges draws an outline into the view only. Compare toggles a difference view, with a menu mark while it is on. Choosing it again restores the normal look.

**Peek** is hold, so you cannot forget it on. Hold the reference layer’s eye, or hold the backtick key, and that layer goes to full opacity for as long as you hold. Release restores 40%.

**Close gaps** is under More on the bucket, labeled in pixels, default 0. Above zero, the flood treats a hole thinner than that many pixels as a wall, then the smooth-edge pass still colors the real fringe.

**Alt to pick a color** works on the paint tools. Hold Alt and the cursor becomes the eyedropper. A click samples with the sample size and Sample all layers already set on the picker, puts the color in the slot you clicked with, and leaves you on the tool you were using. Releasing Alt restores the tool cursor. Shape tools keep Alt-from-center. The status hint on the paint tools says “Hold Alt to pick a color.”

## Drawing

- [ ] Shift-click draws a straight segment from the end of the last stroke.
- [ ] A movable symmetry axis, plus radial steps.
- [ ] Snap the pencil, line, and shapes to the pixel grid.
- [ ] Flip the view horizontally without flipping pixels.

### How

**Shift-click** is a click, and the existing Shift-drag stays a 45° lock. When a pencil, brush, or line stroke ends, remember that endpoint. The next Shift-click, with almost no drag, draws one straight segment from that endpoint to the click and becomes the new endpoint. A Shift-drag still locks the stroke you are drawing. The hint adds “Shift-click continues the last line.”

**Symmetry** keeps the dropdown already in the tool options and adds Radial. Off shows nothing else. Choosing a mode draws the axis, which you can then drag. Double-click the axis to put it back through the center. Radial adds a count next to the dropdown, from 2 to 12, default 6, and a center handle. The mirror math uses that axis and that center. The axis is a view overlay and is never exported.

**Snap to grid** is a check in the View menu, beside Pixel Grid. On, the pencil, the line, and the shape tools land on grid intersections. The brush keeps a freehand path, and snap applies to its start point and to a Shift-locked end. The grid size already in that menu is the snap spacing. The menu mark shows when snap is on.

**Flip view** is a checked item in the View menu. It mirrors the paper horizontally. Pointer positions are mapped back before any tool sees them, so a stroke lands where you see it. The file’s pixels stay put. The status bar says “View flipped” while it is on, and choosing the menu item again clears it. This is separate from the layer flip command.

## Fill and selection

- [ ] While a selection is being scaled or rotated, width, height, and angle fields sit in the options strip.

### How

The fields appear in the tool options only while a selection float is active, which is when the handles are already on the canvas. Width and height are in pixels. Angle is in degrees. Editing a field applies the same transform the handles apply, so the handles and the numbers always match. Enter confirms the field.

## View

- [ ] Rotate the canvas without rotating the pixels, with a two-finger twist and a reset.
- [ ] Optional square and isometric grids, view only, with snap as a checkbox.
- [ ] One drawing assistant at a time, view only: parallel lines, an ellipse, or a vanishing point. Strokes stick to it while it is on. These are overlays, not guides pulled out of a ruler.

### How

**Rotate view** uses the two-finger gesture already used for pinch. A small twist still zooms, so a sloppy pinch does not spin the page. A clear twist rotates the view around its center. Pointer positions are unrotated before tools see them. When the angle is anything but 0, the status bar shows that angle next to the zoom. Click or tap the angle to reset it to 0. View → Reset View clears rotation and the horizontal flip together. A one-finger drag still draws. A two-finger drag with no twist still pans.

**Grids** extend the Pixel Grid item already in the View menu. The grid size control gains a type: Square or Isometric. Square is the grid it draws today. Isometric draws the same spacing on 30° axes. Both are view overlays. Snap to grid follows whichever type is showing.

**Assistant** is a View submenu: None, Parallel lines, Ellipse, Vanishing point. Choosing one asks for a drag on the canvas to place it, then returns you to the tool you had. The assistant stays visible. Pencil, brush, pen, and line strokes pull onto it while you draw. Its handles move like selection handles. View → Assistant → None removes it. Only one assistant exists at a time. It is a view overlay and is never saved into the pixels.

## Layers and color

- [ ] Long-press a layer eye for Hide others and Show all.
- [ ] A layer mask as a command in the layer menu, painted with the existing tools.
- [ ] A small mixer pad in the color dock: smear the primary and secondary, then click to pick.

### How

**Hide others** is a long-press on a layer’s eye. The menu has two items: Hide others, and Show all. A normal click still toggles that one eye.

**Add mask** is in the Layers menu and in the layer’s menu. The mask appears as a second thumbnail on that row. Click the mask thumbnail and the tools you already have paint the mask. Black hides, white shows, gray is partial. Click the layer thumbnail and you are painting pixels again. The status bar says “Painting the mask” while the mask is the target, so a gray stroke is explained. A new mask is white. Remove mask is in the same menu.

**Mix** is a disclosure under the palette, closed by default, labeled Mix. Open it and a small pad appears. Drag with the primary button to smear the primary color. Drag with the secondary button, or a second finger, to smear the secondary. A click on the pad picks that color into the slot you clicked with. A Clear control sits at the corner of the pad. Closing Mix leaves the pad’s colors for the next time you open it.

# Big goals

Do not implement anything in this section until the user explicitly asks.

## Make the UI your own

A big goal. Until this is asked for, the toolbox, the menus, the docks, and the shortcuts stay exactly as they are. A person who never opens this still has normal Pinta.

Niche tools are still worth building. They start in a catalog, off the toolbox and out of the default menus, so a beginner never sees them. Someone who wants one can place it beside the brush, drop its command into a menu, and give it a shortcut. Reset, or a browser that has never customized anything, puts the normal layout back.

- [ ] Window → Customize is the only door. The toolbox has no More row, and the default menus do not list the catalog.
- [ ] **Toolbox.** The left list is the toolbox, top to bottom. The right list is the catalog. Each catalog row is the tool name and one plain sentence. Drag a row onto the toolbox at the position you want, including directly beside the brush. Reorder. Take a default tool off. On a touchscreen, Add places it at the end and up and down walk it into place.
- [ ] **Menus.** The same dialog has a Menus tab. Pick File, Edit, View, or any other menu, and drop a catalog command into it. It shows up there and nowhere else. The default menus stay as they are until you change them.
- [ ] **Shortcuts.** A tool on the toolbox can have a shortcut you type in. A tool still in the catalog has no shortcut, so it cannot fire by accident. Existing commands can be given a different shortcut from the same screen. Reset restores the original keys.
- [ ] **Docks.** Move the toolbox to the right side. Collapse the layer, history, and color docks to a strip. Reorder those docks. They open back to the normal layout on Reset.
- [ ] **Workspaces.** Three starting layouts, Draw, Pixel, and Edit, that only change which tools are on the toolbox and which docks start open. You can still rearrange after picking one. The untouched app is the normal layout, not a workspace you have to choose.
- [ ] The saved layout is a list of tool ids in order, the menu placements, the shortcuts, and the dock arrangement, stored on this browser. The toolbox render walks that list. Reset deletes it. Until Customize exists, that list does not exist.

A catalog tool uses the same path as the tools already there: a button, the hint, the tool options, and a shortcut only after you assign one. Adding a niche tool means adding it to the catalog with that one-line description. It does not add an icon to the default toolbox.

## Brush engine

The brush library is one button at the top-right of the window, in the role Procreate’s brush button has. It is not the tip dropdown in the tool options, and it is not a new toolbox icon. The button opens a panel anchored to that corner: the tips, a stroke preview, and Edit for everything else.

Paint, Smudge, and Erase are tabs inside that panel. Each remembers its own preset. The pencil, paintbrush, fountain pen, dither, recolor, random brush, and tone follow the paint preset. The eraser follows the erase preset.

Today the menu is six fixed tips (`plain`, `circle`, `squares`, `splatter`, `slash`, `grid`) plus smudge, and smoothing is one fixed average on the brush, eraser, and pen. Those tips become the default presets. Smudge becomes a preset whose wet mix is all the way up, not a special tool path.

- [ ] **Preset.** Each brush stores tip, spacing, scatter, rotation, hardness, flow, opacity, blend, wet mix, grain, taper, streamline, stabilizer, and the size and opacity response to speed. Duplicate, rename, and delete live on the preset. A PNG can be the tip.
- [ ] **Tip and hardness.** The tip is one of the current shapes or a PNG stamp. Hardness is the falloff from the center of the dab to its edge, from a hard pixel to a soft edge.
- [ ] **Rotation.** Fixed angle, follow the stroke direction, or jitter. Input is the mouse, the touchpad, or the touchscreen.
- [ ] **Grain.** An optional second image. It either travels with each dab or stays locked to the canvas, so a long stroke reveals one continuous texture.
- [ ] **Wet mix.** A slider from pure primary color to a full sample of the canvas under the dab. In between, the brush picks up what it paints over and blends that toward the primary. Full mix is today’s smudge.
- [ ] **Flow and opacity.** Flow is how fast a stroke builds up. Opacity is the cap for the whole stroke.
- [ ] **Blend.** One dropdown on these presets: Normal, Multiply, and Behind. Behind paints only empty pixels. Alpha lock stays a layer property and still protects empty pixels.
- [ ] **Spacing.** Stamps are laid down by arc length, at a spacing relative to the brush size. A fast flick does not break into gaps. A slow pass does not pile into a blob.

Stroke path, in order. Shift-lock still replaces the path and skips every smoother below.

- [ ] **One-euro filter.** Adaptive smoothing on the raw points. A fast stroke raises the cutoff and stays low-lag. A slow stroke lowers it and knocks out hand shake.
- [ ] **Corners.** When the heading turns past a threshold, break the stroke there so later smoothing does not round that corner.
- [ ] **Stabilizer.** The lazy-mouse lag listed under Smoothing. It lives inside Edit brush and defaults to off. Higher values lag the cursor and catch up on release.
- [ ] **Streamline.** Fit a centripetal Catmull-Rom spline through the filtered points and draw along that curve. Low values only take out the wobble the filter left. High values turn the stroke into a flowing curve. The rendered point blends from the filtered point toward the spline as the amount goes up.
- [ ] **Catch-up.** On release, finish along the spline to the real endpoint.

Easing is along the length of the finished path, not a step from one sample to the next.

- [ ] **Taper.** Taper in and taper out are a fraction of the stroke’s length. Size and opacity each follow a curve (smoothstep, or a soft ease-in) across that fraction.
- [ ] **Speed.** On any of these brushes, not only the fountain pen: slow stays thick, fast thins, and the change eases. Three strengths: off, light, heavy. Speed comes from how fast the pointer moves, whether that pointer is a mouse, a touchpad, or a finger.

After the stroke:

- [ ] **Hold to settle.** If the pointer stays still after you release, fit the stroke and animate the ink onto the fit. A nearly straight path becomes a line. A closed path becomes an ellipse. A path with a few sharp corners becomes a polygon. The move from the freehand line to the fitted one is a short ease. The next stroke commits it.
- [ ] **Correct the line.** Simplify the finished stroke to a handful of points on that same spline and show them. Drag a point and the brush redraws along the new curve, using the dab settings from the stroke. The next stroke bakes it.
- [ ] **Pencil at size 1.** Pixel-perfect corners still run after the path is finalized. With streamline, stabilizer, and the one-euro filter all off, the pencil stroke is the one it draws today.

### How

The menubar gains one brush button at the top-right. The toolbox still chooses the tool. The button opens a short list of the tips you already know, with a stroke preview. A click uses that tip and closes the list. Paint, Smudge, and Erase are three tabs at the top of that list, so each keeps its own preset and the menubar stays one button. Edit, at the bottom of the list, opens the rest: shape, grain, flow, blend, wet mix, taper, speed, and the lag stabilizer. Duplicate, rename, delete, and a PNG tip live on the brush’s own menu. Presets persist in IndexedDB with the session.

What you see while drawing stays size and one **Smoothing** slider. Smoothing is the streamline amount. Its default on the brush, eraser, and pen is high enough that a fast stroke follows a curve instead of a chain of straight segments. Off is the raw path. The pencil defaults to off, and size 1 still runs the pixel-perfect pass. The one-euro filter and the corner break are part of that slider. They have no controls of their own.

The lag stabilizer, taper, speed strength, scatter, grain, and wet mix stay inside Edit. Stabilizer defaults to off, so the mark stays under the pointer until you ask it to lag. Smudge is the plain tip with wet mix at full, chosen from the Smudge tab.

The stroke is built in the tool controller, in place of the fixed average and the per-tip stamp. Points go through the one-euro filter, then the corner break, then the stabilizer if it is on, then the spline by the Smoothing amount. Stamps walk the arc length at `spacing × size`. Flow accumulates on a stroke buffer. The buffer is drawn onto the layer at the preset opacity, with the blend mode. Behind uses destination-over and leaves opaque pixels alone. Alpha lock still runs after the stroke, as it does now. Wet mix samples the layer under each dab and blends that color toward the primary by the slider. Shift-lock replaces the path with the 45° line and skips the filter, the stabilizer, and the spline.

Hold-to-settle is a switch inside Edit, off by default, labeled “Snap shape when you hold.” When it is on, holding still after a stroke eases the ink onto a line, an ellipse, or a polygon. Starting another stroke keeps the freehand line. Adjust last stroke is an Edit menu command, and a quiet button in the tool options that appears after a stroke and disappears as soon as you draw again. Choosing it shows a few handles. Dragging one redraws from the snapshot taken at the start of that stroke. The next stroke bakes the pixels and the handles go away.

## Animation

A huge goal. It should feel like Pencil2D if you only draw frame by frame, and like Flash when you reach for objects, tweens, and bones. The canvas stays the stage. The tools stay the tools you already know. Mouse, touchpad, and touchscreen all drive it the same way: click or tap a frame, drag the playhead, pinch and ctrl-wheel still zoom the canvas.

If you never open the library or the bone tool, the extra UI stays out of the way. You draw, add a frame, and draw the next one.

### How the timeline appears

The document you have today is frame 1 of every layer. Nothing about the paint tools changes until a frame exists beyond that.

Window → Timeline toggles the timeline, the same way Window toggles the toolbox and the docks. It is off by default. The first time you insert a frame, the timeline opens and stays until you hide it. Frame commands live on the timeline bar and in the cell menu. The top menu bar does not gain a Frame menu.

Each layer stores its own list of frame bitmaps. The layer you already have is that list with one frame. Undo still records the stroke you just made, on the frame you are looking at. Switching frames swaps which bitmap the tools read and write. The canvas, the toolbox, and the tool options stay where they are.

### Timeline

The timeline docks along the bottom, in the layout Flash and Pencil2D share. Layers are the rows. Frames are the cells. The playhead is a marker on the current frame, and the canvas shows that frame.

- Play, stop, and loop sit on the timeline bar, with the frame number and the FPS beside them. FPS is one number.
- Previous and next frame are buttons on that bar. Comma and period do the same.
- Drag the playhead to scrub. A finger, a touchpad drag, or a mouse drag all scrub. Timeline zoom is its own slider on that bar, so a pinch does not fight canvas zoom.
- Click or tap a cell to edit that frame. Right-click, or long-press on a touchscreen, opens the frame menu: insert keyframe, insert blank keyframe, duplicate, delete, copy, paste.
- A keyframe is a filled mark in the cell. The cells after it hold that drawing until the next key. A tween span draws an arrow between two keys, the way a classic Flash tween does.
- Onion skin is one toggle on the timeline bar. Previous frames show in one tint, next frames in another. A small count sets how many frames before and after. Turning it off returns the canvas to the current frame only.

### Drawing on frames

- The frame you select is the document. Pencil, brush, bucket, selection, and the rest work on it with no new gestures.
- Insert frame extends the hold. Insert blank keyframe gives an empty frame to draw the next pose. Duplicate frame copies the current drawing so you can change it.
- A drawn layer is frame-by-frame. What you paint lives on that frame of that layer. Adding a layer still means adding a layer. Each layer has its own row of frames.
- Onion skin is a view. It never becomes part of the drawing, and it is left out of export.

### Objects

Objects are Flash symbols, kept in a library next to the layers.

- Convert a drawing to an object and it lands in the library. Drag it onto a frame to place an instance.
- An instance moves, scales, rotates, and changes opacity with the same handles a selection already uses.
- Double-click an instance to edit the object in place. A clear way back returns you to the stage. Editing the object updates every instance.
- An object can be a single drawing, or it can have its own short timeline (a walk cycle, a blink). Placing it reuses that animation. The instance’s first frame on the stage lines up with the stage frame under it.
- Keyframes on an object track store the instance transform. The cells between keys hold the last transform until you tween them.

The library is a second tab on the layer dock, and the tab appears once the first object exists. Until then the dock is only Layers. **Convert to object** is on the selection menu and in the Edit menu, next to the copy and paste commands. A breadcrumb above the canvas names the object you are inside, and clicking the stage name in that breadcrumb brings you back. The breadcrumb is hidden while you are on the stage.

### Tweens and easing

- A tween is a command on the span between two keys: Motion. The in-between is generated for position, scale, rotation, and opacity.
- Easing is a short list on that span: linear, ease in, ease out, ease in and out. Ease in slows into the next key. Ease out starts fast and settles. The names and the feel match Flash.
- A custom curve stays behind that list, closed until you open it. The default path is picking a named ease.
- Frame-by-frame layers and tweened object tracks share one timeline. A painted character can sit on one row while a tweened prop sits on another.
- Clearing a tween leaves the keys and removes the generated in-between.

Create Motion Tween is on the cell menu when two keys are selected or when you right-click the span between them. The ease list appears in the tool options while that span is selected, the same way text options appear when the text tool is active. The custom curve is a disclosure under that list, closed until you open it.

### Bones

Bones are the Flash bone tool, used on an object when you want to pose a drawing instead of redrawing it. Lay a bone by dragging from the joint to the tip. Select a bone and rotate it the way you rotate a selection. Drag the tip and the chain follows back to the root. Children follow their parent.

The bone tool is a button on the timeline bar, shown once the timeline is open. The main toolbox stays as it is. Until you lay a bone, the button is the only sign the feature exists.

A new bone is rigid and holds the pose you set. Soft is a switch on the selected bone. The extra numbers live in the tool options for the selected bone, the same place brush size lives, and their defaults keep a rigid bone still and a soft bone on a light follow-through. You open them when you want the motion, not before.

A skeleton can mix both. An upper arm stays rigid while a sleeve or a strand of hair on the same rig is soft.

**Rigid.** A straight, solid link. It hinges at its joint and moves the art bound to it as one piece. In the options when a rigid bone is selected:

- Length and pivot.
- Minimum and maximum bend, so a knee cannot flip the wrong way.
- Stiffness. High holds the keyed pose. Low lets the joint swing with its parent and settle.
- Damping, so a loose joint comes to rest.
- Mass and gravity scale. Zero gravity follows only the pose. Above zero, the bone can sag or swing inside its angle limits, then return to the keyed pose.

**Soft.** The bone can bend, stretch, and squash, and the art along it deforms with it. The root stays with the parent. The tip lags, then catches up. In the options when a soft bone is selected:

- Bend, stretch, and squash: how far the bone may leave its rest shape.
- Softness: how much of the bound art follows the curve. Low stays close to rigid. High deforms the region.
- Weight along the bone, root planted and tip taking the deformation.
- Structural stiffness (resistance to stretching) and bend stiffness (resistance to folding).
- Damping and follow-through. Follow-through is how long the tip keeps moving after the root has stopped.
- Pin the root, the tip, or both. The end you leave free is the one that jiggles.

**Binding.** By default, the art nearest a bone follows that bone. A rigid region stays solid. You can paint weights when you need a region shared across bones. Weight paint is a mode of the bone tool, and leaving it returns you to posing.

**Keys.** Posing a bone on a frame sets a key for that object. The key stores each bone’s rotation, and a soft bone’s bend and stretch. A motion tween eases those values with the same ease list as position and scale. Playback shows the deformed drawing. Onion skin can include the bones of the frames beside the playhead.

The rigid and soft numbers stay collapsed under “Motion” in the tool options. The row you see first is the switch (Rigid or Soft), the angle limits, and length. Stiffness, damping, mass, gravity, squash, and follow-through are inside that disclosure. A rigid bone with the disclosure closed holds the pose you dragged it to.

### Playback and export

- Play runs on the stage, in place, at the clip’s FPS. Loop is a toggle. Stop leaves you on the frame where you stopped.
- Export is the familiar set: GIF, a PNG sequence, and a sprite sheet. Onion skin, bone handles, and the timeline stay out of the file.

Play composites each frame through the same view the canvas already uses, at the clip FPS, and leaves the document on the frame where you stopped. Export walks those frames and reuses the current export path. GIF, PNG sequence, and sprite sheet are three entries in the existing Export dialog, shown once the document has more than one frame. A one-frame document keeps the export dialog it has today.
