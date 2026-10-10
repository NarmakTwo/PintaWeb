# To implement

The working list is everything above Big goals. Do not implement Big goals until the user explicitly asks.

The main goal is that Pinta is easy to learn, and powerful when you go looking. A first visit still looks like Pinta: the same toolbox, the same menus, size where size already is. A fast stroke comes out as a curve, and a fill colors the soft edge, because that is what people expect to happen. The control for a niche feature appears only after you ask for that feature. Asking means opening Edit on a brush, turning symmetry on, or opening a More disclosure. Rearranging the toolbox, the menus, the docks, and the shortcuts is the big goal Make the UI your own. Do not build that until the user explicitly asks. A mouse, a touchpad, and a finger do the same action. Where a mouse would right-click, a finger long-presses. The status bar names the one gesture that is not obvious.

Nothing in this file adds a toolbox icon. The toolbox stays the tools it has. A new control goes in the tool options, a menu that already exists, or a disclosure that starts closed. Input is a mouse, a touchpad, or a finger. There is no stylus pressure, tilt, or azimuth. Speed means how fast that pointer moves.

## Smoothing

Unserrate stays in the tool options next to the Smoothing slider. It is the only switch. The slider is only the amount. Unserrate off draws as if Smoothing were 0 and does not change the number on the slider. Unserrate on uses that number. Each tool remembers both. The checkbox defaults on for the brush, the eraser, and the pen, and off for the pencil. Pencil size 1 with the effective amount at 0 stays pixel-perfect. Shift-lock skips the curve. The work left here is the slider, the same pair of controls on dither, recolor, the random brush, and the tone tools, and the lag stabilizer inside Edit brush.

- [ ] One Smoothing slider on the pencil, paintbrush (including smudge), fountain pen, eraser, dither, recolor, random brush, and tone, beside the Unserrate checkbox.
- [ ] Unserrate off uses zero and leaves the slider where it is. Unserrate on uses the slider. The pencil’s checkbox defaults to off.
- [ ] The lag stabilizer lives inside Edit brush. It defaults to off. Higher values lag the cursor and catch up on release.
- [ ] Shift-lock still skips smoothing and the stabilizer.

### What you see

The slider sits in the tool options, immediately after size, and only while one of those freehand tools is selected. The label is Smoothing. The range is 0 to 100. The Unserrate checkbox sits on the same row. The number is not shown as a percent in the label. A small readout to the right of the slider shows the integer, the same way size does. Unchecking Unserrate does not move the thumb and does not rewrite the readout.

On the paintbrush, the eraser, and the fountain pen the slider default is 70, and Unserrate starts checked, so a fast stroke follows a curve. On the pencil the slider default is 0 and Unserrate starts unchecked. On dither, recolor, the random brush, lighten, and darken the slider default is 0 and Unserrate starts unchecked, so those tools stay jagged until you turn the checkbox on and raise the slider.

The stroke uses the slider only while Unserrate is checked. Checked, the number is how far the drawn point moves from the raw sample toward the spline. 100 is the spline alone. 70 redraws the stroke along the spline, which is the curve Unserrate draws today. Unchecked, the effective amount is 0 no matter what the thumb says. Checking it again uses the number still sitting on the slider. Dragging the slider while Unserrate is off updates the stored number and does not curve the stroke you are drawing.

Dither, recolor, the random brush, and the tone tools gain both controls. With Unserrate off, or with it on and the slider at 0, they keep the stamp they use today. With Unserrate on and the slider above 0, the pointer samples are fit with the same spline and the tool’s existing dab is replayed along that curve. Their other sliders stay where they are.

### How the number works

An effective amount of 0 stamps the segments the tool already stamps. That is the slider at 0, or Unserrate unchecked. The brush, the eraser, and the pen keep the moving average they already have in that case. The pencil at size 1 keeps the pixel-perfect pass.

An effective amount above 0, which requires Unserrate checked and a slider above 0, appends the aimed point on each move (after Shift-lock, if Shift is held) and redraws the whole stroke from the pointer-down snapshot. The fit is a centripetal Catmull-Rom, the one already in the tool controller. Two points stay a straight line. Three or more points bend. The slider is the blend from the raw polyline toward that spline. At the default 70 the drawn point is mostly the spline, which matches the current Unserrate look. At 100 the drawn point is the spline. The stamps still walk at `max(1, size / 4)` so a large brush does not gap and a small brush does not pile into a solid blob beyond what it does today.

The one-euro filter and the corner break described under the brush engine are not separate controls here. Until that engine exists, the slider is only this blend. Do not add a second number beside it.

### Lag stabilizer

The lag stabilizer is not this slider. It is the lazy-mouse control, and it lives inside Edit brush, which does not exist until the brush engine is asked for. Until then, do not put a stabilizer slider in the tool options. A cursor that trails the pointer is surprising if it is on by default, and it is the wrong control to sit next to size.

When Edit brush exists, the stabilizer is a slider labeled Lag, range 0 to 100, default 0. 0 means the mark stays under the pointer. Higher values pull the drawn point toward a lagged point. On release, the stroke catches up to the real endpoint over a short series of steps, the way the moving-average catch-up already does, so the line does not stop short of where you let go. The status hint while it is above 0 says “Lag is on. The stroke catches up when you let go.”

Shift-lock skips the stabilizer as well as the curve. A locked horizontal, vertical, or 45° stroke is a straight segment from the start of the drag to the snapped end. No lag, no spline.

### Pencil size 1

Size 1 and an effective amount of 0 is the pixel-perfect pencil. That is Unserrate off, or Unserrate on with the slider at 0. The corners stay the corners that pencil draws today. Size 1 and an effective amount above 0 fits the path first, then runs the pixel-perfect pass on the finished samples, so a fast curve still lands on whole pixels and does not leave a stair of double-wide corners. Size above 1 uses the stamp, smoothed or not, and does not run the pixel-perfect pass.

### Gestures

A mouse drags the slider. A touchpad drags it. A finger drags it. Letting go of the slider does not start a stroke. The slider is a range input, so it does not count as typing and it does not swallow undo. Changing it during a stroke does not rewrite the stroke already on the canvas. The next stroke uses the new value.

The status hint on a freehand tool, while Unserrate is on and the slider is above 0, says “Smoothing rounds a fast stroke.” While Unserrate is off, or the slider is 0, that sentence is absent. Do not mention the spline or the filter in the hint.

### What this must not do

Do not add the slider to the line, the shapes, the selection tools, the bucket, the wand, or text. Do not store a separate smoothing value per brush tip. One value per tool is enough until presets exist. Do not animate the stroke rewriting itself while the pointer is down beyond the redraw the curve already does. Undo is still one step for the whole stroke.

### Each tool

The paintbrush, including the smudge tip, uses the effective amount on the path and then the tip it already stamps. Smudge still drags the paint under the dab. Smoothing changes where the dabs go, not whether smudge picks up color. A smudge stroke with Unserrate off, or with the slider at 0, is the smudge you have today. Unserrate on at the default high value follows the curve and smears along that curve. The slider number stays put when you uncheck Unserrate. Symmetry copies the smoothed path, it does not smooth each copy separately.

