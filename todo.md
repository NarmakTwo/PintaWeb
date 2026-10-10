# To implement

The working list is everything above Big goals. Do not implement Big goals until the user explicitly asks.

The main goal is that Pinta is easy to learn, and powerful when you go looking. A first visit still looks like Pinta: the same toolbox, the same menus, size where size already is. A fast stroke comes out as a curve, and a fill colors the soft edge, because that is what people expect to happen. The control for a niche feature appears only after you ask for that feature. Asking means opening Edit on a brush, turning symmetry on, or opening a More disclosure. Rearranging the toolbox, the menus, the docks, and the shortcuts is the big goal Make the UI your own. Do not build that until the user explicitly asks. A mouse, a touchpad, and a finger do the same action. Where a mouse would right-click, a finger long-presses. The status bar names the one gesture that is not obvious.

Nothing in this file adds a toolbox icon. The toolbox stays the tools it has. A new control goes in the tool options, a menu that already exists, or a disclosure that starts closed. Input is a mouse, a touchpad, or a finger. There is no stylus pressure, tilt, or azimuth. Speed means how fast that pointer moves.

## Smoothing

The Smoothing slider and the Unserrate checkbox are already in the tool options. The work left in this section is the lag stabilizer, and it waits for Edit brush.

- [ ] The lag stabilizer lives inside Edit brush. It defaults to off. Higher values lag the cursor and catch up on release.

### Lag stabilizer

The lag stabilizer is not the Smoothing slider. It is the lazy-mouse control, and it lives inside Edit brush, which does not exist until the brush engine is asked for. Until then, do not put a stabilizer slider in the tool options. A cursor that trails the pointer is surprising if it is on by default, and it is the wrong control to sit next to size.

When Edit brush exists, the stabilizer is a slider labeled Lag, range 0 to 100, default 0. 0 means the mark stays under the pointer. Higher values pull the drawn point toward a lagged point. On release, the stroke catches up to the real endpoint over a short series of steps, the way the moving-average catch-up already does, so the line does not stop short of where you let go. The status hint while it is above 0 says "Lag is on. The stroke catches up when you let go."

Shift-lock skips the stabilizer as well as the curve. A locked horizontal, vertical, or 45° stroke is a straight segment from the start of the drag to the snapped end. No lag, no spline.

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

### The door

Window → Customize is the only door. It sits in the Window menu with the show-and-hide items that are already there. It is not a big goal the user can stumble into from the toolbox. The toolbox has no More row. The default menus do not list the catalog. A first visit does not show the word Customize anywhere except that one menu item, and even that item is easy to ignore because the rest of Window is the panels you already use.

Choosing it opens one dialog, modal, titled Customize. The dialog has tabs: Toolbox, Menus, Shortcuts, Docks. Workspaces are a row of three buttons at the top of the Toolbox tab, not a fifth tab, because they only change that layout. Reset is a button at the bottom of every tab. Reset asks nothing. It deletes the saved layout and the dialog shows the default lists immediately. Closing the dialog keeps what you did. There is no Cancel that rolls back, and there is no Apply. The canvas behind the dialog updates as you drop tools, so you can see the toolbox change without leaving the dialog.

### Toolbox

The left list is the toolbox, top to bottom, in the order the buttons appear. The right list is the catalog. Each catalog row is the tool name and one plain sentence. The sentence says what the tool does in ordinary words. It does not say which file implements it.

Drag a row from the catalog onto the toolbox at the position you want, including directly beside the brush. A line shows the insertion gap while you drag. Dropping inserts it. Dragging a toolbox row up or down reorders it. Dragging a toolbox row back to the catalog takes it off the toolbox. A tool that is on the toolbox is not also listed as available in the catalog, so you cannot add it twice.

On a touchscreen, drag is unreliable in a scrolling dialog. Each catalog row has Add. Add places that tool at the end of the toolbox. Each toolbox row has up and down buttons that walk it one step, and Remove that sends it back to the catalog. The mouse can use those buttons too. They are the same actions as the drag.

