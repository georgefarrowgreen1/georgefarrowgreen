# InFlite interface

All InFlite apps use the palette and geometry in `tokens.css`. The generated shared menu includes these tokens; hosted modules inherit them from Today. Change this source and regenerate with `.tools/iflmenu.mjs`, rather than editing the generated copies.

## Surfaces and type

Use `--ifl-page` for the canvas. InFlite's Liquid Glass materials derive from each selected palette: `--ifl-glass` for floating chrome, `--ifl-glass-strong` for readable content, and `--ifl-glass-control` for inset controls. Use `--ifl-glass-line`, `--ifl-glass-highlight` and `--ifl-glass-shadow` for a restrained rim and depth. `--ifl-raised` provides separation in dark mode. Keep imagery and data legible through the material; text surfaces must retain sufficient opacity and contrast.

Apply `--ifl-glass-blur` only to floating bars, menus and dialog chrome. Repeated scrolling cards, chart/map canvases and document/message bodies use a static material with blur disabled. Never animate backdrop filters or add an endless sheen. Reduced transparency, increased contrast, unsupported filters and forced colours use the shared opaque fallbacks.

Use `--ifl-text` for primary content and `--ifl-muted` for supporting text. Text and numbers retain system typography and tabular figures where comparisons matter. Allow flex/grid children to shrink and wrap long names without moving actions off screen.

Windows use `--ifl-glass-window` and `--ifl-glass-window-blur`; floating toolbars use `--ifl-glass`. At the default intensity 70 these transmit 16.8% and 21% of the backdrop. Use `--ifl-glass-inset` for nested groups rather than stacking near-opaque surfaces. One outer frame owns backdrop sampling; repeated content and text-entry wells do not add their own filters. The stronger content material remains available for data and documents.

Clear windows must scope primary/secondary legacy aliases to `--ifl-glass-text` / `--ifl-glass-muted`. `--ifl-glass-accent` provides readable unfilled link ink; never replace semantic chart colors or the on-accent foreground. Destructive text actions keep opaque wells without a white specular wash. Preserve opaque accessibility fallbacks without requiring an unsupported media feature to report a positive `no-preference` value. Under reduced motion, floating panes explicitly disable CSS transitions so the global short-duration fallback cannot animate their geometry.

## Actions and meaning

Primary and selected controls use `--ifl-accent-gradient` with `--ifl-on-accent`, a dark foreground. Links, focus rings and unfilled actions use `--ifl-accent-ink`, which has separate light and dark values. Never put white text over the bright action gradient. Secondary controls use neutral surfaces and dark/light text. Charcoal contrast cards can carry voice messages or outgoing chat bubbles.

Actual InFlite/app icons remain unchanged. Weather warnings, map layers, training zones, sport identities, financial gains/losses and system status keep meaningful colours. Exported maps and story artwork retain their data presentation.

## Geometry and motion

Cards are 26px, groups 22px, sheets 30px and rows/fields 16px. Buttons, tabs and segmented controls use pills where their layout permits. Subtract insets from the outer radius for concentric surfaces. Keep touch targets at least 44px, safe areas, visible keyboard access and modal focus restoration.

Round every visible control and every window corner, including keyboard, focus and pressed states. Use one focus indicator on the rounded outer field; bare inner inputs must not draw a second square outline. Keep field text 16px from its surface edge and sheet content 20px from phone edges (24px from 600px), with 12px below the sheet header. Center icon and emoji glyphs explicitly in their hit targets; reactions use 48px circles. Measure glyph bounds as well as the button box.

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

## Account Appearance

Six curated palettes (InFlite, Coast, Iris, Ember, Rose, Graphite) are independent of the account's System/Light/Dark mode. The source is `appearance.js`; run `node .tools/appearance.mjs ../inflite/today/public/theme.js ../inflite/email/public/theme.js` after changes. This bundles the same runtime into early scripts and Status. Run `iflmenu.mjs` for shared colour-transition tokens, then `minify.mjs` and `wxshell.mjs` for production assets.

The runtime applies validated cached preferences before first paint. Shared `--ifl-*` colours update in place without moving or remounting views. App icons, warning/error colours and market gain/loss colours retain their meanings. Theme choices use a short native View Transition cross-fade, with the dock held stationary. Ordinary inherited colour tokens avoid WebKit interpolation issues; reduced motion and browsers without View Transitions apply colours directly. Only palette, mode, Liquid Glass enable/intensity preferences and the account identifier are cached; drafts and app data are never part of the preference.

The account API validates palette IDs and modes before updating `pg_users.appearance` / `theme_palette`. GET appearance is a small private/no-store response; signed-out requests return no preferences. Same-origin authenticated PUT prefs is unchanged as the write boundary. Appearance serializes rapid UI saves, rolls back failed final choices, and ignores old hydration responses after newer local changes. Storage events update same-account tabs without writing the received preference back (`accept(..., {persist:false})`); this prevents a slower window from echoing an older slider value over a newer local commit. visibility/focus refreshes the canonical account choice. App-specific appearance readers cannot replace the shared mode. Standalone app session responses also carry their account palette.


## Liquid Glass interaction and intensity

Appearance offers an enabled switch and a native keyboard-accessible 0–100 intensity range. The default is 70. Account preferences use `glass` (boolean) and `glassStrength` (integer), persisted through nullable `pg_users.glass_enabled` / `glass_strength` columns. Older clients preserve omitted settings. Invalid types, bounds and unknown preference keys are rejected before writes; the authenticated same-origin boundary remains mandatory.

The shared before-paint runtime applies opacity, edge light, depth, blur and saturation through bounded variables. At 100 the material retains the contrast floor of the original glass pass. At zero it is opaque without depth; switching off also disables material feedback while remembering the chosen level. Changing the range previews locally; committing a choice updates the cache and coalesces account saves. Canceled previews, replaced owners, late hydration and failed saves cannot replace a newer committed choice.

Fine mouse pointers illuminate one curated neutral surface at a time, with at most one scheduled animation frame and no idle loop. Light is computed in local surface coordinates. Primary, destructive, selected, chart, map, media and image surfaces retain their own presentation. Only individual controls lift by at most 1px or press by at most 2.5%; fields, bars and containing cards never move. Touch uses native passive pointer handling and CSS active feedback without capturing gestures or changing hit areas. Scrolling, leaving the document, hidden pages, owner changes and accessibility preference changes clear pointer state. Reduced motion suppresses moving light and lift/press additions; reduced transparency, higher contrast and forced colors retain opaque accessible controls.
