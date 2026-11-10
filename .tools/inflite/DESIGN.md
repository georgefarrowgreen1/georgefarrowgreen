# InFlite interface

All InFlite apps use the palette and geometry in `tokens.css`. The generated shared menu includes these tokens; hosted modules inherit them from Today. Change this source and regenerate with `.tools/iflmenu.mjs`, rather than editing the generated copies.

## Surfaces and type

Use `--ifl-page` for the canvas, `--ifl-surface` for cards and sheets, and `--ifl-surface-2` for nested rows, fields and segmented tracks. `--ifl-raised` provides separation in dark mode. Keep surfaces opaque: layered glass, coloured skies and glowing edges are no longer part of the app chrome. Use the shared low shadows and fine borders sparingly.

Use `--ifl-text` for primary content and `--ifl-muted` for supporting text. Text and numbers retain system typography and tabular figures where comparisons matter. Allow flex/grid children to shrink and wrap long names without moving actions off screen.

## Actions and meaning

Primary and selected controls use `--ifl-accent-gradient` with `--ifl-on-accent`, a dark foreground. Links, focus rings and unfilled actions use `--ifl-accent-ink`, which has separate light and dark values. Never put white text over the bright action gradient. Secondary controls use neutral surfaces and dark/light text. Charcoal contrast cards can carry voice messages or outgoing chat bubbles.

Actual InFlite/app icons remain unchanged. Weather warnings, map layers, training zones, sport identities, financial gains/losses and system status keep meaningful colours. Exported maps and story artwork retain their data presentation.

## Geometry and motion

Cards are 26px, groups 22px, sheets 30px and rows/fields 16px. Buttons, tabs and segmented controls use pills where their layout permits. Subtract insets from the outer radius for concentric surfaces. Keep touch targets at least 44px, safe areas, visible keyboard access and modal focus restoration.

Use short press feedback and the shared release/glide curves. Animate transform and opacity; avoid running background effects or adding blur to every surface. Respect reduced motion, reduced transparency and forced colours. Preserve existing navigation, lifecycle cancellation and draft ownership.

Motion uses one scale: 90ms presses, 160ms small fades, 280ms layout/tab changes, 360ms content entry,
420ms spring releases and 460ms page/sheet arrivals. Exits settle in220ms. Stagger by24ms and stop at120ms;
delayed text remains readable. Keep whole cards stationary when only their data refreshes. Avoid transforming
the ancestors of fixed composers or maps. The shared early `motion.js` guard pauses decorative CSS animations
while hidden, including after page restoration; it never pauses data refresh or authentication.

Interruptions belong to the component: cancel old effects before replacements, finish route mutation before
opening a modal, and release transient size animations on keyboard/viewport changes or close. Intrinsic sheet
resizing is the small exception to transform/opacity: it is bounded, unfilled and never locks a pixel height.

Keep focused inputs, recipient chips and selected filters mounted during data refreshes. Quiet refreshes update
values without replaying entrances. When motion is reduced, charts must retain their final data shapes.
Put validation beside the relevant field and associate its message with that input. Long editors and detail
pages keep their close/navigation actions within reach. Closing overlays immediately release interaction and
accessibility ownership; delayed animation callbacks may never reopen them or steal newer focus.

## Verification

Check native and Today-hosted screens at narrow-phone and desktop sizes, in light/dark and explicit appearance settings. Review populated, empty, loading, error and editor/sheet states. Check overflow, contrast, focus, keyboard clearance and route/sheet transitions. Run app regressions and shared contract/budget checks before generating minified assets and deploying both repositories.
