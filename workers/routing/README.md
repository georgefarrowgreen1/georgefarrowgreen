# InFlite UK Routing

This is an InFlite-operated routing service, running its own BRouter engine and a local UK OpenStreetMap road graph
inside Cloudflare Containers. It does not call the public BRouter routing API. Engine 1.7.10, profiles, container base
images and all 10 map tiles are pinned; map files are verified before startup. The initial UK graph is about 296 MB.
Coverage includes England, Wales, Scotland, Northern Ireland, Shetland and Scilly. Starts outside the UK extract
boundary receive an explicit coverage error. Adjacent graph data allows routes near national/tile boundaries.

## Request path

Fitness's authenticated API sends a bounded POST over `ROUTING_APP`, a private binding to this Worker's named
`RoutingService` entrypoint. The public Worker exposes only release metadata at `/health` and a secret-protected,
fixed-location deployment probe at `/probe`. Both routing and corridor lookup use the private binding.
Coordinates are carried in POST bodies. The engine's own access/error output is discarded so it cannot log waypoint URLs.
The Java gateway emits only lifecycle event codes and aggregate counters. The gateway's failover logs name the
instance/status, without coordinates or request bodies.

A capped primary/standby pool runs at most two `basic` instances (1 GiB, 1/4 vCPU each). Each engine admits one route
calculation at a time. Busy/unhealthy primary requests are sent once to the standby. The SDK restarts containers;
the Java gateway checks/restarts its engine after a crash, with a restart ceiling. Idle instances sleep after ten
minutes. Container internet access is disabled: serving routes needs no public routing server, map download or
external credential. The site's map tiles remain its existing OpenFreeMap renderer.

The owned profiles in `profiles/road.brf` derive from BRouter `fastbike`. Road offers Main roads, Quiet lanes and
an Avoid unpaved switch. Gravel favours aggregate and firm tracks with quieter connections. Mountain bike favours
mapped trails and tracks and avoids the harder mapped technical grades. Gravel and MTB favour loops with lower exposure to built-up areas and
long runs of busy roads. If all the suitable routes pass through substantial built-up areas, the planner
can spend one of its existing retries on a loop with quieter connections and a different way out. City
starts can still use cycling paths and streets to reach the countryside. The profiles respect mapped riding
restrictions and exclude motor roads, steps, ferries and fords. The legacy Mixed profile remains available for
existing clients and saved plans.

The build indexes quiet lanes, gravel corridors and MTB trails from the verified RD5 snapshot. The index joins
mapped ways of the same ride type and records allowed direction, measured length and three points along each stretch.
It favours low-traffic road classes, mapped gravel or firm track, and trails with mapped cycling access. The same
BRouter profiles used for routing check the direction and access of each indexed way. The private Worker reads the
generated binary by geographic cell without starting a routing container.

The planner explores six bearings, then uses up to three further searches to correct the distance. For Quiet lanes,
Gravel and Mountain bike, it looks for a suitable indexed stretch before starting. If the bearings fail to produce
a usable route, the first retry can shape a loop through that stretch. Each proposal goes through BRouter for
the full route calculation and access validation. The planner can also pair
outward and homeward legs from measured tracks, giving preference to shared map vertices. For an off-road ride
it can hold a sustained stretch of gravel or trail in its observed direction and shape the return leg around
the remaining distance. If the last retry is needed, the planner can swap the section between two shared
junctions with a section that another measured path follows in the same direction. It estimates the new distance,
terrain and built-up exposure before sending checkpoints to BRouter. If no measured swap fits, the planner can
adjust a connector on a loop that came close. Distance, terrain and riding access are checked on the resulting
route. A request allows at most nine sequential engine calls, with a 75-second deadline
and a 10% distance tolerance. If it finds a suitable loop outside the tolerance, it can report the measured
distance as guidance for another search.

The recommendation also weighs sustained terrain, built-up areas and retracing within the ride. A short
shared road at the start and finish carries a lighter cost than repeating roads in the middle. Loop validation
rejects short side trips that return to their junction and turn-backs on closely spaced parallel roads.
When there is room in the search budget, the planner can send checkpoints on either side of a rejected detour
back through BRouter to find a continuous connection. The planner
compares alternatives in pairs and offers up to three suitable options that share at most 65% of their
sampled corridors. Labels such as More gravel or Flatter loop require measured differences.

Gravel requires at least 18% mapped gravel or firm track. Mountain bike requires at least 25% mapped trail.
For otherwise similar rides, longer stretches of matching terrain rank higher. Quiet Road also weighs mapped
traffic exposure and the longest continuous stretch of busy road. Unknown surface stays visible in the breakdown. Map access, trail grades and surface are taken from the
snapshot. Local signs, conditions and temporary closures can differ. Existing account and concurrency limits
apply, and intermediate waypoints can snap up to 1 km. Release checks exercise real Road, Gravel and Mountain
bike loops and validate the mapped terrain on the two off-road profiles.

### Settlement data