The eraser uses the same path as the brush and then the eraser tip, hard or soft, whichever the edge control is set to. Smoothing does not soften the edge. The edge control does. Right-button erase, which paints the secondary color, follows the same path.

The fountain pen uses the path, then its speed thinning on top. Smoothing decides the centerline. Speed decides the width along that centerline. With Unserrate off, or with it on and the slider at 0, the pen is the pen you have today, including the moving average. With Unserrate on at the default high value, the centerline is the curve and the width still thins when the pointer was fast. The pen does not gain Shift-lock.

The pencil with Unserrate off, at any slider position, is the straight path: pixel-perfect at size 1, and the straight stamp above size 1. Unserrate on and the slider at 0 is that same straight path. Unserrate on and the slider above 0 fits first. Size 1 then runs pixel-perfect on the fitted samples. Size above 1 stamps the fitted samples. The pencil’s symmetry copies follow that result.

Dither follows the path and then the dither dab it already uses, including the secondary color on the other button. Recolor follows the path and then the recolor dab, and Global recolor stays a separate checkbox that recolors the whole match in one step instead of along a path. When Global is on, the slider does nothing visible, because there is no path. The slider stays on screen so it is there when you turn Global off. The random brush follows the path, then applies its random range per dab along the fitted samples. Lighten and darken follow the path, then apply their amount at their rate along the fitted samples. Rate 0 still means each pixel is touched once. The path only changes which pixels the tool visits.

### While a stroke is in progress

Pointer-down stores the snapshot and the first sample. Pointer-move either extends the raw segments, if the effective amount is 0, or rebuilds the curve from the snapshot, if it is above 0. Pointer-up commits one history step. A pointer cancel restores the snapshot and does not commit. Switching tools mid-stroke cancels, the way abandoning a stroke already does. Changing the slider or the checkbox mid-stroke does not rebuild the stroke in progress. The effective amount is read at the next sample, so the rest of the stroke uses it and the earlier part stays as it was drawn. Unchecking Unserrate mid-stroke does not move the slider. Checking it mid-stroke starts using the number already on the slider.

A very short stroke, under one pixel of movement, is a dot. The fitter is not asked to curve a dot. Tap and release leaves one dab at the down point, at the current size, on every tool in this list.

### Memory

Each tool stores its own slider value and its own Unserrate checkbox in this browser, next to the other tool settings that already survive a reload. A new browser starts at the defaults above. Neither value is written into the `.pinta` file. Opening someone else’s file does not change your smoothing. Undo does not change the slider or the checkbox. Turning the checkbox off never writes 0 into the slider.

## Anti-aliased flood fill

The bucket currently replaces every pixel inside tolerance with a flat color. On a black shape over white, the gray fringe is either left as a halo or painted solid, so the edge goes hard.

The target look: the white interior becomes the fill color, a solid pixel such as `16,16,16` stays put, and the gray edge pixels are rewritten as the same mix of the new color and the ink. A `60,60,60` fringe becomes a dark red around `108,44,44`. A light fringe such as `207,207,207` becomes a light red around `244,44,44`. Those two pixels are the acceptance check for a red fill on a soft black edge over white. If a formula does not land near both of them, the formula is wrong. Do not ship a fill that only flattens the interior and leaves the halo, and do not ship one that paints the dark ink solid red.

- [ ] **Coverage reconstruction.** Treat a fringe pixel as a blend of the clicked color and the neighboring ink. Recover that blend amount, then write the same blend of the fill color and the ink. This is the right mix when the edge really is two colors blended together.
- [ ] **Distance transform plus a one- or two-pixel expansion.** First fill only pixels that clearly match the clicked color. Then step outward into the fringe and blend by distance, so a soft ramp picks up the fill without swallowing the line.
- [ ] Use the distance pass to decide which pixels are fringe and which are real ink, and use the coverage math for the color of the fringe.
- [ ] The wand uses the same fringe rule, so a selection does not leave the gray edge behind.

### What you see

The bucket and the wand gain one checkbox in the tool options, beside tolerance. The label is Smooth edges. It is on for the bucket and on for the wand. It is one stored preference, so turning it off on the bucket turns it off on the wand. Turn it off and the fill is the hard replace the app does today, including the existing wasm flood when the fill is contiguous and on the active layer only.

The bucket’s visible options stay tolerance, Smooth edges, and Sample all layers. The wand’s visible options stay tolerance, Contiguous, Smooth edges, and Sample all layers when that checkbox applies. No new toolbox icon. No extra dialog.

The status hint on the bucket, while Smooth edges is on, says “Fills the soft edge.” While it is off, the hint stays the bucket hint that already exists.

### The click

The click still means “fill what I clicked.” The tolerance slider still means how far a color may be from that pixel. Tolerance 0 to 100 is still `round(tolerance * 2.55)` in channel distance, and distance is still the max channel distance, alpha included. Sample all layers still means the match is against the flattened composite and the paint still lands on the active layer. Contiguous on the wand still means a walk from the click. Contiguous off still means every matching pixel. Smooth edges does not change those meanings. It only changes what happens to the fringe after the interior is known.

Alpha lock still runs after the write. A pixel that was empty before the fill stays empty when the layer locks transparency. The whole fill, interior plus fringe, is one undo step. The history label stays Fill.

### Steps when Smooth edges is on

1. Build the interior with the contiguous walk already used for sample-all fills. A pixel joins the interior when its max channel distance to the clicked color is within tolerance. If the wand is not contiguous, the interior is every pixel within tolerance, not a walk. If the bucket is a same-layer contiguous fill with Smooth edges off, keep calling the wasm flood and do not run the rest.
2. Run a two-pass distance transform outward from that interior, in pixel steps, 4-connected. Each fringe candidate records the distance and the step back toward the interior.
3. Take a ring of one to two pixels around the interior. A pixel farther than two pixels out is not paint and not selection. A pixel in that ring whose coverage of the clicked color is near zero stays ink. That is the `16,16,16` pixel. Near zero means the recovered coverage is under about 0.04, so a genuinely solid ink pixel is not tinted.
4. For every other pixel in the ring, sample the nearest ink by walking the distance gradient out of the interior until the pixel is outside the ring or its coverage of the clicked color collapses. Recover the blend amount between that ink and the clicked color. Write the same blend of that ink and the fill color. The clicked color is replaced by the fill. The ink is kept in the same proportion it already had. A light fringe stays light. A dark fringe stays dark. The solid ink outside the ring is not written.
5. Alpha lock runs after the write. Then one checkpoint.

Coverage is recovered per pixel, not taken from the distance alone. Distance decides who is allowed into the ring. Coverage decides the color. A two-pixel anti-aliased ramp should pick up the fill. A hard black pixel one step outside a sloppy tolerance should not.

If the fringe is not a blend of two colors, for example a texture or a gradient that happens to sit next to the click, the coverage recover will not find a stable ink color. In that case write the fill only on the interior and leave the ring alone. A wrong blend is worse than a hard edge. The fill still completes. It does not cancel.

### The wand