The toolbox can become empty. If it does, the dialog says “The toolbox is empty” in the left list, and the canvas shows no tool buttons. The current tool stays selected internally so a shortcut still works if one is assigned. Add at least the brush back by dragging it. Reset is the fast way to the normal set.

Default tools can be removed. That includes the brush. The catalog sentence for a default tool is still one plain sentence. Removing a default tool does not delete the feature. It only takes the button off the toolbox.

### Menus

The Menus tab lists the menus that already exist: File, Edit, View, Image, Layers, Adjustments, Effects, Window. Pick one. The left side shows that menu as it is now, including separators. The right side shows catalog commands that are not already in that menu.

Drop a catalog command into the menu. It shows up there and nowhere else. Dropping a command that already lives in another menu moves it. It does not copy. A command in a menu still runs the way it does today. Taking it out of the menu does not unbind a shortcut you set on the Shortcuts tab. The shortcut fires whether or not the item is visible, but only after you have assigned that shortcut. Default shortcuts stay on their default commands until you change them.

Separators can be added and removed from this tab. A separator is a row, not a command. You cannot drop a separator into the catalog.

The default menus stay as they are until you change them. Opening the tab and closing the dialog without a drop does not write a layout.

### Shortcuts

A tool on the toolbox can have a shortcut you type in. The row shows the tool name and a field. Focusing the field and pressing a key records that key, with Ctrl, Shift, or Alt if they were held. Pressing Escape clears the field without saving. Pressing Backspace removes the shortcut.

A tool still in the catalog has no shortcut field, so it cannot fire by accident. Putting the tool on the toolbox reveals the field, empty. Existing commands, including ones that already have shortcuts, are listed on this tab too, under the tools, so you can give Save or Undo a different key. A conflict is shown on both rows as the words “Also used by” plus the other command’s name. The new assignment wins when you leave the field. The old command loses that key. It does not get a silent second binding.

Reset restores the original keys and clears every custom one. Reset is the same button as the layout reset. Keys and layout are one saved blob. There is no separate reset for keys only.

The shortcut is swallowed when a text field is focused, the same way shortcuts are swallowed today. The Customize dialog’s own fields do not fire the shortcut you are editing.

### Docks

The Docks tab shows the toolbox side, and the layer, history, and color docks. Move the toolbox to the right side with one control: Left or Right. That is the only side choice. Collapse a dock to a strip with a checkbox on that row. Reorder the docks by dragging their rows or with up and down buttons. The order is top to bottom along the edge they occupy.

Collapsed, a dock is a vertical word, the dock’s name, and a click expands it again. The strip is the same width as a scrollbar. A finger can hit it. Expanding does not reorder.

They open back to the normal layout on Reset: toolbox on the left, docks in the order they have today, none collapsed.

### Workspaces

Three starting layouts sit at the top of the Toolbox tab: Draw, Pixel, and Edit. They only change which tools are on the toolbox and which docks start open. You can still rearrange after picking one. Picking one replaces the current toolbox list and dock arrangement. It asks first if you already have custom changes: “Replace your layout with Draw?” The buttons are Replace and Keep mine. Keep mine closes the question and does not change anything.

The untouched app is the normal layout, not a workspace you have to choose. There is no workspace picker on first launch. The three buttons exist only inside Customize.

Draw favors the brush, the pencil, the eraser, the pen, the bucket, and the eyedropper, and opens the color dock. Pixel favors the pencil, the selection tools, and the pixel grid, and opens layers. Edit favors selection, move, crop, and the adjustment menus, and opens history. The exact tool list for each can be settled when this is built. The rule is that each list is a subset of the real tools, short enough to scan, and none of them is a new tool invented for the workspace.

### What is saved

