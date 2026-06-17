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

**Visitors never see any edit controls, and edit mode never opens on its own.**
To open the editor as the owner, tap the **faint key icon in the top-right**. If
your session is still valid you go straight in; otherwise you'll be asked for
your passkey/password. Then:

- name, role, and bio become editable in place over the hero image.
- **Background image:** the picture icon in the edit pill uploads a full-screen
  hero background (downscaled, stored separately in KV via `/api/background`).
- **Photo:** while editing, tap the avatar to upload a picture. It's
  center-cropped, downscaled, and stored with your content (falls back to a
  monogram if none set).
- **Links:** **+ Link** opens an editor; tap any existing pill (✎) to edit its
  label/URL, reorder it (◀ ▶), or remove it. Icons for GitHub, LinkedIn, X,
  Instagram, and email are detected automatically.
- **Backup** (toolbar) → export your content as JSON, import a JSON file, or
  **restore a previous version** (the last 15 saves are kept automatically; a
  restore is itself undoable).
- **Save** writes to KV. **Sign out** ends the session.
- Sessions last 7 days. Changing `EDIT_PASSWORD` instantly logs out everyone.

## Contact form

The page has a public contact form. Wire it up to email you via
[Resend](https://resend.com) (free tier is plenty):

1. Verify your domain in Resend (add the DNS records it gives you — easy on
   Cloudflare since your DNS is there).
2. Create a Resend API key.
3. In your Pages project → **Settings → Variables and Secrets**, add:
   - `RESEND_API_KEY` — **Secret** — the key from step 2
   - `CONTACT_TO` *(optional)* — where messages go (default
     `georgefarrowgreen@icloud.com`)
   - `CONTACT_FROM` *(optional)* — verified sender, e.g.
     `Website <noreply@georgefarrowgreen.com>`
4. Redeploy.

Until `RESEND_API_KEY` is set, the form politely reports it's not configured.
Spam defenses: a hidden honeypot field + a per-IP rate limit (5/hour) in KV.

## SEO & social

- `og.png` is the social preview image; `index.html` sets Open Graph + Twitter
  card meta and a `Person` JSON-LD block (enhanced at runtime from live content).
- `robots.txt` and `sitemap.xml` point at `https://georgefarrowgreen.com/`.
- Replace `og.png` anytime — keep it 1200×630.

### Passkeys

Sign in with Face ID / Touch ID / a security key instead of typing the password.

- Sign in once with your password → toolbar **Passkeys → + Add a passkey** →
  follow the system prompt. Repeat per device.
- After that, the login dialog shows **Sign in with a passkey**.
- Manage/remove them anytime from **Passkeys** in the toolbar.
- The **password stays** as a fallback/recovery method — passkeys are added, not
  required.
- WebAuthn is implemented on Web Crypto (no dependencies); credentials live in
  KV. ES256 and RS256 keys are supported.

> **Pin the RP ID for multi-subdomain setups.** Passkeys are bound to a domain.
> Set an environment variable **`RP_ID`** = `georgefarrowgreen.com` (Pages →
> Settings → Variables and Secrets, a plain variable, not a secret) so one
> passkey works across the apex **and all subdomains** (www, etc.). When unset,
> it defaults to the exact host you visited. Note: a passkey can't be registered
> from the raw `*.pages.dev` URL once `RP_ID` is pinned to your custom domain —
> use the real domain for registering.

### Security

- Login is **rate-limited** per IP (8 failures → 15-minute lockout, tracked in
  KV) to blunt password-guessing.
- The password lives only as a Cloudflare secret; sessions are HMAC-signed in an
  `HttpOnly; Secure; SameSite=Strict` cookie.
- Passkey assertions are verified server-side (challenge, origin, RP-ID hash,
  user-presence flag, and signature).

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
