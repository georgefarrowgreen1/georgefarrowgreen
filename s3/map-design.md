# Map: the design system and the demo, for One Roof stage 1

Reader's map, no edits made. Paths:
- MAIN = `/home/user/up4/tf/georgefarrowgreen`
- IFL = `/home/user/up4/tf/inflite`
- DEMO = `/tmp/claude-0/-home-user/08ceabf0-4558-56d4-9e3e-4d128d8ff562/scratchpad/superapp/roof-src.html`

Line numbers are for the files as they are on `claude/one-roof` today. Contrast figures come from a WCAG luminance script
(`/tmp/claude-0/-home-user/08ceabf0-4558-56d4-9e3e-4d128d8ff562/scratchpad/roof/contrast.mjs`, run with node).

---

## 0. In short

1. **Four style systems exist today, and none can be the framework's as it stands.**
   - MAIN `.tools/inflite/menu.css`: light first, `--ifm-*` / `--ifh-*` / `--ift-*` tokens, used by the menu, header,
     tab bar and sheets in every app.
   - IFL `today/public/app.css`: dark first, unprefixed `--text`, `--glass`, `--tint`... over an aurora sky.
   - MAIN `weather/styles.css`: always dark, white on a sky that changes with the weather, and the same unprefixed names
     with **different meanings** (`--tint` is the glass's darkening, not the accent).
   - DEMO: light first, `--ink`, `--acc`, `--glass`...

   Today's `app.css` token set is the right base: it is already light and dark, glass, and on the page that becomes the
   framework. Add the demo's accent model to it, plus the component anatomy that menu.css already has (header, tab bar,
   Settings sheet top).
2. **The accent can't be one colour per app.** Four of the demo's light accents fail 4.5:1 as text on its own screen
   colour: Weather 3.74, Fitness 3.38, Markets 4.03, Mail 3.63. In dark mode, every white-on-accent fill fails
   (1.9 to 2.7): `.btn.go`, `.week .now`, `.badge`, `.pin`. Each app needs three values: `--acc` (graphics and
   indicators, 3:1), `--acc-ink` (text on surfaces, 4.5:1) and `--acc-fill` + `--on-acc` (filled buttons). Values are in §3.2.
3. **Weather under the roof.** It loses the sky, the always-dark white-on-sky text, the per-sky glass tints, the rim
   lighting and its own top bar. It keeps its accent, its coloured weather icons, its data colours (redone for light
   surfaces) and its motion curves, which are already the site's. Its stylesheet hardcodes white 300 times
   (185 `rgba(255, 255, 255, …)` plus 115 `#fff`/`#ffffff`), and every one has to become a token.
4. **Several things in the demo would fail with real content.** Fixed header offsets (`--top: 112px/160px`). Titles
   and segments that clip without ellipsis. Section swipes that fight Weather's place pager, horizontal scrollers and
   Safari's own edge swipe. Inline `style=""` everywhere, which is blocked by `style-src 'self'` on every app.
   Google-hosted Inter, blocked by `font-src 'self'`. A backdrop blur on every card, which Weather already found costs
   most of a phone's frames. Below-44px tap targets. Sheets with no focus trap, Escape or inert. A whole-screen
   `innerHTML` rebuild on every tap, which loses focus. Details in §10.

---

## 1. What was read

| File | Lines | What's there |
|---|---|---|
| MAIN `.tools/inflite/menu.css` | 1-253 | Menu tokens `--ifm-*` (l.5-33). Per-app tint `.ifm-in-<app>` (l.34-40). Menu popover `.ifm-pop` (l.49-110). Allow sheet `.ifa-*` (l.112-126). Update note `.ifm-note` (l.128-139). **Header `.ifh`** (l.141-190). Tab bar sizes `--ift-*` (l.192-195). **Settings sheet top `.ifs-btn` / `.ifs-hero`** (l.197-207). **Hub tab bar `.ifl-tabs`** (l.209-231). Back `.ifl-back` (l.232-238). Chat engine dialog (l.239-247). Toast `.ifl-toast` (l.251-252). |
| MAIN `.tools/inflite/menu.js` | 1-761 | `GLYPHS` (l.13-51, 24×24 stroke icons), `svg()` (l.52), `el()` (l.55), `note()` (l.68), `allow()` (l.85), `built()` (l.118), `updates()` (l.143), `close()` (l.254), `menu()` (l.270), `headerHtml()` (l.365), `header()` (l.372), `settle()` / `watch()` (l.384-392, the `--p` scroll collapse), `hub` (l.483: `go` l.487, `href` l.502, `tabs` l.509, `send` l.533, `signIn` l.548, `moved` l.553), `movedCard()` (l.700), `toast()` (l.736), `api` (l.753) |
| MAIN `.tools/inflite/icons/*.svg` | 7 files | App icons: 1024×1024, full-bleed square sky + frosted glyph + warm sun (chat has `rx=224` built in). Inlined into menu.js as `ICONS` by `.tools/iflmenu.mjs` l.25, served as `blob:` URLs (`iconUrl`, menu.js l.53-54) |
| MAIN `weather/styles.css` | 1-2338 | Tokens (l.8-48). Sky panes (l.52-84). Glass (l.110-172). Sky (l.173-299). Top bar (l.300-373). Layout and pager (l.374-467). Now (l.468-665). Cards and `.seg` (l.666-700). Hours and charts (l.700-762). Insights (l.914+). Tiles (l.1034+). Sheets (l.1171-1450). Radar (l.1451-1798). Settings (l.1834+). Reduced transparency and more contrast (l.1944-1975). Copied IFL block (l.2025-2279). `.wx-ifh` header on Weather's bar plus hub Back (l.2280-2338) |
| IFL `today/public/app.css` | 1-931 | Tokens, dark first, with both light blocks (l.8-75). Page and sky (l.77-112). `.glass`, `.section`, `.slabel` (l.113-120). `.group` / `.row` / `.ic` (l.126-145). `.pill` (l.147-157). `.tcard` (l.159-187). Weather card skies (l.189-245). Chat, Fitness and Markets card parts (l.246-400). Morning (l.402-420). `.bsheet` (l.422-446). `.toast` (l.448-453). Apps tiles (l.485-502). You (l.504-526). Narrow screens (l.535-550). Reduced motion and transparency (l.551-554). Copied IFL block (l.556+) |
| IFL `today/public/day.css` | 1-71 | Top card `.day-top` with `--dt-ac` per kind (l.14-36), `.dt-stats` (l.24-30), Waiting rows and chips (l.38-47), Coming Up rows with time column and send (l.49-59) |
| IFL `today/public/index.html` | 1-80 | Shell: `.sky`, signed-out `.ifl-in`, `#hd`, `#views` (three `<main class="view">`), `nav.ifl-tabs#tabs` |
| IFL `today/public/_headers` | l.34 | CSP `style-src 'self'; font-src 'self'; img-src 'self' data: blob:` |
| DEMO | 1-678 | Tokens (l.8-30). Phone stage (l.39-55, demo only). **One-roof chrome** (l.56-79). **Shared pieces** (l.81-139). Zoom, scrim, sheet, toast (l.141-158). "Now" comparison (l.160-191, demo only). Refinements: sliding indicators, settling header, live tiles, connector (l.216-248). Reduced motion (l.263). JS: views (l.364-456), `roof()` (l.461-487), `slideTo()` (l.489-497), `swipes()` (l.499-511), `go` / `back` / `zoomOpen` / `open` (l.520-547), `sheet` / `shut` / `toast` (l.591-593), `searchSheet` (l.601-612), `sendSheet` (l.613-616), `connSheet` (l.618-624), `addSheet` (l.626-629) |

---

## 2. The four systems side by side