The saved layout is a list of tool ids in order, the menu placements, the shortcuts, and the dock arrangement, stored on this browser. The toolbox render walks that list. Icons, hints, and tool options stay the ones those tools already have. Reset deletes the blob. Until Customize exists, that blob does not exist, and the render does not look for it. Do not add a dormant reader that changes the toolbox if a hand-edited key appears.

A catalog tool uses the same path as the tools already there: a button, the hint, the tool options, and a shortcut only after you assign one. Adding a niche tool means adding it to the catalog with that one-line description. It does not add an icon to the default toolbox. A niche tool with no sentence does not ship. The sentence is part of the tool, the way the hint already is.

### Dialog details

The dialog is wide enough for two lists and no wider than the window minus a margin. On a narrow window the two lists stack, catalog under toolbox, and Add is the way you move a tool because a sideways drag no longer fits. The tabs stay one row. If they do not fit, they scroll horizontally. They do not wrap into a second row of tabs.

Keyboard use in the dialog: Tab moves between the lists and the buttons. Arrow keys move within the focused list. Enter on a catalog row is Add. Enter on a toolbox row does nothing, so you do not remove a tool by accident. Delete or Backspace on a toolbox row removes it, and that is the only removal key. Escape closes the dialog and keeps the changes. There is no unsaved state. The layout was already saved on each drop.

The status bar does not change while the dialog is open. The hint under the lists is one line, “Drag a tool onto the toolbox,” and it changes to “Add places it at the end” when the lists are stacked. That is the only instructional sentence in the dialog. The rest is labels.

### What a customized app still looks like

A person who moved one tool still has the same menus, the same docks, and the same shortcuts, except for the toolbox order they changed. Customizing one tab does not rewrite the others. Draw, Pixel, and Edit are the only actions that change more than one tab at once, and they ask first.

The canvas tools keep their shortcuts if those shortcuts were the defaults and you did not touch the Shortcuts tab. Removing a tool from the toolbox does not remove its default shortcut. The shortcut still switches to that tool, and the tool options still appear, even though the button is gone. That is how a hidden tool stays reachable for the person who set it up, and how a person who removed a tool by mistake can still press its key. The catalog sentence is where they learn the name. The Shortcuts tab is where they see the key is still bound. If they want it dead, they clear the shortcut and leave it off the toolbox.

Reset is always available and always does the same thing. It does not reset colors, documents, or brushes. It resets layout and shortcuts only. The button label is Reset Layout. The confirmation is one question, “Restore the original layout and shortcuts?”, with Restore and Cancel. Restore is the default button. Cancel is the escape. A mistaken Reset is not undoable from the Edit menu. The question is the guard. Documents are untouched, so the cost of a wrong Restore is the layout, which you can rebuild, not the picture.

## Brush engine

The brush library is one button at the top-right of the window, in the role Procreate’s brush button has. It is not the tip dropdown in the tool options, and it is not a new toolbox icon. The button opens a panel anchored to that corner: the tips, a stroke preview, and Edit for everything else.

Paint, Smudge, and Erase are tabs inside that panel. Each remembers its own preset. The pencil, paintbrush, fountain pen, dither, recolor, random brush, and tone follow the paint preset. The eraser follows the erase preset.

Today the menu is six fixed tips (`plain`, `circle`, `squares`, `splatter`, `slash`, `grid`) plus smudge, and smoothing is the Unserrate curve on the brush, the eraser, and the pen. Those tips become the default presets. Smudge becomes a preset whose wet mix is all the way up, not a special tool path. The Smoothing slider already in the tool options is the streamline amount this engine will own. Building the engine replaces that slider’s simple blend with the path described here. Do not build the engine in order to finish the slider.