The wand builds the same interior plus the same ring, and that mask becomes the selection. Marching ants include the soft edge. Fill Selection then paints that mask with the same blend, not with a flat color on the fringe pixels, so the selected edge and the filled edge match. Pixels in the ring with near-zero coverage are not in the mask. That is how the solid ink stays unselected.

Smooth edges off on the wand is the selection the wand makes today. Contiguous and Sample all layers still apply on top of that.

### Partial alpha and empty pixels

A clicked pixel with partial alpha is a real color. The interior matches it under the same max-channel rule, alpha included. The fill color keeps the alpha of the color you are painting with, the way the bucket already does, including a fully transparent fill that erases. On a fringe pixel the written alpha follows the same blend: ink alpha and fill alpha in the recovered proportion. Do not force the fringe to opaque.

An empty pixel, alpha 0, is not ink and not interior unless the click itself was empty. The ring does not crawl out across a transparent margin and invent a fringe there.

### What this must not do

Do not change the bucket into a non-contiguous fill. The bucket stays contiguous. Do not add a gap-closing control in this task. Do not preview the fill on the overlay while the mouse is merely hovering. The fill happens on click, as it does now. A second click is a second undo step.

### Worked pixels

Use a black line over white and a red fill, red being the primary color at full opacity. The interior white pixels become that red. A solid ink pixel at `16,16,16` is outside the blend and stays `16,16,16`. A fringe pixel at `60,60,60` becomes a dark red near `108,44,44`. A fringe pixel at `207,207,207` becomes a light red near `244,44,44`. Check both fringe pixels on the same fill. Passing one and missing the other means the coverage or the ink sample is wrong.

The same image with Smooth edges off becomes a hard red interior and an untouched gray halo, which is today’s bucket. That pair of results is the test: off matches the current flood, on matches the two fringe colors and leaves the solid ink.

### Tolerance

Tolerance 0 only accepts the clicked color, then the ring still reaches one or two pixels out and blends those by coverage. Tolerance 0 with Smooth edges on is how you fill line art without a halo and without swallowing the line. Raising tolerance widens the interior before the ring is added. The ring does not grow with tolerance. It stays one to two pixels. A huge tolerance can already include the fringe in the interior, and those pixels are then painted as interior, flat fill, because they joined on color distance. That is correct. The ring is only for pixels the interior refused.

### Sample all layers

When Sample all layers is on, the interior and the ink sample are read from the composite you see. The write still goes to the active layer. A fringe pixel’s ink might live on a lower layer. The blend still uses that seen ink color, and the result is painted on the active layer. The lower layer is not modified. If the active layer already had paint in that pixel, the fill replaces it according to the bucket’s usual composite onto that layer, then the fringe blend, then alpha lock.

When Sample all layers is off, both the match and the ink sample come from the active layer. A soft edge that exists only on a lower layer is invisible to the fill. That matches the checkbox you already have.

### Selection after a wand fill

Marching ants follow the mask, including the partial fringe pixels that were accepted. Fill Selection uses the stored coverage for those fringe pixels so the color matches a bucket click on the same spot. If the user changes the fill color between the wand click and Fill Selection, the blend uses the new fill color and the coverage saved with the mask. The coverage is part of the selection until the selection changes. A selection that did not come from the wand has no coverage and Fill Selection stays the flat fill it is today.

Moving or scaling the selection drops the coverage and fills flat, because the fringe amounts no longer sit on the pixels they were measured from. The ants remain. Only the soft blend is dropped. Nudging by a pixel also drops it. The drop is silent. There is no toast.

### Undo, redo, and the empty click

Undo restores the layer bitmap and, for the wand, the previous selection. Redo puts both back, including coverage. A click in a region that does not change any pixel still counts as a fill attempt and does not add a history step, matching a no-op fill today. A click that only changes fringe pixels does add a step, even if the interior was already the fill color.

## Drawing

- [ ] Shift-click draws a straight segment from the end of the last stroke.
- [ ] A movable symmetry axis, plus radial steps.
- [ ] Snap the pencil, line, and shapes to the pixel grid.
- [ ] Flip the view horizontally without flipping pixels.

### Shift-click

Shift-click is a click. The existing Shift-drag stays a 45° lock on the pencil, the brush, and the line. The pen is not Shift-locked today and does not gain Shift-click.

When a pencil, brush, or line stroke ends, remember that endpoint in document pixels. The memory is per document, not per tool, so you can draw a line with the pencil and continue it with the brush. It clears when you switch documents, when you undo past that stroke, when you resize the canvas, and when you start a stroke that is not a Shift-click. It does not clear when you change color, size, or layer.

The next Shift-click, with almost no drag, draws one straight segment from that endpoint to the click and becomes the new endpoint. Almost no drag means the pointer moved less than 4 screen pixels between down and up. More than that is a Shift-drag: the 45° lock from the down point, and the remembered endpoint is replaced by the end of that drag when you let go.

The segment uses the current tool, the current size, the current color, and the effective smoothing if that tool has the checkbox and the slider. A continued segment is a two-point path, so the curve fitter leaves it straight. Shift-lock is not applied on top of Shift-click. The line goes to the click, not to the nearest 45° slot, because the point of the gesture is “continue to here.”

The segment is one undo step. The history label is the tool’s usual label. Redo restores the remembered endpoint to the end of the redone segment.

A finger has no Shift key. Shift-click is a mouse and touchpad gesture. Do not add a toolbar button for it. The status hint on the pencil, the brush, and the line adds “Shift-click continues the last line.” The hint is one sentence. It does not appear on the other tools.

If there is no remembered endpoint, Shift-click is an ordinary click. Nothing special happens, and no error toast appears.

### Symmetry

The symmetry dropdown already in the tool options for the brush, the pen, and the pencil gains one more entry: Radial. The list is Off, Vertical, Horizontal, Orthogonal, Radial. Off shows nothing else. The eraser does not gain symmetry. The line does not gain symmetry.

Choosing Vertical, Horizontal, or Orthogonal draws the axis on the view. Vertical is a vertical line. Horizontal is a horizontal line. Orthogonal draws both. The default position is the center of the document, which is the axis the mirror math uses today (`x' = width - 1 - x`, `y' = height - 1 - y`). The axis is a view overlay. It is never exported, never flattened, and never stored in a pixel layer.

You drag the axis by its line. The hit target is 8 screen pixels on either side of the line so a finger can grab it. Dragging moves it in document pixels. It clamps to the document. Double-click the axis, or double-tap it, and it returns to the center. A mouse, a touchpad, and a finger all drag it. While you drag the axis you are not drawing. Pointer capture stays on the axis until you let go.

Radial adds a count control next to the dropdown, a number from 2 to 12, default 6, and a center handle. The count is a small stepper, not a slider, so it does not get confused with size. The copies are placed at `360 / count` degrees around that center. The center handle defaults to the middle of the document. Drag it to move the center. Double-click it to recenter. Radial does not also draw the orthogonal axis. One mode at a time.

The mirror math uses that axis and that center, not a hardcoded half-width, as soon as the mode is anything but Off. A stroke still paints the active layer once per copy, in the same undo step it uses today. Smudge samples each copy from the canvas under that copy. Shift-lock applies to the stroke you drag. The copies follow by mirroring the snapped segment. They do not each snap again.

