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
| Auth | Random server-side session in an HttpOnly cookie; password checked server-side |
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
   - `PIGEON_FROM` — an address on the verified domain, e.g.
     `noreply@georgefarrowgreen.com` (only its domain is used: see **Email**)
4. Redeploy.

Messages come from **Website** `<website@georgefarrowgreen.com>` in the site's
email look (below): their words as they wrote them, their address, when they
sent it, and a button to reply (a reply goes to them). With `WEB3FORMS_KEY` set
instead, Web3Forms sends them, in its own format. Until one is set, the form
politely reports it's not configured. Spam defenses: a hidden honeypot field + a
per-IP rate limit (5/hour) in KV.

## Email

Every app's email goes through one module, `functions/_email.js`, and looks the
same, each app in its own colours. An app that sends email is a **brand** there:
its name, its colours, its pictures and what's said at the foot of its emails.

| Brand | From | Colours | Its emails |
|---|---|---|---|
| `account` | **Account** `<account@…>` | indigo; a red tile for deleting | sign-ins in any app, the password, passkeys, the email address, reset links, keeping or deleting the account (`functions/_account.js` `accountMail`) |
| `inflight` | **InFlight** `<inflight@…>` | blue; an orange tile for a pigeon landed | a pigeon landed, a friend request, the week in flight (`functions/_notify.js`), the admin page's test |
| `weather` | **Weather** `<weather@…>` | Weather's sky blue; a warning's tile in its colour (yellow, amber, red) | official warnings and the morning briefing, for those signed in who turn them on (`functions/_wxpush.js`, worded by `weather/alerts.js` briefMail and warningMail) |
| `website` | **Website** `<website@…>` | the home page's periwinkle to violet | the contact form's messages, to the site's owner (`functions/api/contact.js`) |

To send one:

```js
import { emailBody, sendEmail, linkOrigin } from "./_email.js";
const { text, html } = emailBody({ brand: "weather", origin: linkOrigin(request), title: "Rain from 3pm",
  pill: ["pin", "Bristol"], lines: ["Heavy showers this afternoon.", "Take a coat."],
  rows: [["When", "15:00 to 18:00"]], button: { label: "Open Weather", url: "https://weather.georgefarrowgreen.com/" } });
await sendEmail(env, { brand: "weather", to, subject: "Rain from 3pm", text, html });
```

**The look.** A white card on the app's sky (a night sky in dark mode). At its
top one picture: the email's own tile (`icon`: a shield, a key, a red bin, an
orange pigeon, …; else the app's usual one) with the app's icon as a badge on its
corner. Then the title; a pill (`pill: [symbol, words]`) with the one thing to see
at a glance (the device and place of a sign-in, the address, the day it'll be
deleted); what happened, then, quieter, what to do (`lines`); someone's own words
as they wrote them (`quote`); a notice in its own colour (`notice: { tone, lead,
text }`, yellow, amber or red: a warning in force); a strip of a few columns on the
app's own colour (`strip: [[what, picture, big, small], …]`: the morning,
afternoon and evening); the details as a list, a symbol on each row (`rows:
[what, value, symbol?]`, the symbol found from what it is when not given); one
button, with its address under it for a web link; and at the foot the app's own
words (the account's: "About your georgefarrowgreen.com account" and a link to
it), why it came (`footer`) and a way to turn them off (`unsub`). Tables and
inline styles, so it holds up in Gmail and Outlook, which show flat colours where
gradients aren't drawn. Every email has a plain-text version too.

**The pictures** are PNGs in `mail/`, served from the site's own address so they
show in any app's email: `<brand>-<tile>.png`, the tile and the badge drawn as one
with a ring cut out round the badge (so mail apps that can't place one thing on
another still show it whole, light or dark), `g-<brand>-<symbol>.png`, the
symbols in the app's colour (and any of its own, `art.syms`), `g-warn-<tone>.png`
for a notice, and `wx-<icon>.png`, the weather as Weather draws it
(`weather/icons.js`), for a strip. `node .tools/tests/mailicons.mjs` draws them all from
the brands (the tiles' gradients, the badge, the symbols' colour are each brand's
`art`). The first emails' pictures stay in `pigeon/mail/`, and the old address of
these, `pigeon/mail/v2/`, sends to `mail/`, so emails already sent keep theirs.

**A new app** is a new entry in `BRANDS` (its name, which is also its address;
its colours; its icon and tiles), then `node .tools/tests/mailicons.mjs`. The unit
tests check every brand's pictures are drawn.

**Sending.** Resend's REST API (no SDK). In Pages → Settings → Variables and
Secrets add **`RESEND_API_KEY`** as a Secret (never in the code), then redeploy.
Until a domain is verified in Resend, mail goes from Resend's test sender
`onboarding@resend.dev`, which only delivers to your own Resend address. To email
everyone else, verify georgefarrowgreen.com in Resend and add **`PIGEON_FROM`** =
`noreply@georgefarrowgreen.com` (a name with it is fine: only its domain is used;
`CONTACT_FROM`'s, if that's the one set). Each brand sends from its own address on
that domain; Resend sends from any address on a verified domain, so there's
nothing to add there. Separate addresses let a mail app show each its own picture:
Apple Mail shows a sender's logo through Apple Business's Branded Mail (free; the
organisation verified by Apple, a logo per address, and DMARC at `p=quarantine`
or `p=reject` with `pct=100`, which georgefarrowgreen.com has).

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
- The password lives only as a Cloudflare secret; sessions are random tokens in
  an `HttpOnly; Secure; SameSite=Strict` cookie, kept server-side.
- Passkey assertions are verified server-side (challenge, origin, RP-ID hash,
  user-presence flag, and signature).

## Your account (account.georgefarrowgreen.com)

One page for the georgefarrowgreen.com account every app on the site signs in with (`account/`, served at the
address's root by `functions/_acctapp.js`; its API is `/api/account/`, `functions/api/account/[[path]].js`, answered
only there). Always the latest, however it's opened (an app's in-app browser included): the page is never kept
(no-store), its script and styles are stamped with what's in them (`app.js?v=…`, kept for good only when they match),
and a page the browser brings back from its back-forward cache is opened afresh. In keeping with the apps: iOS 27's Liquid Glass (panels of glass with a bright rim, blurred enough to read
over anything) over a night-sky gradient with slow light drifting over it (a dawn sky in light mode); grouped
lists as Settings has them; a large title that scrolls with the page (glass behind the status bar once it's under it); sheets that come up from below
(swipe one down by its top, or Esc) while the page steps back; and everything rising into place. Still with Reduce
Motion, solid with Reduce Transparency.

- **Its icon** (`account/icon.svg`, with PNGs at 180, 192 and 512 and a maskable one for Android) is made as Weather's
  is: a flat indigo sky (the page's own night sky, at dusk), a flat warm head where Weather has its sun, and frosted
  glass shoulders where Weather has its cloud, the head showing softly through them, with the same fine light rim and
  faint shadow. It's the mark at the top of the page where you sign in, join, or carry on from an app.
- **Signed out:** under "Your account" (and "One sign-in for InFlight and Weather", with their icons), sign in with a
  passkey (the site's: one made in any app works here) or your email and password
  (stretched on the device as everywhere on the site; the password never leaves it), with **Forgot password?** under
  them. Under that, how a new account's made: **Create your account** where one can be (with an invite, or on a test
  server), else plainly "New here? Accounts are by invitation: open the link you were sent to make yours". Every app on the site signs in the same way, in the same order and words: a passkey first, then "or with your
  email", the form, **Forgot password?**, and **New here? Create your account**, both of which open this page.
- **Accounts are made here, and only here** (`#join`; `functions/_join.js` makeAccount, `POST /api/account/signup`).
  No app makes one: InFlight's old sign-up answers 410, and its invite links (`#invite=`) are passed on to this page.
  Name, handle (suggested from the name, and checked as it's typed), email and password (its strength, and whether it's
  in a data breach, said as it's typed). The slow parts start while it's typed: the InFlight key pair is made here and
  locked with the password before it's sent, so the server only ever has it locked. By invite, as before: a one-time
  link from the site's owner (InFlight's admin page makes them, now pointing here), carried in the address's `#` and
  sent in the body, never the URL; without one, the page says accounts are by invitation. Made, it's signed in at once
  and the confirm email sent; InFlight then opens with **Continue as**, and only needs the password to unlock the key.
- **Forgot password** (`#forgot`): a one-hour, one-time link by email (the same answer, in the same time, whether
  there's an account or not; at most 3 an hour and 10 a day to an address, wherever they're asked from). The link
  (`#reset=`, InFlight's older ones passed on here) says who it's for (the email half hidden) and asks for a new
  password. With a passkey that holds a copy of the InFlight key (one made in InFlight, which can), **Keep messages
  with passkey** unlocks the key here and locks it anew; otherwise, or by choice, **Start fresh**: a new key, friends
  kept, older messages sealed. Either way every sign-in and passkey ends, a pending email change is called off, and
  this browser's signed in.
- **Opened from an app** (a code handed over, as below): who it's for is said first (**Continue as Rowan**, or **Not
  you? Sign in**) and nothing's signed in until that's said yes to, so a page elsewhere can't send the browser here to
  sign it in to an account of its own. Where another account's signed in already, it stays (said, and refused by the
  server too, 409).
- **Signed in:** your profile (photo, name, handle, email) with **Edit profile** and **Your code**; tap the photo (its
  camera badge) to pick a new one straight away. **Your apps**
  (a card for each); **Sign-in and security** (starting with the **Security check-up**, below), **Preferences**, **Your data**, **Sign out** (of every app on the site, in
  this browser; not when an app opened the page in its own window: signing out is the app's own) and **Delete account**. Each row says how things are, not what to do: the check-up "2 to do" and an
  unconfirmed email in amber, the password "Set today" or "Changed 3 Oct" (`pg_users.pw_at`, kept from now on, and for
  accounts from before as far back as recent activity goes), passkeys **Add one** where there are none, devices "This
  iPhone" where it's the only one, recent activity when the latest was. Once the profile's scrolled away, a bar of
  glass at the top keeps your photo and name in sight (a tap goes back up). On a wide screen (1000 pixels and up), two
  even columns: your profile, your apps and your data on the left, sign-in and security and preferences on the right.
- **Security check-up:** a row at the top of Sign-in and security that says how it stands ("All done", or "2 to do"
  with an amber icon), kept off the page itself. Tapped, a sheet: a ring for how far along, then four checks (email
  confirmed, a passkey saved, the password not in a known data breach, no devices left unused for 3 months), each one
  left with its fix, which opens over the check-up (Back returns to it). A password found in a data breach is the one
  check also said up top, in a banner with **Change**, as an unconfirmed email is.
- **Your code:** a QR code of the link that adds you in InFlight (`#add=handle`, drawn by InFlight's own `pigeon/qr.js`,
  shared here as `/qr.js`), for a friend's camera, with **Share** (where the browser has a share sheet) and **Copy link**.
- **Your apps:** each card says what you have there ("4 friends · 9 sent", "6 places in your passport"; "4 places",
  "Alerts on") with **Open** to go to it; its ⓘ opens a sheet of what that app keeps of yours. InFlight: how many
  friends, pigeons sent (as its log counts them: one to one, each of a group pigeon's, and those whose messages have
  gone after a month), places in your passport and groups; counts only, as its letters are end-to-end encrypted.
  Weather: its saved places (the first few by name), its notifications (how many places, and the morning brief) and
  units.
- **Email.** Not confirmed: a banner up top sends a confirm link (the same one InFlight sends, said as the account's).
  A new email: a link to it (good for 2 days) and a word to the old one (the new one half hidden); nothing changes until
  the link's opened, then the old one's told. The links open the page (`#confirm=`, `#email=`, `#keep=`): their token is
  what counts, so they work signed in or not, in whichever browser the email opens them in.
- **Password.** A new one: the old one's proof gets the key it locks, which the page unlocks and locks anew with the new
  one, so nothing locked changes hands; a password from a data breach is said as it's typed (Pwned Passwords, only the
  first 5 characters of its SHA-1 asked); every other device is signed out. **Checked against data breaches** from the
  check-up, or quietly whenever it's typed here (signing in, showing it's you): how it went is kept with its proof
  (`pg_users.pw_leaked`, `pw_checked_at`), so only someone who knows it can say. A password changed in InFlight counts
  as checked (InFlight won't take one from a breach).
- **Passkeys:** each with a name of your own (tap it to change it, or take it away) and where it's saved (iCloud
  Keychain, Google Password Manager, 1Password and so on, from the AAGUID in the authenticator data a new one comes with:
  `functions/_activity.js` providerOf; InFlight sends it too now). Signed in here with a password, with no passkey yet,
  on a device that can make one (Face ID, Touch ID, Windows Hello: it asks the browser), a sheet offers one, at most
  once a month on that device.
- **Signed-in devices:** each with where and when; those unused for 3 months are marked, with **Sign out N unused
  devices**, as well as one at a time or all the others. On a touch screen a device's row slides left to show
  **Sign out**, and a passkey's to show **Remove**, as lists do on a phone (the buttons stay, for a keyboard).
- **Recent activity:** the last 30 days, by day: sign-ins (and how), a new password or reset, passkeys added and taken
  away, devices signed out, the email confirmed or changed, the data downloaded, a deletion asked for or called off; each
  with the app it was in, the device and roughly where (`pg_events`, kept 30 days; noted from InFlight's own sign-in and
  security too), each on one line with its time on the right and the app it happened in on its icon, where most of a
  day's happened said once by the day; **All**, **Sign-ins** or **Changes**. A password sign-in from another device or
  place has **Not you?**: it signs every other device out, then asks for a new password. Passkey sign-ins don't, as a
  passkey needs your own device.
- **Preferences, for every app on the site that has them:** **Appearance** (Automatic, Light, Dark): this page and
  InFlight, which already kept it with the account (InFlight now keeps it only once it's been chosen, not its default).
  **Units** (temperature, wind, rain, pressure, time; °C, mph, mm, hPa and 24-hour until chosen): Weather's, kept in
  its record for the account so every device it's signed in on takes them up, and its notifications say them at once.
  **Emails**: what each app emails you, each from its own address: the account's, about sign-ins and security, always;
  InFlight's notifications by email, on or off here as in its own Notifications (`pg_users.notify_email`, through
  `PUT /api/account/prefs`); Weather's warnings and morning briefing by email, a switch each, kept with Weather's own
  choices (`functions/_wxacct.js` setMail), for the places and time chosen in its Notifications (said under each). The
  row says "All on", "Security only", or which apps email.
- **Your data:** everything kept with the account that can be read: the profile and photo, sign-in and recent
  activity; InFlight's friends, groups, passport, birds, settings, and how many pigeons sent and had (as its log counts
  them); Weather's places, settings and notifications. InFlight's letters aren't in it: they're end-to-end encrypted,
  with keys only your phones have. **As a PDF** to read and keep: A4, your profile up top, then each part as rows and
  tables, page numbers at the foot. It's written in the browser from what the export gives, with no library
  (`account/pdf.js` writes the file, `account/datapdf.js` sets it out): the text is Helvetica, which every PDF reader
  has, so nothing's embedded and it stays text you can select and search; anything Helvetica can't show (a Polish place
  name, another alphabet, an emoji in a name) is drawn as a picture of itself by the page's canvas. **Or as JSON**, the
  same data in a form other apps can read.
