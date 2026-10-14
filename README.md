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
- The password lives only as a Cloudflare secret; sessions are random tokens in
  an `HttpOnly; Secure; SameSite=Strict` cookie, kept server-side.
- Passkey assertions are verified server-side (challenge, origin, RP-ID hash,
  user-presence flag, and signature).

## InFlight (/pigeon) — 1.0.1

A pigeon-post messenger at **/pigeon**: every message ("scroll") flies the real
distance between two people at 80 km/h (5 minutes to 3 days), and photos are
deleted 24 hours after they land. It is end-to-end encrypted and works on
phones and iPads only, held upright.

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
- the wind everywhere, as thousands of drifting trails, brighter where it blows harder, with a key. Tap anywhere for the wind there, as direction and mph. The layers button turns it off, and the route gets its own green or orange tailwind and headwind streaks instead. The grid comes from Open-Meteo through InFlight (`functions/_windmap.js`): only a box of the world is sent, never who is looking, and it's cached for everyone per place and hour;
- the rain, as a weather radar: light blue drizzle through blue and purple rain to orange and yellow cloudbursts, with a key. The same grid carries how hard it's raining (Open-Meteo's last 15 minutes, as mm an hour); it's blended smoothly, given a radar's streaky grain by noise that drifts slowly, and worked out at a third of the screen's resolution a few times a second. Whatever held a pigeon up (storms, heavy rain, snow) is always on it, as an intense cell where it was worst, labelled, even with the layer off; fog and gales are drawn as fog banks and gusts. Still with Reduce Motion;
- shallow water along the coasts, softly shaded mountain ranges, and country names as you zoom in (`pigeon/countries.js`);
- a pigeon that flaps, tilts with its course and flutters as it takes off and lands. Only the pigeon is redrawn each frame; the map stays as it was drawn.

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
the map marks the spot. Only pigeons you could already see count.

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

**Stopovers.** Tap the two-people button beside the pigeons in a one-to-one
chat and pick a friend you and they both have. The pigeon flies to that friend,
rests with them for an hour, then flies on. The friend gets their own sealed
copy (words only; photos stay between you two) and can add one line for the
recipient, sealed between the two of them, which shows under the message when
it lands. The trip is longer by the detour and the hour. If the recipient moves,
it still leaves the friend on time and heads for the new spot. Calling it back
deletes the friend's copy too. A scheduled pigeon can't make a stopover. Code:
`stopover`, `stopoverNote` and `mutuals` in `functions/api/pigeon/[[path]].js`;
the `via_*` columns on `pg_msgs`.

**Replies and reactions.** Tap a message that has landed: react (❤️ 👍 😂 😮 😢
🙏) or Reply. A reply carries a quote of the original, sealed inside it; tap the
quote to jump to it. A reaction flies back on a tiny pigeon at rocket speed:
free, and it never uses anyone's turn. Reactions are sealed too (one to one with
the pair key; in a group sealed once with a key for each member), so the server
can't see which one it was. One per person per message: another replaces it,
the same again takes it back. Code: `functions/_reacts.js`, table `pg_reacts`.

**Weather.** At take-off the server asks Open-Meteo (free, no key) for the wind
at five points along each route (`functions/_weather.js`), snapped to a
quarter-degree grid (about 28 km) so Open-Meteo can't tell where a route starts
or ends; each square's weather is kept 10 minutes, so a busy sky asks once. What blows the
pigeon's way changes its cruising speed (80 km/h plus the tailwind, or minus a
headwind; between 0.6× and 1.6×), and the 5-minute and 3-day limits still apply
after it. Storms slow it too: it sits out thunder (0.7×), picks its way
through heavy rain, snow and fog, and fights gusts over 60 km/h. The server
keeps how much later (or earlier) that makes it, and the spot where the weather
did most of it (what and where, never who). When it's 5 minutes or more, the
map card and the incoming pigeon say "Delayed 3h 4m · storms over the Alps" or
"52m early · a tailwind over France", naming a mountain range when it's right
over one, and once it lands, "Landed 3h 4m late"; the sender's message says
"delayed 3h 4m by storms". Rerouting a pigeon clears it. Smaller changes keep
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
photo, up to 7 MB. The GIF button beside + searches GIPHY: searches and the
GIFs themselves go through this server (`functions/_gifs.js`), so GIPHY never
sees who's looking, and the one picked is sealed on the phone like any other.
GIFs stream through the server (never held whole in memory), with GIPHY's
~60 KB downsampled previews in the picker.
Needs the secret **`GIPHY_API_KEY`** (free from developers.giphy.com: create an
API app); without it the GIF button stays hidden.

**On its way.** A pigeon flying to you is one slim line in the chat: its
colour, a little route with it flapping along, and the time to go (and the
weather's delay, if any). Several on their way at once, from a group or a run
of swifts, share one "3 on their way" card with a row each; tap one for its
map. Each leaves the card as it lands and becomes the message.

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
  this origin's storage. The `/blokk` demo, which is mostly inline script, is
  served sandboxed on an opaque origin of its own, so it can't reach that
  storage either. `README.md` and `wrangler.toml` aren't served.

### InFlight's security model

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
