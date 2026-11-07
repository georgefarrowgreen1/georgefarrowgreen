# InFlite UK Routing

This is an InFlite-operated routing service, running its own BRouter engine and a local UK OpenStreetMap road graph
inside Cloudflare Containers. It does not call the public BRouter routing API. Engine 1.7.10, profiles, container base
images and all 10 map tiles are pinned; map files are verified before startup. The initial UK graph is about 296 MB.
Coverage includes England, Wales, Scotland, Northern Ireland, Shetland and Scilly. Starts outside the UK extract
boundary receive an explicit coverage error. Adjacent graph data allows routes near national/tile boundaries.

## Request path

Fitness's authenticated API sends a bounded POST over `ROUTING_APP`, a private binding to this Worker's named
`RoutingService` entrypoint. The public Worker exposes only release metadata at `/health` and a secret-protected,
fixed-location deployment probe at `/probe`; arbitrary route requests are not public. Coordinates are carried in
POST bodies, never Worker URLs. The engine's own access/error output is discarded so it cannot log waypoint URLs.
The Java gateway emits only lifecycle event codes and aggregate counters. The gateway's failover logs name the
instance/status, without coordinates or request bodies.

A capped primary/standby pool runs at most two `basic` instances (1 GiB, 1/4 vCPU each). Each engine admits one route
calculation at a time. Busy/unhealthy primary requests are sent once to the standby. The SDK restarts containers;
the Java gateway checks/restarts its engine after a crash, with a restart ceiling. Idle instances sleep after ten
minutes. Container internet access is disabled: serving routes needs no public routing server, map download or
external credential. The site's map tiles remain its existing OpenFreeMap renderer.

The owned road profile (`profiles/road.brf`) derives from BRouter `fastbike`, with a light traffic penalty, lower
costs for paved primary/secondary/tertiary roads, and higher costs for residential/service shortcuts and unpaved
sections. Steps and ferries are disabled; the upstream motorway, trunk and access restrictions are retained. Mixed
still derives from `trekking`. Distance controls waypoint radius, adaptive scaling and ranking; speed/climbing never
change route selection. Already-open 2.05 clients can still send their legacy time request during rollout. Intermediate waypoints can snap up to
1 km to a cycling road, which avoids rejecting a loop merely because a proposed via point falls in a field.
Fitness independently rejects a start snapped over 250 m away, invalid/discontinuous/open tracks, excessive
backtracking and unsuitable durations. BRouter/OpenStreetMap access data is not a guarantee of current conditions.

## Deployment and readiness

`.github/workflows/routing-service.yml` checks hosting access, restores owned build inputs, verifies checksums, builds
the container and computes a real route with `--network none --memory 1g --cpus 0.25`. It mirrors the validated build
inputs to the private `inflite-routing-data` R2 bucket before deployment. It then installs the isolated Worker and
runs protected probes across the UK, including map-tile boundaries, plus the exact loop planner used by Fitness.
Initial Cloudflare container provisioning can take several minutes; the readiness step retries within its deadline.
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
- `docker build -t inflite-routing:check .` builds the service.
- `docker run -d --name inflite-routing-check --network none --memory 1g --cpus 0.25 inflite-routing:check`, then
  `docker exec inflite-routing-check java -Xmx32m -cp /opt/router/classes Probe`, proves routing without external access.

The pinned public release and segment feed are used only to bootstrap/review a new snapshot. See NOTICE.txt and
LICENSE-BROUTER.txt for engine and OpenStreetMap attribution. UK boundary source: Geofabrik's UK extract polygon.
