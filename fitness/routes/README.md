# Cycling routes in Fitness

Fitness → Routes now generates road-following cycling loops from the device’s current location. Tap **Use current
location**, allow the browser’s location prompt, choose a distance (5–120 km or 5–70 mi) and road cycling or mixed surface.
The same GPS coordinate is the first and last routing waypoint. The result uses BRouter’s snapped cycling-road point;
if it is over 15 m away, the distance to the road is shown. Starts over 250 m away and GPS accuracy worse than 200 m
are refused. There is no IP-location fallback and no sample-route fallback.

The planner asks for up to three different directions, adjusts subsequent loop sizes using actual track distance,
rejects open/discontinuous routes, excessive backtracking and tracks over 25% away from the target, ranks by closest
distance, and keeps valid partial results. Time estimates are secondary and never influence route selection.
The route map and scrubbable elevation use Fitness’s existing renderer. GPX exports the returned coordinates and
available elevations, with no fabricated activity timestamps. Missing elevation and unavailable maps have explicit
fallbacks. Live Routes shows no sample weather and does not provide turn-by-turn guidance.

An indeterminate route animation shows while obtaining location and generating loops. It uses CSS, stops when the
request finishes or is cancelled, and becomes static for reduced-motion preferences. The planner shows only a compact
linked OpenStreetMap attribution; the longer explanatory footer has been removed.

## Account and location handling

Generated candidates stay in memory until **Save planned route**. One planned route, its day, departure and time zone
are then stored per account in D1 (`fx_route_plan`), separate from activities and training state. It syncs to the next
device through the account API and appears beneath the workout on Fitness Today. Saving a new planned route replaces
the previous one. Dates are limited to the next 30 days. Version-checked deletion cannot remove a plan another device
has since changed. The account’s JSON export includes the planned route, and account deletion removes it.

Location access happens only after a user tap; one-shot GPS is used, with no background watching. Coordinates travel
in the body of an authenticated, same-origin POST to InFlite. They are processed by InFlite’s private UK routing service;
the browser asks permission before sharing location. InFlite keeps the start/track only when the user saves a route.
No coordinates go into InFlite URLs, browser storage, shared caches or application logs. Account caches are in memory,
scoped to the owner, expire after 30 seconds and are cleared on module unmount. Late GPS, map and account responses
are guarded; hidden views cancel generation and release maps.

## Routing service

InFlite now operates its own UK BRouter engine inside Cloudflare Containers. `functions/_fitloops.js` plans and
validates loops; `workers/routing` owns the engine, UK coverage boundary, failover pool and verified local road data.
The authenticated API reaches its named `RoutingService` entrypoint through a private `ROUTING_APP` binding. There
is no public BRouter routing fallback. The engine has no internet access at runtime and uses a pinned 296 MB UK graph.

The public routing Worker's `/health` contains release metadata only; arbitrary route requests are private. Protected
deployment probes test England, Wales, Scotland, Northern Ireland, Shetland, Scilly and map-tile boundaries, plus the
same complete loop planner used by the site. CI also runs these checks in a resource-capped container with external
networking disabled before deployment. Both site Worker configs bind the service, which must be deployed first.

Generation is limited to 12 requests per account/hour and a shared 600-call/hour capacity budget. There are at most
three sequential route calculations, 30 seconds per call and 75 seconds overall, with a 90-second client budget,
capped response/geometry sizes, and duplicate-work protection. The private gateway fails over once between two capped
instances; idle instances sleep. Coverage errors, warming/busy status, no suitable loops and permission refusal remain
explicit. Data snapshots are checksum verified, mirrored in owned R2 storage and embedded in immutable container images.
A failed upstream data update cannot alter a running router. Details and rollback: [workers/routing/README.md](../../workers/routing/README.md).

- `POST /api/fitness/routes/generate`: `{ start: [longitude, latitude], metres, surface, seed }` → routes.
- `GET /api/fitness/routes/plan`: the account’s planned route, or null.
- `PUT /api/fitness/routes/plan`: `{ route, day, time, tz }` → saved plan with an opaque version.
- `DELETE /api/fitness/routes/plan`: `{ id, version }` → remaining plan, preserving a concurrent replacement.

All endpoints require sign-in; generation and writes also require the app's own Origin. Responses are never cached.
Fitness 2.06 retains the existing Routes tab; no companion navigation deployment is needed.

## Checks

Run `node --test .tools/tests/unit/fitroutes.test.mjs` for provider bounds, track/GPX validation, API authorization,
rate limits, account isolation, persistence, concurrent deletion and export/deletion coverage. Run
`node --test .tools/tests/routes-live.test.cjs` for location permissions, mobile/desktop themes, cancellation, map
cleanup, saved-plan refresh and account APIs. The existing demo test also mounts the actual Fitness module and
checks the real planned-route card under Today’s workout. `ROOF_IFL` points to the companion InFlite checkout.

The public-location geometry in `.tools/tests/fixtures/cycling-loop.json` was generated by BRouter on 2026-11-07 at
Richmond Gate solely as a deterministic test fixture. The production view never imports it.

# Archived sample preview

The original account-free sample remains at `https://fitness.inflite.ai/routes-demo` for design review.
It uses an explicit sample Endurance 90 session and cached Richmond/Surrey tracks. This preview is separate
from the live Routes section described above.

The demo provides four sample loops from Richmond Gate: a short road-biased loop, that loop twice for
endurance, a longer Surrey lanes loop, and mixed park paths. Filters match time and surface, the detail shows
a route map and scrubbable elevation profile, and GPX export uses the actual coordinates. Timing assumes
22 km/h by default, slower on mixed surfaces, plus a simple climbing allowance and five-minute pause.
Weather is deliberately labelled **sample weather**; there are no live forecast claims. This is route exploration,
not turn-by-turn navigation or a statement that every road/path is currently open.

Demo plans are stored under `fitness:routes-demo:<account-id>`, separately from activities and training state.
They appear directly beneath the workout on Fitness Today. The standalone review page has its own `standalone-preview` storage scope.
Date/time and route IDs are validated, storage failures are recoverable, and account changes invalidate old views.

Routes reuses Fitness's existing card/glass, grouped rows, pick controls, sport icons, metrics and gradient buttons.
The feature stylesheet only adds route-specific layout, maps and elevation. Route details and the planner sit in
Fitness's standard two-column layout on desktop and stack on mobile; technical notes stay in a disclosure.

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
there is no runtime dependency on BRouter and no routing API credential. Arbitrary starting-point generation belongs to the live section above; this fixed preview does not simulate it.

## Maps and lifecycle

Street maps reuse Fitness's MapLibre/OpenFreeMap renderer and load when a route is opened. Outline previews
and GPX remain available without WebGL or tiles. A failed/slow map falls back to the route outline with a retry.
Map instances are removed when a view hides, changes route or is destroyed; stale map loads are released.
The archived routing-model module is used by this sample only; live routing uses routes-geometry.js.

## Review and checks

Install the existing test dependencies with `npm ci --prefix .tools/tests`.
Build a single downloadable HTML file with `node .tools/build-routes-demo.mjs` (output: `artifacts/`).
The file bundles the map renderer, its worker and styles; street tiles need an internet connection.
The outline, elevation inspection and GPX export also work offline. Local plan persistence needs browser storage.

Run `node .tools/tests/unit/fitnessroutes.test.mjs` and
`ROOF_IFL=/path/to/inflite node --test .tools/tests/routes-demo.test.cjs`.
The dedicated Fitness routes workflow checks the archived preview, live location flow and actual Fitness module.