| Role | menu.css (shared) | Today app.css | Weather styles.css | DEMO |
|---|---|---|---|---|
| Base mode | light first, dark by `prefers-color-scheme` + `[data-theme]` (l.22-33) | **dark first**, light by `prefers-color-scheme: light` + `[data-theme="light"]` (l.9-75) | **always dark** (`color-scheme: dark`, l.47) | light first, dark by both (l.19-30) |
| Text 1/2/3 | `--ifm-text`, `-2`, `-3` | `--text`, `--text-2`, `--text-3` | `--text` (#fff), `--text-2`, `--text-3` (white α) | `--ink`, `--ink-2`, `--ink-3` |
| Surface | `--ifm-sheet`, `--ifm-panel` | `--glass`, `--glass-strong`, `--glass-ctl`, `--solid` | `--tint` (per sky, l.58-75), `--tint-ctl` | `--glass`, `--solid`, `--ctl`, `--bar`, `--screen` |
| Hairline | `--ifm-line` | `--line` | `--line` | `--line`, `--rule` |
| Pressed | `--ifm-press` | `--press` | brightness filter | (none) |
| Accent | `--ifm-tint` per `.ifm-in-<app>` (l.35-40); `--ifh-tint`; `--ifl-tab-on` fixed blue (l.214) | `--tint`, `--tint-deep`, `--tint-text`; `--c-<app>` (l.21) | (none: white) | `--acc` = `var(--<app>)` (l.12, 14, 23) |
| Status | `--ifm-red`, `-green`, `-warn` | `--danger`, `--good`, `--good-text`, `--warn` | `--alert`, `--good`, `--warn`, plus data `--temp`, `--rain`, `--wind` | `--good`, `--bad`, `--warn` |
| Depth | inline shadows | `--edge`, `--lift`, `--sheen`, `--blur` | `--edge`, `--lift`, `--sheen`, `--body`, `--rim`, `--blur`, `--blur-ctl` | `--shadow` only |
| Radius | 30 (pop), 24 (group), 34 (sheet) | `--r-group` 26, `--r-card` 30, `--r-hero` 34, sheet 38 | `--r-card` 26, `--r-inner` 18, tile 24, sheet 34 | card 24, tile 22, sheet 34, tab bar 32, stat 16 |
| Motion | literal curves (`cubic-bezier(0.32, 1.25, 0.5, 1)` etc.) | `--ease-out`, `--ease-glide`, `--ease-spring` (l.23-25) | the same three plus `--ease-in` and `--dur-*` (l.24-29) | `--ease` (= 0.2, 0.8, 0.2, 1) |
| Type | system stack | `--font` / `--font-d` system, Inter fallback; body 17px | system; body inherits | **Inter from Google** (l.3-5), 15px body |

**Name clashes that will matter once modules share the document** (MAIN `weather/styles.css` l.8-48 against IFL
`app.css` l.9-37): `--text`, `--text-2`, `--text-3`, `--line`, `--tint`, `--blur`, `--edge`, `--lift`, `--sheen`,
`--good`, `--warn`, `--ease-out`, `--ease-glide`, `--ease-spring`. Weather's `:root` block would override Today's. And
`--tint` means "glass darkening" in Weather but "accent" in Today. The class clashes `.card`, `.seg`, `.tile`, `.hero`,
`.toast`, `.row-btn`, `.muted`, `.small` are listed in `roof/map-weather-client.md` §5. **Rule for the framework:** it owns
the unprefixed tokens on `:root`, and a module's CSS is scoped under its root (`.m-weather`) and defines nothing on
`:root`/`html`/`body`.

---

## 3. Proposed tokens (the framework's `:root`)

Base: IFL `app.css` l.9-75. Keep its names, so Today, Apps and You need almost no edits, and its dark/light/`data-theme`
three-block pattern, which matches the demo's l.19-30 and theme.js. Adds are marked **new**.

### 3.1 Neutral

| Token | Dark (default) | Light | From |
|---|---|---|---|
| `--sky-a/b/c/top`, `--aura-1/2/3` | as app.css l.11-12 | l.47-48 | Today's backdrop, kept as the frame's backdrop |
| `--text`, `--text-2`, `--text-3` | #f5f6fb, α .72, α .56 | #0d1020, α .66, α .62 | app.css. (The demo's `--ink-3` #7c849c is only **3.42:1** on #f4f5fb, so don't take it; Today's light `--text-3` is darker on purpose) |
| `--glass` (card), `--glass-strong` (sheet, toast), `--glass-ctl` (wells, stats, chips), `--solid` (Reduce Transparency) | app.css l.14, l.36 | l.50, l.54 | demo `--glass` / `--solid` / `--ctl` map 1:1 |
| `--bar` **new** | rgba(36,38,52,.82) | rgba(250,250,253,.8) | the tab bar's and header band's glass, today `--ifl-tabs-glass` (menu.css l.214, l.220) and `--ifh-band` |
| `--line`, `--press`, `--field`, `--dim` | app.css | app.css | |
| `--edge`, `--lift`, `--sheen`, `--blur` | app.css l.16-19 | l.51-53 | demo's single `--shadow` is too thin for glass over the aurora |
| `--danger`, `--good`, `--good-text`, `--warn` | app.css | app.css | demo `--bad` = `--danger`. In light, `--good-text` #167a42 is 4.95:1 and `--warn` #945600 is 5.38:1 |
| `--r-card` 30 / `--r-group` 26 / `--r-hero` 34 / `--r-sheet` **new** 38 / `--r-well` **new** 16 / `--r-pill` 999px | | | DEMO uses 24/22/34/16. Keep Today's (bigger glass reads better at 390 wide) |
| `--ease-out`, `--ease-glide`, `--ease-spring`, `--ease-in` **new**, `--dur-press` .1s, `--dur-fast` .2s, `--dur-base` .35s, `--dur-sheet-in` .5s, `--dur-sheet-out` .34s **new** | | | MAIN weather/styles.css l.24-29 (its comment says "as every app on the site has it") |
| `--font`, `--font-d` | system stack (app.css l.28-29) | | **not** Google Inter (§10) |
| `--hd-h` **new** (measured), `--tabs-h` = `var(--ift-h)` 64px, `--gutter` 16px | | | needed because the demo hard-codes offsets (§10) |

### 3.2 Accent: one set per app, set on the screen root (`[data-app="weather"]`)

| App | `--acc` (graphics, indicator, rings, charts; ≥3:1) light / dark | `--acc-ink` (text on surface; ≥4.5:1) light / dark | `--acc-fill` + `--on-acc` (filled button) both modes |
|---|---|---|---|
| InFlite / Today, Apps, You | #5a4fe0 / #9a90ff | #5a4fe0 (5.32) / #9a90ff (5.83 on #1b2140) | #5a4fe0 + #fff (5.79) |
| Chat | #2a6ae6 / #6ea6ff | #1f63d6 (5.06) / #6ea6ff (6.40) | #1f63d6 + #fff (5.51) |
| Weather | #2f7af0 (3.74) / #6aa8ff | #1f63d6 (5.06) / #6aa8ff (6.47) | #1f63d6 + #fff (5.51) |
| Fitness | #e8532f (3.38) / #ff8a68 | #b93a1c (5.24) / #ff8a68 (6.79) | #b93a1c + #fff (5.70) |
| Markets | #138a52 (4.03) / #4fd18e | #0a7a4d (4.94) / #4fd18e (8.10) | #0a7a4d + #fff (5.38) |
| Mail | #0f8f8a (3.63) / #45cfc8 | #0b7a76 (4.75) / #45cfc8 (8.23) | #0b7a76 + #fff (5.17) |

Light ratios are against the demo's screen #f4f5fb; dark ratios are against `--solid`-ish #1b2140. Why three values:
- In dark mode, white on the demo's dark accents is 1.9 to 2.7. Dark text #0b1020 on them is 7 to 10, so a
  `--acc-fill` of the dark accent with dark text also works. One rule for both modes (the deeper fill, white text) is
  simpler, and it is what Today's `.pill.primary` already does (app.css l.151-154).
- `--acc-wash` = `color-mix(in srgb, var(--acc) 13%, transparent)` for chips, the tab pill and the segment track (the
  demo's 13 to 14%, l.79, l.84, l.221). `--acc-tint-bg` = `color-mix(in srgb, var(--acc) 22%, transparent)` for the
  hero wash and the day-top chip (day.css l.19).
- `--c-<app>` (app.css l.21) stays as the "fixed colour of that app" (Apps tiles, row icons, the Today cards'
  `--dt-ac`). `--acc*` is "the app whose screen this is".
- Where it's set: on `.ifl-screen[data-app]` and mirrored on `html[data-app]` so the tab bar's pill, the header crumb
  and the backdrop wash follow it (demo l.463-464 sets `--acc` on the screen).
- **Decision for George:** InFlite's own accent. The demo uses indigo #5a4fe0 (also the account's, menu.css l.40) for
  Today; live Today uses blue (`--tint` #5aa9ff / #2f7af0, `--c-inflite` #2a6ae6, tab bar `--ifl-tab-on` #1d55c4). The
  Today icon has both (#5a4fe0, #2b69de). With indigo, Today, Chats and Weather stop all being the same blue, and you
  can tell which app you're in.

---

## 4. Components the framework should provide

The prefix `ifl-` for framework classes keeps them clear of modules' `.card` and `.seg` (§2). Each entry lists anatomy,
then states, then tokens, then what it replaces or reuses.

### 4.1 Frame and backdrop: `.ifl-frame`
- **Anatomy:** a fixed `.sky` with auras (app.css l.99-104, index.html), plus an accent wash layer (DEMO `.screen::before`
  l.52: `radial-gradient(120% 60% at 10% -10%, color-mix(var(--acc) 22%, transparent), transparent 60%)`), the
  status-bar strip (app.css `body::before` l.88), the header slot, the screen stack and the tab bar slot.
- **States:** accent changes with an eased crossfade (DEMO l.52 transitions `background` 0.5s). Animating a gradient
  repaints the whole layer each frame, so crossfade two layers by opacity instead. Signed-out shows the `.ifl-in`
  page with no tab bar.
- **Tokens:** `--sky-*`, `--aura-*`, `--acc`.

### 4.2 Header: `.ifl-hd` (extends `.ifh`, menu.css l.141-190 and menu.js `headerHtml` l.365)
- **Anatomy, row 1:**
  - Leading: the `.ifh-me` photo button (root screens) or the Back button (in an app or a pushed screen; today's
    `.ifl-back` menu.css l.233 and `.wx-ifh .ifl-back` weather l.2310-2322).
  - Title block: a **crumb** line above the title (new; DEMO `.ttl small` l.63-64). On root screens it is the date line
    in `--text-3` (DEMO l.467); in an app it is a 16px app icon plus app name in `--acc-ink`. Then the **title** as `h1`
    (the existing `.ifh-name` with clamp size l.167), optionally a picker button with ▾ (`.ifh-pick` l.170, `ifh-down`
    l.172). An optional status **line** sits under the title (the existing `.ifh-line` l.173), used today by Weather for
    place and now and by Today's "line said".
  - Trailing: the actions capsule (`.ifh-acts` / `.ifh-act`, l.177-185). The framework always puts **Search** first;
    the app adds 0 to 2 actions (Weather: Locate; Today: Edit as a word, app.css l.106).
- **Anatomy, row 2:** the section switcher (§4.3), present only in an app.
- **States:**
  - Large (`--p: 0`) to compact (`--p: 1`) over the first 64px of scroll. This is continuous, driven by `IFL.watch` /
    `settle` (menu.js l.384-392), not the demo's class toggle at 28px (l.484, l.226-228). Compact: the crumb and line
    fade to 0 height (as `.ifh-line` does, l.173), the title drops 32 to 20, and the band glass fades in (`.ifh::before`,
    l.150-155). The switcher stays and the header keeps a fixed height while compacting (menu.css l.142-145 explains
    why).
  - Signed out: `.ifh-me.out` (l.163).
  - Picker open: the title button gets `aria-expanded`.
  - Long title: ellipsis at one line; the crumb never wraps.
  - In a Chat thread (stage 3): title = person, no switcher.
- **Tokens:** `--ifh-ink: var(--text)`, `--ifh-ink-2: var(--text-2)`, `--ifh-tint: var(--acc-ink)`,
  `--ifh-glass: var(--glass-ctl)` or the existing rgba, `--ifh-band: var(--bar)`, and `--hd-h`, published from a
  ResizeObserver so screens can pad under it.
- **A11y:** one `h1` per screen. On navigation, focus moves to the `h1` (Today already does `.ifh-name:focus { outline:
  none }`, app.css l.108). The crumb is not a link (Back is the way up).

### 4.3 Section switcher: `.ifl-segs` (DEMO `.segs` l.66-68, l.217-222, with `slideTo` l.489-497)
- **Anatomy:** a track (`--glass-ctl`, pill), the buttons, and a sliding lens (`--solid` with a soft shadow, as in the
  demo; Weather's glass lens is `.seg::before` l.682-685, positioned by `--seg-i`).
- **States:** selected (`--acc-ink` text), pressed (opacity .6, Weather l.691), focus ring, and swipe-driven change.
  When the sections don't fit (a 4th label plus Dynamic Type, or 320px wide), the track scrolls horizontally with the
  selected one kept in view and an edge fade (Weather `.strip` mask l.704-705). Don't squeeze: the demo's `flex: 1;
  min-width: 0; white-space: nowrap` (l.67) clips labels with no ellipsis.
- **Hit area:** buttons 32 to 38px tall get `::after { inset: -3px 0 }` to reach 44 (Weather l.690).
- **Semantics:** `role="tablist"` with `aria-selected`, and the screen body is the `tabpanel`. The demo uses
  `aria-pressed` (l.468), which is wrong for navigation. Arrow keys move between tabs.
- **Indicator:** placed with transform from `offsetLeft`/`offsetWidth` (DEMO l.492-495), recomputed on resize and font
  load. Under reduced motion it jumps.
- **Tokens:** `--glass-ctl`, `--solid`, `--acc-ink`, `--ease-glide`, `--dur-base`.

### 4.4 Tab bar: `.ifl-tabs` (menu.css l.209-231; `IFL.hub.tabs` menu.js l.509)
- **Anatomy:** a glass capsule, Today · Chats · Apps · You (`TABS` menu.js l.447; glyphs `sun`, `bubble`, `grid`,
  `person`), each tab a 24px icon over an 11px label, plus the **sliding pill** (new; DEMO `.slide` l.221 inside
  `.tabs`).
- **States:**
  - Current: an `aria-current="page"` tab gets `--acc-ink` text over an `--acc-wash` pill. In an app, **Apps** is
    current (DEMO l.475) and its colour follows the app.
  - Pressed: scale .92 (l.228).
  - Badge on Chats (unread; the demo's `.badge` l.108 is white on `--chat`, so it needs `--acc-fill`/`--on-acc` or a
    red badge).
  - Hidden (`.away`, DEMO l.76) when a composer takes the foot: stage 3, but build the state now.
  - Landscape on a phone: 48px with label beside icon (l.231).
- **Change:** `view-transition-name: ifl-tabs` (l.222) is no longer needed once the page never reloads. Tabs stay
  `<a href>` (a real URL per tab) with the click intercepted, so long-press "open in new tab" and the old hub paths keep
  working.
- **Tokens:** `--ift-h` 64, `--ift-pad` 5, `--ift-max` 440, `--ift-label` 11, `--ift-icon` 24, `--ift-pill` 15%,
  `--bar`, `--acc-ink`, `--acc-wash`.

### 4.5 Screen and stack: `.ifl-screen`
- **Anatomy:** one scroll container per screen (or the window; see §7). Padding top is `--hd-h`, bottom is
  `--tabs-h + 24px + safe-bottom` (Today `.view` l.111), and columns are max 640 (`.view`).
- **Transitions:**
  - Push: from 28px right plus fade (DEMO `slidein` l.71-74, .38s).
  - Pop: from left.
  - Tab switch: crossfade.
  - Today card to app: shared-element zoom (§4.17).
  - Use `document.startViewTransition` where available, with the CSS animation as the fallback.
- **States:** loading (skeleton, §4.15), error, empty, signed-out gate. Scroll position is kept per screen and restored
  on Back (the demo resets it, since it re-renders on every draw).

### 4.6 Card: `.ifl-card` (Today `.tcard` app.css l.162-178; DEMO `.card` l.82)
- **Anatomy:**
  - Optional head: `.tc-head`, with a 26px app icon, app name, meta and a "go" link (l.166-172), **or** the demo's
    accent chip (§4.9).
  - Headline `.tc-h` (21px, l.173) / `.dt-h` 24px (day.css l.21), or the demo's `.big` 26px.
  - Body `.tc-p`.
  - Optional stats (§4.10), optional wells.
  - Foot actions `.tc-foot` with pills (l.176-179).
- **Variants:**
  - `plain`
  - `hero`: accent wash gradient (DEMO `.hero` l.229 uses `--weather`; it should be `--acc`)
  - `list`: zero padding, holds rows (DEMO `.card.list`, Today `.group` l.126)
  - `tappable`: the whole card opens something, so it needs a `role` / `<a>` and a focus ring
- **States:** pressed (tappable), loading (`.tcard.loading .sk`, l.182-187), arriving (`.tcard.in`, l.164-165), error.
- **Surface:** tinted glass **without** a per-card backdrop blur (Weather l.52-57: blurring each card cost a phone most
  of its frames). Keep blur for bars and sheets only. Today's `.glass` (l.113) blurs every card today; that is fine
  for a few cards but not for a Weather screen with 10.
- **Tokens:** `--glass`, `--sheen`, `--edge`, `--lift`, `--r-card`, `--acc-tint-bg`.

### 4.7 Section label: `.ifl-label`
There are five versions of the same thing: DEMO `.lab` (l.83), Today `.slabel` (app.css l.119) and `.you-h` (l.506),
Weather `.card-title` / `.section-title` (l.669), and `.pg-label` (l.283).
- **Spec:** 13px, 600, uppercase, letter-spacing .4px, `--text-3`. In You and in sheets use `--text-2`, since Today
  raised it for contrast (l.506). Margin 0 18px 8px.
- **Variants:** outside a card (over the backdrop), and inside a card's head (Weather's `.card-head` with an icon,
  l.668).

### 4.8 Row: `.ifl-row` (Today `.row` app.css l.127-145; DEMO `.row` l.98-107; menu `.ifm-row` l.73)
- **Anatomy:**
  - Leading, one of:
    - icon tile 32px r9, gradient (`.ic.blue`…, l.131-138)
    - app icon (`.ic.app`, l.139)
    - avatar 40 (§4.13)
    - time column 46px, tabular (day.css `.dc-tm` l.54; DEMO `.tm` l.105)
  - Text: `b` title (17px 500) and `small` sub (13.5px `--text-2`).
  - Trailing, one of:
    - value (`.val`)
    - stacked right column (DEMO `.rt` l.103-104: value over meta)
    - chevron (`.chev`)
    - switch (§4.12)
    - badge
    - round icon action (day.css `.dc-send` l.57)
  - Under-row chips (day.css `.dw-chips` l.44).
- **States:** pressed (`--press`), focus (outline inset -2px, rounded to the group, app.css l.509), disabled (.5),
  selected/current (`--acc-ink` trailing tick).
- **Separators:** inset 0.5px `--line`, starting after the leading slot (left 62 with icon, 18 plain, 72 for avatar or
  time rows; app.css l.129-130, day.css l.40, 51).
- **Text overflow:** **wrap, not ellipsis**, for titles and subs: Today uses `overflow-wrap: anywhere` (l.143-144),
  the demo uses nowrap plus ellipsis (l.101-102). Ellipsis only in dense lists (search results, chat list), and then
  the full text goes in `aria-label`.
- **Tokens:** `--text*`, `--line`, `--press`, `--r-group`.

### 4.9 Chip: `.ifl-chip`
- **Variants:**
  - **Tag** (non-interactive): accent wash plus `--acc-ink` text, optional 16px app icon (DEMO `.chip` l.84-85;
    day.css `.dt-chip` l.18 with `--dt-ac`). 28px tall is fine because it isn't a target.
  - **Action** (a link or button): `--glass-ctl`, `--text`, min-height 36 plus `::after` to 44 (Today `.achip`
    l.498-500, `.dw-chip` l.45 at 44px).
  - **Mini meta** (DEMO `.conn span` l.239: 11.5px). Too small: use 12.5px minimum.
- **States:** pressed, focus.

### 4.10 Stats: `.ifl-stats`
- **Anatomy:** a grid `repeat(auto-fit, minmax(84px, 1fr))` (day.css l.24). The demo's fixed `repeat(3, …)` (l.88)
  breaks at 4 stats or 320px. Each stat is a `--glass-ctl` well r16 holding `dt` 12px `--text-2` and `dd` 19px bold
  tabular (day.css l.25-27; DEMO `.stat` l.89-91, which uses `--ink-3` for the label and fails in light).
- **States:** up/good (`--good-text`), down (`--danger`), warn (`--warn`) (day.css l.28-30); accent value
  (`--acc-ink`).
- Use `<dl>` semantics as day.css does.

### 4.11 Buttons
- `.ifl-btn` (secondary pill): 44 min-height, `--glass-ctl`, inner highlight, spring on release (app.css `.pill`
  l.147-151). The demo's `.btn` is 38px tall (l.93), below a 44px target.
- `.ifl-btn.primary`: `--acc-fill` + `--on-acc` (replaces the hard-coded blue gradient at l.151-154 and the demo's
  `.btn.go` l.96).
- `.ifl-btn.small`: 36 plus `::after` to 44 (l.520-521).
- `.ifl-icon-btn` (circle 40 plus `::after` to 44): `.ifs-btn` (menu.css l.199-203), `.circ` (DEMO l.59), `.ifh-act`
  (l.181-185). They are one component with variants `glass` (header), `filled-ctl` (sheet close/back) and `accent`.
- `.ifl-btn.destructive`: `--danger` text (Today's `.you-signout` uses `--warn`, l.524; the menu's `.ifm-out` uses red,
  l.106).
- **States:** pressed scale .95 (`--dur-press`, released on `--ease-spring`), disabled .5, busy (label "Sending…",
  `aria-busy`), focus ring `--acc-ink` 2px offset 2.

### 4.12 Small controls (reuse as they are, with tokens)
- Switch: app.css `.switch` l.411-417 (an `input[type=checkbox]` with role switch styling). It is better than
  menu.css's `.ifm-switch` button (l.90-94) because it's a native input. "On" stays `--good` green (iOS), not the
  accent.
- Small segmented control (settings choices, chart metric): Today `.seg` l.516-519 and Weather `.seg` l.680-694. Rename
  it `.ifl-seg-sm` so it doesn't collide with §4.3. Selected = `--acc-fill` + `--on-acc` (Today's is a fixed blue
  gradient, l.518).
- Picker row: `.row.pick` with a transparent `select` over it (app.css l.404-408).
- Field: `--field` background, 16px font (stops iOS zoom), r14 (DEMO `.find` l.149-151).

### 4.13 Avatar: `.ifl-avatar`
Sizes 32 / 40 / 54 (friends) / 42 (header). An initial on a gradient, with a photo `img` (object-fit cover) laid over it
so the initial shows if the photo fails (app.css `.ifh-me .av-img` l.100-104, `.you-ph` l.512). The demo writes the
colour inline (`style="background:…"`, l.365), which CSP blocks; use a class palette `.av-c1`…`.av-c8` hashed from the
id.

### 4.14 Badge and count
20px min, pill, 12px 700, tabular. Red (`--danger` fill, white: #d12a1f gives 5+ in light) for unread on the tab bar;
accent fill for in-row counts. The demo uses `--chat` with white (l.108), which is 2.45:1 in dark.

### 4.15 Skeleton, empty and error
- Skeleton: `.tcard.loading .sk i` pulse (app.css l.183-187) and Weather `.card.sk` shimmer (weather l.535-556). Pick
  Today's (pulse by opacity is cheap) and drop the shimmer.
- Empty: `.empty-cards` (l.180-181), a centred line plus an optional pill.
- Error: the same shape with a Try Again pill.

### 4.16 Live tile (Apps): `.ifl-tile` (DEMO `.tile` l.111-115, l.230-237; Today `.atile` l.487-500)
- **Anatomy:** app icon 40 to 52 r11 to 13, name (16 to 19px 600), the day's line (`--text-2`), then a `mini` slot at
  the foot (min-height 30), plus optional section chips (Today's `.achips`, l.497).
- **Mini kinds**, each from the connector's Cards contract: big number (DEMO `b.num` 24px), bars (`.bars i`, heights
  via `--h` custom properties, **not** inline `style="height"` as in demo l.391), ring (svg with `stroke-dasharray` as an
  attribute is fine under CSP), sparkline (svg path attribute), unread count.
- **States:** pressed scale .97, loading (mini shows a placeholder bar), stale ("as of 12:40" in `--text-3`), signed out
  of that app ("Sign in to Fitness" chip).
- **Layout:** the demo's 2-up grid (l.110) works at 390. At 320, use 1 column or a min-height that fits two lines of
  name (Today's full-width tiles at l.486-488 already survive). Choose `grid-template-columns: repeat(auto-fill,
  minmax(160px, 1fr))`.
- Colours in minis use `--c-<app>` (the tile's own app), not `--acc`.

### 4.17 Shared-element open: `ifl.zoom(fromEl, toScreen)`
The demo (`zoomOpen` l.534-543, `.zoom` l.142) grows a glass box from the card to the full screen with `transition:
all` on `left/top/width/height`, then swaps the screen after 300ms. Problems: it animates layout properties (jank),
uses a fixed timeout, and ignores reduced motion. Build it as a View Transition (`view-transition-name` on the card and
the target hero) or a FLIP transform on one element. With reduced motion, crossfade. Keyboard opening (Enter/Space, demo
l.664) must work too.

### 4.18 Sheet: `.ifl-sheet` (one component replacing Today `.bsheet`, Weather `dialog.sheet`, menu `.ifa-sheet`, DEMO `.sheet`)
- **Anatomy:** dimmer, then a sheet holding:
  - a grab bar 40×5 (DEMO `.grab` l.147)
  - a head: title h2 22px plus `.ifs-btn` close ✕ and, on an inner page, back ‹ (Today `.bsheet-head` l.430-436;
    menu.css l.197-203)
  - an optional **hero** (`.ifs-hero`: 64px icon, name, line; menu.css l.204-207), for a settings or connector top
  - the body
  - an optional sticky action row (`.sh-acts`, l.444)
- **Element:** `<dialog>` opened with `showModal()`, as Weather does (l.1172), for the free focus trap, Escape and inert,
  plus top layer above the tab bar. Weather's open/close keyframes with `--in-t` / `--from-t` continuity (l.1178-1191)
  and drag-to-dismiss (`.dragging`) are the most complete; Today's (l.425-428) is a div with a visibility trick.
- **Stacked pages:** push an inner page with a slide, keep a back ‹ in the head (markets/app.js l.2215-2216 has
  `closeBtn` / `backBtn` against `Sheet.stack`).
- **States:** opening, open, dragging, closing, stacked (page 2+), busy, keyboard up (max-height follows
  `visualViewport`, as menu.js l.337-342 does for the menu).
- **Sizes:** phone is the full width less 8 (DEMO l.145) or edge to edge with top radius 38 (Today). On ≥700px, centred
  at max 560 with scale-in (Weather l.1191-1194). Max height `calc(100dvh - safe-top - 24px)`.
- **Tokens:** `--glass-strong`, `--blur`, `--edge`, `--dim`, `--r-sheet`, `--dur-sheet-in` / `--dur-sheet-out`,
  `--ease-glide`.

### 4.19 Search sheet: `ifl.search()` (DEMO `searchSheet` l.601-612)
- **Anatomy:** title "Search everything", the field (§4.12) with a magnifier and a clear button, then results grouped by
  kind (label plus rows with an app icon or avatar, title, sub and chevron), then an empty line ("Nothing for "…"").
  Then recent or suggested entries when the field is empty, held **in memory only**.
- **States:** empty field (suggestions), typing (results, debounced), no results, a provider loading (that group shows a
  thin skeleton row), a provider failed (group omitted silently).
- **A11y:** `role="combobox"` with an `aria-controls` listbox, or a plain field plus an `aria-live="polite"` count; Enter
  opens the first result. Focus the field after the sheet has risen (the demo waits 350ms, l.611; tie it to
  `animationend` instead).
- **Privacy (rule 6):** the query and the results never go into the URL, history state, storage under `today:*`, or a
  log. Chat entries come from the engine in memory; Markets entries show % only. The demo's echo
  `Nothing for “${q.value}”` (l.608) is **unescaped innerHTML** (XSS), so use `textContent`.

### 4.20 Send sheet: `ifl.send(card)` (DEMO `sendSheet` l.613-616; live: `IFL.hub.send` menu.js l.533, the Chat engine's sheet in `dialog.ifl-engine-box` menu.css l.243-247)
- **Anatomy:** the title "Send <what>" with what's sent described in `textContent`, a horizontal friends strip (avatar
  54 plus name; DEMO `.friends` l.154-156), a preview of the card as it will arrive, and a "you stay where you are"
  note.
- **States:** engine not ready (fallback row "Open in Chats"), sending, sent (toast "Sent to Pat. You're still here",
  menu.js `stillHere`), failed.
- **Stage 1 reality:** the friends list and the sending are Chat's engine (end-to-end encrypted, in its frame). Either
  the framework draws the sheet chrome and the engine only supplies the list and sends, or the engine's own sheet stays
  and gets restyled with the framework tokens. **Decision for the spec.** The engine runs in a frame from Chat's page,
  so its CSS is Chat's: the framework can't style inside it. Getting one look means Chat's sheet adopts the tokens.

### 4.21 Connector sheet: `ifl.connector(app)` (DEMO `connSheet` l.618-624, `.provides` l.240-242)
- **Anatomy:** a hero (app icon, "<App>'s connector"), one line, then a list of contract rows (label column 96px:
  Cards, Search, Notifications, Actions, Screens), then the primary "Open <App>".
- **Accent:** the sheet takes the app's accent (the demo sets `--acc` on the whole screen and never resets it, l.619; it
  must be scoped to the sheet).
- At 320px wide, put the 96px label column above its value instead of beside it.

### 4.22 Toast / note: `ifl.toast(text)` (menu.js `toast` l.736, menu.css `.ifm-note` l.129 + `.ifl-toast` l.252; Today `.toast` l.449; DEMO `.toast` l.157)
- **One place:** above the tab bar, `bottom: calc(var(--tabs-h) + 28px + safe-bottom)` (Today) or 104 + safe (menu).
  The demo puts it at the top (l.157), where it collides with the header and Dynamic Island.
- Announced through the hidden `aria-live` element (`.ifm-say`, l.139; `sayEl` in menu.js).
- One at a time, 3.6s, with an optional action ("Undo"); with an action it stays until tapped or 6s.
- `white-space: nowrap` (DEMO l.157) overflows on long names, so use `max-width: calc(100vw - 32px)` and wrap
  (Today l.450).

### 4.23 Allow-notifications and moved cards (keep: menu.js `allow` l.85, `movedCard` l.700; menu.css `.ifa-*` l.112-126)
These are centred hero sheets. Re-skin them as `.ifl-sheet` variant `hero-center` so there is one sheet look.

### 4.24 Coach hint: `.ifl-hint` (DEMO `.hint` l.247-248)
A one-time pill above the tab bar ("Swipe sideways for the next section"). Remember that it was shown (per device,
`localStorage` key outside `today:*` or a non-sensitive pref). It is decorative, so `aria-hidden`. Under reduced motion,
no animation. Show it only if section swipes actually ship (see §10).

### 4.25 Menu popover (`IFL.menu`, menu.js l.270; `.ifm-pop` menu.css l.49-110)
Under one roof, the photo opens **You** (DEMO: `.me` with `data-tab="you"`, l.472), not a popover. Keep the popover for
the apps' standalone frames only. Its footer (version, Update, Sign Out) moves to You.

### 4.26 Data colours (framework semantic, used by modules)
- `--pos` / `--neg` = `--good-text` / `--danger`: Markets moves (Today `--mk-up/down`, l.361-362).
- Warning levels (official yellow, amber, orange, red: Today `--wx-chip-*`, `--wx-amber-*`, `--wx-red-*`, l.199-201).
  These are not accents.
- Chart primitives: `--chart-grid: var(--line)`, `--chart-axis: var(--text-2)`, `--chart-now: var(--text-3)`, and a
  label halo `paint-order: stroke` in `--glass-strong`. They replace Weather's white strokes (l.719-735).

---

## 5. How today's styles map onto it

| Existing | Becomes | Action |
|---|---|---|
| app.css tokens l.9-75 | framework `:root` | keep. Add `--acc*`, `--bar`, `--r-sheet`, `--r-well`, motion `--dur-*` / `--ease-in` |
| app.css `.view` l.111 | `.ifl-screen` | keep the padding formula; top from `--hd-h` |
| app.css `.glass` l.113 | `.ifl-card` surface | drop per-card `backdrop-filter` for screens with many cards |
| app.css `.slabel` l.119, `.you-h` l.506, `.pg-label` l.283; DEMO `.lab`; Weather `.card-title` / `.section-title` | `.ifl-label` | merge |
| app.css `.group` / `.row` / `.ic` l.126-145, `.dw-row` / `.dc-row` day.css l.38-59; menu `.ifm-grp` / `.ifm-row` | `.ifl-list` / `.ifl-row` | merge; day.css keeps only its leading slots (time column, chips) |
| app.css `.pill`, `.pill.primary`, `.pill.small` l.147-157, 520 | `.ifl-btn` | primary takes `--acc-fill` |
| app.css `.tcard` and `.tc-*` l.162-187; day.css `.day-top` / `.dt-*` | `.ifl-card` (+ `hero`) | keep. `--dt-ac` becomes `--acc` set per card kind |
| day.css `.dt-stats` | `.ifl-stats` | keep as is |
| day.css `.dt-chip`, app.css `.achip`, `.dw-chip`, `.ft-sport`, `.wx-warn` | `.ifl-chip` (tag / action) | merge. `.wx-warn` stays a warning-level chip |
| app.css `.atile` l.487-500 | `.ifl-tile` (+ mini slot) | extend with the demo's live mini |
| app.css `.bsheet` / `.dimmer` l.423-446; Weather `dialog.sheet` l.1171-1450; menu `.ifa-sheet` l.115 | `.ifl-sheet` | merge on `<dialog>` with Weather's motion |
| app.css `.ifs-btn` l.433 + menu.css `.ifs-btn` / `.ifs-hero` l.199-207 | `.ifl-icon-btn.filled`, `.ifl-sheet-hero` | merge (two copies today) |
| app.css `.toast` l.449; menu `.ifm-note` / `.ifl-toast` | `ifl.toast` | one |
| app.css `.switch`; menu `.ifm-switch` | `.ifl-switch` (native input) | Today's |
| app.css `.seg` l.516; Weather `.seg` l.680 | `.ifl-seg-sm` | rename to avoid §4.3 |
| menu.css `.ifh*` l.141-190; menu.js `headerHtml` / `header` | `.ifl-hd` | extend: crumb, Back as leading, switcher row, Search fixed first |
| menu.css `.ifl-tabs` l.209-231; `hub.tabs` l.509 | `.ifl-tabs` | add the sliding pill, accent colour and badge; drop `view-transition-name` |
| menu.css `.ifl-back`; weather `.wx-ifh .ifl-back` l.2310 | header leading Back | merge |
| menu.css `.ifm-pop` / `.ifm-card` / `.ifm-foot` | standalone frames only; foot content into You | keep in menu.js |
| menu.css `.ifm-in-<app>` l.35-40 (menu tints #3a86f0 etc.) | `[data-app]` accent sets (§3.2) | replace. The menu tints fail 4.5 in light (Weather 3.30, Fitness 3.21, Markets 2.95, Mail 2.83 on #f4f5fb) |
| app.css Weather card skies l.189-245 | Today's Weather card, and **perhaps** Weather's Now hero | decision (§9) |
| app.css Chat, Fitness, Markets card parts l.246-400 | stay card-specific (`.pg-*`, `.ft-*`, `.mk-*`) inside `.ifl-card` | keep |
| app.css `--cloud-glass` l.32/54 | Weather icon cloud on light surfaces | defined but **unused** (no `var(--cloud-glass)` anywhere in today/public). Wire it into the weather icons (§9) |

---

## 6. Dark mode

- **Pattern:** the dark default on `:root`, the light overrides under `@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) }` and again under `:root[data-theme="light"]`, as app.css l.43-75 does today (the demo
  is the mirror image: light default, dark under two selectors, l.19-30). Keep Today's direction, since Today is the
  framework.
- `theme.js` sets `data-theme` from `localStorage["today:appearance"]` before paint and updates `meta[name=theme-color]`
  (#1b2860 / #dde3fb). In stage 1, Weather's own Appearance setting has no say: the framework's (in You) rules.
  Weather's standalone frame keeps always-dark until it loads the module.
- Each accent has a dark value (§3.2). The fill stays the deeper light value with white text in both modes.
- **Hard-coded colours that ignore the theme, to fix:**
  - menu.css `.ifh-me` gradient and white ring (l.159-160): OK in both.
  - `.ifl-back` `--ifm-panel` (fine).
  - `.ifm-lit` blue glow (l.47).
  - The demo's `.me` gradient (l.61), `.pin` (l.131) and `.week .now` (l.125): all white on accent.
  - Weather: all 300 white literals (§9).
  - Today `.pill.primary` gradient #4b95ff→#2a6ae6 (l.151) and `.seg` selected (l.518): fixed blue.
- **Backdrop:** the aurora sky has light and dark values already (`--sky-*`, `--aura-*`). The accent wash should be 22%
  in light and about 16% in dark (22% of a light accent on a dark sky gets loud).
- `color-scheme` follows the mode (app.css l.10, l.45), so form controls and scrollbars match.

## 7. Safe areas and layout

- Viewport: `viewport-fit=cover` (IFL index.html l.6) and `apple-mobile-web-app-status-bar-style: black-translucent`,
  so the page runs under the status bar. app.css `body::before` (l.88) paints the top inset with `--sky-top`; under the
  roof, paint it with `--bar` once the header is compact.
- **Header:** top padding `env(safe-area-inset-top) + 10px` (menu.css l.146, `--ifh-pt0`). Sides are
  `max(16px, env(safe-area-inset-left/right))` (l.148). Weather's `.wx-ifh` adds `top: env(safe-area-inset-top)`
  (l.2285) because its body is padded by insets (l.91); the framework must **not** pad `body` by insets (Weather does,
  Today doesn't), or the header is offset twice.
- **Tab bar:** `bottom: calc(10px + env(safe-area-inset-bottom))`, `width: calc(100% - 32px)`, `max-width: 440px`,
  centred (menu.css l.215-216). In landscape with a notch the sides are safe because it's centred and capped. The demo
  pins it at `left/right: 12px; bottom: 18px` (l.75), which needs the bottom inset added.
- **Screens:** bottom padding `--tabs-h + 40px + env(safe-area-inset-bottom)` (app.css `.view` l.111); sides as the
  header. Top: `--hd-h` measured, not 112/160 (demo l.69, l.471).
- **Sheets:** bottom padding `28px + env(safe-area-inset-bottom)` (app.css l.426; menu `.ifa-sheet` l.115); sides
  `max(18px, inset)`.
- **Toast:** above the tab bar plus the bottom inset.
- **Scroller choice:** prefer **the window** as the scroller for the current screen. Hidden screens are `display:none`
  or `inert` with their scroll positions saved. On iOS, the window scroller is what gives status-bar tap-to-top, and
  Safari's toolbar collapse in a browser tab. `IFL.watch(t)` supports either (menu.js l.388). The demo uses an inner
  `.body { position: absolute; overflow-y: auto }` (l.69), which loses both.
- **Landscape phone:** the tab bar is 48px (menu.css l.231). The header should drop the crumb in landscape (height
  matters more than width).
- **Wide (≥672px):** the column is centred at 640 and the header follows it (app.css l.536-537). Weather's
  two-column ≥980 layout (weather l.374-467) can stay inside the module.
- **Keyboard:** sheets fit `visualViewport.height` (menu.js `tall`/`fit`, l.337-342).

## 8. Reduced motion, transparency, contrast

- **Reduced motion:** the demo's global kill switch (l.263, `0.01ms` for everything) matches Today's (app.css l.551).
  Keep it as the framework default, and add the deliberate replacements (as menu.css l.186-190 and Weather l.1196-1198
  do), so that things that must move still give feedback:
  - Screen push/pop and the card zoom become a 150ms crossfade.
  - Sheets fade in place (Weather `sheet-fade-in/out` keyframes).
  - The tab and segment indicators jump; the header compaction stays (it follows the finger, so it isn't animation).
  - Toast fades.
  - The radar loop becomes manual steps (Weather already has a play control).
  - No coach hint animation.
  - No skeleton pulse (static placeholders).
  - Weather icon animations off (weather l.513).
- **Reduced transparency:** one framework rule, `.ifl-card, .ifl-sheet, .ifl-tabs, .ifl-hd band, .ifl-toast {
  background: var(--solid); backdrop-filter: none }` (app.css l.552-554; Weather l.1945-1962 is the fuller list). In
  light, `--solid` is #f4f6fc; in dark #1c2138.
- **More contrast (`prefers-contrast: more`):** raise `--text-2`/`--text-3` to α .9/.8, `--line` to α .3, and make
  the rim/edge a solid 1px (Weather l.1963-1969). Today has no rule for this yet.
- **Forced colours:** not handled anywhere. The sliding indicators are backgrounds, which forced-colours mode removes,
  so the selected tab and segment need an outline or `Highlight` border under `@media (forced-colors: active)`.
- **Dynamic Type:** the system font stack does not scale with iOS Dynamic Type unless `font: -apple-system-body` is used.
  Not in scope, but the header and switcher must tolerate a 1.3× font (the reason for §4.3 overflow).

## 9. Weather's look under the roof (accent only)

**What goes** (all in MAIN `weather/styles.css`):
1. The sky as the page background: 14 sky palettes `body[data-sky=…]` (l.205-218), and the animated clouds, stars,
   rain, snow and lightning layers (l.219-299). Plus `html { background: #2a3546 }` (l.202) and the sky fading into
   Safari's bar (l.189-196).
2. Per-sky glass tints `--pane` (l.58-73), the Glass setting clear/tinted (l.74-75), and the pale-sky contrast patch
   (l.80-84).
3. Always-dark white text (`--text: #ffffff`, `color-scheme: dark`; l.9-11, l.47) and the 185 `rgba(255, 255, 255,
   …)` and 115 `#fff`/`#ffffff` literals, including:
   - `:focus-visible { outline: 2px solid #fff }` (l.108)
   - `.hour.now .h-time { color: #fff }` (l.711)
   - chart grid, ticks and labels (l.719-735)
   - insight focus (l.925)
   - `.seg button[aria-selected] { color: #fff }` (l.689)
4. The rim and sheen lighting `--rim`, `--sheen`, `--body`, `--edge` and the pointer light (l.37-44, l.121-134,
   l.148-155). Glass-on-glass wells (l.156-160) become `--glass-ctl`.
5. Its own top bar `.top` / `.wx-ifh` and the hub Back (l.300-373, l.2280-2338), the pull-to-refresh spinner position
   (l.350-363; the framework could offer pull-to-refresh on screens, or Weather keeps a Refresh action), and the
   copied IFL block (l.2025-2279).
6. Its own sheet chrome, `dialog.sheet` (l.1171-1450): the content moves into `.ifl-sheet`.

**What stays, re-tokenised:**
- **Accent** `--c-weather`. The light `--acc` is #2f7af0, `--acc-ink` #1f63d6; the dark values are #6aa8ff for both.
  Used for the header crumb, the switcher's selected label, the tab bar's Apps pill, primary pills, the "now" hour
  highlight (replacing `.hour.now` glass), focus rings, and the radar location pin.
- **Data colours**, re-tuned for light surfaces. Measured on #f4f5fb: `--rain` #3B8BE0 is 3.24 (OK for bars, not small
  text), `--temp` #D07A12 2.98, `--wind` #14A08F 2.99, `--rain-text` #9fd0ff **1.49** (unreadable). Each needs a
  graphics value (≥3:1) and a text value (≥4.5:1) per mode, e.g. rain text in light ≈ #1f63d6, and keeping #9fd0ff in
  dark.
- **Weather icons** (coloured SVG; MAIN `weather/icons.js`, copied for Today as IFL `today/public/wxicons.js`). `CLOUD = "#EEF3F9"`
  (wxicons.js l.4) is a white cloud that disappears on a light card. Wire Today's unused `--cloud-glass` (#c3cee0 in
  light) through a `currentColor` or class fill. The `fill="…"` attribute itself is CSP-safe.
