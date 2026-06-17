# George Farrow Green — Personal Bio

An elegant, dark **liquid-glass** bio page with an Apple-inspired feel. It's a
static page enhanced with **Cloudflare Pages Functions**, so you can log in with
a password and edit your bio directly on the live site — changes persist for
everyone.

## How it works

| Part | Tech |
| --- | --- |
| Page | `index.html`, `styles.css`, `app.js` — static, no build step |
| Login / save | `functions/api/*` — Cloudflare Pages Functions (run on the edge) |
| Auth | HMAC-signed, expiring cookie; password checked server-side |
| Storage | Cloudflare **KV** (your edits are saved here) |

The page works **immediately** as a static site. Login and editing only switch
on once you complete the Cloudflare setup below.

## Files

```
index.html            The bio page
styles.css            Liquid-glass styling
app.js                Front-end (login, inline editing, save)
functions/_auth.js    Shared auth helpers (cookie signing/verification)
functions/api/
  login.js            POST  — verify password, set session cookie
  logout.js           POST  — clear session
  session.js          GET   — am I logged in?
  content.js          GET (public) / PUT (auth) — read & save the bio
```

## Deploy to Cloudflare Pages

### 1. Connect the repo (one time)
[Cloudflare dashboard](https://dash.cloudflare.com/) → **Workers & Pages** →
**Create** → **Pages** → **Connect to Git** → pick
`georgefarrowgreen1/georgefarrowgreen`.

Build settings:
- **Framework preset:** `None`
- **Build command:** *(leave empty)*
- **Build output directory:** `/`

Click **Save and Deploy**. Cloudflare auto-detects the `functions/` folder.

### 2. Create a KV namespace (stores your bio)
Dashboard → **Workers & Pages** → **KV** → **Create namespace**, name it e.g.
`bio`. Then in your Pages project → **Settings → Bindings → Add → KV namespace**:
- **Variable name:** `BIO_KV`  *(must be exactly this)*
- **KV namespace:** the one you just made

### 3. Set your edit password
Pages project → **Settings → Variables and Secrets → Add**:
- **Name:** `EDIT_PASSWORD`  *(must be exactly this)*
- **Value:** your chosen password
- Type: **Secret** (encrypted)

### 4. Redeploy
Settings changes need a fresh deploy to take effect: **Deployments → … →
Retry deployment** (or just push any commit).

That's it. Visit your site, click **Edit** in the footer, sign in with your
password, and edit your name, role, bio, and links inline. Hit **Save**.

## Editing

- **Edit** (footer) → sign in → fields become editable in place.
- **+ Link** adds a social/contact pill; click a pill's text while editing to
  change it, or the red × to remove it.
- **Save** writes to KV. **Sign out** ends the session.
- Sessions last 7 days. Changing `EDIT_PASSWORD` instantly logs out everyone.

## Local preview

The look works offline, but the API calls need Cloudflare's runtime. To run
Functions + KV locally, install Wrangler and:

```bash
npm install -g wrangler
wrangler pages dev . --kv BIO_KV
# then set a password for the local session:
#   EDIT_PASSWORD=test wrangler pages dev . --kv BIO_KV --binding EDIT_PASSWORD=test
```

Or just open `index.html` in a browser to preview the design (login/edit will
show a friendly "backend not set up" message).

## Security notes

- The password is **never** stored in the repo — it lives only as a Cloudflare
  secret. Don't commit it.
- Sessions are signed with HMAC-SHA256 using a key derived from the password and
  carried in an `HttpOnly; Secure; SameSite=Strict` cookie.
- Reads are public (it's a bio); only authenticated requests can write.

## Branch / deploy note

Cloudflare publishes your **production branch** (`main`) to the live URL. Pushes
to other branches create preview deployments.