The axis is hidden while the dropdown is Off, while the tool is not the brush, the pen, or the pencil, and while a dialog is open. It comes back when you return to the tool with a mode still chosen. The mode is remembered per tool, the way the dropdown already remembers a selection if you leave and come back. New documents start at Off.

Turning a mode on is the moment the axis appears. A person who never opens the dropdown never sees it. The status hint while a mode is on says “Drag the axis. Double-click centers it.”

### Snap to grid

Snap to grid is a check in the View menu, directly under Pixel Grid. The label is Snap to Grid. The menu mark shows when it is on. It defaults off. It is a view preference for this browser, not a property of the file.

On, the pencil, the line, and the shape tools land on grid intersections. The grid size already in that menu is the snap spacing. If the pixel grid is hidden, snap still uses that size. Showing the grid is separate from snapping to it, so you can snap without the lines, and you can show the lines without snapping.

The pencil snaps each plotted point when snap is on and size is 1. Above size 1, the stroke snaps its start on pointer-down and then runs free, except a Shift-locked end, which snaps. A freehand pencil that snapped every sample would stair-step a curve into the grid and fight Smoothing. The line snaps both ends. Rectangle, rounded rectangle, and ellipse snap the corner you drag and the opposite corner. Alt-from-center snaps the center to a grid point and snaps the dragged corner. The rounded corner radius does not snap.

The brush keeps a freehand path. Snap applies to its start point and to a Shift-locked end. The copies from symmetry snap only if the stroke you dragged snapped. They are not snapped a second time onto the grid, or the mirror would break.

A finger and a touchpad get the same snap, because it is a view setting, not a modifier key. There is no temporary snap modifier. The status bar says “Snap on” while it is on, in the same quiet way it will say “View flipped.”

### Flip view

Flip view is a checked item in the View menu. The label is Flip View. It defaults off. Choosing it again clears it. It mirrors the paper horizontally in the view only.

Pointer positions are mapped back before any tool sees them, inside the same function that already turns a screen point into a document point. A stroke lands where you see it. The file’s pixels stay put. Export, copy, and the layer thumbnails show the unflipped pixels. The rulers flip with the view so the numbers still match the marks under them.

This is separate from the layer flip command and from the document flip command. Those rewrite pixels. This does not. Undo does not record it. It is not stored in the `.pinta` file. It is remembered for this browser so a person who flips while tracing a reference they already have on a layer can leave and come back still flipped. A new visit that has never flipped starts unflipped.

The status bar says “View flipped” while it is on. Reset View, described with rotate view, clears the flip and the rotation together.

Zoom, pan, the dab cursor, and selection handles all live in the flipped view. The dab cursor stays centered on the pointer you see. A handle dragged on the right side of the paper affects the pixels on the corresponding side after the mapping. Shift-lock directions are in document space after the mapping, so a horizontal drag on screen is still a horizontal line in the file.

### Shift-click details

The remembered endpoint is the last point of the stroke in document pixels, after snap and after the view mapping, so a flipped or rotated view continues to the pixel you see. If snap is on and the tool snaps, the remembered point is the snapped point, and the next Shift-click snaps its end too when that tool snaps ends.

Shift-click does not fire when the pointer-down was on a selection handle, a symmetry axis, or a dialog. It only fires when the active tool is the pencil, the brush, or the line, and the down event hit the paper. A Shift-click that lands outside the paper is ignored. The remembered endpoint stays.

Holding Shift and clicking with the secondary button continues in the secondary color. The button does not change the gesture. Alt held as well does not turn the segment into an alt-from-center shape. Alt is ignored for this gesture on the line. On the pencil and the brush, Alt is not a from-center modifier today, so it stays unused here.

If Unserrate is on and the slider is above 0, a two-point continuation is still straight. The user should not see a bowed “straight” segment. The implementation can special-case two points, which the fitter already does.

### Symmetry details

The axis is drawn in the view, in the ink used for guides that are not pixels: a 1px line using the muted color, with a slightly heavier hit stroke that is invisible. It does not follow the pixel grid. It can sit between pixels. The mirror sample rounds the way the current mirror rounds, so a stroke and its copy stay on pixels.

Radial count changes apply to the next stroke. They do not rewrite the stroke you just finished. Changing the count while the pointer is down is ignored until pointer-up. Dragging the center while the pointer is down is also ignored. One pointer owns the stroke. The axis is edited only when you are not drawing.

Orthogonal is both axes through the same center. Dragging the vertical line moves the horizontal line’s crossing with it, because they share a center. Dragging the horizontal line does the same. There are not two independent centers in orthogonal mode. Radial replaces that center with the radial handle. Switching from Radial back to Vertical keeps the center’s x and puts the vertical axis through it. Switching to Off hides the handle and keeps the center stored, so turning Vertical back on returns the axis to where you left it.

Symmetry and a selection are independent. The brush still paints mirrored copies. It does not mirror a selection transform. Move Selected Pixels does not gain a symmetry mode.

### Snap details

Snap rounds to the nearest intersection, not always down. A point halfway between two lines goes to the nearer one, and an exact halfway rounds toward positive infinity so it is stable. The document origin is a grid point. A grid size of 16 means lines at 0, 16, 32, and so on, in document pixels, independent of zoom. Zooming in does not change which pixel is an intersection. It only makes the target easier to hit, until snap is on, at which point you do not need to hit it.

Shape tools snap the dragged point and, for a corner drag, the anchored point if it was not already on the grid. Alt-from-center snaps the center on pointer-down and the outer point on move. The width and height that result can be odd. Do not force them even.

The line tool’s curve mode, if a curve is in progress, snaps the points you click and leaves the curve through those snapped points. It does not snap the interpolated curve back onto the grid.

Snap does not affect the bucket, the wand, the eyedropper, text, or a selection drag. A selection’s move already nudges by pixel and does not need the grid. If you want a selection to snap, that is a later decision. It is not part of this checkbox.

### Flip details

Flip is horizontal only. There is no vertical flip in the view. The layer and image flip commands remain the way to rewrite pixels, including a vertical flip. Putting both axes in the view would duplicate those commands and make “what is the file” unclear. One view axis is enough.

The flip is around the center of the paper. A document with an odd width maps the center pixel to itself. A stroke down the middle stays on that column. A stroke on the left side of the screen lands on the right side of the bitmap, and the next stroke continues from the bitmap point, so Shift-click still meets.

Copy and paste copy the unflipped pixels. Paste lands at the selection or the center in document space, then the view shows it flipped. The user sees the paste where the view says it is, because the mapping is in and out.

Turning flip on during a stroke cancels the stroke and restores the snapshot. The view changes only between strokes. That avoids a stroke that starts in one mapping and ends in another.

## Fill and selection

Arrow keys already nudge a Move Selected Pixels selection by one pixel, and Shift plus an arrow nudges by ten. Each nudge is its own undo. The fields below do not replace that.

- [ ] While a selection is being scaled or rotated, width, height, and angle fields sit in the options strip.

### What you see

