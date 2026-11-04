# Moving the site off Pages, onto a Worker

The site (georgefarrowgreen.com, and chat., weather., fitness., finance., account. and auth.inflite.ai) is one
Cloudflare **Pages** project today (`wrangler.toml`). This is the move to a **Worker with static assets**
(`wrangler.worker.jsonc`), which Cloudflare is steering Pages projects towards, and which lets Today's and Mail's
Workers reach the account by a service binding instead of over the public internet (the next step after this one).

Nothing here changes the live site until step 5. Each step can be undone.

## What's ready (the prep)

| | |
|---|---|
| `wrangler.worker.jsonc` | The Worker: `functions/` compiled as Pages compiles it, the folder's files as its assets (`ASSETS`), every request through the Worker first (as the root `_middleware.js` makes it on Pages), Pages' own HTML handling, `404.html`, `_headers` and `_redirects`. The same D1, KV, R2 and the typing Durable Object. No routes yet. |
| `.assetsignore` | What's never served as a file: `functions/`, `workers/`, `.tools/`, the repository's own files. (`_middleware.js` still refuses them too.) |
| `.tools/workers/build.mjs` | Builds it: `wrangler pages functions build` into `.tools/workers/dist/index.js` (1.8 MB, 0.5 MB gzipped; the limit is 10 MB). |
| `SERVE=worker` | The end-to-end tests run against the Worker (`wrangler dev -c wrangler.worker.jsonc`) instead of `wrangler pages dev`: `SERVE=worker .tools/tests/run.sh home acctsignin …`. |
| `tickHost` | The scheduled jobs call the site's `georgefarrowgreen.pages.dev` address, past the custom domains' bot checks, and the code only took ticks there. It now also takes them at the Worker's own address (`TICK_HOST`), and the jobs call `TICK_SITE` when it's set (GitHub's weather and Chat ticks: the repository variable `TICK_SITE`; the ticker Worker: its `TICK_SITE` variable). Until they're set, nothing changes. |
| `worker-deploy.yml` | Deploys the Worker, by hand only (Actions, "Deploy the site's Worker"), to `georgefarrowgreen-site` with no routes: reachable only at its workers.dev address, side by side with Pages. |

## The move, step by step

1. **Deploy it side by side.** Run "Deploy the site's Worker" from the Actions tab. It's live only at
   `georgefarrowgreen-site.<your account's subdomain>.workers.dev`, which nobody uses.

2. **Give it the Pages project's variables and secrets, the same values.** In the dashboard, the Pages project's
   Settings, Variables and Secrets, for Production: each one, by name and value, onto the Worker (its Settings,
   Variables and Secrets, or `npx wrangler secret put NAME -c wrangler.worker.jsonc`). **`PIGEON_PEPPER` above all:
   a different one and no one can sign in.** Also `HUB_KEY` and `MAIL_KEY` (the same as Today's and Mail's Workers
   have), the tick secrets, Resend's and Strava's keys. Then set `TICK_HOST` to the Worker's workers.dev name.
   The names the code reads, to check against (most `*_URL` ones are tests' stand-ins and won't be set):
   `ACCOUNT_SITE APPS_MAIL_DOMAIN APPS_SITE CF_ACCOUNT_ID CF_EMAIL_API CF_EMAIL_TOKEN CHAT_HOST CONTACT_FROM CONTACT_TO
   FITNESS_HOST FITTING_HOST FITTING_USERS GIPHY_API_KEY HUB_KEY HUB_ORIGINS HUB_PUSH MAIL_KEY MAIL_VIA MARKETS_DATA
   MARKETS_HOST MARKETS_PAGE PIGEON_ADMIN_EMAIL PIGEON_CONTACT PIGEON_FROM PIGEON_PEPPER PIGEON_PUSH_URL
   PIGEON_TICK_SECRET RESEND_API_KEY STRAVA_CLIENT_ID STRAVA_CLIENT_SECRET WEATHER_HOST WEATHER_TICK_SECRET
   WEB3FORMS_KEY` (and any other the Pages project has).

3. **Check it there.** At its workers.dev address: the home page, `/version`, a preview of an app (`/weather/`), and
   one tick by hand (`curl -X POST https://<its address>/api/pigeon/notify-tick -H "Authorization: Bearer …"`).
   The apps themselves answer by their own addresses, so they're checked in step 5, one at a time.

4. **Run the tests against it locally**, as now: `SERVE=worker` with the end-to-end tests (all of them, the night
   before the move).

5. **Move the addresses over, one at a time.** For each address, a Worker route on its zone
   (`chat.inflite.ai/*`, zone inflite.ai), added in `wrangler.worker.jsonc`'s `routes` and deployed. A route runs in
   front of the Pages project's custom domain, so the address is the Worker's at once with nothing taken down, and
   **undoing it is deleting the route**. Start with the quietest (www.georgefarrowgreen.com), then the home page,
   finance., fitness., weather., account. and auth., and chat. last. After each, sign in there and open the app
   (the nightly sign-in check, run by hand, does it for every app at once: Actions, "Sign-in check").

6. **Make it the one that's deployed.** Add `push: branches: [main]` to `worker-deploy.yml`; set the `TICK_SITE`
   repository variable and the ticker Worker's `TICK_SITE` to `https://<the Worker's workers.dev address>`.
   Turn off the Pages project's automatic deployments (its Settings, Builds).

7. **After two quiet weeks**, take the custom domains off the Pages project, and delete it. Then the
   `PAGES_HOST` fallback in `functions/_sites.js` and the Pages config (`wrangler.toml`) can go too.

## What's the same, and what isn't

- **The same:** every address, every cookie (the browser can't tell), the database, the files in R2 and KV, the
  typing Durable Object, Today's and Mail's Workers (they call the same addresses).
- **Not the same:** Pages' preview deployments per branch (`<branch>.georgefarrowgreen.pages.dev`) become Workers'
  preview versions (`wrangler versions upload`), on a different address, if they're wanted. Pages' automatic
  deployment from Git becomes the workflow in step 6.
- **Afterwards:** Today's and Mail's Workers can call the account by a service binding instead of over the internet
  (faster, and nothing outside can pass as them), and the hub's forwarding with `HUB_KEY` can shrink.