- [ ] **Preset.** Each brush stores tip, spacing, scatter, rotation, hardness, flow, opacity, blend, wet mix, grain, taper, streamline, stabilizer, and the size and opacity response to speed. Duplicate, rename, and delete live on the preset. A PNG can be the tip.
- [ ] **Tip and hardness.** The tip is one of the current shapes or a PNG stamp. Hardness is the falloff from the center of the dab to its edge, from a hard pixel to a soft edge.
- [ ] **Rotation.** Fixed angle, follow the stroke direction, or jitter. Input is the mouse, the touchpad, or the touchscreen.
- [ ] **Grain.** An optional second image. It either travels with each dab or stays locked to the canvas, so a long stroke reveals one continuous texture.
- [ ] **Wet mix.** A slider from pure primary color to a full sample of the canvas under the dab. In between, the brush picks up what it paints over and blends that toward the primary. Full mix is today’s smudge.
- [ ] **Flow and opacity.** Flow is how fast a stroke builds up. Opacity is the cap for the whole stroke.
- [ ] **Blend.** One dropdown on these presets: Normal, Multiply, and Behind. Behind paints only empty pixels. Alpha lock stays a layer property and still protects empty pixels.
- [ ] **Spacing.** Stamps are laid down by arc length, at a spacing relative to the brush size. A fast flick does not break into gaps. A slow pass does not pile into a blob.

### The button

The menubar gains one brush button at the top-right. It shows the current tip as a small mark, not a word, so the menu bar does not grow a label. The toolbox still chooses the tool. The button chooses how that tool paints, when the tool is one of the tools that follow a preset. On a tool that does not follow a preset, the button is still there and still edits the paint preset, but the tool you are holding does not change. The status hint does not mention the button until the panel is open.

The panel is anchored to that corner, the width of a narrow dock, and it stays open until you click the button again, press Escape, or start a stroke on the canvas. Starting a stroke closes it so the panel is not in the way of the mark. A finger taps the button to open and taps it again to close. The panel does not open on hover.

Inside, the top is three tabs: Paint, Smudge, Erase. Under the tabs is a short list of presets and a stroke preview. The preview is a single curve drawn with the selected preset at the current size and color, on a transparent checker, updated when you change a setting. It is not an animation. A click on a preset uses it and closes the list if you clicked the name. Edit at the bottom of the list opens the rest and does not close the panel.

### Preset

Each brush stores tip, spacing, scatter, rotation, hardness, flow, opacity, blend, wet mix, grain, taper, streamline, stabilizer, and the size and opacity response to speed. The current size slider is still the size. The preset stores how size and opacity respond to speed, not a locked pixel size, so the size slider keeps meaning “how big.”

Duplicate, rename, and delete live on the preset’s own menu, opened from a button on the selected row. Rename is an inline field. Delete asks nothing if the preset is a duplicate. The built-in presets can be duplicated and the duplicate can be deleted. The built-in itself can be edited, and Reset preset on that menu returns it to the factory values. Delete is disabled on the last remaining preset in a tab. A tab is never empty.

A PNG can be the tip. Choosing “From image” on the tip control opens the same file picker Open uses. The image is stored with the preset in IndexedDB, scaled down so the longest side is at most 128 pixels. A huge PNG does not become a huge stamp. The preset does not embed the PNG in the `.pinta` file. Opening the file on another browser falls back to the plain tip if that preset id is unknown. The document still opens.

Presets persist in IndexedDB with the session. They are not per document. Switching documents keeps the brush you were using.

### Tip and hardness

The tip is one of the current shapes or a PNG stamp. The current shapes are the ones the tip dropdown already has: plain, circle, squares, splatter, slash, grid. They are the factory presets, one each, so the dropdown in the tool options goes away once this panel exists. Do not keep both.

Hardness is the falloff from the center of the dab to its edge, from 0 to 100. 100 is a hard pixel edge, which is what the stamps do today. Lower values fade the alpha of the dab from the center out. 0 is a soft falloff that reaches the edge of the size. Hardness does not change the size. A soft dab at size 20 is still 20 pixels across. It is faint at the rim.

### Rotation

