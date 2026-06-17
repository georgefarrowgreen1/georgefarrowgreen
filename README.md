# George Farrow Green — Personal Website

A small, fast, static personal site. No build step, no framework — just HTML, CSS,
and a sprinkle of JavaScript. It deploys to [Cloudflare Pages](https://pages.cloudflare.com/)
straight from this GitHub repo.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The page content |
| `styles.css` | Styling (light + dark theme) |
| `script.js` | Theme toggle + footer year |
| `_headers` | Security headers applied by Cloudflare Pages |

## Editing

Open `index.html` and replace the placeholder text (About, Work, Contact) with
your own. Everything is plain HTML, so you can edit it directly on GitHub or
locally. To preview locally, just open `index.html` in a browser, or run a tiny
server:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Deploying to Cloudflare Pages

This is a one-time setup. After it's done, **every push to GitHub auto-deploys.**

1. Go to the [Cloudflare dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Authorize Cloudflare to access GitHub and pick this repository (`georgefarrowgreen1/georgefarrowgreen`).
3. In the build settings:
   - **Framework preset:** `None`
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/`
4. Click **Save and Deploy**.

Cloudflare gives you a `*.pages.dev` URL within a minute. To use your own domain,
go to the project's **Custom domains** tab and add it.

### Which branch deploys?

By default Cloudflare deploys your repo's **production branch** (usually `main`).
Pushes to other branches create preview deployments. This work currently lives on
`claude/personal-website-github-cloudflare-a18aq8` — merge it into `main` (or set
that branch as production in Cloudflare) when you're ready to go live.