The fields appear in the tool options only while a selection float is active, which is when the handles are already on the canvas. If you are not transforming, the fields are absent. Selecting a rectangle does not show them until you start a scale or a rotate, or until the float exists because you have already moved the pixels. Showing them whenever any selection exists would put numbers on the screen during an ordinary march of ants. The handles are the signal that the numbers are meaningful.

Three fields: W, H, and Angle. Width and height are in pixels. Angle is in degrees. They are numeric inputs, wide enough for four digits, not sliders. They show the current float. While you drag a handle they update live, so the numbers and the handles always match. They do not steal keyboard focus while you drag. If a field is focused, arrow keys edit the number and do not nudge. Escape blurs the field and leaves the transform where it is. Enter confirms the field and blurs it.

### What editing a field does

Editing a field applies the same transform the handles apply. Width and height scale the float from the same origin the handle uses. If Shift is held while you confirm a width or a height, the other dimension follows and the scale stays uniform, matching Shift on the handle. If Shift is not held, one dimension changes and the other stays. Angle rotates around the same pivot the Alt-drag rotate uses. The value wraps to the range the rotate already uses. Snap rotate, Alt-Shift by 15 degrees, applies when you confirm an angle if Shift is held: the angle rounds to the nearest 15 degrees.

A typed value that is empty or not a number is ignored on blur and the field snaps back to the live value. Width or height below 1 is clamped to 1. There is no upper clamp beyond what the handle already allows, so a typed size can grow past the canvas the same way a dragged handle can.

Confirming a field does not add an extra undo step by itself. The transform commits when the gesture commits, which is the existing finish of the move. If you type a size and then press Enter without a drag in progress, that confirmation is the gesture: one undo step, labeled with the same label a handle drag uses.

### Gestures

A mouse clicks the field and types. A touchpad does the same. A finger taps the field, gets the platform keyboard, and types. The fields are text inputs, so shortcuts that would paint or nudge stay out of them while they are focused, and they come back when the field blurs.

The status hint on the move tool, while the float is up, says “Arrow keys nudge. Shift moves ten.” It does not explain the fields. The labels W, H, and Angle are the explanation.

### While the handles move

A scale handle updates W and H on every move. A rotate handle updates Angle. A move of the whole float does not change W, H, or Angle. If a field is focused when a handle drag starts, blur the field first and take the handle’s value, so a half-typed number does not fight the drag. The drag is what the user is doing now.

Uniform scale from the handle, the one Shift already triggers, updates both numbers together. Free scale updates one. The numbers are the size of the float’s bitmap in document pixels after the scale, not the size of the marching-ants rectangle if those ever differ. They match the pixels you will commit.

Angle is the accumulated rotation of this float, in degrees, displayed from -180 to 180. A second rotate adds to it. The field shows one decimal place if the value is not whole, and an integer if it is. Typing 15 with Shift held snaps to 15. Typing 15 without Shift sets 15 exactly, even if the last drag had snapped.

### Commit and undo

The fields and the handles share one undo step when the gesture ends. Typing 40 into W and pressing Enter, with no handle drag active, commits immediately. The history label matches a scale from a handle. Undo restores the pixels and the selection and hides the fields if the float is gone. Redo brings the float back with the numbers matching.

If the float is cancelled, the fields disappear with it and the numbers are not remembered. Starting a new transform shows the new float’s real size, which is the pixel size of the selection at that moment, and angle 0.

### What you can type

W and H accept integers. A decimal is rounded to the nearest pixel on commit. Angle accepts a decimal. A leading minus is allowed on angle. Units are not typed. The letters px and deg are not part of the field. The labels carry the unit. Pasting `40px` fails the parse and the field reverts. That is stricter than being clever, and it keeps the field a number.

The fields do not zoom with the canvas. They live in the tool options and stay 1:1 with the window. A finger can tap them. The platform keyboard may cover the canvas. That is acceptable. Enter dismisses it.

## View

- [ ] Rotate the canvas without rotating the pixels, with a two-finger twist and a reset.
- [ ] Optional square and isometric grids, view only, with snap as a checkbox.
- [ ] One drawing assistant at a time, view only: parallel lines, an ellipse, or a vanishing point. Strokes stick to it while it is on. These are overlays, not guides pulled out of a ruler.

### Rotate view

Rotate view uses the two-finger gesture already used for pinch. A small twist still zooms, so a sloppy pinch does not spin the page. A clear twist rotates the view around its center. The threshold is about 8 degrees of rotation across the gesture before it counts as a twist. Below that, the gesture stays a pinch and the angle does not change. Above that, the gesture rotates and does not also zoom, so one motion does one job.

There is no rotate handle on the canvas and no rotate slider in the tool options. The gesture is the control. A mouse with no second finger does not rotate the view. Ctrl-wheel and the zoom keys still zoom. They do not rotate. Do not bind a keyboard rotate. Reset is the way back for a mouse.

Pointer positions are unrotated before tools see them, in the same function that maps the flipped view. A stroke lands where you see it. The pixels in the file stay upright. Export stays upright. Thumbnails stay upright.

When the angle is anything but 0, the status bar shows that angle in whole degrees next to the zoom. Click or tap the angle to reset it to 0. That click does not also reset the zoom. View → Reset View clears rotation and the horizontal flip together, and leaves the zoom where it is.

A one-finger drag still draws. A two-finger drag with no twist still pans. A two-finger twist rotates. The paper’s screen size stays the zoomed width and height. The rotation is a transform around the paper’s center, so the corners swing out over the stage and the stage scrolls to follow if you are drawing near an edge. The rulers rotate with the paper. The dab cursor rotates with the view only in the sense that it stays on the pointer. It stays a circle.

The angle is a view preference for this browser. It is not in the file. Undo does not record it. A document opened later in the same browser keeps the angle, which is what you want if you turned the sketch to draw a side. Reset View is always in the View menu, even at 0 degrees, and at 0 degrees it is disabled only if the flip is also off. If either is set, Reset View is enabled.

### Grids

Grids extend the Pixel Grid item already in the View menu. Pixel Grid still toggles the overlay. The grid size control gains a type next to the size: Square or Isometric. Square is the grid it draws today. Isometric draws the same spacing on 30° axes. Both are view overlays. They are not pixels. They do not export.

Snap to grid follows whichever type is showing in the type control, even if the overlay is hidden. Square snap is to the intersections of the square grid. Isometric snap is to the intersections of the 30° grid. The tools that snap are the same ones listed under Snap to grid. The brush still only snaps its start and a Shift-locked end.

The type and the size are remembered in this browser. Default type is Square. Default size stays the size the pixel grid already uses. Changing the type does not turn the overlay on. If the overlay was off, it stays off, and only snap behavior changes if snap is on.

The isometric lines are drawn in the view, after flip and rotation, so they match what you see. The snap math runs in document space, then the view maps the pointer. A snapped point is a document point. Flip and rotation do not change which document point is the nearest intersection.

Do not add a third grid type. Do not add color or opacity controls for the lines. The lines use the existing grid ink.

### Assistant