- **Official warning colours** (yellow, amber, red chips; Today `--wx-chip-*` l.199-201): these are semantic, keep them.
- **Insight levels** `.ins[data-level=alert|warn]` (Weather l.1955-1957) map to `--danger` / `--warn` tinted wells.
- **Motion:** Weather's `--ease-*` / `--dur-*` become the framework's (§3.1). Chart draw-in animations (l.736-744) stay
  inside the module, gated by reduced motion.
- **Radar map:** over a map, controls keep a blur (the one place blur is worth it). Leaflet's dark filter (Weather
  l.1634) follows the theme; the radar's full-screen mode (`.radar-big`) becomes unnecessary because Radar is a section.
- **Layout pieces:** the hours strip (`.strip` / `.hour`, l.704-716) becomes a module component inside `.ifl-card`.
  Tiles (l.1034+) become `.ifl-stats` or a module tile grid using `--glass-ctl`. The 16-day list becomes `.ifl-row`s
  with a time column (day name) and a range bar.

**Header under the roof:**
- Crumb: Weather icon plus "Weather" (accent ink).
- Title: **the place** with ▾ (opens Places, as the live `.place` pill and `#place-name` do). The demo's title is the
  section name ("Now", "7 Days"; demo l.466). With the place as title, the switcher already says the section, and the
  place is what people switch. **Decision.**