- **Deleting the account** (typed to confirm) signs it out everywhere and deletes it in 7 days, with an email to keep it.
  Until then no app will sign in to it (they say where to keep it); this page will, to show **Keep my account**; and the
  email's link keeps it too. A week on, the once-a-minute tick's housekeeping deletes it (`functions/_retention.js`
  dueDeletions). (InFlight's own Delete Account, in the app, still deletes at once.)
- **Keeping up:** the page looks again when you come back to it (and every minute while it's open), so a device
  signed out elsewhere, or a change made in another app, shows without a reload.
- What could hurt if someone had only your sign-in (a passkey added or taken away, a device signed out, a new email,
  your data, the account deleted) asks you to show it's you first if you last did more than 10 minutes ago (a passkey or
  your password), then carries on with what you were doing. Changes to the password, passkeys and email are emailed to
  the account, from **Account** (account@georgefarrowgreen.com), with its icon at the top;
  so is every sign-in, saying which app it was in (InFlight, Weather or this page), with **Review your account**.
- The page acts only with the site's sign-in (the HttpOnly cookie, never in the page's reach), and only from its own
  address: anything that changes something is refused from any other page, the apps' included. Its rules allow
  nothing inline and no framing. A few files are the site's, shared: the password stretching (`pigeon/crypto.js`,
  `argon2.js`) and the apps' icons.
- Weather's account card and InFlight's Edit Profile and Your Account open it, signed in (a code handed over, and said
  yes to), with the way back to the app.
- Tests: `.tools/tests/acctpage.mjs` (71 checks: an account made here, then signed in to InFlight, the check-up, the email confirmed and changed
  by its links, the password checked, the profile and photo, a new password that InFlight then opens with on a new
  phone, passkeys renamed, added after showing it's you and taken away, a device unused for months signed out and the
  other page noticing, recent activity, appearance and units, the data file, signing in both ways, light mode and a wide
  screen, deleting in 7 days and keeping it both ways, then gone; the API only here and only from here),
  `.tools/tests/acctmore.mjs` (66 checks: the photo from its badge, your code and its link, each app's sheet and its
  counts, the passkey offer only where one can be made, the check-up's row and sheet (a fix opened over it, Back to it, a leaked password's banner), "Not you?" only on another
  device's password sign-in, rows slid to sign out and remove, two columns on a wide screen; your data as a PDF, read
  back by poppler and pypdf, and as JSON), `.tools/tests/acctjoin.mjs` (30 checks: accounts by invite only: none without one,
  InFlight's invite link passed on, the account made, the invite used up and refused again; InFlight's and Weather's
  sign-in in the same order and words, a new account and a forgotten password only here; a reset link by email,
  passed on from InFlight's older address, keeping the key with a passkey, then starting fresh, the old password
  refused), `.tools/tests/acctlink.mjs` (23 checks: the hand-off code: said yes to first, once, for a minute, only here, and never
  over another account's sign-in), `unit/pdf.test.mjs` (the PDF writer: Windows Latin 1, Helvetica's widths,
  wrapping, every object where the cross-reference table says) and `unit/activity.test.mjs` (passkey providers).

**Set up (once):** in Cloudflare Pages → the project → Custom domains, add `account.georgefarrowgreen.com`. Nothing
else: it's the same deployment, routed by its address.

## Weather (weather.georgefarrowgreen.com)

A forecast that explains itself, in `weather/`: no build step, no keys, no
database. Your phone asks [Open-Meteo](https://open-meteo.com/) (free, CC BY
4.0) for the forecast and works the insights out itself (`weather/insights.js`),
so there's nothing to set up beyond the address.

**What it tells you**

- **A briefing** for the next day or so, in words ("Cloudy until about 16:00,
  then rain until around 20:00. High 14°"), its first sentence (what's coming)
  in bold, and each day of the fortnight described part by part (morning,
  afternoon, evening, overnight).
- **The next four hours**, by the quarter hour: rain starting or stopping, how
  long it lasts and how heavy, charted as light, moderate or heavy (those words in a margin of their own at
  the chart's end, so no column runs under them; the amounts are in the readout
  as you touch it). Where there's radar (RainViewer's
  coverage), the radar leads: the rain on it carried along its own track and
  read over a circle about the place that widens the further ahead (about 2 km
  across now, 20 km two hours on), the radar's alone for the first half hour,
  giving way to the models' 15-minute rain by two hours on (`rainmap.js` along
  and blend; the radar card's tiles, so the card then has them to hand). Rain it
  sees coming that the hourly forecast doesn't have is in the briefing too.
  While the radar's leading, the card says so (Radar, by its title), and each
  quarter it leads says so in its readout.