Assistant is a View submenu: None, Parallel lines, Ellipse, Vanishing point. None is the default. Choosing one asks for a drag on the canvas to place it, then returns you to the tool you had. The tool does not change. The next drag after you release the placement drag is a normal stroke with that tool.

The assistant stays visible until you pick None or Reset View. Only one assistant exists at a time. Choosing a different assistant replaces the previous one. There is no stack of assistants.

It is a view overlay. It is never saved into the pixels, never exported, and not stored in the file. It is remembered for this browser so you can reload and still have the ellipse you were using. Reset View removes it along with rotation and flip.

Pencil, brush, pen, and line strokes pull onto it while you draw. The other tools ignore it. Pull means the pointer point used for the stroke is projected onto the assistant before the tool sees it. Smoothing and Unserrate run after that projection, so a smoothed stroke follows the assistant instead of fighting it. Shift-lock wins over the assistant. A Shift-locked stroke is straight and is not pulled.

Parallel lines are a direction and a spacing. The placement drag sets the direction and the distance between two lines. Further lines repeat at that spacing across the document. A stroke pulls to the nearest line. Dragging a handle on one line rotates the set or changes the spacing. The handles are the same small squares selection handles use, drawn in the view, not in the pixels.

An ellipse is placed by a drag that sets its bounding box, the same drag a shape tool uses, including Shift for a circle. Strokes pull to the nearest point on the ellipse. Handles scale it and, with Alt, rotate it. The rotate is the assistant, not the view.

A vanishing point is placed by a click, then a second drag sets one guide line through it. Two more guide lines sit at even angles and can be dragged by their handles to change the fan. Strokes pull to the nearest guide line. The point itself is a handle. Dragging it moves the fan.

A finger places an assistant with the same drag. Long-press does not place one. The menu is the only way to start. While an assistant is on, the status bar names it: “Parallel lines”, “Ellipse”, or “Vanishing point”. The hint on the paint tools adds nothing further. The submenu item shows a mark on the active one.

Turning the assistant off mid-stroke abandons the pull for the rest of that stroke and keeps the ink already laid as a normal stroke. It does not undo.

### Rotate view details

The angle is stored in degrees, not radians, and it is continuous during the gesture. The status bar rounds to the nearest degree. Resetting from the status bar sets the stored angle to 0, not to a leftover fraction. A twist that ends at 0.4 degrees snaps to 0 when you lift the fingers, so a tiny accident does not leave the status bar showing 0 while the pixels are a hair off. The snap-to-zero threshold on release is 1 degree. During the gesture the view follows the fingers exactly, so you can see it move before the snap.

Two fingers of a touchpad send the same gesture as two fingers on a screen. A mouse wheel does not rotate. Holding Ctrl and twisting is still a twist. Ctrl does not have to be held. The gesture is identified by two contacts and the change in angle between them, which is the pinch code path already on the window.

Rotation and flip compose. The view applies flip first in document space, then rotation, so Reset View clearing both returns to the file’s orientation regardless of the order you set them. Snap and the assistant run in document space before either view transform, then the picture is flipped and rotated for display. A snapped point stays the snapped document point. You see it wherever the view puts it.

The dab cursor’s diameter stays `size × zoom` in screen pixels. Rotation does not turn it into an ellipse. Selection handles are drawn in the view, so they sit on the corners you see, and dragging them maps back through the same function.

### Grid details

Square grid lines are vertical and horizontal at multiples of the grid size. Isometric lines are three families at 0°, 60°, and 120°, spaced so the distance between parallel lines is the grid size. The 0° family is horizontal, which keeps the isometric grid related to the square one instead of spinning it by 30° into a second convention. Intersections are where a line from two families meet. Snap picks the nearest intersection in document pixels.

The overlay lines are 1px in screen space, not 1 document pixel, so they stay visible when zoomed out and do not thicken when zoomed in. They use the existing grid color. They are drawn under the selection ants and under the symmetry axis, and over the paper. They are not drawn on the thumbnails.

Changing grid size while snap is on affects the next pointer sample. A stroke in progress keeps the size it started with, so the line does not jump to a new lattice mid-drag. The next stroke uses the new size.

### Assistant details

Parallel lines project the pointer onto the nearest line along the perpendicular. The stroke sees the projected point. A fast stroke still goes through Smoothing after projection, so the curve follows the lines if you hop across them, and stays on one line if you draw along it. Hopping is allowed. The assistant does not lock you to the line you started on. If you wanted a lock, you would use Shift-lock, which wins and ignores the assistant.

The ellipse projection uses the nearest point on the ellipse, not the nearest point on the bounding box. A drag inside the ellipse pulls to the boundary. A drag outside pulls to the boundary. The center does not attract. Vanishing-point guides are infinite lines through the point. The nearest guide wins. The point itself is not a snap target unless a guide degenerates, which it should not.

Handles on an assistant are hit-tested in the view, at 10 screen pixels, so a finger can grab them. They sit above the paper and below menus. Dragging a handle does not draw. If a stroke was waiting for pointer-up, it commits first.

The assistant is one object with a type and a few numbers: for parallel lines, an angle and a spacing and an origin; for an ellipse, a center, two radii, and a rotation; for a vanishing point, a center and three angles. That is all that is stored in the browser. No bitmap.

Choosing None deletes that object. Reset View deletes it too. Closing the browser and opening it restores it only as part of the same local preferences as flip and snap. It is not in the document, so a file you send does not include your ellipse.

## Layers and color

Alt-click on a layer eye already solos that layer and remembers the other layers’ visibility. Alt-click again restores them. A normal click still toggles that one eye. The remaining eye gesture is the long-press for a finger.

- [ ] Long-press a layer eye for Hide others and Show all.
- [ ] A layer mask as a command in the layer menu, painted with the existing tools.
- [ ] A small mixer pad in the color dock: smear the primary and secondary, then click to pick.

### Hide others

Hide others is a long-press on a layer’s eye. The press is about half a second. Moving more than a few pixels before that cancels it, so a scroll does not open the menu. On release after the wait, a two-item menu opens at the eye: Hide others, and Show all.

Hide others hides every layer except that one and remembers the previous visibility, the same memory Alt-click solo uses. Choosing it again is not a second item. Show all sets every layer visible and clears the memory. A normal click still toggles that one eye and does not open the menu. A mouse uses Alt-click, not the long-press. The long-press exists because a finger has no Alt. A touchpad with a keyboard still has Alt-click.

The menu is the same context menu the layer row already uses, with only those two items, so it stays on screen and does not need its own scrolling region. Choosing either item is one undo step, labeled Solo Layer or Show All Layers. Dismissing the menu without choosing does nothing.

### Layer mask

Add mask is in the Layers menu and in the layer’s own menu. The label is Add Mask. It is enabled when a layer is active and that layer has no mask. A group row does not get a mask.

The mask appears as a second thumbnail on that row, to the right of the layer thumbnail, with a one-pixel gap. A new mask is white, which means fully shown. The thumbnails are the size the layer row already uses.

Click the mask thumbnail and the tools you already have paint the mask. Black hides, white shows, gray is partial. The paint tools, the bucket, the gradient, and the selection fills all write into the mask instead of the layer pixels while the mask is the target. Click the layer thumbnail and you are painting pixels again. The active thumbnail has the same selected outline the active layer row already uses, so you can see which one receives the stroke.