- Line: "Now 14° · rain from 15:00" once compact (the live `.place-now`, l.334-338).
- Actions: Search (framework), then Locate.
- Switcher: Now · 16 Days · Radar · Warnings. The real forecast is 16 days (`#daily-n`, weather/index.html l.138); the
  demo says "7 Days".

**The Now hero (decision):**
- Option (a), accent only, the demo's way: a `hero` card with a `--acc` wash (demo l.229), the big temperature in
  `--text`, the condition icon in colour.
- Option (b): keep a sky-gradient hero card by condition, as Today's Weather card already does (`.tcard.wx` with
  `--wx-card` gradients, app.css l.189-214), white text inside that one card only.

  (b) keeps Weather recognisable and matches Today's card, so the card that "opens into" Weather looks like what it
  opens. (a) is what "accent only" literally says. Either way, Today's card and Weather's hero should be the same
  component, so the zoom (§4.17) is seamless.

**Place pager:** Weather swipes horizontally between saved places (`.pager`, l.379; `drawWhole` and `placePages`). This
conflicts with the demo's section swipe (l.499-511). Pick one meaning for a horizontal swipe on Weather's Now. My
recommendation: places stay on swipe (an existing habit), sections are switched by tapping, and section swipes are off
for Weather.

---

## 10. In the demo but wouldn't survive real content

