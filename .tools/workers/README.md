# Moving the site off Pages, onto two Workers

Today the whole site is one Cloudflare **Pages** project, `georgefarrowgreen` (`wrangler.toml`). It becomes two
**Workers**, built from the same code, using the same database and storage:

| Worker | Its addresses |
|---|---|
| `inflite-apps` (`wrangler.worker.jsonc`) | chat., weather., fitness., finance., account. and auth.inflite.ai |
| `gfg` (`wrangler.gfg.jsonc`) | georgefarrowgreen.com, www., fitting. (Fit Studio), and the apps' old georgefarrowgreen.com addresses |

**The Pages project keeps running the site until every address works on the Workers.** Each step can be undone.

## Your checklist

### 1. Deploy the two Workers (nobody sees them yet)
GitHub → the georgefarrowgreen repo → Actions → **Deploy the site's Workers** → Run workflow.
They appear in Workers & Pages as `inflite-apps` and `gfg`, with no addresses but their workers.dev ones.

### 2. Carry the pepper over
1. Make a long random password (40+ characters) in your password manager. Call it **PIGEON_PEPPER_KEY**.
2. On the **Pages project** (Settings → Variables and secrets → Add): a secret `PIGEON_PEPPER_KEY` with that value.
   Leave `PIGEON_PEPPER` exactly as it is.
3. Pages → Deployments → the latest one → **Retry deployment**, so the site sees the new secret.
4. Sign in to your account once (any app), then open Admin → Insights. Under "Signing in" it should say
   **Passwords' pepper, kept for the move: Yes**.
5. On **both Workers** (each one's Settings → Variables and secrets): a secret `PIGEON_PEPPER_KEY` with the same
   value. Not `PIGEON_PEPPER`: the Workers don't need it.

### 3. The other secrets: nothing to do
With `PIGEON_PEPPER_KEY` on the Pages project and both Workers, the Pages project keeps all its other variables and
secrets in the database too, locked with that key, and the Workers open them (`functions/_kept.js`): the same values,
so Today's, Mail's and the ticker Workers and GitHub keep theirs. Admin → Insights says how many are kept ("Settings and
secrets, kept for the move"). One set on a Worker of its own always wins over the kept copy.

### 4. Check them before they're live
Open `https://inflite-apps.georgefarrowgreen.workers.dev/version` and `https://gfg.georgefarrowgreen.workers.dev/`:
each should answer (the home page shows on gfg's).

### 5. Move the addresses, one at a time
For each address I add a route to the Worker's config and deploy it. A route sits in front of the Pages project's
custom domain, so the address switches with nothing taken down; **undoing it is deleting the route**. Order:
www.georgefarrowgreen.com (we check here that the switch is seamless), then georgefarrowgreen.com, fitting.,
finance., fitness., weather., account. and auth.inflite.ai, and chat.inflite.ai last. After each, sign in and open
the app there (or run Actions → **Sign-in check**).

### 6. Make the Workers the ones that deploy (done in the code: nothing to do)
- Deploys on every push to main (`.github/workflows/worker-deploy.yml`).
- Scheduled jobs: the ticker (`workers/ticker/wrangler.toml`'s `TICK_SITE`) and GitHub's backup schedules call
  `https://inflite-apps.georgefarrowgreen.workers.dev`, and the Pages project's address if that didn't do it (the tick
  secret's carried with the rest). The GitHub variable `TICK_SITE`, if it's ever set, overrides the Worker's address.
- Pages goes on deploying on every push too, so the fallback behind the routes stays the same site; it's switched off
  at step 7.

### 7. Done (5 November)
The Pages project's custom domains were removed and the project deleted. Deleting it deleted the DNS records it had
made, so every address went dark until the Workers took each as a custom domain of their own (the configs'
`"custom_domain": true`), which made each its own DNS record again. (While the Pages project was there, a custom domain
couldn't take over a record it had made: Cloudflare refuses.) And a Worker's fetch to an address in its own zone skips
the zone's routes, so Today and Mail (the inflite repo) reach inflite-apps through a service binding (`APPS`).
Left: the Pages-only bits of the code (`PAGES_HOST` in `functions/_sites.js`, `wrangler.toml`, the scheduled jobs'
fallback to `georgefarrowgreen.pages.dev`). Changing a secret from now on is done on the Worker.

## What's ready in the code

- **The Workers' configs:** `wrangler.worker.jsonc` and `wrangler.gfg.jsonc`. `functions/` is compiled as Pages
  compiles it. Every request goes through the Worker first, and the site's files are its assets, with Pages' own HTML
  handling, `404.html`, `_headers` and `_redirects`.
- **What's never published:** `.assetsignore`.
- **The build:** `.tools/workers/build.mjs`, one build for both Workers.
- **Testing the Workers:** `SERVE=worker` runs the end-to-end tests against the Worker build instead of Pages.
- **The pepper:** `PIGEON_PEPPER_KEY` (`functions/_atrest.js`). With it set beside `PIGEON_PEPPER`, the site keeps
  the pepper in the database, locked with that key. A Worker with only the key opens it, so every password goes on
  working, and a copy of the database alone is still useless.
- **The scheduled jobs:** `tickHost` and `TICK_HOST`/`TICK_SITE`, so the jobs can call the Workers' address instead
  of `georgefarrowgreen.pages.dev`.