The status bar says “Painting the mask” while the mask is the target. That sentence replaces the tool hint for as long as the mask is targeted, because a gray stroke on a mask is otherwise unexplained. When you click back to the layer thumbnail, the ordinary tool hint returns.

The mask is stored with the layer. It survives undo as part of the layer snapshot, so painting the mask is an undo step with the tool’s usual label. Delete layer deletes the mask with the layer. Duplicate layer duplicates the mask. Merge down applies the mask into the layer pixels and does not carry the mask onto the lower layer.

Remove mask is in the same menus, enabled only when the active layer has a mask. Removing it is one undo step, labeled Remove Mask. The layer pixels stay as they are. The hidden parts become visible because the mask is gone, which is the point of the confirmation-free command. Do not show a dialog.

Export and flatten respect the mask: hidden pixels are hidden in the result. The mask thumbnail itself is not an exported image. Sample all layers sees the layer after the mask, because that is what you see. A bucket on the layer, with the layer thumbnail targeted, still paints layer pixels. The mask then hides them if they fall in a black region. A bucket while the mask is targeted fills the mask, not the pixels.

Alpha lock and the mask are different. Alpha lock protects empty pixels of the layer. The mask hides pixels that exist. Both can be on. The status bar can show “Painting the mask” without mentioning alpha lock. If both matter, alpha lock still wins on empty pixels when you are painting the layer, and it does not apply while you are painting the mask, because the mask has no transparency lock. A mask pixel is always opaque gray.

A finger taps a thumbnail to target it. There is no drag between thumbnails. Reordering layers stays the drag it already is, and the drag handle remains the row, not the thumbnails, so a tap on a thumbnail does not start a reorder.

### Mixer

Mix is a disclosure under the palette, closed by default, labeled Mix. It sits below the palette, not between the recent colors and the palette. The divider between recent colors and the palette stays as it is. Closed, the disclosure is one row, a button with the word Mix and a mark that it is closed. Open, a small pad appears under that row.

The pad is square, about the width of the palette. Its background starts as the primary color. Drag with the primary button to smear the primary color onto the pad. Drag with the secondary button, or a second finger, to smear the secondary. The smear is a soft stamp at a fixed small radius, not the current brush size, so the pad does not depend on which tool is selected. Strokes on the pad are not document strokes. They do not create undo steps. They do not change the canvas.

A click on the pad with the primary button picks that color into the primary slot. A click with the secondary button picks into the secondary. The pick uses the pixel under the pointer, including the alpha already on the pad. A picked color is remembered in the recent colors the same way any other color change is.

A Clear control sits at the corner of the pad. It resets the pad to the primary color. Clear is not undoable. Closing Mix leaves the pad’s colors for the next time you open it. They are kept in this browser, not in the file. Quitting and reopening restores the pad if the session restore already brings the document back. A failure to restore the pad just starts from the primary again. The canvas is unaffected.

A finger smears with one finger as the primary. A second finger smears the secondary. A tap with no movement picks. Movement above a few pixels is a smear, not a pick, so a shaky tap does not draw a dot and also pick. The status hint while Mix is open says “Smear, then click to pick.”

### Long-press details

The timer starts on pointer-down on the eye and only on the eye. Pointer-down on the row’s name, the thumbnail, or the visibility of a different row does not start it. If the pointer moves more than 6 pixels, or lifts before half a second, the timer is cleared. A cancelled long-press does not toggle the eye. The click that would have toggled is swallowed when a long-press was attempted and cancelled by movement, so a scroll does not also hide the layer. A clean short tap still toggles.

The menu closes on a click outside it, on Escape, and after a choice. A second long-press on another eye closes the first menu and opens the new one. Alt-click while the menu is open closes the menu and performs the solo, so the mouse gesture still wins.

Hide others on a layer that is already the only visible layer remembers the current visibilities, which are already solo, and Show all is how you get the rest back. If the memory is empty because nothing was hidden, Show all still sets every layer visible. Neither item is disabled. A disabled item is a puzzle. Both always do something understandable.

### Mask details

The mask bitmap matches the layer’s width and height. Resizing the canvas resizes the mask with the same rule the layer uses. A mask pixel is stored as a single alpha-like channel in the document, painted through the normal tools by writing gray. Color you paint is converted to luminance for the mask, so a red stroke and a white stroke do not mean two different things. The status bar sentence is what tells you the red became gray. Undo restores both the gray and the tool’s usual pixels if you undo back to painting the layer.

Targeting the mask does not change the active tool. The brush stays the brush. The options stay the brush options. Only the destination changes. The thumbnail outline is the destination marker. Keyboard focus stays on the canvas, not the thumbnail, so shortcuts keep working after you click it. The click targets the mask and does not focus a control that would swallow keys.

A layer with a mask still shows its blend, opacity, and visibility as it does now. The mask is applied before blend and opacity. You see the masked result in the composite. The layer thumbnail shows the pixels without the mask, and the mask thumbnail shows the gray, so you can tell them apart. If both thumbnails showed the result, you could not see a black mask.

Remove mask on a layer that has no mask is hidden, not disabled. Add mask on a layer that has one is hidden. The menu shows the command that is possible. Groups do not show either command.

Fill Selection while the mask is targeted fills the mask with the luminance of the fill color inside the selection, on the mask, and does not change layer pixels. Smooth edges, if the selection carries coverage, writes gray in that proportion. The layer thumbnail stays still. The mask thumbnail updates.

### Mixer details

The pad is a small bitmap, 128 by 128, displayed at the palette’s width. Smears are stamped into that bitmap. It does not get larger if the window does. Clear fills it with the current primary, including the primary’s alpha. A transparent primary clears to transparent over the checker, so you can see the pad’s alpha. Picking a transparent pixel sets the slot’s alpha, the same way the color picker does.

Smearing uses a fixed radius of 8 pad pixels and full opacity of the slot you are smearing, so the pad builds up. It does not use flow, smoothing, or the brush tip. Those would make the pad feel like a second canvas and would surprise you when the brush is a splatter. The pad is a mixer, not a sketch.

Recent colors update when you pick, not when you smear. A smear that you do not pick does not flood the recent row. The primary and secondary swatches update on pick, and the hidden color inputs stay in sync the way any other color change syncs them.

Closing the disclosure hides the pad and keeps the bitmap. Opening it shows the same smears. Reset is not a separate command from Clear. There is no reset of the pad in the file menu. The pad is not part of the document, so Save does not mention it.

If the color dock is collapsed or hidden from the Window menu, Mix is hidden with it. Opening the dock again restores the disclosure to whatever open or closed state it had. That state is a browser preference, default closed.

### States worth spelling out

Unserrate off on the brush is the old straight path, moving average included, and the slider thumb stays where it was.

Unserrate on, with the slider at its high default, is the curve the brush draws today.

Unserrate off on the pencil, size 1, is the pixel-perfect corner, even if the slider is above 0.

Unserrate on and the slider above 0, at pencil size 1, fits the path and then places whole pixels.