The off-road planner uses an offline grid derived from the European Commission Joint Research Centre’s
GHS-SMOD R2023A, 2020 epoch. InFlite cropped and resampled the source and grouped its four built-up
classes for route ranking. © European Union. [Dataset](https://human-settlement.emergency.copernicus.eu/ghs_smod2023.php)
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) [GHSL reuse and citation terms](https://human-settlement.emergency.copernicus.eu/GHSLhowToCite.php)

To regenerate the grid, download the archive and run
`python3 workers/routing/scripts/build-settlement-grid.py /path/to/archive.zip` with GDAL’s Python bindings.
The script verifies the archive's SHA-256 and writes `workers/routing/src/settlement-grid.json`.
[Pinned GHS-SMOD archive](https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_SMOD_GLOBE_R2023A/GHS_SMOD_E2020_GLOBE_R2023A_54009_1000/V2-0/GHS_SMOD_E2020_GLOBE_R2023A_54009_1000_V2_0.zip)

## Deployment and readiness

`.github/workflows/routing-service.yml` checks hosting access, restores owned build inputs, verifies checksums, builds
the container and generates the corridor index. It checks all three corridor types and computes real routes with
`--network none --memory 1g --cpus 0.25`. It mirrors the validated build
inputs to the private `inflite-routing-data` R2 bucket before deployment. It then installs the isolated Worker and
runs protected probes across the UK, including map-tile boundaries, plus the exact loop planner used by Fitness.
Initial Cloudflare container provisioning and gradual rollouts can take several minutes; the active-profile readiness
step allows up to eight bounded attempts before stopping the release.
The site must not be switched until the hosted readiness check is green. The protected release check also compares
the running primary/standby engines’ embedded profile fingerprints against the deployed source. Idle stale instances
are replaced sequentially (standby first); busy ones are retried. This prevents a successful gateway deployment from
validating an older container still running during a gradual rollout. The loop planner also runs in `workerd`
under both production compatibility dates, catching Worker-specific Request/AbortSignal incompatibilities that Node
unit tests cannot detect. An identical source tree on merge rechecks the
already deployed service without restarting its tested container image.

The existing `CLOUDFLARE_API_TOKEN` and optional account selector need Workers, Containers/registry and R2 permissions.
The first hosted preflight and snapshot mirror succeeded with this repository's existing deployment credentials.
`ROUTING_PROBE_TOKEN` is generated/masked by the deployment job, stored only as a routing-Worker secret, and used
only against that Worker's fixed-location readiness endpoint. It is separate from the Cloudflare API credential.
The site deployment also calls a scheduler-key-protected `/api/routing-check` at its scheduler host. This computes
a real fixed-location loop through the deployed site’s private binding and returns only summary metrics; it accepts
no caller location, performs no account writes, and is unavailable on public app hosts.
The site’s two Worker configs bind `ROUTING_APP` to `inflite-routing`, entrypoint `RoutingService`.

Containers incur usage charges under the existing Workers paid account. Instance count is capped at two and idle
sleep limits running time. Cloudflare's current pricing: https://developers.cloudflare.com/containers/platform/pricing/.
No billing-plan upgrade is performed by these scripts.

## Map data updates and rollback

R2 keys contain the snapshot date and the data-lock hash. Verified source archives and map tiles are mirrored there
so future builds do not depend on an upstream daily file still matching an old checksum. Images also contain the
complete snapshot; a failed upstream download/update cannot change a running router.

To stage an update, run `python3 scripts/update-lock.py`, review the data-lock diff, and run the service workflow.
Updates are promoted only after offline-container, UK-region and full-loop probes pass. A checksum mismatch, bad graph
or failing probe stops rollout. Keep the previous successful Worker/container deployment for rollback; switching
back to its image restores its embedded map snapshot. No update schedule or automatic data-lock merge is enabled.

The Worker/gateway roll back through normal Cloudflare Worker/container deployment versions. The public BRouter
routing endpoint is not used as a hidden fallback. The site can return a clear warming/busy/coverage error while
an instance recovers; owning the service does not make outages impossible.

## Local review

- `npm ci` then `npm test` checks UK coverage, input bounds and failover.
- `node scripts/snapshot.mjs restore` restores owned build inputs (deployment credentials required).
- `python3 scripts/prepare.py` materialises and verifies the pinned engine and graph.
- `docker build --target corridor-data --output type=local,dest=.build .` builds the private Worker's corridor index.
- `docker build -t inflite-routing:check .` builds the service.
- `docker run -d --name inflite-routing-check --network none --memory 1g --cpus 0.25 inflite-routing:check`, then
  `docker exec inflite-routing-check java -Xmx32m -cp /opt/router/classes Probe`, proves routing without external access.

The pinned public release and segment feed are used only to bootstrap/review a new snapshot. See NOTICE.txt and
LICENSE-BROUTER.txt for engine and OpenStreetMap attribution. UK boundary source: Geofabrik's UK extract polygon.