Rotation is a choice of three: Fixed, Follow stroke, or Jitter. Fixed uses an angle in degrees, default 0. Follow stroke turns the tip to the direction of the segment being stamped. Jitter picks an angle per dab within a range, default a full turn, so splatter stays splatter without a new tip.

Input is the mouse, the touchpad, or the touchscreen. Direction comes from the stroke, not from a pen barrel. There is no tilt control and no azimuth control. A round tip ignores rotation because you cannot see it. The control still exists so a PNG tip can use it later without a new mode.

### Grain

Grain is an optional second image, chosen the same way as a PNG tip. Off is the default. It either travels with each dab or stays locked to the canvas. The choice is a second control, labeled Move with brush or Lock to canvas, shown only when a grain image is set.

Move with brush multiplies the dab by the grain, scaled to the dab, so every stamp carries the same texture. Lock to canvas samples the grain in document coordinates, so a long stroke reveals one continuous texture instead of a repeating dab. The grain does not appear as its own layer. It only affects the stamp. Removing the grain image turns the control off and deletes the stored image from the preset.

### Wet mix

Wet mix is a slider from 0 to 100. 0 is pure primary color. 100 is a full sample of the canvas under the dab, which is today’s smudge. In between, the brush picks up what it paints over and blends that toward the primary by the slider. The sample is taken from the active layer, before this dab is written, so a stroke can pick up its own earlier ink as it crosses itself. Sample all layers does not apply. Wet mix reads the layer you are painting.

Smudge as a tool-options tip goes away. The Smudge tab selects the plain tip with wet mix at 100. Switching back to Paint restores the paint preset, which keeps its own wet mix, usually 0. The eraser tab does not use wet mix. Its slider is hidden there.

### Flow and opacity

Flow is how fast a stroke builds up, 1 to 100, default 100. Each dab is drawn at `flow / 100` into a stroke buffer that starts clear when the pointer goes down. Opacity is the cap for the whole stroke, taken from the opacity slider that already exists, not a second opacity inside the preset. The buffer is composited onto the layer once per move, at that opacity, so painting back and forth in one stroke does not stack past the cap. A new stroke starts a new buffer and can darken further. That is the difference people mean by flow versus opacity.

At flow 100 and opacity 100 the stroke matches a normal stamp, aside from blend and wet mix. Do not make the default flow a slow buildup. The first stroke after you open the app should look like the brush you already know.

### Blend

One dropdown on these presets: Normal, Multiply, and Behind. Default Normal. Normal is the source-over the brush already uses, including the rule that alpha 0 erases. Multiply darkens by the dab. Behind paints only empty pixels, using destination-over, and leaves opaque pixels alone.

Alpha lock stays a layer property. It still runs after the stroke, as it does now, and it still protects empty pixels. Behind and alpha lock can both be on. Behind refuses to paint opaque pixels. Alpha lock refuses to paint empty ones. Together they only affect pixels that are partially there, which is a narrow case and an acceptable one. Do not add a fourth blend mode in this dropdown. The layer’s own blend menu is unrelated and stays where it is.

### Spacing

Stamps are laid down by arc length along the finished path, at a spacing relative to the brush size. The control is a percent of size, default 25, which is the `size / 4` walk the brush already uses. A fast flick does not break into gaps, because the path is continuous even when the pointer events were sparse. A slow pass does not pile into a blob, because stamps are by distance, not by event. Spacing 100 puts dabs edge to edge for a hard round tip. Spacing above 100 leaves gaps on purpose. The maximum is 200. The minimum is 1, which is a solid stroke.

Scatter is a percent of size, default 0, stored on the preset and edited in the same spacing group. Each dab is offset perpendicular to the path by a random amount inside that percent. 0 is no scatter. The random brush tool keeps its own random-range sliders. Scatter on a preset is positional jitter of the dab, not a recolor.

### Stroke path

Stroke path, in order. Shift-lock still replaces the path and skips every smoother below. A Shift-locked stroke is the straight 45° segment from the start, stamped at the spacing, with flow, blend, and wet mix still applied. The smoothers do not run.