Both controls are ignored while Shift locks the pencil, the brush, or the line.

The pen has no Shift lock, so Unserrate and the slider always apply.

Global recolor ignores the slider because it has no path.

A dot shorter than one pixel is one dab, not a curve.

The slider value and the Unserrate checkbox are each stored per tool, in this browser, and not in the file. Unchecking Unserrate does not write 0 onto the slider.

Smooth edges on is the default for the bucket and the wand together.

Smooth edges off is today’s flood and today’s wand.

Tolerance widens the interior and does not widen the one-to-two pixel ring.

A solid ink pixel with almost no coverage of the clicked color is left alone.

Sample all layers reads the composite and writes the active layer.

A wand selection remembers coverage until the selection moves.

Moving, scaling, or nudging the selection drops the coverage and later fills flat.

Shift-click with a remembered end draws one straight segment and becomes the new end.

Shift-click with no remembered end is an ordinary click.

Shift-drag is still the 45° lock, and it replaces the remembered end when you let go.

The pen does not take Shift-click.

Symmetry Off draws no axis.

Vertical, Horizontal, and Orthogonal share one center.

Double-click or double-tap on the axis returns that center to the document middle.

Radial uses a count from 2 to 12, default 6, and its own center handle.

The axis is a view overlay and is absent from export, flatten, and thumbnails.

Snap off leaves every tool where you put it.

Snap on pulls the pencil at size 1, the line, and the shapes onto intersections.

Snap on pulls the brush only at the start and at a Shift-locked end.

The grid overlay and the snap checkbox are separate. Either can be on alone.

Flip view mirrors the paper around its center and maps pointers back before tools run.

Flip view does not rewrite pixels. The layer flip command does.

Reset View clears flip and rotation together and leaves zoom alone.

A selection float shows W, H, and Angle. No float, no fields.

A focused field takes the arrow keys. A blurred field leaves them to nudge.

Enter on a field commits the same transform a handle would.

Shift while confirming W or H keeps the scale uniform.

Rotate view starts on a two-finger twist past about 8 degrees.

A smaller twist stays a pinch.

The angle in the status bar is a control. Click or tap sets it to 0.

Square grid is the grid that already exists.

Isometric grid uses 0°, 60°, and 120° at the same spacing.

Assistant None is the start.

One assistant at a time: parallel lines, an ellipse, or a vanishing point.

Shift-lock beats the assistant. The assistant beats a freehand path.

A short tap on an eye toggles that layer.

A long-press on an eye offers Hide others and Show all.

Alt-click still solos and restores, and it does not open the long-press menu.

A new mask is white. Black hides. Gray is partial. The tools you already have paint it.

The status bar says “Painting the mask” only while the mask thumbnail is the target.

Remove Mask leaves the layer pixels and drops the hide.

Mix starts closed, under the palette, below the recent-color divider.

A smear is not an undo step. A pick sets the slot you clicked with and updates recent colors.

Clear fills the pad with the primary. Closing Mix keeps the smears.

### Checks for the working list

These are the behaviors a pass has to show. They are part of the items above, not a separate feature.

Smoothing. With Unserrate on, set the paintbrush slider to 0 and flick three points of a V. The ink stays on the straight segments. Set the slider high and flick the same V. Some ink leaves those segments along a curve. Uncheck Unserrate and flick again. The ink is straight, and the slider still shows the high number. Check it again and the curve returns at that number. Set the pencil’s checkbox off, size 1, and draw a right angle. The corner is the pixel-perfect corner even if the slider is high. Check Unserrate, raise the slider, and the fast stroke curves. Hold Shift on the brush and the stroke is horizontal, vertical, or 45°, with both controls ignored. Dither with Unserrate off matches dither today. Dither with Unserrate on and the slider above 0 follows the flicked curve.

Smooth edges. Fill a soft black circle on white with red, checkbox on. The interior is red, `16,16,16` is unchanged, `60,60,60` is near `108,44,44`, and `207,207,207` is near `244,44,44`. Checkbox off leaves the gray halo. The wand with the checkbox on selects the fringe. Fill Selection paints that fringe with the same blend. Sample all layers reads the composite and writes the active layer. Alpha lock still protects empty pixels. One undo removes the fill.

Shift-click. Draw a stroke, Shift-click elsewhere, and a straight segment joins the end of the first stroke to the click. Shift-drag still locks to 45°. A click without a previous stroke is a normal click. Undo removes the segment. The pen does not continue.

Symmetry. Off shows no axis. Vertical shows one line through the center. Dragging it moves the mirror. Double-click returns it to the center. Orthogonal mirrors both ways around the shared center. Radial at 6 places six copies around the handle. The axis is absent from export.

Snap. Off, a pencil point lands where you clicked. On, the pencil at size 1 and the line and the shapes land on grid intersections of the current grid size. The brush snaps its start and a Shift-locked end and otherwise draws free. Hiding the grid does not turn snap off.

Flip view. The menu item mirrors the paper. A stroke on the left of the screen writes the right side of the bitmap. Export is unflipped. The layer flip command still rewrites pixels and is a different command. The status bar says “View flipped.” Reset View clears it.

Selection fields. They are absent until a float exists. Dragging a scale handle changes W and H. Typing a width and pressing Enter scales the float. Shift while confirming keeps the scale uniform. Angle follows the rotate handle. Arrow keys still nudge when no field is focused, and they edit the number when a field is focused.

Rotate view. A two-finger twist turns the paper and leaves the file upright. A small twist zooms instead. The status bar shows the angle. Clicking the angle sets it to 0. Pinch still zooms. One finger still draws.

Grids. Square is the grid that already exists. Isometric draws the 0°, 60°, and 120° families at the same spacing. Snap follows the type that is selected. The lines are not in the export.

Assistant. None is the default. Parallel lines, an ellipse, or a vanishing point, one at a time, pull the pencil, brush, pen, and line. Shift-lock ignores the assistant. The overlay is not in the export. None removes it.

Hide others. A short tap toggles one eye. A long-press on a finger offers Hide others and Show all. Alt-click still solos and restores. A scroll does not open the menu and does not toggle the eye.

Mask. Add Mask adds a white thumbnail. Painting while that thumbnail is targeted writes gray. Black hides, white shows. The status bar says “Painting the mask.” Clicking the layer thumbnail returns to pixels. Remove Mask drops the mask and leaves the pixels. Export hides what the mask hides.

Mixer. The disclosure starts closed. Open, a smear with the primary button lays the primary, and a click picks into the primary slot. The secondary button picks into the secondary. Clear resets the pad. Closing and opening keeps the smears. The canvas does not gain an undo step from a smear.

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

Today the menu is six fixed tips (`plain`, `circle`, `squares`, `splatter`, `slash`, `grid`) plus smudge, and smoothing is the Unserrate curve on the brush, the eraser, and the pen. Those tips become the default presets. Smudge becomes a preset whose wet mix is all the way up, not a special tool path. The Smoothing slider in the working list is the streamline amount this engine will own. Building the engine replaces that slider’s simple blend with the path described here. Do not build the engine in order to finish the slider.

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
