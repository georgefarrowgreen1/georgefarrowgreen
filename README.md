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
  KV) to blunt password-guessing, plus a strongly consistent D1 count of every
  try (20 per IP per 15 minutes, 100 an hour in all), so a burst of parallel
  guesses can't slip past KV's delay.
- Passkeys are tied to the password they were added under: changing
  `EDIT_PASSWORD` retires them along with every session.
- The password lives only as a Cloudflare secret; sessions are HMAC-signed in an
  `HttpOnly; Secure; SameSite=Strict` cookie.
- Passkey assertions are verified server-side (challenge, origin, RP-ID hash,
  user-presence flag, and signature).

## InFlight (/pigeon) — 1.0.0

A pigeon-post messenger at **/pigeon**: every message ("scroll") flies the real
distance between two people at 80 km/h (5 minutes to 3 days), and photos are
deleted 24 hours after they land. It is end-to-end encrypted and built for
phones, held upright.

| Part | Where |
| --- | --- |
| App (static, no build step) | `pigeon/` — `app.js`, `crypto.js`, `styles.css`, `land.js` (coastlines), `places.js` |
| Map data | `pigeon/map/world-50m.json`, `world-10m.json`: Natural Earth (public domain) land and borders, loaded only as you zoom in, self-hosted so no map provider sees anyone's route |
| API | `functions/api/pigeon/[[path]].js`, helpers in `functions/_pigeon.js` |
| Data | D1 (`DB`), tables prefixed `pg_`, created on first request |
| Photos | R2 (`BIO_R2`) under `pigeon/`, encrypted blobs only |

**Notifications.** Account → Notifications has Push (Web Push, works on
Android and desktop browsers, and on iPhone once InFlight is added to the Home
Screen) and Email (via Resend). Push is per phone; the rest is per account:
which events notify (a pigeon lands, takes off, friend requests, accepted
requests), whether names show on the lock screen, and quiet hours in the
phone's own time zone (pigeons that land then are announced when they end). They say who sent a pigeon, never what it says.
Push payloads are encrypted to each phone; the server makes its own VAPID key
on first use (stored in D1). Emails wait 10 minutes and go out at most every
half hour, with a one-click unsubscribe link. Code: `functions/_notify.js`,
`pigeon/sw.js`.

Landings are noticed on the back of normal app traffic, at most once a minute.
For notifications while nobody has the app open, set up the 5-minute nudge:

1. Make a long random string (e.g. `openssl rand -hex 32`).
2. Cloudflare → Workers & Pages → georgefarrowgreen → Settings → Variables and
   Secrets → add **`PIGEON_TICK_SECRET`** (type Secret) = that string → redeploy.
3. GitHub → this repo → Settings → Secrets and variables → Actions → New
   repository secret **`INFLIGHT_TICK_SECRET`** = the same string.

`.github/workflows/inflight-notify.yml` then calls `POST /api/pigeon/notify-tick`
every 5 minutes, via the site's `georgefarrowgreen.pages.dev` address (the custom
domain's bot protection blocks GitHub's servers). Optional: `PIGEON_CONTACT` = an email address push services can
contact about your pushes.

**Updates.** `functions/pigeon/_middleware.js` stamps every script and
stylesheet an InFlight page loads (and every module `app.js` imports) with
`?v=<fingerprint of that file>`. Pages are never cached, so a refresh always
pulls whatever changed; fingerprinted files are cached for good. Open copies
check the page's `inflight-version` when the app comes back to the screen and
every 5 minutes, and reload themselves on a new deploy, or offer an Update
button if you're mid-message.

No new setup is needed: it uses the `DB` and `BIO_R2` bindings already in
`wrangler.toml`. Optional backstop for photo deletion (the app already deletes
them itself): R2 → `bio-media` → Settings → Object lifecycle rules → delete
objects with prefix `pigeon/` after 5 days.

**Pigeons.** *Standard* (green) flies at 80 km/h and is free, but only when
it's your turn (the pigeon is on your windowsill). *Swift* (red, 2×, up to 9,
one hatching every 2h 40m), *Turbo* (black, 3×, up to 3, one every 8 hours) and
*Rocket* (gold, 9×, one a day) fly any time and each send uses one. The phone picks in the message
box; the server enforces the rules (`PIGEONS` and `loft()` in `functions/_pigeon.js`).