| # | Demo | Line | Problem | Fix |
|---|---|---|---|---|
| 1 | Inline `style="…"` (avatar colours, bar heights, `--top`, `--acc` per card, padding) | l.365, 376-378, 391, 393, 407, 419, 425, 433, 471, 620, 633 | CSP `style-src 'self'` on inflite.ai (IFL `_headers` l.34) and every MAIN app (`functions/_wxapp.js` l.30 etc.) blocks style attributes | classes, plus `data-vars` / `el.style.setProperty` (Today's `applyVars`, cards.js l.208-215) |
| 2 | Inter from fonts.googleapis.com | l.3-5 | CSP `font-src 'self'`, and a third-party request on every load | system stack (`--font`, app.css l.28) |
| 3 | `--top: 112px` / `160px` hard-coded under the header | l.69, l.471 | breaks with the safe-area top, a 2-line crumb, larger text, landscape, or a title wrap | measured `--hd-h` (ResizeObserver) |
| 4 | Title `nowrap` + ellipsis at 30px; segments `flex:1; min-width:0; nowrap` with no ellipsis | l.65, l.67 | "Weston-super-Mare", "Newcastle upon Tyne", German-length labels, 5 sections, or 320px: clipped text | clamp size (menu.css l.167 `clamp(26px, 8.6vw, 32px)`), switcher scrolls (§4.3) |
| 5 | Section and back swipes on `pointerdown/up` over the whole body | l.499-511 | fights the hour strip, radar map pan, Markets' charts, Weather's place pager, text selection, and Safari's own left-edge back (in a browser tab) | don't ship sections-by-swipe in stage 1, or only on screens without horizontal content. Never claim the left 28px edge in Safari (only in standalone) |
| 6 | Whole screen re-rendered with `screen.innerHTML` on every tap | l.470-477, 585-588 | focus lost on every action, header and tab bar re-created (the indicator flicker is masked by `lastAt`), and the scroll position lost | persistent header and tab bar; swap only the screen; restore focus and scroll |
| 7 | `backdrop-filter: blur(16px)` on every `.card`, `.tile`, `.circ` | l.59, 82, 111 | Weather measured this (styles.css l.52-57): a phone drops most frames with a blur per card while scrolling | blur only bars and sheets; cards get tinted glass |
| 8 | Tap targets: `.circ` 40, `.btn` 38, `.segs button` 32, `.chip` 28, `.conn span` 11.5px | l.59, 93, 67, 84, 239 | below 44pt, and the text below 12px | `::after` hit extension (menu.css l.185), 44px minimum on actions |
| 9 | Sheet: a `div` with `role="dialog"` but no label, no focus trap, no Escape, page not inert, no safe-bottom, scrim closes on click only | l.145, 513, 591-592 | keyboard and screen-reader users escape behind it; it sits under the home indicator | `<dialog>.showModal()` (§4.18) |
| 10 | Accent colours as text in light; white text on dark accents | l.12, 23, 63, 68, 96, 108, 125, 131 | measured fails (§0, §3.2) | the three-value accent set |
| 11 | `--ink-3` #7c849c for labels and stat captions in light | l.9, 83, 90 | 3.42:1 on #f4f5fb | Today's `--text-3` / `--text-2` |
| 12 | `.stats` fixed 3 columns | l.88 | a 4th stat or 320px squeezes the numbers | `auto-fit, minmax(84px, 1fr)` (day.css l.24) |
| 13 | `.toast` at the top, `nowrap` | l.157 | under the Dynamic Island and header; long names overflow | above the tab bar, wraps (§4.22) |
| 14 | Search results built with unescaped `innerHTML` including the query | l.608 | XSS from your own typing, and from any indexed name (a contact named `<img onerror>`) | `textContent` / `el()` |
| 15 | Search index includes mail subjects and Chat people in a static array | l.594-600 | in real use: rule 6, the index must stay in memory, from each connector, with Chat entries only via the engine; no query in the URL or storage | §4.19 |
| 16 | `connSheet` sets `--acc` on the whole screen and never resets it | l.619 | after closing, Today stays tinted Weather blue | scope the accent to the sheet |
| 17 | `zoomOpen`: `transition: all` on left/top/width/height plus `setTimeout(300)` | l.142, 541-542 | layout animation (jank), races with a slow first module load, no reduced-motion path | View Transition / FLIP; wait for the module's first paint |
| 18 | Tab buttons are `<button data-tab>` | l.475 | no URL per tab: no deep link, no "open in new tab", and the old `/chats/` / `/#apps` links break | `<a href>` intercepted (as `hub.tabs` does now) |
| 19 | `aria-pressed` on section buttons | l.468 | it is navigation, not a toggle | tablist / tabpanel |
| 20 | Header `background: linear-gradient(var(--screen) 70%, transparent)` | l.57 | on a real page with the aurora sky behind, a flat band shows over it at rest | no band at rest; glass band only when scrolled (menu.css l.150-155) |
| 21 | The radar animates by `setInterval` every second, forever | l.514-518 | battery; ignores reduced motion and hidden tabs | Weather's own radar (frames on request, paused when out of sight) |
| 22 | The `.hint` animates and is shown on every first app open per page load | l.486 | nags on every visit | remember it, once |
| 23 | Mixed `title` semantics: the section name in an app, the person in a thread, the tab name on root | l.466 | for Weather, the place belongs in the title (§9) | per-module title provider |
| 24 | Thread composer replaces the tab bar | l.136-139, 476 | the bottom inset is missing (`bottom: 18px` fixed) and the keyboard isn't handled | stage 3; use `visualViewport` |

---

## 11. Decisions for the designer and spec writer

1. InFlite's own accent: indigo (#5a4fe0, the demo) or the current blue (§3.2).
2. Weather's title: the place (recommended) or the section name (§9).
3. Weather's Now hero: accent wash (a) or a condition-sky card shared with Today's card (b) (§9).
4. Horizontal swipe on Weather: places (recommended) or sections (§9, §10 #5).
5. Send sheet: framework chrome around the engine's data, or the engine's own sheet restyled with tokens (§4.20).
6. The scroller: the window (recommended) or per-screen inner scrollers (§7).
7. Class prefix and module scoping: framework `ifl-*` on unprefixed tokens; modules under `.m-<app>` with no `:root`
   rules (§2).
8. The menu popover from the photo retires inside the roof; You holds the version/Update/Sign Out foot (§4.25).
