# Cycling routes demo

Open `/fitness/routes-demo.html` for the standalone review page, or Fitness → Routes under InFlite's roof.
The same component runs in both. The preview uses an explicit sample Endurance 90 session. The integrated
view uses today's planned cycling workout and median recent outdoor ride speed where available.

The demo provides four sample loops from Richmond Gate: a short road-biased loop, that loop twice for
endurance, a longer Surrey lanes loop, and mixed park paths. Filters match time and surface, the detail shows
a route map and scrubbable elevation profile, and GPX export uses the actual coordinates. Timing assumes
22 km/h by default, slower on mixed surfaces, plus a simple climbing allowance and five-minute pause.
Weather is deliberately labelled **sample weather**; there are no live forecast claims. This is route exploration,
not turn-by-turn navigation or a statement that every road/path is currently open.

Demo plans are stored under `fitness:routes-demo:<account-id>`, separately from activities and training state.
They appear on Fitness Today. The standalone review page has its own `standalone-preview` storage scope.
Date/time and route IDs are validated, storage failures are recoverable, and account changes invalidate old views.

## Route provenance

Geometry and filtered ascent were calculated by the public BRouter service on 2026-11-07, using OpenStreetMap
data. Coordinates (including elevation) are cached in `../routes-data.js`; the small metadata catalog is
`../routes-catalog.js`. OpenStreetMap contributors, ODbL: https://www.openstreetmap.org/copyright.
BRouter: https://brouter.de/. Its sample routing result is not hand-surveyed. Surface percentages come from
BRouter's OSM surface tags; unknown surfaces remain labelled unknown.

Requests used `https://brouter.de/brouter`, `alternativeidx=0`, `format=geojson` and these waypoints (`lon,lat`):

- Road loop, `profile=fastbike`: `-0.296178,51.450117|-0.2678,51.4532|-0.2577,51.4277|-0.2868,51.4213|-0.296178,51.450117`
- Surrey lanes, `profile=fastbike`: `-0.29647,51.450229|-0.3708,51.3910|-0.4115,51.3296|-0.3631,51.2932|-0.2970,51.3715|-0.29647,51.450229`
- Mixed paths, `profile=trekking`: `-0.29647,51.450229|-0.2738,51.4520|-0.2570,51.4300|-0.2850,51.4220|-0.3030,51.4320|-0.29647,51.450229`

The endurance option repeats the closed road loop twice. Only coordinates and small summary fields are retained;
there is no runtime dependency on BRouter and no routing API credential. Arbitrary starting-point route generation
is the next provider integration, not simulated by these sample suggestions.

## Maps and lifecycle

Street maps reuse Fitness's MapLibre/OpenFreeMap renderer and load when a route is opened. Outline previews
and GPX remain available without WebGL or tiles. A failed/slow map falls back to the route outline with a retry.
Map instances are removed when a view hides, changes route or is destroyed; stale map loads are released.
The routing-model module exposes geometry/estimation independently from the UI for a future routing provider.

## Review and checks

Install the existing test dependencies with `npm ci --prefix .tools/tests`.
Build a single downloadable HTML file with `node .tools/build-routes-demo.mjs` (output: `artifacts/`).
The file bundles the map renderer, its worker and styles; street tiles need an internet connection.
The outline, elevation inspection and GPX export also work offline. Local plan persistence needs browser storage.

Run `node .tools/tests/unit/fitnessroutes.test.mjs` and
`ROOF_IFL=/path/to/inflite node --test .tools/tests/routes-demo.test.cjs`.
The dedicated Fitness routes demo workflow checks both the standalone component and the actual Fitness module.
