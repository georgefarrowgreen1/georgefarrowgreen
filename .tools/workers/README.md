# The site on Cloudflare Workers

The site runs as two Workers built from the same code, sharing D1, KV and R2:

| Worker | Configuration | Addresses |
|---|---|---|
| `inflite-apps` | `wrangler.worker.jsonc` | chat., weather., fitness., finance., account., auth. and status.inflite.ai |
| `gfg` | `wrangler.gfg.jsonc` | georgefarrowgreen.com, www., fitting., and the apps’ old georgefarrowgreen.com addresses |

## Build and deploy

Push to `main`, or run **Deploy the site's Workers** in GitHub Actions (`.github/workflows/worker-deploy.yml`).
It builds once with `node .tools/workers/build.mjs`, then deploys both configurations with `wrangler deploy -c`.
The workflow needs `CLOUDFLARE_API_TOKEN` with Workers Scripts Edit and Workers Routes Edit for the domains,
and `CLOUDFLARE_ACCOUNT_ID` if the token can see multiple accounts.

Every request goes through the Worker middleware in `functions/` first. Static files use the `ASSETS` binding,
including HTML handling, `404.html`, `_headers` and `_redirects`. `.assetsignore` excludes private source and tools.
Custom domains in each configuration create the Worker’s DNS records and certificates.

## Variables and secrets

Manage variables and secrets on the Workers in Cloudflare → Workers → the Worker → Settings → Variables and Secrets.
Use the same shared values on `inflite-apps` and `gfg`. A directly configured value takes precedence over the encrypted
copy already held in D1 (`functions/_kept.js`). To disable a value held there, set an explicit empty or off value on
both Workers rather than deleting the override.

Keep the existing `PIGEON_PEPPER_KEY` on both Workers: it opens the encrypted password pepper and saved settings.
Do not rotate it without re-encrypting the stored values. Never put secrets in the repository.

## Local development and checks

`node .tools/workers/build.mjs` builds the Worker. Run `wrangler dev -c wrangler.worker.jsonc` locally.
The end-to-end test runner (`.tools/tests/run.sh`) builds and serves the Worker automatically on :8788,
with test variables, local storage and routes removed so each test hostname remains distinct.

Check `https://inflite-apps.georgefarrowgreen.workers.dev/version`, the home page and the apps after deployment.
The **Sign-in check** workflow checks production sign-ins.

## Scheduled jobs and service bindings

The ticker and GitHub backup schedules call `https://inflite-apps.georgefarrowgreen.workers.dev`.
`TICK_HOST` allows tick routes only at that host; `TICK_SITE` can override the scheduler destination.

Today and Mail reach `inflite-apps` through `APPS` service bindings. The site reaches Mail and Today through
`MAIL_APP` and `TODAY_APP`; its status checks reach `gfg` through `GFG_APP`.

## Performance

The schema fingerprint and encrypted settings are cached in KV (`site:schema_fp`, `site:kept_secrets`),
with D1 as the fallback. The build records which minified assets are current, avoiding runtime fingerprinting.
Further database location, read replication or Smart Placement changes need separate validation.

## Owned UK routing

The Fitness API uses the private `ROUTING_APP` binding to `inflite-routing`'s `RoutingService` entrypoint. Deploy
`workers/routing` and pass its offline and hosted UK probes before deploying the site binding. The separate UK routing
workflow uses a checksum-pinned UK graph and capped Cloudflare Containers, with no public routing API at runtime.
See `workers/routing/README.md` for map updates, costs, health checks and rollback.