**Scheduled pigeons.** Tap the clock beside the pigeons in a one-to-one chat
and pick when it should *land* (this evening, tomorrow morning, or any time in
the next 30 days). The pigeon waits in your loft and takes off just in time:
`sent_at` is its take-off, `deliver_at` the time you picked, `sched` 1 until it
leaves. Until then only you can see it, and it doesn't take anyone's turn.
The tick tells the recipient when it takes off. If they move first, it
re-plans its take-off so it still lands on time. Cancelling before take-off is
free and puts the pigeon back in your loft. Scheduled pigeons must be swift,
turbo or rocket: a standard pigeon can't wait that long for its turn.

**Flight Log.** Account → Flight Log: miles flown (and how far around the world
that is), pigeons sent, received and in the air, hours in the air, the longest
flight, the fastest pigeon, the best tailwind, pigeons by kind, and how many
were lost to Pigeon Death or called back. Worked out by `functions/_stats.js`
from distances, times and kinds only; a group pigeon's destination is never
named, since it could be someone who isn't your friend.

**Replies and reactions.** Tap a message that has landed: react (❤️ 👍 😂 😮 😢
🙏) or Reply. A reply carries a quote of the original, sealed inside it; tap the
quote to jump to it. A reaction flies back on a tiny pigeon at rocket speed:
free, and it never uses anyone's turn. Reactions are sealed too (one to one with
the pair key; in a group sealed once with a key for each member), so the server
can't see which one it was. One per person per message: another replaces it,
the same again takes it back. Code: `functions/_reacts.js`, table `pg_reacts`.

**Weather.** At take-off the server asks Open-Meteo (free, no key) for the wind
at five points along each route (`functions/_weather.js`). What blows the
pigeon's way changes its cruising speed (80 km/h plus the tailwind, or minus a
headwind; between 0.6× and 1.6×), and the 5-minute and 3-day limits still apply
after it. The map card shows "Tailwind 13 mph · faster than usual"; messages in
the air say tailwind or headwind. Only points along the route are sent, never
who's flying; if the forecast doesn't answer within 2.5 s, the pigeon flies at
its usual speed. The demo uses a steady westerly instead.

**Calling a pigeon back.** Tap your own pigeon while it's in the air → Call It
Back. A swift pigeon flies after it (so it costs one): it never arrives, what it
carried is deleted from the server, and it's your turn again. The other person
sees "George called their pigeon back." In a group, only pigeons still flying
turn back; anyone who already has it keeps it.

**GIFs.** A GIF from your phone is sent as a GIF (frames, timing and looping
kept; comments and other extra blocks stripped), end-to-end encrypted like any
photo, up to 7 MB. The GIF button beside + searches GIPHY: searches and the
GIFs themselves go through this server (`functions/_gifs.js`), so GIPHY never
sees who's looking, and the one picked is sealed on the phone like any other.
GIFs stream through the server (never held whole in memory), with GIPHY's
~60 KB downsampled previews in the picker.
Needs the secret **`GIPHY_API_KEY`** (free from developers.giphy.com: create an
API app); without it the GIF button stays hidden.