- [ ] **One-euro filter.** Adaptive smoothing on the raw points. A fast stroke raises the cutoff and stays low-lag. A slow stroke lowers it and knocks out hand shake.
- [ ] **Corners.** When the heading turns past a threshold, break the stroke there so later smoothing does not round that corner.
- [ ] **Stabilizer.** The lazy-mouse lag listed under Smoothing. It lives inside Edit brush and defaults to off. Higher values lag the cursor and catch up on release.
- [ ] **Streamline.** Fit a centripetal Catmull-Rom spline through the filtered points and draw along that curve. Low values only take out the wobble the filter left. High values turn the stroke into a flowing curve. The rendered point blends from the filtered point toward the spline as the amount goes up.
- [ ] **Catch-up.** On release, finish along the spline to the real endpoint.

The one-euro filter has no slider of its own. It is part of the Smoothing slider, and Unserrate still gates it. With Unserrate off, or with the slider at 0, the filter is off and the points stay raw. With Unserrate on and the slider above 0, the filter is on, and its minimum cutoff is what removes a slow wobble. A fast stroke raises the cutoff so the line does not lag behind a flick. The parameters are fixed. If they need tuning later, they are tuned in one place, not exposed.

Corners: when the heading between the last accepted direction and the new point turns past about 70 degrees, break the stroke there. The spline ends and a new one starts, so a sharp corner you clearly drew is not rounded off by the neighbors. The break is part of the Smoothing slider. It has no control of its own. With Unserrate off, or with the slider at 0, there is nothing to break.

Stabilizer is the Lag slider inside Edit, default 0, as described under Smoothing. It runs after the filter and the corner break, and only if Lag is above 0. The drawn point chases the filtered point. On release, catch-up walks the lagged point to the real endpoint.

Streamline is the Smoothing amount, and Unserrate still gates it. Fit a centripetal Catmull-Rom through the points that survived the filter, the corners, and the stabilizer. Low values only take out the wobble the filter left. High values turn the stroke into a flowing curve. The rendered point blends from the filtered point toward the spline as the amount goes up. Unserrate off is the raw path and leaves the slider alone. Unserrate on at 0 is the raw path too. Unserrate on at 100 is the spline. The default on the brush, the eraser, and the pen stays high, with Unserrate checked. The pencil’s slider defaults to 0 and its checkbox starts unchecked.

Catch-up on release finishes along the spline to the real endpoint, including the stabilizer catch-up. The stroke does not stop short. Catch-up is not a separate checkbox.

### Easing

Easing is along the length of the finished path, not a step from one sample to the next. A sparse pointer and a dense pointer produce the same taper if the path length is the same.

- [ ] **Taper.** Taper in and taper out are a fraction of the stroke’s length. Size and opacity each follow a curve (smoothstep, or a soft ease-in) across that fraction.
- [ ] **Speed.** On any of these brushes, not only the fountain pen: slow stays thick, fast thins, and the change eases. Three strengths: off, light, heavy. Speed comes from how fast the pointer moves, whether that pointer is a mouse, a touchpad, or a finger.

Taper in and taper out are two percents of the path length, default 0 and 0, edited inside Edit. Size and opacity each have a checkbox for whether they taper. Both off means no taper, which is the default. The curve is a smoothstep. There is no custom taper curve. A stroke shorter than a few pixels ignores taper and draws one dab at full size, so a tap does not vanish.

Speed is three strengths: Off, Light, Heavy. Default Off for every preset except the fountain pen, whose default is Light, because the pen already thins with speed. Slow stays thick. Fast thins. The change eases along the path so a single fast sample does not punch a hole in the stroke. Speed is pointer speed. It is not pressure. Off leaves the size you set.

### After the stroke