- **Official warnings**, from the place's own weather service: the Met
  Office's for the UK, and those of the other European services that draw
  their warnings' areas (Norway, Sweden, Switzerland, Slovenia, Estonia,
  Iceland, Israel, Ukraine, Latvia, now and then the Netherlands), through
  MeteoAlarm (EUMETNET's feeds, CC BY 4.0); the National Weather Service's in
  the US. Each a card in its colour (yellow, amber or orange, red) saying who
  issued it and when, with the whole of it a tap away (what to expect, the
  details, what to do, the issuer's own page), and in the morning briefing
  ("Met Office: yellow wind warning until 18:00."). Only warnings yellow and
  up, in force or to come, and not since replaced. Elsewhere none: the other
  services name regions only by code, and MeteoAlarm keeps the map of those to
  registered users. In England, the Environment Agency's **flood warnings**
  too (its real-time flood-monitoring API, Open Government Licence): flood
  alerts yellow, flood warnings amber, severe flood warnings red, each for
  its own flood area, shown where the place is in that area or within 3 km of
  it (the areas' outlines kept a week). They have no end time, so they're in
  force while the Agency lists them (the phone lets one go if it hasn't heard
  of it for 12 hours). Scotland's and Wales's services offer no open feed.
- **Warnings** worked out from the forecast: thunderstorms, heavy rain, gales,
  snow, icy patches (freezing on wet ground), frost and ground frost (clear,
  calm, cold nights), fog, heat and warm nights, bitter cold, high UV (with how
  long fair skin takes to burn), poor air and high pollen. Where an official
  warning (in force, or starting within a day and a half) says the same, the
  app's own stands aside. Once the place's thirty years are in, the bars suit
  it: hot is also as hot as the warmest tenth of its summer days (very hot, the
  warmest hundredth), a warm night the warmest tenth of its summer nights,
  bitter cold the coldest tenth of its winter nights, and heavy rain its wettest
  hundredth of days, never short of the fixed bars (27° and 32° feeling like,
  20°, −5°, 25 mm) that are hard on anyone; and frost isn't a warning where
  nearly every night freezes at the time of year (`climate.js` extremes).
- The app's own insights (warnings aside, which have cards of their own) are in
  one card, **Highlights**, near the top (under the next four hours, as iOS
  27's Weather has its own): the first three as rows, each its title and a short line of its own
  that fits beside its icon on a phone ("Rain this afternoon (82%)", "18°:
  warmer than 99% of days"), rather than the start of all it says cut off; a
  tap opens a row to the whole of it, and closes it again, with a way on to its
  day ("Monday in full") or the hours it's about ("Rain, hour by hour"); the
  others under "N more". A warning's title opens the same.
- **Tips**: whether to take an umbrella (by the chance of rain at some point
  while you're up and about, counted across the ensembles' runs: over a whole
  day it can be well above any one hour's chance), what to wear (from the
  feels-like range of your waking hours, with wind and rain), and your weekday
  commute (Settings).
- **How sure the forecast is**, day by day: seven global models side by side
  (ECMWF, Met Office, GFS, ICON, Météo-France, GEM, and ECMWF's AI model, AIFS)
  and five ensembles pooled: ECMWF's (51 runs), ICON's (40), GFS's (31) and the
  Met Office's global (18) and 2 km UK one (3 here, over the UK only), each
  system an equal say whatever its number of runs (the UK one half), so one
  system's 51 runs don't drown the rest; each drops out where it stops (ICON
  at about a week, the UK one at about six days). Days the models disagree on
  (each one's usual lean here taken off first, where the record has it, so one
  that always runs cold isn't taken for disagreeing) are marked uncertain, with
  why; the temperature chart shades how far it could
  go either way. The 16 days show the first ten (the last three of them under
  "Less certain"), and the rest under "Show 6 more days". As in iOS 27's
  Weather, Temp / Rain / Wind changes the days as well as the 48 hours (either
  card's switch, kept in step): by rain, each day shows when it falls, an hour a
  bar, with its chance and how much; by wind, its wind as a line with the gusts
  a band above it, on one scale for all the days. Until you choose, it follows
  the weather: rain if it's raining or due within the hour, wind in a gale. By
  rain, the 48 hours' chart says how much each spell brings over its wettest
  hour, clear of every column (the wettest first, where there isn't room for
  them all).
- **This time of year**: thirty years of the place's own days (ERA5-Land, with
  ERA5 where it has none: one consistent record, through Open-Meteo's archive;
  asked for once you've stayed on a place a few seconds) put each forecast in
  context: the normal high and low,
  how unusual a day is (its percentile), near-record warmth or cold, a wet or dry
  week against normal, this day last year.
- **Best times** in the next two days for your activities, each with its own
  limits you can change (Settings → Best times): run, walk and ride to start
  with, and golf, sailing (which needs some wind), gardening, tennis, hiking, a
  barbecue, an outdoor swim or anything you add: a feels-like range, wind
  (at least and at most), gusts, whether light rain is fine, how long, and
  between which hours. By the sea, a swim goes by the water's warmth and its
  waves too ("sea 14°"), and sailing by the waves ("waves 1.2 m"). Each with the chance the whole stretch stays dry
  ("80% chance it stays dry"): the share of the ensembles' runs dry throughout,
  each system that reaches through the stretch by its say (`data.js` keeps
  which are wet each hour), which a longer stretch has less of
  than any one hour does, and which its score goes by. Plus drying washing
  outside (dry hours, thirsty air, a breeze, sun), stargazing (dark, clear, the
  Moon out of the way) and a colourful sunset or sunrise (high and mid cloud, no
  low cloud in the way). Those worth it are tiles (two to a row, an odd one out at the end across
  the row); those that aren't today or
  tomorrow are named in a line under them ("Not looking good: Stargazing"),
  which a tap opens to show them too, faded.
- **Rain radar** (playing from now through the next two hours, again and
  again: the hours gone are a drag back; "No rain nearby" on the map when
  there's none about): the last two hours of radar, every 10 minutes, from
  RainViewer's free mosaic of the world's radars, then the next two hours as
  the latest radar carried on along its own track (how the rain's moving from
  the last 20 minutes of radar around the place, lined up block by block;
  every 10 minutes ahead, fading the further it goes, marked Forecast); where
  there's no track to follow (no radar there, or too little rain to tell), the
  weather models' rain instead (Open-Meteo's 15-minute rain on a 9 × 9 grid
  about 220 km across, blended and painted in the radar's own colours, inside
  a dashed box; asked for only when rain's expected there soon, or there's rain about on the radar; dry all
  about, the latest radar held, so the next two hours are always there), animated on one
  timeline marked Now, to the minute: Now is the clock's own time (kept to it while the map's on screen), where it
  opens; the radar comes 5 to 15 minutes behind, so its latest frame sits a little before Now, said as such and how
  long ago ("06:50 · 11 min ago · latest radar"), carried on along its track up to Now (if it's more than 20
  minutes behind, those minutes are said to be estimated); after Now, "in 25 min · forecast". The slider moves a
  minute at a time (Page Up and Page Down from frame to frame and to Now, a tick under each of the radar's own),
  and play runs on smoothly (about 30 pictures a second, for the
  battery's sake). Between two frames of the radar, each is moved along the rain's track between those two (each
  pair's own, steadied with the pairs either side) and blended into the other as rain, not as colour: each
  frame's tiles are kept as rain (how much of each pixel it covers, its strength, whether it's snow:
  `rainmap.js` rainValues), so a heavy core easing between frames goes through the radar's own colours rather
  than a muddy mix of yellow and blue; the graphics chip does the blending and the colouring (`radarmix.js`,
  WebGL 1), drawn on one canvas over the tiles in sight (a layer under the names). After the latest frame, it's
  carried on to the minute, fading a little the further ahead; the models' quarter hours are blended
  (`rainmap.js` partsAt). Each frame's tiles are drawn once and kept (those a picture's drawing never let go,
  those of other zooms first), with the tiles a minute or a frame on asked for ahead, and, once the map's still, the
  rest of the frames for what's in sight (nearest in time first) and the frame on show a zoom out, so play, a drag
  along the timeline or a pinch out finds them waiting. Where they aren't in yet, the last picture's held till they
  are, then faded into (zoomed far out, the nearest frame as it is); a jump (play coming round to the start, Page Up
  or Down) fades from one picture to the next rather than cutting (where there's no graphics chip to hand, the same
  blend drawn as pictures). The minutes between are estimates: the radar itself comes every 10 minutes, the models' every 15. It looks
  as Apple's Weather map does. The rain in its colours (`rainmap.js` SHADES, sampled from Apple's own legend): light
  rain a see-through blue, moderate violet, through mauve and tan into heavy's yellow, extreme a pale yellow, snow in
  cyans to teal (RainViewer's Universal Blue, from their published table, is only for reading their tiles back into
  rain; rain rate to reflectivity by Marshall and Palmer). The map, OpenFreeMap's vector map of OpenStreetMap (the
  OpenMapTiles schema) drawn on the phone by MapLibre GL JS, light or dark as the phone is: by day near-white land
  and a pale grey-blue sea, roads in light greys and the names dark; at night land in a quiet grey and the sea a deep
  blue, the names crisp and white; either way the lie of the land faintly shaded (Natural Earth's relief), roads a
  whisper, borders on land only, the names drawn above the rain so they read through it (and stepping aside from the
  place's bubble and its name, however long, and from the buttons, scale and credits over the map, rather than hiding under them, as the map
  moves too). The place is marked as Apple marks it: its temperature and sky in a bubble the colour of how warm it is,
  pointing to a dot, its name ("My Location") under it. Where a phone can't draw the vector map (no WebGL 2), the
  radar's on OpenStreetMap's own map instead (Leaflet), toned to match, with the same controls; either is driven the
  same way (`mapgl.js`, `mapleaf.js`). Closer in than
  the radar's tiles go, it's smoothed rather than drawn as squares: each pixel's
  colour read back into reflectivity, blended with a cubic B-spline (curved
  edges, colours that flow between bands) and recoloured, the frame on show first,
  off the page's own thread (up to three workers, `weather/radarwork.js`, so the map keeps moving under a finger
  meanwhile; on the page a few tiles at a time where there are none), each tile's radar stitched into one block so
  the smoothing reads it straight through (`rainmap.js` decode, ramp, resample, rainValues). The radar
  is asked for in 512-pixel tiles a zoom out, which carry the same detail in a
  quarter of the requests; a tile that doesn't come is asked for again. A line above it
  says what's coming ("Rain starting in about 40 min"); under it, the dock: play, what's on show over its day and
  time ("Latest radar · Wednesday 08:50 · 3 min ago", "Forecast · Wednesday 09:30 · in 37 min"), and the timeline,
  filled to where it is, a tick at each real frame, the clock under it (Now, and the hours, the half hours where
  there's room); then a legend (Light, Moderate, Heavy, Extreme, and Snow). On the map, in glass at its top right,
  zoom in and out (opening close in, about 10 miles to the scale's bar, two steps from as close as the radar's worth
  seeing) and a button back to the place; a scale drawn as Maps draws it, and the map's credits in full as it first
  appears (in two lines), then folded into a © that opens the Credits window (folding over the map
  without moving anything on it). On
  a phone a tap opens it full screen to pan and pinch (the page scrolls past it
  otherwise), which "Tap to explore" says at the map's foot, between the scale
  and the ©, once the credits have folded away. Full screen, as Apple's: the map to every edge, an × at the top left,
  the legend in a panel under it, and the dock in glass at the foot.
  MapLibre GL JS 6.12.0 and Leaflet 1.9.4 are vendored in `weather/vendor/`
  (each checked against npm's integrity hash); MapLibre's megabyte is fetched as
  the card comes within a screen of view, and the map made once it's in view
  (each once the page has come to rest, not in the middle of a flick, and the map
  only if it's still in sight then; the vector map fading in once the country's
  drawn); it holds still under a sheet; with reduced motion it doesn't play by itself (`weather/radar.js`, `weather/mapgl.js`,
  `weather/mapstyle.js`, `weather/mapleaf.js`, `weather/rainmap.js`).
  **Its layers**, as Apple's Weather map has them (the button under its zoom; kept as chosen): the rain, the
  **temperature**, the **wind**, the **air quality** or the **UV index**, the first two (and the UV index, in the same
  request) from Open-Meteo's models over a grid of their
  own (11 × 11 places about 750 km across, by the hour from two hours ago to twelve on, eased between the hours;
  asked for once a half hour), the UV index in the WHO's bands and colours (low green, moderate yellow, high orange,
  very high red, extreme violet; a reading says "UV 6, high"), the air quality (the European index, as the page says it, in the European Environment
  Agency's colours, good to extremely poor) from Open-Meteo's air quality service over the same grid; the temperature
  also over a finer grid about the place (13 × 13, about 18 km apart: the lie of the land shows in it, the fells
  cooler than the coast), drawn over the region's and fading into it at its edges,
  the map opening out to the region for them and back in again for the rain. The temperature's colours run from
  purple through green to red; the wind's a blue that pales the stronger it is, and over it the wind **flows**:
  specks carried along it on the screen, each with a trail that tapers, brighter the stronger, kept clear of the
  place's bubble, and held while a sheet's up or the map's out of sight (with reduced motion, still arrows instead);
  on the vector map, drawn into the map itself under its names, so they stay readable.
  The place's bubble follows the layer: the temperature there at the time on show, in its colour; or which way the
  wind's from and how strong ("WSW 14 MPH"). Each has its legend in round values in the units chosen ("Wind (mph)",
  0 to 75) and its own timeline, a tick each hour. The wind's has a choice of **Wind or Gusts** beside its colours
  (kept as chosen): the colours, the flow, the bubble and the words all of the one chosen.
  **The rain on to twelve hours ahead**: after the next two hours, the models' rain by the hour (Open-Meteo's, on the
  radar's 9 × 9 grid, asked for once a half hour), the radar or the models' quarter hours faded into the first of
  them, then hour into hour; the timeline a step a minute up to there and a step every three minutes after, so the
  radar's minutes keep their room on it (ticks each hour, the clock every few hours), played an hour every 0.6 s.
  **The other saved places** are on the map too, each a small bubble with the layer's say there (its temperature now,
  as the list of places has it, on the rain; the models' temperature or wind at the time on show on the others) and
  its name under it, the map's own names stepping aside from them; a tap on one goes to it. **A tap anywhere** (full
  screen, or with a mouse) reads the weather there at the time on show ("Moderate rain", read back from the radar as
  it's drawn; "12°"; "SW 18 mph"), and the warning it's in, in a label at the spot that follows the timeline; a tap
  on it puts it away. **Official warnings' areas** are drawn on it in their colours while they're in force at the time
  on show, where their services draw them (MeteoAlarm's feeds, the National Weather Service's alerts with a drawn
  area, the Environment Agency's flood areas): the server sends each outline made light for the map (points that
  hardly change its shape left out, no more than 120 a ring, to 3 decimal places); one starting within a day and a
  half of the time on show is drawn dashed till then, and a tap in it says when it starts ("Yellow wind warning from
  Friday 10:00"). The reading keeps clear of the place's own bubble and name: beside its spot, or under it, where over
  it would cover them. The saved places never opened on this phone have their weather now asked for together (one
  request, once a half hour at most), so each has its bubble, and the list of places its temperature. On a phone the
  card shows the layers button alone (a tap there opens the map full screen, with all its buttons), and the rain's
  timeline marks where the models' hours begin ("Hourly").
- **Forecast accuracy here, and a forecast tuned by it** (the card only where
  there's an airport near enough to check against): the server collects
  the nearest airport's weather reports (METAR, within 40 km; the Aviation
  Weather Center gives at most 400 reports at a time, about a week at a big
  airport, so each day's high and low, and its hours (temperature, dew point,
  wind, gusts), are kept in
  D1, `wx_obs`, for six weeks: each day the airport's own, whoever asks, and
  only reports just fetched are written), and the phone compares them with what each of
  the seven models forecast a day and three days ahead (Open-Meteo's archive of
  past forecasts). The card shows each model's average error and lean ("±0.8°,
  runs 1.2° warm") and which is most accurate here. From 7 days of record, the
  highs and lows from tomorrow on are tuned: each model's usual error taken
  off, the closest counting most (ECMWF's AI model among them: its hours come
  6-hourly, so its daily highs and lows run flat, and it counts for as little
  as its record here earns), and the hours with them, so a day's chart
  peaks at its tuned high (each hour moved by a share of the corrections to the
  highs and lows either side of it; the ensemble's likely range moved as far).
  From 5 days of record, the hours from now on are tuned too, against what the
  forecast the page shows had said a day ahead, hour by hour: each time of day's
  usual error off the temperature (three-hour blocks; on days the highs and
  lows aren't tuned), the dew point's (the humidity worked out again), and the
  wind and gusts in proportion, each eased towards none on a short record and
  kept within bounds, and eased in over the next three hours from what it's
  like now; the card says what ("Also tuned here: nights 0.7° cooler, wind 17%
  stronger") (`weather/skill.js` localSkill and refine; Settings can turn all
  of it off).
- **Steadier days ahead**: a day three or more days off can swing from one
  run of the models to the next. Its high and low are what the page says of it
  now blended with what it said of it a day and two days ago, now counting most
  (60/30/10 for three and four days off, 50/30/20 beyond), its hours moving with
  them. Open-Meteo's archive of past runs only reaches the hours just ahead, so
  the phone keeps its own: what the page said of the next 11 days, before this
  steadying (so it doesn't feed on itself), the latest of every three hours for
  three days (`weather/skill.js` steady, `app.js` keepSaid).
- **One rain story**: the rain is told the same everywhere. The first hours
  are the next four hours' (their rain and weather from the quarter hours, and
  where the radar leads, their chance too); every other hour's chance is the
  pooled ensembles' (the share of runs with 0.2 mm or more in it); and a day's
  chance, or a part of a day's, is of rain at some point in it, counted run by
  run as the umbrella's and the best times' are (today's from now on), rather
  than its wettest hour's: so on a showery day it's higher than any one hour's
  (`weather/agree.js`, `insights.js` rainChance). The weather now (the top of
  the page, its sky, the hours' first) is raining or not as the next four hours
  have it, so it never says "Overcast" over a card saying the rain stops in 25
  minutes; and the hour now's in, partly gone, is wet if what's left of it is.
- **Notifications** (Settings → Notifications: rain alerts and official warnings
  for each saved place, a Rain and a Warnings button on each place's row, and the
  briefing for the place you choose; signed in, the account's choices, sent to
  every device signed in to it that has notifications on; until
  they're on, a word about them on the page, once, put away for a month with
  "Not now"): a
  heads-up when rain is about to start within the hour ("Rain in about 20 min",
  not between 22:00 and 07:00, not twice in three hours; where there's radar,
  timed by it just as the app's next hours are: the server reads RainViewer's
  tiles itself, with no canvas there to draw them into (`functions/_png.js`, its
  own PNG reader, which reads only as far as an image says it goes), and works
  the rain out the same way, `weather/rainmap.js` radarAt, each tile once a tick
  however many phones are under it, for at most 40 places a tick,
  `functions/_wxradar.js`), and a morning
  briefing at a time you choose (the day in a sentence, any warnings, whether
  to take an umbrella; any quarter hour, said as your clock's set, 07:00 or 7am,
  as the commute check's times are), and **official warnings** as they're issued
  for the place ("Amber wind warning", or "Raised to amber: …" when one's
  raised; each once, a yellow one not overnight, amber and red at any hour; what
  was in force when they were turned on isn't sent, as it's already on the page). Sent with Web Push, encrypted to the phone, worded by
  the app's own code (`weather/alerts.js`) so a notification says what the app
  would. On iPhone and iPad, add Weather to the Home Screen first. Turning them
  on sends a first one ("Notifications on"), and the phone is kept only if it
  arrives (so made-up subscriptions can't take the places); each notification is
  claimed before it's sent, so a slow or doubled tick can't send it twice; a
  phone is forgotten when its push service says it's gone, after five failures
  in a row, or after four months unheard of (the app tells the server again now
  and then, and when the browser changes its subscription). **By email too**
  (signed in: an Email group there, two switches, warnings and the briefing, for
  the places and time above; `notify.email`, the account's choice, so on every
  device and on the account's own page): from Weather's own address, to the
  account's email once it's confirmed, so they reach a phone that can't show
  notifications (an iPhone with Weather not on its Home Screen). Not rain alerts:
  an hour's notice by email comes too late. The account's email is one more of its
  devices to the server (wx_devs `mail:` and the account, its places the ones with
  warnings on, never rain), sent the same warnings and briefings as a phone, with
  the same claim first, but as an email (`functions/_email.js`): the briefing with
  the day's look, the headline, any official warning in force as a notice in its
  colour, the morning, afternoon and evening on Weather's blue, and the high and
  low, rain, wind and sun; a warning with its tile in its colour, the issuer's
  words, when and where, raised from which colour, and how many more
  (`weather/alerts.js` briefMail, warningMail). Each has a link to turn them off
  (GET shows a button, POST turns them off: `/api/weather/email-off`, with the
  account's own token, as InFlight's emails have) and the mail app's own
  Unsubscribe (RFC 8058). The site's sending plan is shared by every app's email
  (Resend's free plan: 100 a day, 3,000 a month), so Weather sends at most
  **`WX_MAIL_DAY`** a day (60 unless set; raise it on a paid plan), a briefing
  only within four-fifths of them so warnings still go; one not sent waits for the
  next tick. An address not confirmed yet, or an account being deleted, gets
  nothing (and nothing's held for it). Rain checks ask
  Open-Meteo only for the next four hours' rain; the whole forecast only where
  a briefing is due; and each tick asks no more than Open-Meteo's free
  allowance spread over a day (briefings first; places left over wait ten
  minutes, in a different order each time). Each connection can only ask the
  API so often. Each device's notifications are a row a place
  (`functions/_wxpush.js`: wx_devs, the device; wx_subs, its places, each with
  what's been told there), at most 12 places a device; an app from before (one
  place) is still understood.
- **The rain in words**, for a screen reader: the radar map's description is the
  rain about the place from the latest radar, "Light rain about 25 km to the west,
  moving east at about 30 km/h: it could be here in about 50 minutes", "Moderate
  rain here now", or "No rain within about 290 km" (only as far as the radar
  sees; nothing where it doesn't see the place) (`weather/rainmap.js` rainSaid).
- **Your account** (top of Settings; signed out, a row there opens the sign-in): signed in with your georgefarrowgreen.com
  account, your saved places, settings and notification choices are kept with
  it and are the same on every device you're signed in on; the app works just
  the same without. The sign-in is the site's own (below, *One account*):
  signed in on the site anywhere in this browser, Weather is too; or it signs in
  itself, with a passkey (the site's: one made anywhere on the site works here)
  or an email and password (stretched on the device as everywhere on the site,
  Argon2id via a copy of hash-wasm's build, `weather/argon2.js`; the password
  never leaves it). Signed in, it's just **one card for the account** (your
  photo, name and @handle, and a word on your places and settings only when
  there's something to say: "Saving…", "Will go up when you're online",
  "Couldn't save just now") that opens the account's own page
  (account.<site>: the profile, email, password, passkeys, devices, and signing
  out), signed in as you in whichever browser it opens in (Weather asks for a
  code good once, for a minute, `POST /api/weather/account-link`, and the page
  swaps it for a sign-in of its own, as InFlight's Edit Profile does; the page
  shows the way back to Weather). Where notifications go is said in
  Notifications ("Notifications go to this device and Mac · Chrome", with "Send
  them here too" where this one isn't among them). Signed out there (or
  anywhere on the site), Weather notices the next time it asks, and this
  device's notifications stay, as its own (`POST /api/weather/leave`, by its
  push address). Places says nothing of it while all's in step; a quiet note under the saved places says when it's
  syncing, offline ("Your places will sync when you're back online") or couldn't sync, and the account's card says so
  briefly. What's kept is one record with a version
  (`functions/_wxacct.js`, wx_accts: the places, the settings, the notification
  choices; at most 50 places and 48 KB); a change goes up a moment after it's
  made, from the version it was made from, and if another device got there first
  the two are put together (the account's places, less those taken away here
  since, plus those added here; settings changed here win; notifications place
  by place) and sent again (`weather/account.js`). Signing in on a device with
  places of its own keeps them all. My Location is each device's own (in Places it's
  on its own at the top, the Saved header over the places kept only once there are some). Signing
  out keeps everything on the device, and its notifications go on as its own.
  The page never holds the sign-in (the browser does, out of its reach), and the
  account's API answers only Weather's own pages. **Your profile** is the
  account's, the same in every app on the site: Weather shows your photo, name
  and @handle, and they're changed on the account's page (by the site's rules,
  `functions/_profile.js`); changed anywhere, Weather shows it when you're back.
  **Sign out** is at the foot of Settings (the account's page, opened from here,
  leaves it to Weather): this device keeps its places and settings, and its
  notifications go on as its own.
- **Context**: warmer or cooler than yesterday, a big change coming ("Turning
  colder from Friday"), the barometer rising or falling, the best and worst day of
  the week, the weekend, daylight gained or lost, and **what's changed since you
  last looked** ("Saturday looks drier: rain chance 70% → 20%").
- **Right now**, straight after the 16 days: feels like (and why) on a
  thermometer marked with the actual temperature, wind with a compass and
  Beaufort name, humidity on a bar and dew-point comfort, rain in the last and
  next 24 hours (the next as little bars, an hour each), pressure on a dial with which way it's going, visibility on a
  scale from fog to clear, UV, air quality and pollen, by the sea the sea
  (how warm it is, the waves and which way they come from, whether the tide's
  rising or falling and its next high and low, the next day's tide drawn as a
  curve: Open-Meteo's marine forecast at the nearest sea cell, where one's
  within 30 km), and the Sun and the Moon side by side: when the sun next sets
  or rises and its path across the sky, and how much of the Moon is lit, when
  it next rises or sets and the next full or new moon, all worked out on the
  phone (`weather/sky.js`: Meeus's Moon, checked against real sunrises and full
  moons in the tests). Each tile opens to a sheet of its
  own: what it says now, its hours on a chart (feels like against the actual
  temperature, wind and gusts with which way it'll blow every 3 hours, humidity
  with dew points, rain and pressure over the last day and the next two, UV
  today and tomorrow, visibility, the air quality index, the tide with its
  turns marked and listed day by day and the waves over the next two days;
  the Sun's first light, sunrise, golden hours, sunset, dark and daylight today
  and its rise and set for the week; the Moon's rise, set, phase and next full
  and new moon, and the week's),
  and a line on what it
  means; a swipe sideways (or the arrow keys) goes on to the next tile's, as a
  day's sheet does to the next day, with dots for which it is.
- **Credits**: every source in one window (who, what for, the licence, a link
  out), opened from the small print at the foot of the page (no panel, centred:
  when it was updated, Open-Meteo's credit, and "Learn more about weather data
  and map data", as the Weather app has it) or from the map's ©.

Places (search, or Use My Location) and settings (°C/°F, mph/km/h/m/s/knots,
mm/in, hPa/inHg/mmHg, 12/24-hour; to start with °C, mph, mm, hPa and 24-hour,
whatever the phone's language) stay on the device. A first visit opens on
roughly where you are, from your connection (`GET /api/weather/where`,
Cloudflare's city-level guess; nothing kept), or on your location if you've
already allowed it. It opens at once, on a poor signal or none, from its own
copy (`weather/sw.js`: each version's files kept whole as it's installed, and
given from there before the network's asked; the map's libraries kept apart,
across versions), shows what it last fetched (each file is checked against its
fingerprint as it's kept, and the page against its version, so a phone never
keeps a mix of two versions, as a server can hand out for a moment mid-release:
after changing any of them, `node .tools/wxshell.mjs`, which the tests check), can be added to the Home Screen,
and is **fresh whenever it's opened**: started, brought back to the front,
restored by the browser, its window focused or the phone back online, it asks
again for whatever's due (the forecast after 10 minutes, warnings after 5, the
models, ensembles, air and sea hourly; only those, so a quick look back costs
nothing; and one that failed rests a while, up to 10 minutes, rather than being
asked every minute), the radar's say on the next hours after 5, and the radar
card's frames if it's on screen, showing what it had meanwhile; it checks the
same every minute while open, and redraws only what's changed. It holds still as
it fills: the parts of a forecast coming in close together are drawn together
(twice a second at most); a place with nothing kept waits a second at most for
its warnings and the radar's say, so they don't come in over the top of what's
being read; meanwhile, placeholders the shape of the page (the hero's lines kept,
the hours' pills their own width) under a sky for the time of day, and in one
column, only the first column's; each part of the page is drawn by itself, so a
fault in one (on some odd piece of the forecast) leaves the rest as they should
be, and isn't taken for the network failing. A forecast kept
so long it has run out (two weeks away, say) isn't shown; the new one is asked
for. Opening it also looks for a new version of the app: one that arrives as
it's opened is started on there and then; one that comes later (or while a
sheet's open) waits until the next time it's opened, so it never reloads under
you mid-use. On a phone, pull the page down past its top and let go to refresh
it then ("Updating…" under the temperature: the forecast and warnings asked for
again, the rest as they're due). As on iPhone, the
spinner's spokes appear one by one as you pull, it pops when you've pulled far
enough, and let go, the page holds open a gap for it to turn in (long enough to
be seen) until the forecast itself is in, the rest arriving behind it, then
glides back up. It goes if the page is scrolled on meanwhile, and gives up after
15 seconds whatever happens. With more than one place saved, swipe across the top
of the page to go between them: the page follows your finger (giving at the
first and last), and let go far enough, or flicked, it carries on out at the
speed you let go at as the next place comes in from the other side (a view
transition, where the browser has them); not far enough, it springs back. A
day's details go to the day before or after the same way. Places lists them as
cards, as iOS's Weather does: each in its own sky, its name, its clock and its
weather, the temperature and the day's high and low; swipe one left and it
narrows to make room for a Delete beside it (nothing on it cut off).
Turned on its side, a phone shows the weather now held on the left and
everything else beside it, scrolling, as iOS 27's Weather does. On a wide
screen, two columns kept about level: the radar, the 16 days and This time of
year each go to whichever side does it, worked out as a place's forecast comes
in and as the window's resized (never as the page is used, so nothing moves
under a finger). **Settings** is a short list, as the iPhone's own is: your
account at the top (signed out, a row that opens the sign-in), then
Notifications, Commute and Best times, then Units, Appearance and Forecast, each
with what's in it said beside it ("On", "08:00, 17:30", "Run, Walk, Ride", "°C,
mph, mm") and opening over the list, the sheet's title its name and a way back
beside it; an activity's limits are a page of their own in Best times, kept as
you go back. The sheet keeps one height on a phone, so it doesn't jump from one
to another. Settings → Appearance makes the glass Clear, Standard or Tinted (as
iOS 27's slider does: a web page can't read the phone's own). Everything to tap is a finger's 44 points,
and no words are smaller than 11. Like an app, its words can't be selected,
copied or dragged off, and a long press calls up no menu or preview; what you
type into (search, settings) takes typing, copying and pasting as ever.
Share a place with `?lat=…&lon=…&name=…`.

**Setup (once).** In Cloudflare, Workers & Pages → the `georgefarrowgreen`
project → Custom domains → Set up a custom domain → `weather.georgefarrowgreen.com`.
The zone is already on Cloudflare, so it adds the DNS record itself. Nothing
else: notifications are sent by `.github/workflows/weather-tick.yml` every 10
minutes with InFlight's tick secret (`INFLIGHT_TICK_SECRET` in GitHub,
`PIGEON_TICK_SECRET` in Cloudflare), unless `WEATHER_TICK_SECRET` is set on
both sides; they use the site's D1 database and InFlight's push key. georgefarrowgreen.com/weather sends you to
the new address; preview deployments (`*.pages.dev/weather/`) serve the app
directly, so a branch can be tried before it's merged.

| Part | Where |
| --- | --- |
| Page, styles | `weather/index.html`, `weather/styles.css`: Liquid Glass throughout, as iOS 27 has it (translucent panels blurred enough to read over anything, with a light-catching rim and a darker hairline round it, over a sky that follows the weather and the time of day; where the page scrolls under the top bar, a bar of glass the width of the screen with a hairline under it; capsule buttons that give under a finger and spring back, segmented controls (the chart's, and every choice of one in Settings) whose lens of glass glides to the choice, iOS switches, floating sheets whose content fades under a fixed header; solid panels when Reduce Transparency is on, stronger edges with Increase Contrast). Motion: a new chart draws in once it's on screen (the line traced, columns growing one after another); the 16 days' bars sweep out row by row, the compass needle swings round to the wind, the sun's path is traced and the UV and air knobs slide to their reading, once per place as each comes into view; cards settle into place as they're scrolled to (scroll-linked, where the browser has it); the big icon at the top lives a little (rays turn, clouds drift, rain and snow fall); and the sky drifts with cloud, twinkles on clear nights, snows, and lights up softly in a storm. Sheets come up from below on iOS's own curve (quick, then soft, no overshoot; not faded in, which Safari draws unblurred then snaps frosted), the dim with them, and the page behind steps back and holds still while one's up (its glass unblurred, nothing on it, the radar included, or in the sky moving, so the sheet's own glass isn't blurred afresh every frame; its panes of glass and the hero's icon named one by one, and how far back it steps the page's alone, so a sheet comes and goes, and follows a finger down, without every part of the page being restyled); with a mouse, a soft light follows the pointer across the pane it's over; the sky holds still too once the page has scrolled on past the top (and behind the radar full screen; its slow drifts, clouds and stars, move in small steps a few times a second, so the glass over them isn't blurred afresh every frame, and the clouds not at all where there are none to see); a choice redraws the page behind only once its lens is gliding; Places keeps one height, so it doesn't jump as results come and go; on a phone a place is first drawn from the top (what's on the screen), the cards under it a moment later, once that's shown; something new near the top while the page is there (a warning come in, say) has what's under it glide to its new place rather than jump; and the bar takes up the temperature with a crossfade of its own once the big one's mostly scrolled away. Nothing is measured mid-way through drawing the page (which would lay it all out again, once for each chart): a chart's width is as it was last time at the window's width, or worked out from it, and put right by its ResizeObserver before it's shown if that's another; and the glide's "from" is where each part was as last shown. Buttons' icons sit in their middles; play and pause (and full screen and back) swap as iOS swaps its symbols, one shrinking and blurring away as the other grows in; the map's buttons give under a finger like the rest; and the radar grows from its place to fill the screen and back (a view transition, where the browser has them; its place held meanwhile, so the page under it doesn't move). All of it off with Reduce Motion (checked in the tests) |
| Drawing | `weather/app.js`, `weather/charts.js` (SVG charts: one measure each, a readout under your finger or the arrow keys, a table for screen readers), `weather/icons.js` |
| Fetching | `weather/data.js`: Open-Meteo's forecast (now, 15-minute rain, hourly, 16 days), seven models, five ensembles pooled, air quality and pollen, the sea (temperature, waves, tide), the 30-year archive, past forecasts, place search; BigDataCloud names where you are (only a position your phone has just given: a kept one is named by OpenStreetMap's Nominatim). Kept in `localStorage` (the climate for a year per place, the accuracy for 12 hours) |
| Thinking | `weather/insights.js` (and activities), `weather/skill.js` (accuracy, tuning), `weather/alerts.js` (notifications), `weather/climate.js`, `weather/sky.js`, `weather/codes.js`, `weather/format.js` (pure: no page, no network) |
| Radar | `weather/radar.js` (the frames, the timeline, the controls; drives either map), `weather/rainmap.js` (colours, the grid, painting, the timeline, the minutes between: pure), `weather/radarwork.js` (the smoothing, off the page's thread), `weather/radarmix.js` (the minutes between blended as rain on the graphics chip: WebGL 1), `weather/mapgl.js` (the vector map: MapLibre, `weather/vendor/maplibre-gl*.mjs`, `maplibre-gl.css`, BSD-3-Clause; the radar's tiles handed to it as drawn), `weather/mapstyle.js` (its style: pure), `weather/mapleaf.js` (without WebGL 2: Leaflet, `weather/vendor/leaflet.js`, `leaflet.css`, BSD-2-Clause) |
| Offline, notifications | `weather/sw.js` (the offline copy, and showing notifications), `weather/manifest.webmanifest` |
| Serving | `functions/_wxapp.js` (headers, the app at the root of its address), `functions/_middleware.js`, `functions/weather/_middleware.js`, `functions/api/weather/[[path]].js` |
| Server | `functions/_wxpush.js` (subscriptions in D1 `wx_subs`, the tick; push through `functions/_notify.js`'s `pushToSub`), `functions/_wxobs.js` (airport reports, kept in D1 `wx_obs`), `functions/_wxwarn.js` (official warnings: MeteoAlarm's feeds, the National Weather Service and the Environment Agency's floods, each kept 5 minutes in Cloudflare's cache, shaped down to what's in force, and matched to the place by the warning's own drawn area; the flood areas' outlines a week); `weather/official.js` says them (colour, title, when) |

**Its own address.** At weather.georgefarrowgreen.com only the app and its own
API answer (anything else is "Not found"), so its storage is kept apart from the
site's and InFlight's. Its Content-Security-Policy runs only its own scripts and
lets it fetch only from Open-Meteo, BigDataCloud (and OpenStreetMap's Nominatim
when BigDataCloud can't name a place), RainViewer and OpenFreeMap (the map's
tiles, fonts and relief), and show map tiles only from RainViewer, OpenFreeMap
and OpenStreetMap (the map without WebGL 2); the map's own worker is the app's
own file. It's the only place, with InFlight, that may ask for your location.

**What the server keeps.** For notifications: the phone's push subscription,
the place (to two decimal places, about a kilometre) and its name, which
notifications, the briefing's time and your units, and when it last sent
each; all of it deleted when they're turned off, or when the push service says
the phone has gone. By email, the same for the account's email (its address is
the account's, looked up when one's sent), kept while they're on, and a count of
the day's emails. Subscribing is only from the app's own pages, the push
service must be a real one (Apple, Google, Mozilla, Microsoft), and there's a
cap of 300. For accuracy: airports' daily highs and lows, nothing about you.
For official warnings: the feeds themselves, for 5 minutes (flood areas'
outlines for a week); the place asked about isn't kept.

**Limits.** Open-Meteo's free API is for non-commercial use, about 10,000 calls
a day per device (each phone asks for itself; it counts a big request as
several calls, so a refresh of the forecast is about 8, and the models, ensemble
and air quality, asked for at most hourly, some more). Its quarter hours are
the 15 minutes up to their time (so each is read as starting 15 minutes
before it), and outside central Europe and North America they're each hour's
rain shared out. In the UK that's the Met Office's model, kept rather than
swapped for France's or Germany's true quarter hours, which reach the UK only
at the edge of their maps and often disagree with it (and so with the hourly
forecast). The
30-year history is one large request per place, so it's fetched once and kept
for a year; if the archive is busy the card says so and tries again later.
RainViewer's free radar is the past two hours only, to zoom 7 (closer in it's
enlarged and smoothed; its tiles allow being read in the page, CORS), and its
own nowcast isn't offered, so the next two hours are worked out here: the
latest frame carried along the rain's measured track (rain doesn't grow or die
out on the way, hence the fade). Only without a track does the radar ask
Open-Meteo for its 81 points (kept for 15 minutes): smoother than radar, and
only inside the box around the place.
OpenFreeMap is free with no key or limit asked of a site like this (it asks
for its credit, on the map); OpenStreetMap's own tiles, used only without WebGL
2, are for light use like this. GitHub runs scheduled
workflows late when it's busy, so a rain alert can come later than the hour's
notice it aims for. Accuracy needs an airport within 40 km that reports round
the clock, and 5 days of its record (7 to tune). The insights, and the app's
own warnings, are rules of thumb from the forecast; official warnings only come
from the services above. The sea's from a global ocean model (Copernicus
Marine, and the wave models, through Open-Meteo) a few kilometres offshore: a
guide, not a tide table. Checked against published tide tables on the Sussex
and Norfolk coasts, its high and low waters came 10 to 95 minutes early, and the
app says so.

**Tests.** `.tools/tests/unit/wxinsights.test.mjs` and `wxnext.test.mjs` (in
CI: units, the Sun and Moon, climate, each insight on forecasts made up to show
it, accuracy and tuning, airport reports, activities and their limits, when a
rain alert or briefing is due and what it says; `wxradar.test.mjs`, the
radar's colours, grid, painting and timeline; and `wxwarn.test.mjs`, official
warnings: which count, drawn areas, how they're said; `wxcoast.test.mjs`, the
Environment Agency's floods and their areas, the sea's tides found from its
hours, and the sea in a swim's and a sail's score) and `.tools/tests/wxapp.mjs`
(end to end: the page, official and worked-out warnings (a flood warning by the sea among them), the sea's tile and sheet, models, climate, the radar, accuracy and the
tuned forecast, activities, notifications sent by the tick and decrypted, the
address's limits and accessibility, against stand-ins for every outside
service, with made-up forecasts for the time it runs).

## InFlight (chat.georgefarrowgreen.com) — 1.3.0

**Tests** live in `.tools/tests/` (not part of the site): unit tests run on every push (`.github/workflows/tests.yml`), and the end-to-end suite runs locally with `./run.sh`. See `.tools/tests/README.md`.

**1.3.0** (one way in): InFlight only signs in. New accounts are made on the account's page (account.georgefarrowgreen.com, above), and a forgotten password is reset there too; `POST /api/pigeon/signup` and the reset routes answer 410, and invite and reset links to InFlight's address (`#invite=`, `#reset=`) are passed on to it. The welcome screen has **Sign in** (or **Continue as …** where the browser's signed in on the site) and "New here? Create your account"; Sign in, as on every page of the site, offers a passkey first, then "or with your email", the form, **Forgot password?** and the same link. Someone new to InFlight signs in, picks their place, and is offered a passkey, as before. The admin page's invite links open the account's page.

**1.2.9** (the account's card, as Weather's): Account opens with the same card as Weather's Settings (your photo, your name, "@handle · georgefarrowgreen.com" and a chevron), and it opens your account's page, signed in, as Weather's does. Where you are is its own row (Settings → Location, the sheet that was My Profile); Sign Out and Delete Account are at the foot of Account.

**1.2.8** (your profile, on your account): your photo, name and handle are the georgefarrowgreen.com account's, so My Profile shows them and Edit Profile changes them on the account's page (account.georgefarrowgreen.com) rather than in InFlight. It opens signed in, whatever browser it opens in (a Home Screen app's links open in the browser, which has its own cookies): InFlight asks for a code (`POST /api/pigeon/account-link`, good once, for a minute, in `pg_handoff`), puts it in the address's `#` (never sent to a server), and the page swaps it for a sign-in of its own (`POST /api/account/handoff`, only at the account's address and from its own page; it takes the code out of the address at once). That sign-in shows in Signed-in devices and never counts as having just shown it's you, so a new password or passkey still asks. The page opens straight at Edit profile with the way back to InFlight; Done or Cancel closes it, and InFlight shows the change as you come back. Privacy & Security's Your Account opens the page the same way (`.tools/tests/acctlink.mjs`).

**1.2.7** (tidier, after a review of 1.2.2–1.2.6): Look Up's camera and location watch stop whenever the sheet stops being Look Up (Back, X, another sheet, even after the pigeon has landed) and when the app goes to the background; a second tap while the camera starts cancels it rather than opening another; the lens angle when zoomed is right (it was doubled); no location no longer stops the drawing. A way blurred a month on keeps what it said (`w_dodged`, `w_shelter`, `w_ship` on `pg_msgs` / `pg_gdeliv`), so a pigeon tidied away after its blur keeps its storms, shelter and ship in the flight log; the clean-up claims its turn in one step (no warning email twice); a warning never names a day gone by; an account's deletion keeps the landed pigeons its friends sent it as unnamed lines; a full sheet redraw waiting for the slide isn't lost to a lighter one; a safety number for someone no longer found closes; signing out one phone asks first. Times read "2 hours ago" everywhere. `placegrid.js` is fetched with the rest at start (about 0.2 s sooner on a slow line). Insights: days used are noted (`pg_active`, a row per account per London day, 60 kept), so People active counts opening the app and Coming Back shows who used it in their second week; days follow the clocks changing; photos, losses (not recalls) and pigeons in the air counted right; Count Again keeps your place.

**Admin → Insights** (`functions/_insights.js`, `GET /api/pigeon/admin-insights`): totals only, never who sent what to whom, a word, a place or a route. People here today, this week and this month (their app checked in), and how many came back a week after joining (of accounts over 8 days old, and by the week they joined); the last 30 London days as columns of pigeons sent, people active (sent or opened one) and new accounts, with a tooltip per day and a table for screen readers; the kinds of pigeon and the features used (groups, photos, mystery, scheduled, stopovers, cheers, route styles, space, disappearing, Pigeon Death, recalls) as shares of the pigeons sent; what share of accounts have a friend, a group, notifications, a confirmed email, a passkey, named pigeons; and whether landings are told on time (any landed 15 minutes ago with no notice is flagged). Bars are sized from script, as the page's Content-Security-Policy allows no inline styles (`.tools/tests/insights.mjs`). The same fix sizes Privacy & Security's verified-friends bar, which 1.2.6 drew full.

**1.2.6** (where you're signed in): Signed-In Phones says how many places the account is signed in ("Only This Phone"), shows this phone as active now, Home Screen app or browser, and since when, and lists the others with when each was last active, a New mark on any from the last day, and Sign Out; Sign Out of This Phone is at the bottom. Each sign-in keeps roughly where it was made (`pg_sessions.place`: the city and country Cloudflare puts its address in, never closer), gone when it's signed out. Privacy & Security counts the places signed in, shows the friends verified as a bar with who's next, and has shorter lines.

**1.2.5** (safer, at a glance): Privacy & Security opens with a status card (encryption, email confirmed, a passkey, App Lock on this phone; a ring that fills as each is done, each one left a tap away), then Account, Encryption, This Phone and Who Sees What; the live tracker's small print folds away. Encryption explains the three steps (the key made on the phone and its locked copy, every pigeon sealed, safety numbers), draws your key's fingerprint as a mirrored 5×5 pattern (`keyArt`), and lists each friend as verified, not checked or key changed. Safety Number puts the friend in a ring of that colour, with scan or compare as two steps, a green ring drawn when a scan matches, and a plain "You checked together" once verified. Passkeys explains itself when there are none, and shows when each was last used.

**1.2.4** (look up, closer): Look Up draws the pigeon's whole way across your sky (80 points along its route, each seen from where you are: flown solid, the rest dashed, the ends named); Where I Am measures from the phone's own location instead of the profile's place, only while Look Up is open, never stored or sent (`watchPosition`, cleared on leaving); the camera prefers the plain main back camera over a combined, ultra-wide or telephoto one, and takes the lens's field of view from what it is and any zoom the phone reports.

**1.2.3** (look up): a pigeon in the air's map has Look Up: hold the phone up and turn, and the sky ahead shows the pigeon where it really is from where you've said you are (a great circle's bearing, and its elevation with the Earth's curve: a pigeon 120 m up sinks below the horizon about 40 km off), how far, and over where; facing it, "There it is" and a tap. Space pigeons: the Moon or Mars where they are in your sky (Meeus's Moon, Mars from its orbit, through local sidereal time), an orbital one from its orbit 400 km up. The phone's compass and tilt (`deviceorientationabsolute`, or Safari's `webkitCompassHeading` after it asks); with a compass, Camera puts the back camera's picture under it all, at the lens's own scale (a phone's main camera takes in about 75° corner to corner; the picture stays on the phone and the camera stops on leaving); without one, a dial and which way to face in words (`pigeon/space.js` lookTo, moonLook, marsLook; `.tools/tests/lookup.mjs`, `unit/look.test.mjs`).

**1.2.2** (lighter): messages are kept for 30 days after they land (or are lost), then deleted for everyone, with their photos, reactions and moments (`functions/_retention.js`, run from the tick every ten minutes). What each pigeon did stays as one line in `pg_flights` (distance, times, kind, how it fared, storms gone round, hours sheltering, a ship, its space legs; never its words or its exact way), so the Flight Log, badges, rare pigeons, seasons and passport trips read the same; a flight is stamped and a named pigeon's career settled first (one that can't be waits up to 45 days). A group's history goes after 30 days, the admin log after 180. Files in storage that nothing points to (over a day old) are found a page at a time and deleted. An account nobody has used for a year is deleted, after an email a week before; signing in, or the app checking in, keeps it. Admin → Storage shows rows per table, the database's size, files by kind and what's waiting to go. Also: sheets slide up without a judder (a redraw waits until a sheet is up), screens push and pop on the same curve, tabs glide, and moving between sheets slides like pages (`.tools/tests/sheetmotion.mjs`).

**1.2.1** (wherever you go): pigeons on their way follow you off the Earth, back to it and between the Moon and Mars (`functions/_follow.js`). An Earth pigeon in the air is handed to a space pigeon from wherever it is; a space pigeon carries on to where you were and is relayed on (a second leg, `moon.prev`); a new spot on the same world, it heads there instead. Lunar eclipses use Meeus's fuller Moon and Sun series and the umbra's real size that night, so they're found to within a couple of minutes, the shallow ones too. Also: notification rounds page through everything due (along each query's index) instead of stopping at a few hundred; unfriending or blocking puts booked pigeons back in their lofts; sign-in holds count wrong passwords per address (30 an hour), with a much higher bar (300) for the account as a whole; two standard pigeons sent at the same moment can't both take the turn.

**1.2.0** (further out): Mars, as well as the Moon, is somewhere to live (My
Profile → Location → Go to Mars), and only laser pigeons reach it: pulses of
light, timed by the real Earth–Mars distance (JPL's Keplerian elements), so 3
to 22 minutes; across Mars, by an orbiter overhead. Orbital pigeons (2 a day)
go Earth to Earth by way of low Earth orbit and come down on the first pass
within gliding reach of the friend: hours, however near or far. A friend on the
Moon has day and night (a lunar day is 29.5 Earth days) and one on Mars a
Martian clock, under their name. Space flights' big moments (halfway, behind the
Moon, re-entry, into orbit, a real lunar eclipse on the way) reach their sender
as Mid-air Moments. Ten off-Earth postmarks (Tranquility Base, Tycho, Olympus
Mons, Jezero…), passport stamps for the Moon, Mars and Low Earth Orbit, and
Supermoon, Through the Shadow, Red Planet and Orbiter badges. Any space trip can
be replayed with a slider and shared as a postcard or a story. The numbers live
in `pigeon/space.js`, which the server imports too, so the phone and the server
always agree.

**1.1.0** (to the Moon): anyone can set themselves on the Moon (My Profile →
Location → Go to the Moon), at a named site or anywhere on a map of either
side. While they're there their spot on Earth isn't kept at all, and Update
Automatically goes off; choosing somewhere on Earth brings them home. Only
lunar pigeons fly to the Moon or leave it, from lofts of their own (3 a day,
about 3 days each way like Apollo; 1 Lunar Express a day, about a day), and
the trip is as long as the Moon is far away that day (`functions/_moon.js`,
from its orbit). Between two people on the Moon a pigeon bounds over the
surface. A lunar flight keeps none of the Earth's places on its row (its two
ends are in `moon`, an Earth end only to the half degree), so routing,
weather, flyovers, the passport's countries and InFlight Live's dots all
pass it by; the phone draws the trip instead (`pigeon/moon.js`). In a group,
pigeons to or from someone on the Moon go as lunar pigeons by themselves.
The passport gets a Moon stamp, there's a Moonshot badge, and InFlight Live
counts the pigeons out in space (a number only).

**1.0.8** (a new home, and InFlight Live): InFlight moved to
chat.georgefarrowgreen.com, bringing each phone's sign-in across, and the
old address says where it went; InFlight Live shows every pigeon in the air
on a computer, with no one in it.

**1.0.4** (ships, coasts and surer times): standard pigeons cross oceans by
ship and keep to coasts, fast ones fly over the mountains, finer wind-optimal
planning, 15-minute showers, ensemble landing ranges and steadier turns.

**1.0.3** (a fresh chat, and the Earth itself): Messages-style bubbles,
magnetic storms, volcanoes and wildfires, the flight card as a story, flying
together, cleverer routes, tidier photos and folded-up near misses. Tap the
version at the foot of Account for **What's New**: every release, newest first
(`RELEASES` in `pigeon/app.js`; it never pops up on its own). Add an entry to
`RELEASES` and bump `APP_VERSION` with each update.

**1.0.2** (security, privacy, stability and speed): a pigeon from someone
you've blocked or unfriended no longer follows you when you move; blocks hold
inside groups; "Updated", "Opened" and lofts honour the privacy switches both
ways; deleting an account deletes everything of it. The app opens with no
signal (a copy kept by the service worker, network first), never hangs on a
stalled request or a damaged saved copy, retries queued pigeons through
hiccups, and only redraws or saves what changed. The server sets its schema up
once per change, finds what the minute tick needs by index, and checks a
session in one query. The API answers only at georgefarrowgreen.com, so old
preview deployments can't reach the live data (delete them in Cloudflare too).

A pigeon-post messenger at **/pigeon**: every message ("scroll") flies the real
distance between two people at 80 km/h (5 minutes to 3 days), and photos are
deleted 24 hours after they land. It is end-to-end encrypted and works on
phones and iPads only, held upright.

**Other ways in.** georgefarrowgreen.com/chat sends you to /pigeon
(`functions/chat/[[path]].js`), and so can chat.georgefarrowgreen.com. The app
keeps one address, so sign-ins, keys, notifications and the Home Screen icon
stay put. For the subdomain, in Cloudflare (the georgefarrowgreen.com zone):
1. DNS → Records → Add record: type **CNAME**, name **chat**, target
   **georgefarrowgreen.com**, Proxied on.
2. Rules → Redirect Rules → Create rule: when **Hostname** equals
   **chat.georgefarrowgreen.com**, redirect (static) to
   **https://georgefarrowgreen.com/pigeon/**, 301, preserve query string on.

(If chat.georgefarrowgreen.com is added to the Pages project as a custom domain
instead, its /pigeon pages still send you to the main address.)

**Phones and iPads only.** On a computer, /pigeon shows a page saying InFlight
isn't available there, with a QR code that opens the same link (an add-a-friend
or reset link included) on a phone; the app itself never starts, so nothing is
signed in, synced or stored. `pigeon/theme.js` decides before anything is
drawn: an iPhone, iPad or Android device counts, and so does a "Mac" with a
touchscreen, which is how an iPad's Safari introduces itself (it can't be told
apart on the server, so this is decided on the device). The owner's admin page
(/pigeon/admin) still opens on a computer.

| Part | Where |
| --- | --- |
| App (static, no build step) | `pigeon/` — `app.js`, `crypto.js`, `styles.css`, `land.js` (coastlines), `places.js` |
| Map data | `pigeon/map/world-50m.json`, `world-10m.json`: Natural Earth (public domain) land and borders, loaded only as you zoom in, self-hosted so no map provider sees anyone's route |
| API | `functions/api/pigeon/[[path]].js`, helpers in `functions/_pigeon.js` |
| Data | D1 (`DB`), tables prefixed `pg_`, created on first request |
| Photos | R2 (`BIO_R2`) under `pigeon/`, encrypted blobs only |

**Notifications.** Account → Notifications has Push (Web Push, works on
Android, and on iPhone and iPad once InFlight is added to the Home Screen) and Email (via Resend). Push is per phone; the rest is per account:
which events notify (a pigeon lands, takes off, friend requests, accepted
requests), whether names show on the lock screen, and quiet hours in the
phone's own time zone (pigeons that land then are announced when they end). They say who sent a pigeon, never what it says.
Push payloads are encrypted to each phone, and the Topic header push services
read (so a newer notice replaces a waiting one) is a keyed hash per phone, so it
names no one; the server makes its own VAPID key on first use (stored in D1). Emails wait 10 minutes and go out at most every
half hour, with a one-click unsubscribe link. Code: `functions/_notify.js`,
`pigeon/sw.js`.

**Weather delays.** When a pigeon flies into whatever is making it 15 minutes or
more late (the spot along its route where the weather did most, worked out at
take-off), its sender and recipient get "Your pigeon flew into storms. It'll
land 3h 5m late, at 11:52.", in their own time zone. In a group only the
recipient hears (one per member would be a lot for the sender), and muted
groups stay quiet. A switch under Notify Me When (on by default); quiet hours
apply. A rerouted pigeon's old weather is forgotten.

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
*Rocket* (gold, 9×, one a day) fly any time and each send uses one. The phone picks the slowest
that can fly; tap the pigeon at the start of the message box for How It Flies to choose another.
The server enforces the rules (`PIGEONS` and `loft()` in `functions/_pigeon.js`).

**The chat.** A plain bar at the top: who, the time where they are (with a moon
at night) when it isn't yours, where they are and how far. Each message carries
its own time, tucked into its last line, with two ticks once they've read yours;
the day goes above when it changes. Your pigeon in the air is an outline with
its pigeon on a hairline of the way and when it lands; tap it for the map (and
who carries it, how far it has to go, cheers, weather), Cheer It On or Call It
Back. Tap anything that has landed to react, reply or Show the Flight. Mid-air
moments, flyovers and rank-ups are small grey lines. Writing is one row: +
(a photo, or a GIF), the message with its pigeon at the start and when it would
land as the hint, and send (a microphone while it's empty). A line appears
above it only when something stops a pigeon flying. How It Flies (tap the
pigeon) has when it would land up top (and the weather on the way), the kinds,
with how many you have, how long each takes and why one can't fly; which named
pigeon carries it; When It Lands and Stop Over as chips; the Route (Fastest,
Scenic or Safe, each with when it would land); See the Way (the way it would go
if it left now, as a line with its stops, and on the map, where the other ways
are drawn faint with their names: tap one for that way); and whether Pigeon
Death is on. Every time it shows is the planner's: `GET route-plan` plans every
kind of pigeon each way at once, just as sending would (with the rests, the
passes and the weather), and the message box's hint says the same once it's in.

**Scheduled pigeons.** In a one-to-one chat, How It Flies → When It Lands:
pick when it should *land* (this evening, tomorrow morning, or any time in
the next 30 days). The pigeon waits in your loft and takes off just in time:
`sent_at` is its take-off, `deliver_at` the time you picked, `sched` 1 until it
leaves. Until then only you can see it, and it doesn't take anyone's turn.
The tick tells the recipient when it takes off. If they move first, it
re-plans its take-off so it still lands on time. Cancelling before take-off is
free and puts the pigeon back in your loft. Scheduled pigeons must be swift,
turbo or rocket: a standard pigeon can't wait that long for its turn.

**Flight Log.** Account → Flight Log: miles flown (and how far around the world
that is), pigeons sent, received and in the air, hours in the air, the longest
flight, the fastest pigeon, the best tailwind, storms dodged (flights that
went around them), hours sheltered from storms and the most a wind brought one
in early, pigeons by kind, and how many were lost to Pigeon Death or called
back. Three weather achievements go with them: Storm Dodger (around storms 5
times), Weathered It (12 hours sheltering in all) and Rode the Jet Stream (2
hours early on the wind). Worked out by `functions/_stats.js`
from distances, times and kinds only; a group pigeon's destination is never
named, since it could be someone who isn't your friend.

**Rare pigeons.** Each one is unlocked by an achievement: Golden (Fleet),
Midnight (Long Haul), Storm (Tailwind Rider), Ember (Daredevil), Comet (Rocket
Mail) and Rainbow (Around the World). Pick one in the Flight Log, and every
pigeon you send wears it: a ring, glow or tail around the usual colour, so the
colour still says what kind it is. Your friends see it too. The server only
accepts a look whose badge you've earned (`SKINS` and `skinOpen` in
`functions/_stats.js`), and each pigeon keeps the look it flew with.

**The map.** Flights over 3,000 km open on a globe that you can drag to spin and
pinch to zoom; the globe button switches to the flat map and back. Both show:
- the trail, solid where the pigeon has flown and dashed ahead;
- night and twilight, worked out from where the sun really is, with the sun drawn where it's overhead;
- the wind everywhere, as thousands of drifting trails, brighter where it blows harder. Tap anywhere for the wind there, as direction and mph. The layers button turns it off, and the route gets its own green or orange tailwind and headwind streaks instead. The grid comes from Open-Meteo through InFlight (`functions/_windmap.js`): only a box of the world is sent, never who is looking, and it's cached for everyone per place and hour;
- the rain, as a weather radar: light blue drizzle through blue and purple rain to orange and yellow cloudbursts. The same grid carries how hard it's raining (Open-Meteo's last 15 minutes, as mm an hour); it's blended smoothly, given a radar's streaky grain by noise that drifts slowly, and worked out at a third of the screen's resolution a few times a second. Whatever held a pigeon up (storms, heavy rain, snow) is always on it, as an intense cell where it was worst, labelled, even with the layer off; fog and gales are drawn as fog banks and gusts. Still with Reduce Motion;
- shallow water along the coasts, softly shaded mountain ranges, and country names as you zoom in (`pigeon/countries.js`);
- a pigeon that flaps, tilts with its course and flutters as it takes off and lands. Only the pigeon is redrawn each frame; the map stays as it was drawn.

The card over a pigeon's map starts folded to a slim bar: how long it has
left and when it lands, where it is now, a progress bar and a round Cheer
button, so the map gets the screen. Tap it or swipe it up and it becomes the
flight as a timeline: when it took off, each thing on its way (storms it goes
around, wind it rides, islands it rests on, passes, landmarks for postmarks,
turns for the weather, near misses), a Now row with its speed, the wind or
delay and how far it has got, and when it lands; then who is carrying it and
how it flies. Swipe it down, or tap its handle, to fold it again. The phone
remembers which you chose (`flightCard` in `pigeon/app.js`).

**Rockets fly high, and named pigeons tire.** Rocket pigeons climb to the
jet stream (the wind 250 hPa up, about 10 km, asked of Open-Meteo with the rest)
when it blows their way, and the card says so ("4h early · rode the jet stream
over Poland"); other pigeons can't climb that high, and a jet stream the wrong
way just leaves a rocket flying low. A named pigeon gets tired on a long flight:
it comes down on land for a breather ("t" legs, a rest like an island's) every
few hours of flying, near the nearest town, and the more miles it has flown the
longer it goes between them and the shorter they are (a Fledgling every 5 hours
or so for about 40 minutes, a Legend every 16 for 15; `tire` in
`functions/_route.js`). The plan before sending includes them for whoever would
carry it, and a pigeon that turns for the weather keeps them on its new way.

**Magnetic storms, volcanoes and wildfires.** `functions/_earth.js` asks two
free sources with no key, from the server, and keeps them for everyone for half
an hour: NOAA's planetary K index (observed and three days ahead) and NASA
EONET's open volcanoes and wildfires. Homing pigeons steer partly by the Earth's
magnetic field, and real ones do get lost in magnetic storms: from Kp 5 a pigeon
wanders and flies slower, more the nearer the poles (none below 35°, up to 22%
at Kp 9 past 60°), said like any weather ("1h 16m late: a magnetic storm").
Volcanic ash (120 km round an erupting volcano) and wildfire smoke (40 km, more
for a big fire) are marked on the weather's points and gone around like storms:
planned before it leaves, turned for in the air, sheltered from on an island,
drawn on the map (an ash cloud with grit falling, smoke with embers rising) and
on the card ("Goes around volcanic ash over France"). If either source doesn't
answer, pigeons fly as if all were calm. Credited in Account → Map & Weather Data.

**Coasts, mountains and ships.** A standard pigeon keeps to the coast rather
than cross open sea it has nowhere to rest on: the planner charges open sea
more than land (`COAST_W`) and bends along the shore ("o", whose coast), so Rome
to Barcelona goes round by Italy and France; a sea with an island part way over
is still hopped. A turbo flies high enough to go over all but the high ranges,
and a rocket over all but the very highest (`ceilingFor`): no pass, just "m",
over the mountains. An ocean is too far to hop: a standard pigeon rides a ship
along the main shipping lanes (`functions/_ships.js`, a network of ports and
straits, canals and capes, checked against the coastline with
`.tools/geo/lanes.mjs`), from the port that suits best to one across: an hour
waiting for the ship, then each point of the lane at a ship's 40 km/h ("b"),
safe from Pigeon Death, and on from the port. Lisbon to New York takes about
six days. The card says "Boards a ship at Lisbon · Across the North Atlantic"
and "At Sea"; the live weather leaves a voyage be; a friend who moves while it's
at sea is flown to from where it comes ashore.

**On the map, and being told.** The lane it sails is drawn in teal (solid where
it has sailed, dotted ahead) with its two ports named; the card says when the
ship gets in ("At sea across the North Atlantic: the ship gets in to New York on
Thursday", or while it waits, when it sails). Its sender and recipient (in a
group, its recipient) are told when it boards ("Your pigeon boarded a ship at
Lisbon. It comes ashore at New York on Thu at 14:00.") and when it comes ashore,
under Mid-air Moments; the ports only with names on (`shipTick`, claimed with
`ship_told` so each is said once, and only within two hours of happening).

**No ships.** In a hurry, a sender can have a standard pigeon fly the ocean
itself (How It Flies → By Sea → Fly It All the Way, shown only when its way
would take a ship): days quicker, but a long way with nowhere to land, so with
Pigeon Death on its odds go up. The message keeps `noship`, so a friend moving
or the live weather never puts it on a ship after all; its card says No Ships.
How It Flies asks the server for both (`noShip` in route-plan, only for a kind
whose way sails).

**Planning cost.** How It Flies plans every kind of pigeon each way (12 plans,
more with No Ships) from one look at the sky (`skies`: the slowest pigeon's look
reaches far enough for the rest), each square's weather worked out once per
quarter hour, and a way's longest sea and highest ground kept between plans.
London to Sydney costs about half a second of CPU, short hops a few ms. The sky
is looked at for twice the calm flight time, so a pigeon slowed by a headwind
still has forecast to the end.

**Wind-optimal routes.** The planner looks at a finer lattice (up to 13 stages
of 13 points, two steps sideways a stage) and judges each stretch by the sky
when the pigeon would really get there on that way, so a way can wait for the
wind to turn or keep ahead of a storm; bends that hardly bend are smoothed out.
A look in the air uses the coarser lattice, so more flights share one look.

**Showers and how sure.** The forecast includes Open-Meteo's 15-minute rain and
weather for the next two hours, so a shower just ahead is met (or missed) as it
will be. Open-Meteo's ensemble forecast (the same model run many times) says how
much the members disagree about the wind along the way: the "likely" landing
range is the middle 80% of theirs (`spread`, kept with the pigeon), or the old
estimate if it doesn't answer. In the air, a turn for a better wind must save
15 minutes and 5% at least, twice that within three hours of the last, and any
pigeon over land with storms within 150 km and no way round comes down to wait
them out.

**Pigeon Death's odds by the way.** With Pigeon Death on, a pigeon's chance
of being lost depends on the way it takes (`riskOf` in `functions/_route.js`):
1 in 100 for an ordinary flight, half as much again for a stretch of open sea
over 500 km with nowhere to rest (double over 1,500 km), more through severe
weather it couldn't get around, and more past falcon country (the narrow
crossings birds of prey migrate over, like Gibraltar and the Bosphorus, and the
Gulf); the safe way halves it. The route switch shows each way's odds ("1 in
133", green when better than usual, red when worse), and How It Flies says why
("this way: a very long sea crossing").

**Flying together.** Two pigeons someone can see both of (two you send off
the same way at once, say), in the air together going the same way at much the
same pace within 40 km of each other for half an hour or more, fly together for
that stretch, taking turns at the front: each goes 10% faster for it
(`flockUp` in `functions/_moments.js`, when a pigeon takes off). Their times
from there are squeezed, with a point ("f") where they meet and where they
part; it's kept as a moment like a near miss, so both people are told ("Your
pigeon to Reuben and your pigeon to Nia are flying together over France"), the
chat says so, and the card's timeline has it.

**How sure the landing time is.** While a landing is a way off, the card,
How It Flies and The Way give it as a range ("lands 21:10–21:40", "likely Fri
05:35–05:50"): wider the further off it is and the more the weather has to do
with the flight (its wind, the time the weather has cost or saved, the storms it
goes around), and narrowing as it gets closer, until it's just the time
(`landRange` in `pigeon/app.js`).

**The Skies.** The globe button on Messages opens one live map of every pigeon
in the air to or from you, from every chat and group, with a countdown for
each. Tap a row to open that chat. It shows exactly what those chats already
show you (`functions/_skies.js`): a group pigeon from someone who isn't your
friend is listed but not mapped, and a scheduled pigeon appears once it takes off.

**Near misses.** When two pigeons someone can see both of come within 50 km
of each other in mid-air, it's a moment: a pigeon each way in a chat passing
("Your pigeon and Reuben's passed each other over Tajikistan"), or a quicker
pigeon overtaking a slower one. The server works it out when a pigeon takes
off, and again when its course changes or it's called back
(`functions/_moments.js`: each pigeon flies its great circles at an even pace;
it must be a crossing in mid-air, not two setting off or arriving together),
and names the spot with the map's own country and sea names
(`functions/_where.js`). As it happens, both people get a push (Mid-air
Moments, in Notifications), the chat gets a line (tap it for the map), and
the map marks the spot. Only pigeons you could already see count. Pigeons
sent together that meet the same one read as one line with a count (×2), and
three or more in a row fold into one ("5 near misses over India and
Malaysia · 07:11–11:36"); tap it to see each.

**Cheer it on.** While a pigeon flies, both ends of the chat can cheer it on
(the map card's Cheer It On button, or the menu on your own pigeon). Each
cheer takes 4% off the time it has left, 15 minutes at most: a little
tailwind, not a shortcut. Each person gets three cheers per pigeon, and a
pigeon takes twelve in all. The server marks where it was at that moment as a
point on its path (`functions/_cheers.js`), so on the map it flies on faster
rather than jumping ahead, and it isn't drawn as a change of course. The near
misses ahead are worked out again at its new pace. The other person gets a
push ("A little tailwind", under Mid-air Moments). In a group, the sender
cheers on every pigeon still flying, and each member the one flying to them.

**Flyover waves.** When your pigeon passes within 40 km of a friend on its
way to someone else (not near where it set off or where it lands), that
friend gets a push as it flies over ("George's pigeon just flew over you.
Wave hello?"), and their chat with you gets a line with a Wave button. A wave
sends you a push and shows in your chat with them and on your pigeon's map.
They're only told it was yours: never who it's flying to, or where. The server
works out each pigeon's flyovers when it takes off, and again when it turns,
is cheered on or is called back (`functions/_flyover.js`). Group pigeons count
too, for friends who aren't in the group. A friend who has moved since, or is
no longer a friend, isn't told. Flyovers are deleted after a month, and
waving closes 12 hours after the pigeon passed.

**The way it goes.** A pigeon no longer just flies the great circle: its way
is planned as it leaves (`functions/_route.js`) and kept as timed points in the
message's `legs` ([lat, lon, at, tag, name]), which the map, near misses,
flyovers, the passport and postmarks all simply follow.
- *Around storms, and with the wind:* the sky across the route is looked at as
  a lattice: a row of points every ~300 km along it (3 to 9 rows), each with
  points 10%, 20% and 30% of the route's length either side of the straight
  line (none at the ends), plus the straight line's own points every ~200 km,
  all in one request, each by the forecast for the hour the pigeon gets there
  (up to 96 hours ahead). The quickest way through it is found row by row (a
  step sideways at most each time), each stretch at the pace its weather gives,
  storms costing two hours each (`latticeOf` and `bestWay` in
  `functions/_route.js`). A pigeon that would fly into thunderstorms takes the
  quickest way that keeps out of them, round the clearer side ("Going around
  storms over France"); with none in the way, it rides the wind if that's at
  least 4% quicker. A pigeon booked to land later is planned around the forecast
  for when it takes off (up to three days ahead); stopovers and group pigeons
  meet the forecast along their way too.
- *Mountain passes:* where the way goes over high ground (the land's average
  height every half degree, from the AWS Terrain Tiles: `functions/_elevgrid.js`;
  credited with the weather and map data in Account → Map & Weather Data),
  it goes through a pass: a known one near the top (`functions/_mountains.js`:
  the Alps, Pyrenees, Himalayas, Rockies, Andes, Caucasus, Norway, the Atlas,
  Japan and more), the one that adds least; else the lowest way across it can
  find either side ("a pass in Norway"). Not when it starts or ends in the
  mountains.
- *Island hopping:* a standard pigeon facing more than 450 km of open sea
  rests an hour on an island part way over: any of ~1,300 islands out at sea
  from Natural Earth's 10 m coastline (`functions/_islands.data.js`), named
  from a hand-made list where there is one ("the Azores"), else by the country
  they're off ("an island off Greenland"); faster ones fly straight over. The
  data files are made by the scripts in `.tools/geo` (see its README).
- *Route styles* (How It Flies → Route, kept on the phone): Fastest (all of
  the above), Scenic (no chasing the wind, but bends past up to two landmarks
  for their postmarks, at most 15% further) or Safe (every pigeon island-hops,
  and Pigeon Death's risk is halved). A stopover's way is its own.

**Live weather.** A pigeon in the air keeps an eye on the sky ahead
(`functions/_live.js`, from the tick). Every half hour, each flight with more
than an hour to go looks again at the forecast along the rest of its way, each
stretch for when it'll get there, as many as fit in 500 points of sky in one
look (the rest next time: Open-Meteo counts every point). Its pace
changes with it: what's still ahead is retimed, so it lands sooner or later
(changes under 5 minutes, or 3% of what's left, aren't made). A landing made
15 minutes or more later is told again when it reaches the weather, as at
take-off. Group pigeons too.

It changes course when that's better. If storms have got into its way since
it left, it takes the quickest way around them from where it is now (the same
search through the sky ahead, through the passes and resting on islands as it
would have); with none in the way, if the wind along another
way would now get it there at least 5% sooner, it rides that instead (a scenic
pigeon doesn't chase the wind). The point where it turned is kept in its legs
(`[lat, lon, at, "r", why]`) and the rest of its plan replaced; no more than
one such turn an hour. Its sender and recipient are told ("Your pigeon changed
course to go around storms over France. It now lands at 19:12."; in a group,
the recipient), and the map card says "Rerouted around storms over France".

And it waits out storms it can't get around. Resting on an island with storms
on the way on, it shelters there until the first whole hour it could leave and
meet none (up to 12 hours; storms that won't clear by then, it flies on
through, slowly). A safe pigeon in the air over land, with storms ahead and no
way around them, comes down where it is and does the same. The wait is kept
as a rest (`"h"`, where), put down to the storms, and told ("Your pigeon is
sheltering from storms on the Azores until about 15:00. It now lands at
22:00."); the map card says "Sheltering on the Azores until about 15:00".
Rests and shelters get a day on top of a pigeon's longest flight.

On the map, a pigeon that turned for the weather shows the way it was going
as a faint dotted line from where it turned (kept on the turn's point,
`[lat, lon, at, "r", why, { was, storm }]`), the storms it went around (planned
or on the way) are drawn as a storm cloud while it flies, and where it
sheltered gets an orange ring. An open map keeps up by itself: the chat is
fetched again every 15 seconds, and a notification arriving while the app is
open (a course change, say) makes it catch up at once (the service worker
tells it to sync); if the way changes while you watch, a note says so ("Its
way just changed: rerouted around storms over France").

The map card says what it's doing ("Resting on the Azores until 09:48",
"Through the Gotthard Pass"). Turning for someone who moved drops the rest of
the plan and plans again from where it is; a cheer keeps the plan, sooner.

**Plan around the weather.** Before you send, the composer checks the next
day's forecast along the way (`forecastFor` in `functions/_weather.js`: the
same squares of sky as the weather at take-off, never who's flying). If
storms, heavy rain, snow, fog or headwinds would make the pigeon land well
late (at least 20 minutes, and a tenth of its flight), it says so, and when
the skies clear: "Storms over the Alps: it would land 3h 4m late. Clear by
18:00: a swift pigeon leaving then lands tomorrow at 03:12." One tap books it
to land then. A booked pigeon now flies through the forecast for the hour it
takes off, not the weather when it was booked. A strong tailwind gets a word
too. Waiting means booking the pigeon, and only swift or faster pigeons can be
booked, so a standard pigeon is offered a swift one; with none left, the
composer just says when the skies clear. One to one only, since group
pigeons can't be booked.

**Named pigeons with careers.** Account → Your Pigeons: name up to five of
your pigeons. They take turns carrying what you send: the pigeon at the start
of the message box shows which one (the one that has rested longest; pick
another in How It Flies, or Any Pigeon to send it unnamed). A pigeon is credited with the miles when its flight lands,
and miles bring rank (Fledgling, then Courier at 311 mi, Navigator, Veteran,
Ace, and Legend at 24,901 mi: once around the world) and stamina, which
shortens the rest it needs between flights (from about two fifths of the
flight down to a tenth). The chat marks a rank-up. A Legend can retire to
your Hall of Fame; with Pigeon Death on, a named pigeon can be lost, and is
remembered there with where it went down. A called-back pigeon earns no
miles and rests for its trip home. Everyone it flies to sees its name and
rank; only you see its career (`functions/_birds.js`). For a message to a
group, your named pigeon flies the longest of its routes.

**Passport.** Every country and sea your pigeons have flown over, stamped in a
passport. The Flight Log shows it closed (a burgundy cover with the InFlight
crest, how many journeys and pages, the last stamp); it opens as a book you
swipe through: a photo page (your name, loft and handle, how long you've kept
pigeons, miles flown, countries of 195, seas, your furthest flight, your named
pigeons, and a machine-readable strip along the bottom), then visa pages that
fill up in the order your pigeons flew, a journey at a time (its day and ends at
the top of the page, 10 stamps a page). Each country is a rubber stamp in its
own ink (entry boxes, round postmarks, departure ovals, hexagons, triangles),
with its outline inside (Natural Earth, simplified to 48 KB in `pigeon/shapes.js`
by `.tools/geo/shapes.mjs`, loaded only when the passport opens); each sea is
"At sea · crossed" ("By ship" on a voyage), and the last country of a journey that
sailed is "Arrived by sea". The ink is a little rough and worn (SVG filters), the
stamps a little askew; only the pages either side of the open one are drawn. Tap
a stamp for when it was first stamped and how often since; the chat's "New in your
passport" line opens the book at that flight's page. In the dark the pages stay
paper, dimmed. The server says which journey first stamped each place, and each
journey's ends (`trips`; yours, so nothing you don't already know). A flight
is stamped once it has landed, along the way it really flew (great circles,
turns and stopovers), with a point named every 20 km; where it set off and
landed count as the nearest country. Land is named by the border it's within
(Natural Earth's countries, as a quarter-degree grid made by
`.tools/geo/countries.mjs`), not by whichever country's middle is nearest, so a
spot in eastern France is France. Every name is looked up in a quarter-degree
grid (`functions/_placegrid.js`, 75 KB), so stamping a flight costs well under a
millisecond; the app looks places up in the same grid (`pigeon/placegrid.js`),
so the map card and a push about the same spot always agree. The chat marks the flight
that collected new stamps ("New in your passport: Kazakhstan, Mongolia and 3
more"), and Globetrotter is earned at 25 countries. Only your own pigeons that
landed count, and in a group only those to your friends; nobody else sees your
passport (`functions/_passport.js`).

**Coots.** The bank: Coots Coins are earned as your pigeons fly (1 to 6 a landing,
3 a new country or sea, 10 a new postmark, 10 to 100 for a streak) and spent in its
shop on accessories for your named pigeons. (In the code and the database they're
still called feathers: `functions/_feathers.js`, `pg_feathers`.)

**InFlight Live** (`chat.georgefarrowgreen.com/tracker`, computers only). A
public world map of every pigeon in the air, made so that nobody is in it. The
server decides what may be shown (`functions/_tracker.js`, `GET /api/pigeon/tracker`)
and the page (`pigeon/tracker.html`, `tracker.js`) only ever gets rough dots:

- each dot is a place snapped to a half-degree grid (about 55 km), one of 8
  headings, the kind of pigeon (a mystery pigeon stays "mystery") and the
  country or sea it's over: no names, handles, messages, places, routes,
  times or ids;
- a short fading trail shows where each was over the last two hours (up to
  600 km back), every point snapped and under the rules below, so a trail
  stops before it could ever reach home;
- never within 150 km (up to 400 km on a long flight) of where a pigeon set
  off or is going, nor of anywhere it stops, and never while it rests; flights
  under 300 km never show;
- in a shuffled order with no ids, so a dot now can't be linked to a dot later;
- a pigeon shows only if both its sender and the person it's flying to leave
  **Privacy & Security → Live Tracker** on (it's on unless switched off);
- one answer a minute for everyone, kept at the edge: no sign-in, no cookies,
  nothing about who looked is stored, and asking more often learns nothing.

A **Today** strip (top right) adds totals since midnight UTC: pigeons landed,
miles flown and the seas crossed (seas only, never countries), from the same
pigeons the map may show, so anyone who switched the tracker off isn't in them.

The page itself loads nothing from anywhere else, keeps the app's strict
security headers, can be dragged and zoomed round the world, and on a phone
says it's made for bigger screens. The "not on a computer" page links to it.

**Share a flight.** A landed pigeon's map has a Share Flight button. It makes
two pictures on the phone (nothing is sent anywhere to make them): an airmail
postcard (4:5), with the route round the globe for a long flight or on a flat
map for a short one, a perforated stamp in the pigeon's colour and a postmark
in the local time where it landed; and a dark story (9:16) styled like the
landed card in the app. Both use the app's own map. Pick one and Share opens
the phone's share sheet (where there isn't one, it saves the picture instead). Only
the two places, the day and the flight go on it: never the message, never
your friend's name, and your own first name only while Show My Name is on.

**Getting around by touch.** As on iPhone: swipe in from the left edge to go
back (the screen you came from waits underneath, dimmed, and follows your
finger; let go early and you stay put, draft and all), and back returns to
where you came from (Friends, if that's where you opened the chat), at the
same scroll position. Swipe sideways anywhere on Messages, Friends or Account
to move to the tab beside it (it slides in under your finger, and the tab
bar's highlight follows). Hold a chat in Messages (or right-click it) and it
lifts above the blurred screen with a menu: Mark as Read, Mute, Info, and
Leave or Remove. Pull a sheet down by its top, or from anywhere once it's
scrolled to the top, to close it (on the map, its top: dragging the map moves
the map). Swipe a photo away, flick a banner up, tap any empty space to put
the keyboard away, and tap outside a menu or question to close it. Escape
closes whatever is on top, for a keyboard.

**Accessibility.** Checked with axe-core on every main screen and sheet, in
light and dark: no violations. Words meet 4.5:1 contrast (secondary grey is a
little darker than iOS's, the blue a touch deeper, and green, orange and red
words use darker versions of those colours, while switches, dots and badges
keep the bright ones). The page itself doesn't zoom, so it always fits the
screen (pinching zooms the map; text size follows the iPhone's own setting,
below), every icon button has a spoken name, sheets are labelled dialogs with their own heading,
chats have a heading for screen readers, and the app's content is the page's
main landmark. Message text, chat rows and the message box follow the
iPhone's text size (Dynamic Type), from 85% to 160%. Reduce Motion stills
every animation.

**Search.** The search field on Messages finds chats by name, as before, and
now messages too: every message the phone can open (chats you've opened, and
the ones kept from before), ignoring case and accents, newest first, with the
word highlighted. Tap one to open the chat at that message. It all happens on
the phone; what you search for is never sent anywhere.

**App lock.** Privacy & Security → Lock InFlight (per phone; needs a
passkey). InFlight then locks when you leave it, straight away or after 1, 15
or 60 minutes, and opens with Face ID, Touch ID or the passkey: a
user-verified passkey check made on the phone itself, so it works offline.
Turning it on checks it's you first, so you can't lock yourself out by
accident; "Sign Out Instead" on the lock screen is the way out if you're stuck.
While locked nothing from your chats is drawn, and with the lock on the app is
blurred in the app switcher.

**Voice pigeons.** With nothing typed, the send button is a microphone: tap
to record (up to 30 seconds, with a live waveform; the bin cancels), then send.
The recording is sealed like a photo, with its own random key labelled "voice"
so it can't pass for one, and its shape (40 bars) travels inside the sealed
message. It plays in the chat with the bars filling as it goes, and like a
photo, the server deletes the recording 24 hours after it lands. The
microphone is allowed for `/pigeon` only, and recordings play from `blob:`
URLs (`media-src 'self' blob:`).

**No signal.** Send with no connection and the pigeon waits on the perch:
your message, faded, "Waiting for signal". It's kept on the phone already
sealed (ciphertext only, opened again with your key after a reload) and takes
off by itself when the phone is back online, on returning to the app, or at
the next sync; the server takes each message id once, so a retry can't send it
twice. If the server turns it down meanwhile (no swifts left, not your turn),
it stays, marked "Not sent" with why, to try again or delete. One standard
pigeon waits per chat; a swift, turbo or rocket can wait beside it. Signing out
deletes what's waiting.

**Opens at once.** After every sync the phone keeps a copy of what the server
sent, and of the last 12 chats you opened, in IndexedDB. Message contents stay
sealed in it; they're opened with the key that's already on the phone, as they
are anyway. At launch InFlight draws your chats from that copy straight away,
then swaps in the fresh one; with no connection, you still see the last-known
state. Before there's any copy (a new phone), placeholder rows shimmer instead
of a misleading "No messages yet". Signing out deletes the copy.

**In the air.** The same pigeons, as a row of cards at the top of Messages,
soonest to land first: who it's to or from, a countdown (minutes and seconds
in the last hour), the pigeon flapping along its route, and the weather's delay
if there is one. A group is one card, not one per pigeon: its next landing,
every pigeon to or from it as a dot on one line (nudged apart when they'd
overlap), each turning green with a pop as it lands, and "2 of 8 landed"; tap
it for the group's chat. Tap any other card for its chat and map. Cards spring in, glow green in
the last 10 minutes, and on landing the pigeon hops onto a tick before the
card folds away; the row closes when nothing is flying. It hides while you
search, and keeps still for Reduce Motion.

**Your week in flight.** On Sunday from 6pm in your time zone (quiet hours
win), anyone who had pigeons come or go that week gets one note: miles flown,
pigeons sent and received, any badge earned, or how close the next one is. It
comes by push, and by email too if you have emails on. Switch it off under
Notifications → Your Week in Flight. A quiet week sends nothing. It's worked
out by `weekOf` in `functions/_notify.js` from two Flight Logs a week apart. For
testing, `PIGEON_WEEKLY_ANYTIME=1` makes any time count.

**Stopovers.** In a one-to-one chat, How It Flies → Stop Over: pick a friend
you and they both have. The pigeon flies to that friend,
rests with them for an hour, then flies on. The friend gets their own sealed
copy (words only; photos stay between you two) and can add one line for the
recipient, sealed between the two of them, which shows under the message when
it lands. The trip is longer by the detour and the hour. If the recipient moves,
it still leaves the friend on time and heads for the new spot. Calling it back
deletes the friend's copy too. A scheduled pigeon can't make a stopover. Code:
`stopover`, `stopoverNote` and `mutuals` in `functions/api/pigeon/[[path]].js`;
the `via_*` columns on `pg_msgs`.

**Replies and reactions.** Tap a message that has landed: react (❤️ 👍 😂 😮 😢
🙏), Reply, or Show the Flight (its map, with its miles and pigeon). A reply carries a quote of the original, sealed inside it; tap the
quote to jump to it. A reaction flies back on a tiny pigeon at rocket speed:
free, and it never uses anyone's turn. Reactions are sealed too (one to one with
the pair key; in a group sealed once with a key for each member), so the server
can't see which one it was. One per person per message: another replaces it,
the same again takes it back. Code: `functions/_reacts.js`, table `pg_reacts`.

**Climbing for the wind.** The wind is asked for 80, 120 and 180 m up, and at
each point a pigeon flies at whichever height is kindest (120 m unless another
is clearly better): it climbs to catch a stronger tailwind, or keeps low under
the worst of a headwind, and the card says so ("4h 50m early · climbed to
catch a tailwind over Luxembourg").

**Weather.** (If Open-Meteo doesn't answer, MET Norway's free forecast,
api.met.no, is asked instead: one point at a time, so 40 squares at most per
look, with an identifying User-Agent as its terms ask; it has no wind 120 m
up, so the wind at the ground does. If neither answers, pigeons fly as in
still air.) At take-off the server asks Open-Meteo (free, no key) for the wind
120 m up (where pigeons fly; the wind at the ground if that's missing) at a
point every 200 km or so along each route, five to twelve of them
(`functions/_weather.js`), snapped to a
quarter-degree grid (about 28 km) so Open-Meteo can't tell where a route starts
or ends; each square's weather is kept 10 minutes, so a busy sky asks once. What blows the
pigeon's way changes its cruising speed (80 km/h plus the tailwind, or minus a
headwind; between 0.6× and 1.6×), and the 5-minute and 3-day limits still apply
after it. Storms slow it too (thunder by the weather code, or air unstable
enough for it, CAPE 1,500 J/kg or more, with rain falling; hail, slower still,
0.6×, is gone around and sheltered from like storms; and rain is heavy by its
code or when 4 mm an hour or more is falling; ice on its wings in freezing
fog or freezing rain, 0.7×, is gone around and sheltered from too; fierce heat,
35 °C or more, and bitter cold, −10 °C or less, slow it by up to a quarter):
it sits out thunder (0.7×), picks its way
through heavy rain, snow and fog, and fights gusts over 60 km/h. The server
keeps how much later (or earlier) that makes it, and the spot where the weather
did most of it (what and where, never who). When it's 5 minutes or more, the
map card says "Delayed 3h 4m · storms over the Alps" or
"52m early · a tailwind over France", naming a mountain range when it's right
over one, and once it lands, "Landed 3h 4m late"; the menu on the sender's
pigeon says "delayed 3h 4m by storms". Rerouting a pigeon clears it. Smaller changes keep
the plain "Tailwind 13 mph · faster than usual". Only points along the route are sent, never
who's flying; if the forecast doesn't answer within 2.5 s, the pigeon flies at
its usual speed. The demo uses a steady westerly instead.

**Calling a pigeon back.** Tap your own pigeon while it's in the air → Call It
Back. A swift pigeon flies after it (so it costs one): it never arrives, what it
carried is deleted from the server, and it's your turn again. The other person
sees "George called their pigeon back." In a group, only pigeons still flying
turn back; anyone who already has it keeps it.

**GIFs.** A GIF from your phone is sent as a GIF (frames, timing and looping
kept; comments and other extra blocks stripped), end-to-end encrypted like any
photo, up to 7 MB. + → GIF searches GIPHY: searches and the
GIFs themselves go through this server (`functions/_gifs.js`), so GIPHY never
sees who's looking, and the one picked is sealed on the phone like any other.
GIFs stream through the server (never held whole in memory), with GIPHY's
~60 KB downsampled previews in the picker.
Needs the secret **`GIPHY_API_KEY`** (free from developers.giphy.com: create an
API app); without it + goes straight to your photos.

**On its way.** A pigeon flying to you is sealed until it lands: an outline
saying "Sealed · lands tomorrow 06:08", with its pigeon on a hairline of the
way; tap it for its map (and the weather's delay, if any). Several on their way
at once, from a group or a run of swifts, share one "3 on their way" card with a
row each. Each leaves the card as it lands and becomes the message.

**Groups.** New Message → New Group: a name and up to 11 friends (12 people in
all). A message flies to everyone at once, one pigeon each over the real
distance to each person, so it lands at different times for each of them; your
own message shows how many have landed, with a dot for each person (hollow
while their pigeon flies, green once it lands, blue once they've read it, red if
lost); tap it for Who Has It, everyone by name with when it landed or was read,
or how long it has to go, plus the map and Call Them Back. Its map shows every
route. You can
send a standard pigeon once someone else's message has landed for you since your
last; one swift, turbo or rocket covers the whole group. Each pigeon takes its
own Pigeon Death chance and follows its person if they move. Anyone in a group
can add their own friends, rename it, mute it or leave; the last one out takes
its messages and photos with them. People in a group who aren't friends see each
other's names and pictures, never each other's locations: their routes stay off
the map, they see no distances or weather spots for each other, and the times
their pigeons take are worked out between coarse places (half-degree cells,
about 50 km), so even those say only roughly where; the Messages list gives
them a distance to the nearest 50 km. Encryption: each message is sealed once under its own random key, and
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
setting). Location changes are limited to 30 per 15 minutes (automatic
updates check about once a minute). *Update
Automatically* (off by default) refreshes your location each time you open
InFlight, only if location permission was already given.

**Encryption.** Each phone makes an ECDH P-256 key pair. Two friends' keys give
them a shared secret, and each scroll is sealed with its own AES-256-GCM key
derived from it. Photos get a random key that travels inside the sealed scroll.
The server stores ciphertext, public keys, who is friends with whom and flight
times, never message text, photos or private keys.

What each ciphertext is (a message, a reaction, a group key, a stopover's copy
or note) is bound into it along with its id, sender and recipient (format v2;
v1 from before still opens), so the server can't re-address, swap or
re-label one. In a group, each member's sealed key also carries a hash of the
body, so the body is provably the sender's, not just the group's. The phone
checks each decrypted thing looks like what it should (a reaction is one of
the six; a message has words), and remembers which conversation each id
belongs to: if the same id turns up elsewhere, neither is shown as the other.
The server keeps message, group message and reaction ids in one table
(`pg_ids`), so no id can be two things. A reply's quote shows the original's
real sender and words whenever the original is on the phone.

Nothing is ever sealed to a key that changed without your checking it:
messages, reactions, stopover copies and notes, and group keys all go through
one rule, and a changed key is used only after "They Match: Trust New Key" on
the safety number screen (the warning's Check button opens it). Everyone in a
group has a safety number, friends of friends too: tap them in the group's
info. Every change to who's in a group (made, added, left, renamed) shows as a
line in its chat, so no one can be slipped in without everyone seeing.

**One account for the site.** The same account (email, password, passkeys) signs in to every app on
georgefarrowgreen.com, and one sign-in serves them all in a browser (`functions/_account.js`). Each sign-in starts a
session as before and also gives the browser a cookie for the whole site (`__Secure-account`, Domain
georgefarrowgreen.com, HttpOnly, SameSite=Lax, Secure; 180 days, renewed while it's used), so signing in to one app
signs you in to the others in that browser, and signing out of any of them (or deleting the account, or a password
reset) ends it for all. The cookie holds a token of its own for the session (`pg_sessions.site_hash`), not the
session's bearer token, so it opens nothing of InFlight's; and it's only given in answer to a sign-in from the app's
own pages (the browser's Origin), so a sign-in another site sends in your browser, even with a good password, can't
sign the browser in. InFlight keeps its own bearer token as before; it gives an existing sign-in a cookie the first
time it syncs after this change; and, opened signed out where the browser's signed in elsewhere on the site, its
welcome says "Signed in as …" with **Continue as …**, which asks for the password: its proof (`POST
/api/pigeon/resume`, from InFlight's own pages only) starts InFlight's own session in place of the cookie's, and the
password unlocks the key on the phone. Apps that keep nothing themselves (Weather) ask with the cookie, only from
their own pages, at their own address (not the site's, nor a preview's), and only for their own things. Passkeys are
made for the site (rpId georgefarrowgreen.com) at chat., the site's own address, weather. and account., so one passkey works at
all of them; an answer from one is taken only at the address it was given at. The profile (photo, name, handle, email) is the
account's, one set of rules for every app (`functions/_profile.js`). The password and passkey checks, with
their limits and the "new sign-in" email, are shared (`functions/_account.js`), so guessing a password counts the
same whichever app it's tried in. A web app added to an iPhone's Home Screen keeps its own cookies, so there each app
signs in on its own (a passkey makes that one tap). Tests stand in a site of their own (`ACCOUNT_SITE=gfg.test`,
chat., weather. and account. mapped to this machine: `.tools/tests/wxacct.mjs`, `acctpage.mjs`). The account's own
page, account.georgefarrowgreen.com (above), is where its password, passkeys and signed-in devices are for every app
(Privacy & Security → Your Account).

**Accounts.** Email + password, plus optional passkeys. The password is
stretched on the phone (PBKDF2, 600,000 rounds): half of the result locks the
private key before it is uploaded, the other half is the sign-in proof, which
the server stores only as a hash. Passkeys that support WebAuthn's PRF extension
(iOS 18+, recent Android/Chrome) also hold their own locked copy of the key, so
they restore messages without the password. A forgotten password can be reset
by email (below); because the password is what locks the key, only a passkey
can carry the old key across a reset.

**Passwords and resets.** People can change their password in Account → My
Profile → Privacy & Security, or tap
"Forgot password?" (which opens the account's page) to get a one-hour, single-use reset link by email. The
password locks the encryption key, so a reset keeps someone's scrolls only if
they unlock their key with a passkey; otherwise the phone makes a new key,
older scrolls stay sealed and friends see a key-change warning. Every change
signs out the account's other phones and emails a "your password was changed"
notice.

InFlight's emails (a pigeon landed, a friend request, the week in flight, the
admin page's test) and the account's (sign-ins, the password, passkeys, the email
address, reset links, keeping or deleting it) go through the site's email, below
under **Email**. Press **Send a test email** on the admin page to check it's set
up. Without a key the app says reset emails aren't on yet, and the admin page can
still make links for you to send by hand.

**Admin.** `/pigeon/admin/` uses the site owner sign-in (the key icon's password
or passkey). It lists every account (name, handle, email, place, last active,
passkeys, friends, scrolls sent) and can email a reset link, make a 24-hour
reset link to send yourself, sign someone out everywhere, or delete an account.
Admin changes need the owner cookie and a header only the admin page sends,
and every action is logged on the page. Admins never see passwords, keys or
scrolls; the server doesn't have them.

**Profiles.** In Account → My Profile, people can change their name any time,
their handle once a day (enforced by the server), and add or remove a profile
picture. Pictures are cropped square on the phone and shrunk to 512px JPEG,
which also strips location data. They aren't end-to-end encrypted: the server
stores them under `pigeon-avatars/` in R2 and only serves them to the owner,
their friends, people in a group with them, and people they've asked to be
friends (never to someone they've blocked). New columns
are added to the existing tables automatically on first use.

**Safety numbers.** Tap a friend's name in a chat to compare 60 digits. The app
also remembers each friend's key and warns if it changes.

**Headers.** `_headers` (and `functions/pigeon/_middleware.js`) give every page a
strict Content-Security-Policy; `/pigeon/*` gets the strictest one and is the
only place on the site that allows location, the microphone and passkeys.

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
- Sessions are random tokens in an `HttpOnly; Secure; SameSite=Strict` cookie,
  kept (hashed) in D1 for 7 days, so signing out ends one for good. Each is
  tagged with a keyed hash of the password (the key is a server secret, so a
  cookie gives nothing to guess the password from); changing the password
  ends them all.
- Reads are public (it's a bio); only authenticated requests can write.
- Every page runs only its own scripts (a strict Content-Security-Policy, plus
  HSTS), because the bio shares its origin with InFlight, whose keys live in
  this origin's storage. `README.md`, `wrangler.toml` and `blokk/` aren't
  served.

### InFlight's security model

- **Verify in person:** a friend's Safety Number sheet shows your shared 60-digit
  number as a QR code. Scan theirs (the camera, read by the browser's own
  BarcodeDetector or vendored jsQR 1.4.0, Apache-2.0, integrity-checked) or
  compare the digits and Mark as Verified. It's kept, sealed, with your trusted
  keys; if a verified friend's key changes, the chat warns more strongly.
- **Disappearing messages** (a chat's or group's info sheet: 1, 7 or 30 days
  after reading): when the time's up, the server wipes the sealed message, its
  photo or voice pigeon, stopover note and reactions (in a group, once everyone
  it flew to has read it), and phones stop showing it at once, even from their
  saved copy. The flight itself stays for the Flight Log (`functions/_vanish.js`).
- **Nothing is kept for long**: every message is deleted for everyone 30 days
  after it lands, whatever its chat's setting; only a line of what its pigeon
  did is kept, for the Flight Log (`functions/_retention.js`). An account
  unused for a year is deleted, a week after an email saying so.
- **Passwords are stretched with Argon2id** (64 MiB, 3 passes, on the phone;
  `pigeon/argon2.js` is hash-wasm 4.12.0, MIT, checked against npm's integrity
  hash), so guessing with graphics cards is slow. Its salt is marked `a2:`; an
  account from before (PBKDF2-SHA256, 600,000 rounds) moves on quietly at its
  next password sign-in. The page's CSP allows `'wasm-unsafe-eval'` for this.
- **Leaked passwords are refused** at sign-up, password change and reset: the
  phone asks Pwned Passwords (through `/api/pigeon/pwned`, padded) with only
  the first 5 characters of the password's SHA-1 and checks the answers
  itself, so neither server ever sees the password or its hash.
- **New sign-ins are announced:** a push to your other phones and an email
  (device, country, how), saying how to sign it out.
- **Approximate Location** (Privacy & Security) keeps your spot to a 10 km
  grid instead of a 1-mile one.
- **A copy of the database alone is no use:** each password's proof hash and
  the private key it locks are locked again with `PIGEON_PEPPER`, a secret set
  in Cloudflare (Settings → Variables and Secrets) and never stored in the
  database (`functions/_atrest.js`). Accounts from before lock themselves
  within a minute of it being set. **Once set, never change or lose it:**
  every password would stop working.
- **Two addresses, kept apart:** chat.georgefarrowgreen.com serves only
  InFlight's own pages (the app, the tracker) and its own API (`/api/pigeon/`);
  the site's API, its owner's sign-in and InFlight's admin stay on
  georgefarrowgreen.com (`/admin` there redirects). At either address anything
  else is "Not found", never the site's home page as a fallback
  (`functions/_middleware.js`, `functions/_app.js`). The old address's handover
  page may be framed only by the new address and answers only it.
- **What the server can't see:** message text, photos and private keys. Phones
  encrypt with AES-256-GCM under keys only the two friends can derive (ECDH
  P-256). The server stores ciphertext, public keys, who's friends with whom,
  each pigeon's route, and a hash of a login proof (never the password).
- **Safety numbers** are built from your own key as your phone holds it, never
  the server's copy, and the phone warns if the server ever shows a different
  key for you. A friend's changed key is flagged, blocks sending, and isn't used
  to open their messages until you've checked it.
- **Confirm it's you.** Adding or removing a passkey, deleting the account and
  fetching the password-locked key need the password or a passkey in the last
  10 minutes, so a stolen sign-in alone isn't enough. Passkeys must verify the
  person (Face ID, fingerprint or passcode), each passkey request can be used
  once, and adding a passkey emails the account. Only a sign-in that has ended
  signs a phone out; a wrong password never does.
- **Email addresses are confirmed** with a link sent at sign-up (good for 7
  days; Privacy & Security can send another). Until then the address gets
  nothing but that link and password resets, so no one can sign up with
  someone else's address and have notifications sent to it. Accounts from
  before this count as confirmed; an emailed reset link confirms too.
- **Handles** given up (changed, or the account deleted) are held for 30 days,
  so no one can step into one and receive requests meant for its owner. Place
  names are plain words (no web addresses or hidden direction characters),
  email addresses ordinary ones, and request bodies are capped at 512 KB.
- **Signed-In Phones** (Privacy & Security) lists every sign-in, as "iPhone ·
  Safari" with when it was last used, to sign out one or all the others.
- **One address.** InFlight's pages on Cloudflare's preview addresses
  (`*.pages.dev`) redirect to georgefarrowgreen.com, so there's never a second
  origin holding sign-ins or keys. The wind map asks Open-Meteo only within a
  share per person and per hour.
- **Reset links** don't sign anyone out until a new password is actually set,
  say so when the link is for a different account than the one signed in, and
  keeping the old key ("Keep Messages with Passkey") needs the phone to prove it
  holds that key (an HMAC under the secret it shares with a one-off server key),
  so a stolen link can't quietly swap in a key without friends being warned.
- **Friend requests** show the person you asked nothing of them (name or
  picture) until they say yes. Declining isn't told to the asker: their
  request just keeps looking like it's waiting, and asking again reaches no one
  for 30 days. **Blocking** (from a request, a chat's menu or contact info)
  ends the friendship and stops their requests, pigeons, and access to your
  picture and place; they aren't told, and Privacy & Security → Blocked lists
  them to unblock.
- **Location** is snapped to a 1-mile grid on the phone before it's sent, and
  only friends see it. A month after a pigeon lands, its route's ends are
  rounded to half a degree (about 50 km) and the points where it changed course
  are dropped, so old pigeons don't keep a trail of where people were. Photos are re-encoded, which strips EXIF and GPS.
- **Limits:** no forward secrecy (each pair of friends shares one long-term
  key, so a stolen phone key or a guessed password opens past messages), and,
  like any web app, the phone runs whatever JavaScript the server serves.
  Profile pictures aren't end-to-end encrypted; only friends can fetch them.

## Branch / deploy note

Cloudflare publishes your **production branch** (`main`) to the live URL. Pushes
to other branches create preview deployments.