**Groups.** New Message → New Group: a name and up to 11 friends (12 people in
all). A message flies to everyone at once, one pigeon each over the real
distance to each person, so it lands at different times for each of them; your
own message shows how many have landed, and its map shows every route. You can
send a standard pigeon once someone else's message has landed for you since your
last; one swift, turbo or rocket covers the whole group. Each pigeon takes its
own Pigeon Death chance and follows its person if they move. Anyone in a group
can add their own friends, rename it, mute it or leave; the last one out takes
its messages and photos with them. People in a group who aren't friends see each
other's names and pictures, never each other's locations (their routes stay off
the map). Encryption: each message is sealed once under its own random key, and
that key is sealed for each member with the pair key the sender shares with
them, so the server stores one sealed body plus a sealed key per member and can
read none of it. Code: `functions/_groups.js`; tables `pg_groups`,
`pg_group_members`, `pg_gmsgs` and `pg_gdeliv` (one row per member's pigeon);
group photos live in R2 under `pigeon-g/`.

**Pigeon Death.** Each person can turn this on in Account → Pigeons: everything
they send flies 1.25× faster, but 1 in 100 pigeons is lost. The server draws
each pigeon's fate on take-off (`lost_at`, somewhere 15–85% of the way) and
keeps it secret until then. A lost scroll is never delivered, the sender gets
their turn back and a notification, and the recipient sees it was lost.

**Moving about.** When someone's location changes by more than 5 km, every
pigeon flying to them turns in mid-air and heads from where it is to the new
spot, at its own speed (still within its 3-day limit); the turn is stored in
`pg_msgs.legs` and drawn on the map, and the sender is told (a notification
setting). Location changes are limited to 4 per 15 minutes. *Update
Automatically* (off by default) refreshes your location each time you open
InFlight, only if location permission was already given.

**Encryption.** Each phone makes an ECDH P-256 key pair. Two friends' keys give
them a shared secret, and each scroll is sealed with its own AES-256-GCM key
derived from it. Photos get a random key that travels inside the sealed scroll.
The server stores ciphertext, public keys, who is friends with whom and flight
times, never message text, photos or private keys.

**Accounts.** Email + password, plus optional passkeys. The password is
stretched on the phone (PBKDF2, 600,000 rounds): half of the result locks the
private key before it is uploaded, the other half is the sign-in proof, which
the server stores only as a hash. Passkeys that support WebAuthn's PRF extension
(iOS 18+, recent Android/Chrome) also hold their own locked copy of the key, so
they restore messages without the password. Passwords can't be reset, because
the password is what locks the key.

**Passwords and resets.** People can change their password in Roost, or tap
"Forgot your password?" to get a one-hour, single-use reset link by email. The
password locks the encryption key, so a reset keeps someone's scrolls only if
they unlock their key with a passkey; otherwise the phone makes a new key,
older scrolls stay sealed and friends see a key-change warning. Every change
signs out the account's other phones and emails a "your password was changed"
notice.

Reset emails use Resend's REST API from `functions/_pigeon.js` (no SDK
needed). In Pages → Settings → Variables and Secrets add **`RESEND_API_KEY`**
as a Secret (never in the code), then redeploy, and press **Send a test email**
on the admin page. Until a domain is verified in Resend, mail goes from Resend's
test sender `onboarding@resend.dev`, which only delivers to your own Resend
address. To email everyone else, verify georgefarrowgreen.com in Resend and add
**`PIGEON_FROM`** = `InFlight <noreply@georgefarrowgreen.com>`. Without a key
the app says reset emails aren't on yet, and the admin page can still make
links for you to send by hand.

**Admin.** `/pigeon/admin/` uses the site owner sign-in (the key icon's password
or passkey). It lists every account (name, handle, email, roost, last active,
passkeys, friends, scrolls sent) and can email a reset link, make a 24-hour
reset link to send yourself, sign someone out everywhere, or delete an account.
Admin changes need the owner cookie and a header only the admin page sends,
and every action is logged on the page. Admins never see passwords, keys or
scrolls; the server doesn't have them.

**Profiles.** In Roost → Edit profile, people can change their name any time,
their handle once a day (enforced by the server), and add or remove a profile
picture. Pictures are cropped square on the phone and shrunk to 512px JPEG,
which also strips location data. They aren't end-to-end encrypted: the server
stores them under `pigeon-avatars/` in R2 and only serves them to the owner,
their friends and anyone with a pending friend request either way. New columns
are added to the existing tables automatically on first use.

**Safety numbers.** Tap a friend's name in a chat to compare 60 digits. The app
also remembers each friend's key and warns if it changes.

**Headers.** `_headers` gives `/pigeon/*` a strict Content-Security-Policy and
is the only place on the site that allows location and passkeys.

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

### InFlight's security model

- **What the server can't see:** message text, photos and private keys. Phones
  encrypt with AES-256-GCM under keys only the two friends can derive (ECDH
  P-256). The server stores ciphertext, public keys, who's friends with whom,
  each pigeon's route, and a hash of a login proof (never the password).
- **Safety numbers** are built from your own key as your phone holds it, never
  the server's copy, and the phone warns if the server ever shows a different
  key for you. A friend's changed key is flagged, blocks sending, and isn't used
  to open their messages until you've checked it.
- **Friend requests** show the person you asked nothing of them (name or
  picture) until they say yes.
- **Location** is snapped to a 1-mile grid on the phone before it's sent, and
  only friends see it. Photos are re-encoded, which strips EXIF and GPS.
- **Limits:** no forward secrecy (each pair of friends shares one long-term
  key, so a stolen phone key or a guessed password opens past messages), and,
  like any web app, the phone runs whatever JavaScript the server serves.
  Profile pictures aren't end-to-end encrypted; only friends can fetch them.

## Branch / deploy note

Cloudflare publishes your **production branch** (`main`) to the live URL. Pushes
to other branches create preview deployments.