- [ ] **Hold to settle.** If the pointer stays still after you release, fit the stroke and animate the ink onto the fit. A nearly straight path becomes a line. A closed path becomes an ellipse. A path with a few sharp corners becomes a polygon. The move from the freehand line to the fitted one is a short ease. The next stroke commits it.
- [ ] **Correct the line.** Simplify the finished stroke to a handful of points on that same spline and show them. Drag a point and the brush redraws along the new curve, using the dab settings from the stroke. The next stroke bakes it.
- [ ] **Pencil at size 1.** Pixel-perfect corners still run after the path is finalized. With streamline, stabilizer, and the one-euro filter all off, the pencil stroke is the one it draws today.

Hold to settle is a switch inside Edit, off by default, labeled “Snap shape when you hold.” When it is on, holding still for about a third of a second after you release fits the stroke. A path whose deviation from a straight line is under a small threshold becomes a line. A path that ends near its start becomes an ellipse. A path with a few sharp corners, and not much else, becomes a polygon through those corners. Anything else is left alone. The move from the freehand ink to the fitted ink is a short ease, under a quarter of a second, redrawn from the pointer-down snapshot. Starting another stroke before the hold finishes keeps the freehand line and never fits. The fit is the same undo step as the stroke, not a second step. Undo removes the stroke, fitted or not.

Correct the line is an Edit menu command, Adjust Last Stroke, and a quiet button in the tool options that appears after a freehand stroke and disappears as soon as you draw again. The button label is Adjust. Choosing it simplifies the finished stroke to a handful of points on that same spline and shows them as handles. Drag a point and the brush redraws along the new curve, using the dab settings from the stroke, from the same pointer-down snapshot. The next stroke bakes the pixels and the handles go away. Escape bakes and leaves. Undo after baking removes the stroke. There is no undo of a single handle drag separate from the stroke.

Pencil at size 1 still runs pixel-perfect corners after the path is finalized, including after streamline. With streamline, stabilizer, and the one-euro filter all off, the pencil stroke is the one it draws today, including the pixel-perfect pass at size 1 and the plain stamp above size 1.

### What stays on screen while you draw

What you see while drawing stays size, opacity, the Unserrate checkbox, and one Smoothing slider. Everything else is inside the panel’s Edit. The panel’s Edit holds shape, hardness, grain, flow, blend, wet mix, spacing, scatter, taper, speed, and Lag. Duplicate, rename, delete, and a PNG tip live on the brush’s own menu.

The stroke is built in the tool controller. While Unserrate is off the path is the raw one and the Smoothing number is left stored. While it is on, points go through the one-euro filter, then the corner break, then the stabilizer if it is on, then the spline by the Smoothing amount. Stamps walk the arc length at `spacing × size`. Flow accumulates on a stroke buffer. The buffer is drawn onto the layer at the opacity cap, with the blend mode. Behind uses destination-over and leaves opaque pixels alone. Alpha lock still runs after the stroke. Wet mix samples the layer under each dab and blends that color toward the primary by the slider. Shift-lock replaces the path with the 45° line and skips the filter, the stabilizer, and the spline.

### Edit layout

Edit is a second view of the same panel, not a new window. A back control at the top returns to the preset list. The controls, in order, are: tip, hardness, rotation, spacing, scatter, flow, blend, wet mix, grain, taper in, taper out, speed, Lag, and the hold-to-settle switch. Each is one row. A row that does not apply is hidden, not grayed. Wet mix is hidden on the Erase tab. Rotation’s angle field is hidden unless rotation is Fixed. Grain’s lock choice is hidden until a grain image is set. Taper’s size and opacity checkboxes sit on the taper rows.

The stroke preview stays pinned at the top of Edit so every change shows on the same curve. The preview uses the primary color and the current size. It does not use the canvas. Changing size with the size slider while Edit is open updates the preview.

### Factory presets

The factory set on the Paint tab is one preset per current tip: Plain, Circle, Squares, Splatter, Slash, Grid. Their settings match the stamps those tips make today: hardness 100, spacing 25, scatter 0, flow 100, blend Normal, wet mix 0, no grain, no taper, speed Off except that the fountain pen tool still applies its own thinning when the preset’s speed is Off. Streamline on those presets is the high default. Stabilizer is 0.

