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

### 3. The other secrets, on both Workers
**Look up and paste** (same value as before):
- `CF_ACCOUNT_ID`: your account ID (Cloudflare dashboard, account home).
- `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET`: strava.com/settings/api.
- `GIPHY_API_KEY`: developers.giphy.com, your app.
- `HUB_ORIGINS`: `https://inflite.ai,https://next.inflite.ai`
- `HUB_PUSH`: `1`
- `PIGEON_FROM`: the address InFlite's emails come from (as on one you've had).

**Make new ones** (then set the same value on Pages too, so both run with it):
- `RESEND_API_KEY`: a new key in Resend (delete the old one after the move).
- `CF_EMAIL_TOKEN`: a new Cloudflare API token with Email Sending permission.
- `FITTING_USERS`: Fit Studio's logins again, as `name:password, name:password`.

**Make new shared ones.** Each is a random 40+ character password, and each goes in several places. Do one at a
time, in this order, and it's only out of step for a minute:
- `HUB_KEY`:
  1. Set it on the Pages project, then Retry deployment.
  2. Once that's live, set it on the Workers `inflite`, `inflite-next`, `inflite-apps` and `gfg`.
- `MAIL_KEY`:
  1. Set it on the Pages project, then Retry deployment.
  2. Once that's live, set it on `inflite-email`, `inflite-apps` and `gfg`.
- `PIGEON_TICK_SECRET`:
  1. Set it on the Pages project, then Retry deployment.
  2. Once that's live, set it on `inflite-apps`, `gfg` and the ticker Worker, and as the GitHub secret `INFLIGHT_TICK_SECRET`.

Not needed: `EDIT_PASSWORD` (nothing uses it; it can be deleted from Pages).

### 4. Check them before they're live
Open `https://inflite-apps.georgefarrowgreen.workers.dev/version` and `https://gfg.georgefarrowgreen.workers.dev/`:
each should answer (the home page shows on gfg's).

### 5. Move the addresses, one at a time
For each address I add a route to the Worker's config and deploy it. A route sits in front of the Pages project's
custom domain, so the address switches with nothing taken down; **undoing it is deleting the route**. Order:
www.georgefarrowgreen.com (we check here that the switch is seamless), then georgefarrowgreen.com, fitting.,
finance., fitness., weather., account. and auth.inflite.ai, and chat.inflite.ai last. After each, sign in and open
the app there (or run Actions → **Sign-in check**).

### 6. Make the Workers the ones that deploy
- Deploys on every push: `push` is added to the deploy workflow.
- Scheduled jobs: the GitHub variable `TICK_SITE` and the ticker Worker's `TICK_SITE` are set to `https://inflite-apps.georgefarrowgreen.workers.dev`.
- Pages: its automatic deployments are turned off.

### 7. After two quiet weeks
Take the custom domains off the Pages project and delete it. The Pages-only bits of the code go then too
(`PAGES_HOST` in `functions/_sites.js`, `wrangler.toml`).

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