The Smudge tab starts with one preset, Smudge, plain tip, wet mix 100, everything else like Plain. The Erase tab starts with Hard and Soft, matching the eraser edge control. Once the engine exists, the edge dropdown in the tool options is removed and those two presets replace it. Until you ask for the engine, the edge dropdown stays.

### Failure and size

A missing PNG tip falls back to Plain and the preset row shows the word Missing next to the name. The stroke still draws. Deleting the image file from disk later is the same failure, because the bytes were copied into IndexedDB at choose time. If that copy is corrupt, the same fallback applies.

A preset name is one line, trimmed, and empty names are refused. Two presets may share a name. Identity is an id, not the name. Rename does not break a document, because documents do not store the preset.

Size 1 with a soft hardness still draws a soft single pixel, which will look like a faint dot. That is what hardness means. The pencil’s pixel-perfect pass only runs when hardness is 100 and the smoothers are off and size is 1. A soft pencil at size 1 skips pixel-perfect, because there is no hard corner to preserve.

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

### Checks for the big goals

These stay unbuilt until you ask. The checks are here so the ask has a finish line.

Customize. Window → Customize is the only entry. The toolbox has no More row. Dragging a catalog row beside the brush puts it there. Removing the brush from the toolbox leaves its shortcut working until you clear the shortcut. Menus move a command instead of copying it. A conflict on the Shortcuts tab names the other command, and the new key wins. The toolbox can sit on the right. A dock can collapse to a strip. Draw, Pixel, and Edit ask before they replace a layout you already changed. Reset Layout asks, then restores the original toolbox, menus, shortcuts, and docks, and does not touch the picture. A browser that has never opened Customize has no layout blob, and the toolbox is the default one.

Brush engine. One button at the top-right opens the panel. Paint, Smudge, and Erase are tabs. The six current tips are the factory paint presets. Smudge is wet mix at 100, not a separate stamp path. Hardness 100 matches today’s hard dab. A PNG tip is stored with the preset and falls back to Plain if it is missing. Grain can move with the dab or lock to the canvas. Flow builds up inside one stroke and opacity caps that stroke. Behind paints only empty pixels. Alpha lock still runs after. Spacing is by arc length, so a fast flick does not gap. Unserrate stays next to the Smoothing slider. Unserrate off is the raw path and the slider number stays. Unserrate on uses that number, so 0 is the raw path and a high value is the spline. Lag defaults off and catches up on release. Shift-lock skips the filter, the lag, and the spline. Taper and speed default off, except the pen’s light speed. Hold to settle is off until you enable it, and another stroke before the hold keeps the freehand line. Adjust Last Stroke shows handles and bakes them when you draw again. Pencil size 1 with Unserrate off, or with the slider at 0, is the pixel-perfect pencil.

Animation. A one-frame document looks like Pinta. Window → Timeline toggles the bar. The first inserted frame opens it. Comma and period step frames. Space plays only while the timeline is open, and pans while it is closed. Onion skin is off by default and never exports. Drawing on a hold creates a key as part of that stroke’s undo. The library tab is absent until the first object exists. Convert to object cuts the selection into a symbol and leaves an instance where the pixels were. Double-click edits it. The breadcrumb returns to the stage. A tween is Motion between two object keys, with linear, ease in, ease out, and ease in and out. A custom curve stays closed until you open it. Clear tween leaves the keys. The bone button is on the timeline bar, not in the toolbox. A new bone is rigid, stiffness high, gravity zero. Soft is a switch, and the extra numbers stay under Motion. Weight paint is a mode of that same button. Play stays on the frame where you stop. GIF, a PNG sequence, and a sprite sheet appear in Export only when there is more than one frame. Handles, onion skin, and the timeline are not in the file.
