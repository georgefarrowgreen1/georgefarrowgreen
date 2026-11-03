# One roof, stage 4: Mail under the roof (build spec, revision 2)

MAIN = `/home/user/up4/tf/georgefarrowgreen`, IFL = `/home/user/up4/tf/inflite`, both `claude/one-roof` (MAIN `0eb3506`,
IFL `dee9d49`). Paths are relative to the repo named. Read with: stage 1's `roof/spec.md` (cited "§n", "Dn"),
`roof/addendum.md` (R1–R3 bind this stage), `roof/map-mail.md`, both repos' `.claude/CLAUDE.md`, and this folder's
`handoff.md` (the batch briefs). Where this spec and stage 1's disagree about Mail, this spec wins; everything not said
here is stage 1's contract, unchanged.

Revision 2 answers `critique-risk.md` (B1–B4, I1–I14, cited "RB1", "RI3") and `critique-build.md` (B1–B6, I1–I23, cited
"BB1", "BI3"). Each change is in place; §15 lists where each item went, and why where it wasn't taken as proposed.
Line numbers are from this reading; function names come first.

---

## 0. In short

- **Mail becomes a module whose code is IFL's, beside Mail** (`email/public/roof/*`, served by Mail's Worker and passed
  through at `inflite.ai/mail/roof/*`). Its data stays on Mail's Worker (`inflite-email`). The page calls Mail's API
  **directly, by credentialed CORS from InFlite's origins only, and only while Mail's own hub switch is on**: no mail
  crosses InFlite's Worker or the account's server.
- **Bodies never render on inflite.ai, and Mail's server enforces it.** Each body is a frame of
  `email.inflite.ai/body/`, Mail's trusted shell, which draws it in today's script-less sandbox. From an InFlite origin
  Mail's API refuses every endpoint that returns a body; the page gets summaries (`/meta`), draft fields and pictures
  only. Mail's server quotes replies and sends from a saved draft.
- **What you see:** People · Updates · Later · Done as the switcher; filters, an address lens per address, Drafts, Trash
  and Mail Settings from the title's ▾; one act, Write; the reader pushed on a phone, a pane on an iPad; compose, Later
  and Mail Settings as framework sheets; Mail's notifications through InFlite when switched on in You. Mail's own header,
  Back to Apps, tab bar, photo and settings top go.
- **Today:** a counts-only card and the Apps tile's number; no word of mail in Today's server, pushes, URLs, `today:*`
  or logs.
- **Two switches, both off unless set** (§8): `ROOF_MAIL` on InFlite's Worker (the page) and `HUB_API` on Mail's Worker
  (the CORS gate and `/body/`). `roof.yml app=mail` flips both, Mail's first. Off, `/mail/` is milestone 1's framed page
  exactly and Mail's API answers no InFlite origin. Mail at email.inflite.ai stays as it is (only `BUILD`/`NEWS` and two
  service-worker fixes); a parity test guards the port.
- **Shared contracts first.** Every framework change stages 2 and 4 both need is one joint set (§5, "R0"), built once
  in B0 before either wave, so the six stage-4 batches start together and never edit a framework file.

---

## 1. Decisions

**S4-D1. Module code in IFL `email/public/roof/`, beside Mail, served by Mail's Worker and passed through same-origin
at `inflite.ai/mail/roof/*`** (§6.2), as `hub.js` passes Weather's files (D1's reasoning: one owner, one `BUILD`, one
deploy per app). Rejected: `today/public/mail/` (Mail's code on two Workers and release lines); importing from
email.inflite.ai (widens `script-src`; harder for the root worker to keep offline).

**S4-D2. The page calls Mail's API directly: `fetch(MAIL + path, { credentials: "include" })`, CORS only for the hub
origins whose switch is on (§3.5).** Reads (`GET`) carry no custom header, so they are simple CORS requests with no
preflight; the server checks the exact `Origin` (RI12, BI3). Writes (`POST`, `PATCH`, `DELETE`) carry `X-Inflite: 1`
(CSRF, as `api()` already requires, `index.js:125–128`) and go through a few fixed URLs (thread actions always by
`POST /api/threads/batch`, drafts `POST /api/drafts`, sends `POST /api/send`), so one preflight per URL serves a whole
visit. inflite.ai and email.inflite.ai are one site, so the shared `account=` cookie goes as it does to the framed Mail
today. Rejected: a proxy `inflite.ai/api/mail/*` (map-mail R2-B): every subject and sender would cross InFlite's Worker,
whose logs are on (`wrangler.toml:36`), and it couples two deploys. The cost of this choice (the inflite.ai origin can
read and send mail) is recorded in §12 row 13 with its guards.

**S4-D3. Bodies render only on email.inflite.ai (§3).** A body is a frame of Mail's trusted shell
`email.inflite.ai/body/#m=<id>&t=<theme>&img=<0|1>&p=<parent>`, which fetches the message itself and draws it with
today's script-less inner sandbox (`htmlFrame`, app.js:5068–5195, moved) or today's text path (`messageBody`,
5031–5054, moved). The inflite.ai page never receives a body, and Mail's server refuses to give it one (§3.5).

**S4-D4. Mail's server quotes replies and forwards, and sends from a saved draft.** Today the page builds the quote
from the original's HTML (`replyDraft` app.js:5702–5740 carries `quote.html`; `buildPayload` 6588–6597 parses it). Under
the roof, compose carries `quote: { of: <message id>, mode: "reply"|"all"|"forward" }`; Mail's server builds the same
header, `> ` text and `<blockquote type="cite">` from its own copy (new `email/src/quote.js`). Forwarded files are
`{ ref: <attachment id> }`, copied from R2 `att/<id>` on the server, never fetched into the page (`attachmentBlob`
5747). Compose shows the original's `snippet` under "Quoted below". Mail on its own 1.49 keeps sending full quotes and
also writes `of` into the quote it saves (one line in `replyDraft`), so its drafts open cleanly under the roof.

**S4-D5. Addresses: Mail's old vocabulary, `/mail/` + hash** (REGISTRY, §5 C2): lenses `#updates`, `#later`, `#done`;
People is written `/mail/` by `format` (the tidy rewrites `#people` to it); `#thread=<id>` (ids are
`crypto.randomUUID()`, `receive.js:24`: 36 characters, inside the router's `[\w-]{1,40}`); `#settings`;
`#signin=<code>`. Filters, address lenses, Drafts and Trash are module state, never addresses (they never were,
app.js:6986–6988). Search is never in an address. Rejected: `/mail/thread/<id>` (new router and Worker rules; the hub
already maps Mail's `/#thread=` to `/mail/#thread=`, `today/src/hub.js:229`).

**S4-D6. Phone reader = a history entry whose address stays; iPad reader = a pane that writes none.** Phone: a row tap
is `fw.nav.go("/mail/#thread=<id>")`; REGISTRY's `keep: ["thread"]` (C2) keeps the key through the D6 tidy, so reload,
Back and the browser's swipe work; the module hides the switcher (`sections: null`, C3); the framework treats the push
and the pop as a screen change for focus and scroll (C7); Back reads "Back to Mail" (C6). On a `thread` route the module
ignores `route.section` (the alias says People) and keeps its current lens under the reader; a cold reader (depth 0)
uses People (BI17). iPad: thread choice is module state; a cold `#thread=` opens list + pane and the module replaces the
address with the lens's (`fw.nav.section`). Phone is Mail's own rule, `innerWidth < 700 || (innerHeight < 500 &&
innerWidth < 1000)` (app.js:1993), watched by `matchMedia`.

**S4-D7. A cold reader's Back stays in Mail:** `instance.back()` returns `false` unless `fw.nav.depth() === 0` (C5) and a
reader is showing on a phone; then it does `fw.nav.go("/mail/", { replace: true, kind: "pop" })` (C4) and returns
`true`. On a cold reader the module sets `header.set({ back: { label: "Back to Mail" } })` (C6), so the label says
where Back goes. From the list it returns `false` (the frame's own Back).

**S4-D8. Notifications through InFlite carry no words; the phone fetches them from Mail; one delivery.**
- Mail's Worker tells the account `{ kind: "new"|"later", thread }` (shared key, §6.1). The account decides at once and
  answers `{ on, will, held }` (`on`: the preference; `will`: devices it is about to push to; `held`: quiet hours or a
  ride hold kept it back), then pushes in `ctx.waitUntil` (RI3): `{ app: "mail", title: "Mail", body: "New mail from
  people" | "Back from Later", tag: <threadId>, url: "/mail/#thread=<threadId>" }` to the admin's InFlite devices.
- Mail pushes through its own subscriptions (`receive.js:224–233`, `index.js:56`) only when the answer is
  `!on || (will === 0 && !held)`. Mail keeps the last `on` it heard (`meta` row `inflite_on`). If the account fails or
  takes more than 3 s, Mail pushes itself only when the last `on` was false: a possible miss is chosen over a double.
- The root worker shows the push's own words at once, then asks Mail (`GET /api/notice/<threadId>`, 3 s) and, if words
  come, shows the notice again with the same tag, `renotify: false`, `silent: true`: sender and subject replace the fixed
  words without a second sound (RI4). Rejected: words through the account (privacy rule); sharing InFlite's VAPID key
  with Mail; holding `showNotification` for the fetch (iOS penalises slow notices for every app on the subscription).

**S4-D9. Search.** InFlite's search stays on device (D16). While mounted, Mail's provider offers loaded conversations
matching subject, people or snippet (≤ 5), the views as `run`, "Mail Settings" as `run` (opens the sheet, BI15) and
**"Search Mail for “q”"**: that explicit tap is the only way a query leaves the phone, only to Mail's server, in a POST
body (`POST /api/threads/search`), never a URL (Mail's Worker logs URLs, `email/wrangler.jsonc:37`; from a hub origin
the server refuses `GET /api/threads?q=` and `GET /api/contacts?q=` so a slip can't log words). It closes the search
sheet, puts `q` into the list's own search field (store `query`) and shows Mail's results there (BI18). Compose
suggestions use `POST /api/contacts/find`. No recent searches kept. A narrow, deliberate exception to D16 (Q4).

**S4-D10. Today gets a counts-only card built on the server:** the account asks Mail `GET /api/connector/card` (shared
key, 700 ms, admin only) for `{ people, updates, later: { n, next } }` → `cards.mail` and the Apps line `apps.mail`
(today `mail: false`, `functions/_todayday.js:500`). Numbers are fine in the kept copy (`today:cards:<id>`,
app.js:1002). Mail is a card, not a morning line (§6.3, BI14). Rejected: a card fetched by the page (a new contract;
card order and kept copies are the server's).

**S4-D11. Settings: notifications move to You; the rest stays Mail's, as for Weather.** You's Mail row (today "From
Mail’s own app for now", `you.js:119`) opens `dialog#sh-mailnotify` (`/#you=notify-mail`, logic in new
`today/public/mailnotify.js`): "Through InFlite" (account preference, default off) and a switch per address (Mail's
`/api/notify`, now allowed from InFlite while Mail's hub switch is on; otherwise the sheet says "Choose which addresses
notify you in Mail Settings" with Open Mail). Signature, Unknown Addresses, each address's own settings and Remote
Images on this device (`mail:remote-images`, off by default) are the **Mail Settings** sheet (`openSettings`
app.js:2288–2772 ported), from the ▾ Views sheet's last row, search, `/mail/#settings` and Mail's connector sheet.
**New Address, Delete Address and Send From open Mail Settings at Mail's own address** (new tab, `MAIL + "/#settings"`),
and Mail's server refuses them from an InFlite origin (§3.5; §12 row 13; Q12). Appearance and Sign Out are InFlite's.

**S4-D12. Mail's own gate.** Mail needs the admin, a passkey and a check within 12 hours (`accessOf`,
`email/src/auth.js:70–76`); the module shows each as a plain state (§2.1). "Confirm It’s You" runs Mail's hand-back
(`goToAccount`/`finishSignIn`, app.js:6816–6852, ported to lazy `signin.js`): `fw.nav.go(AUTH + "/#signin=mail&ask=…
&back=" + encodeURIComponent(location.origin + "/mail/"))` (as `mailhost.js:40` does; the frame assigns other origins),
then `/mail/#signin=<code>` is swapped at Mail's `/api/auth/handback` over CORS; the account's `fromMail`
(`functions/_mailapp.js:23`) accepts InFlite's origins for that path. Verifier in
`sessionStorage["mail:signin-verifier"]`. `access: "signin"` goes to `fw.session.lost()` (D3).

**S4-D13. Lifecycle (D2's, plus C10).** `hide()` stops the poll and resets the header to the lens's (no subject left
behind, RI14); `flush()` (C10) saves an open compose and any queued sends as server drafts (≤ 2 s) and answers
`{ lost }`; `unmount()` does the same with `fetch(…, { keepalive: true })`, revokes picture URLs, drops listeners.
`busy()` = compose open, a send in its undo window or in flight, a swipe under the finger, or the reader touched in the
last 30 s (`S.readAt`, app.js:5165). `F.setRoof` waits while `busy()` (C1).

**S4-D14. Poll only while shown:** Mail's 30 s `/api/version` poll (app.js:7041–7080) runs only while Mail is shown and
the page visible, at once on `visible`, stopped by `hide()`.

**S4-D15. Offline, the module opens and says "Mail needs a connection. Your mail is safe at Mail and will be here when
you’re back online."** InFlite keeps no list, subject or body anywhere. Compose opens offline (it is in
`connector.lazy`, C11) and its words are kept (S4-D16).

**S4-D16. Storage at inflite.ai (all removed at sign-out, either kind, C10):** `mail:replies` (as app.js:4781),
`mail:unsent` (the open compose's text fields: from, to, cc, bcc, subject, text, `quote: {of, mode}`, draft id; never
files), `mail:outbox` (sends made offline, text only, same fields plus `key` and time; **file bytes are never stored**),
`mail:remote-images`, `mail:lens` (the last lens's name), and `sessionStorage["mail:signin-verifier"]`. All `mail:*`
together are capped at 256 KB; above it compose says "Couldn’t keep this on your phone. Try Again when you’re online"
and keeps the sheet open (RI8). No IndexedDB. Mail's own keys and IndexedDB outbox (app.js:5816) stay on
email.inflite.ai, where Mail on its own still offers them (map-mail R5).

**S4-D17. Pictures as images, everything else at Mail's address.** Gallery and viewer fetch pictures by CORS and show a
`blob:` URL made **only** for `image/(png|jpeg|gif|webp|avif|heic|bmp)`, re-typed (`new Blob([buf], { type })`), used
only in `<img src>`, revoked on leaving the thread. Mail's server answers CORS reads of `/api/attachments/<id>` only for
those types (§3.5). SVG, PDF, video, sound and the rest open in a new tab at `MAIL/api/attachments/<id>` under Mail's own
headers (`attachment`, index.js:600–632: sandbox CSP, download unless viewable). So the CSP needs no `img-src`/`media-src`
for Mail.

**S4-D18. Compose, Later, swipes.**
- Compose is a lazy framework sheet (`mail-compose`) with Mail's fields.
- **Send = save, then send.** Tapping Send saves a server draft (`POST /api/drafts`, files uploaded with progress, as
  `saveDraft` does today), shows the toast "Sending… · Undo" and, after **6 s** (the framework toast's own time, BI8),
  calls `POST /api/send { draftId, key }`; Mail's server sends the stored draft and deletes it (S4-D4). Undo before then
  keeps the draft and reopens compose. The toast is closed by its handle (C9) the moment the send starts; an Undo after
  that says "Already sent". A swipe's Undo toast replaces the send's; the outbox row keeps its Undo until the send
  starts. "Did it go?" and retry use `key` and `/api/sends`, as today.
- Offline Send: if the message has files, compose stays open with "Files need a connection. Try Again". Otherwise it is
  queued in `mail:outbox` and sent (save, then send, no second undo window) on `online` or the next `visible`.
- **Closing compose never asks** (framework sheets have no veto, `sheet.js:36–132`). Closing a changed compose by drag,
  Escape, ✕, a route change or sign-out writes `mail:unsent` synchronously in `onClose` (RI2), then saves a server draft
  (best effort, `keepalive`) and toasts "Draft saved". Delete Draft is in compose's ⋯ menu (BI9).
- Later is a sheet of `laterChoices` (app.js:4160) plus Pick a Time. Swipe right Done, left Later, never from the left
  20 px (D19's edge Back); both are in the row menu too.

**S4-D19. Versions.** Mail 1.48 → 1.49 with `NEWS` (`email/public/app.js:300–302`, IFL CLAUDE.md). `mail.js` keeps
**literal copies** of `BUILD` and `NEWS` (app.js is a classic script and can't be imported), pinned equal by
`roofmailcontract`; the integrator raises both in one commit (BI21). A Mail release reaching an open page is D21 via
`/mail/version`. Today's `BUILD`: whichever of stages 2 and 4 integrates second takes the next number. MAIN changes only
`functions/` and tests: no app `BUILD`, `minify.mjs`, `wxshell.mjs` or `iflmenu.mjs` (no glyph is added to
`.tools/inflite/menu.js`; Mail's extra icons are the module's own `icons.js`, BI12).

**S4-D20. Hub and degraded:** in-page only when hub ready, roof on and `apps.mail` (D13, D14, C1). Degraded, Mail's
links are its own address as today (`OWN.mail = "email"`, app.js:464); an explicit "no" at a `/mail/` boot replaces to
Mail's own address with the hash.

**S4-D21. Admin only:** no Mail request from Today, Apps, You, search or the root worker unless `view.apps.mail`
(`functions/_todayapp.js:94`, `apps.js:14`). A non-admin at `/mail/` gets the admin-only state after one `/api/session`.
Edit Today lists Mail only for the admin.

**S4-D22. Out of stage 4:** Send from Mail to friends (`sendable()` → null), "Email it" as a Send target, Reply/Done/Later
buttons on notifications (Mail on its own keeps them, `email/public/sw.js:151`; Q3), Trusted Types on the framework page
(§15, RI11).

**S4-D23. Keyboard:** Mail's shortcuts (app.js:6708–6791) through one `keydown` listener, inert unless Mail is shown, no
field or sheet focused; removed at unmount.

**S4-D24. Two switches, absent = off** (§8). InFlite's Worker: `ROOF_MAIL="1"` turns the page module on (C1's general
rule: every app but Weather is off unless `ROOF_<APP>="1"`). Mail's Worker: `HUB_API="1"` (inflite.ai) and
`HUB_API_NEXT="1"` (next.inflite.ai) open the CORS gate and `/body/` for that origin only. Ships dark; switched on after
staging; staging's switch is turned off again after the smoke (RB4).

**S4-D25. Remembered lens:** on the first show after a mount, a bare People route (no thread, not a back/forward) with
`mail:lens` naming another lens calls `fw.nav.section(lens)`; every later show follows the route (BI16). A deep link to
`/mail/#later` still opens Later.

**S4-D26. Header acts and badges:** one act, Write (`data-act=compose`); Mail Settings is the Views sheet's last row
(BI6). One badge, on People: `{ n, say: "People, 3 unread" }` (`header.js:8`); Updates' and Later's counts are in the
header line and the Views sheet, not red badges (BI7).

---

## 2. What you see

### 2.1 Screens and header

| Where | Header (framework, §3.5) | Body (module) |
|---|---|---|
| A lens | Back "Back to <where you were>"; crumb Mail; title = the view ("All Mail", "Unread", "Flagged", "With Attachments", an address, "Drafts", "Trash") with ▾ → Views sheet; line "3 unread" / "All caught up" / "Couldn’t reach Mail · Try Again"; act Write; switcher with People's badge; compactTitle "People · 3" | "Search Mail" field; rows by day; Updates' digest; caught-up (next back from Later, newest Updates senders); empty and search alternatives (app.js:3695–3790) |
| Reader, phone | Back "Back to Mail"; title = subject (ellipsis, full in `aria-label`); acts Done, Later; `sections: null` | head; message cards (people, date, body frame §3, files); foot: quick reply (4796), Reply · Reply All · Forward · ⋯ (Flag, Mark Unread, Move to People/Updates, Unsubscribe, Trash, Open Original at Mail's address) |
| iPad (S4-D6) | the lens's | list 360 px on the left, scrolling with the window; reader pane `position: sticky; top: var(--hd-h); height: calc(100dvh - var(--hd-h) - var(--tabs-h) - env(safe-area-inset-bottom)); overflow: auto` with its own toolbar (Done, Later, ⋯); "Choose a conversation"; header compaction follows the window only (BI10) |
| Gate / offline | title "Mail" | S4-D12 / S4-D15 words in `ui.empty` |

Scroll is the window (D20) on a phone and for the iPad list; `html[data-app=mail]` takes Mail's accent (already in
`roof.css:30, 42, 52`). The header is set synchronously at the start of `show()` before any await, and reset in `hide()`
(RI14). Nothing in the module sets `document.title`.

### 2.2 Sheets (`fw.sheet.open`, Mail's accent, no history: D22)

Names are fixed (hooks, §10.2): `mail-views` (filters; addresses with counts; Drafts; Trash with Empty Trash; Mail
Settings), `mail-later`, `mail-compose`, `mail-rowmenu`, `mail-unsub` (`unsubSheet` app.js:4269), `mail-viewer` (pinch,
swipe, Share with `navigator.share({ files })` where offered), `mail-settings` (Addresses with each one's settings,
Unknown Addresses, Signature, Remote Images on this device, "New Address, Delete or Send From: Open Mail Settings at
Mail’s own address", Notifications → `/#you=notify-mail`), `mail-confirm`. You's `dialog#sh-mailnotify` uses §3.8's
frozen markup.

### 2.3 Addresses (every old link must keep resolving)

| Address | Roof on, `ROOF_MAIL=1` | Switch off (milestone 1, as now) |
|---|---|---|
| `/mail` | 301 → `/mail/` + search (`mailhost.js:118`, kept) | same |
| `/mail/` | framework, People (or the remembered lens, S4-D25) | framed page (`hostPage`) |
| `/mail/index.html` | framework (as `/weather/index.html`) | 404, as now (`today/src/mailhost.js:116` `known`) |
| `/mail/#people` `#updates` `#later` `#done` | that lens (`#people` tidied to `/mail/`) | framed page (Mail opens on its remembered lens) |
| `/mail/#thread=<id>` | reader (phone: pushed; iPad: pane, address tidied to the lens) | framed page; `today/public/mailhost.js` now passes `#thread=<id>` (checked `[\w-]{1,64}`) into the frame's address at start, and on a later `{ ifl: "open" }` for the same path sets `frame.src` instead of `location.assign` (RI5), so notification taps open the conversation |
| `/mail/#settings` | People + Mail Settings | framed page; `#settings` passed into the frame (Mail's own boot opens Settings, app.js:7026). `#settings=<page>` is passed as `#settings` (RI14) |
| `/mail/#signin=<code>` | hand-back swap (S4-D12), then People; address tidied | as now (forwarded into the frame) |
| `/mail/#<anything else>`, `/mail/?demo` | People (router: unknown key → first section; the query is dropped by the tidy) | as now |
| `/mail/host.css` | served (the rollback page needs it) | served |
| `/mail/roof/<file>`, `/mail/version` | Mail's module files / `{ build }` through the root Worker | 404 `no-store` |
| `email.inflite.ai/*` | Mail on its own, unchanged (incl. `/#thread=`, `#settings`, its own notifications) | same |
| `email.inflite.ai/body/` | the shell, framed only by the hub origins switched on | 404 |
| `/#you=notify-mail` | You, Mail Notifications sheet | same (You is always the framework) |
| `/#go=/mail/...` (root worker, hub not ready) | as now (`goFromHash` → Mail's own address) | same |
| Apps tile `/mail/` (with People/Updates/Later/Done chips like Weather's), connector sheet "Open Mail", Apps search "Mail · Later" → `/mail/#later` | in-page | normal navigation (crumb written, D8) |

A link to `https://email.inflite.ai/...` inside the framework is mapped by `IFL.hub.go` to `/mail/...` as now
(`hub.js:229`'s twin in the shared block), then routed in-page.

### 2.4 Search entries (S4-D9)

Always (Apps provider, from REGISTRY): "Mail", "Mail · People", "Mail · Updates", "Mail · Later", "Mail · Done", only for
the admin (the Apps provider filters by `view.apps.mail`; C14). While mounted (Mail's provider, group "Mail", order 30):
matching loaded conversations (title = subject, sub = "Pat Smith · 14:02", avatar = sender initial), views as `run`,
"Mail Settings" as `run`, "Search Mail for “q”" (always last, `run`). Settings provider (Today's): "Mail Notifications"
→ `/#you=notify-mail` for the admin.

### 2.5 Today and Apps

- **Today card** `cards.mail` (admin, when Mail answered): head "Mail"; big number = unread People ("3 from people"; 0 →
  "All caught up"); second line "1 back from Later at 14:00" when `later.next` is today, else "Updates: 5 unread" when
  `updates > 0`, else none. Tap → `/mail/`; the Later line → `/mail/#later`. In Edit Today's list as "Mail" with
  `today/public/apps/mail.svg`, for the admin only. The card is absent when Mail didn't answer 200 within 700 ms (never a
  stale or error card).
- **Apps tile**: line from `apps.mail` ("3 from people"); mini `{ kind: "num", num: "3", label: "From people" }` from
  `answer.cards.mail.people` (connector `mini`, synchronous); chips People, Updates, Later, Done when `apps.mail`.
- **Connected Apps** row and sheet: Mail's connector words (§4.6) once the switch is on; `STATIC.mail`'s words while off.

### 2.6 Notifications and taps

| Notice | Push (through the account) | Shown | Tap |
|---|---|---|---|
| New mail (People, or an address set to notify for Updates: `receive.js:222` rule unchanged) | `{ app: "mail", title: "Mail", body: "New mail from people", tag: <threadId>, url: "/mail/#thread=<threadId>" }` | at once with those words; then, if Mail answers within 3 s, again (same tag, silent) with title = sender's name (or address), body = subject | `/mail/#thread=<id>`: in the open framework window in-page (`{ifl:"route"}`), else a new window there; switch off: the framed page opens it (§2.3) |
| Back from Later (`scheduled`, `index.js:48–58`) | body "Back from Later" | then title sender, body "Back from Later: <subject>" | same |

Quiet Hours: Mail checks them before telling anyone (`quietNow`); the account applies its own quiet and ride hold too
and says so (`held`). Tags `mail:<threadId>`, so a second message in a thread replaces the first. With "Through
InFlite" off (the default), Mail's own worker shows its notices as today; its taps now open a window instead of posting
to a body frame (§7, RB2).

---

## 3. The body boundary (security-critical; deep review, R3)

### 3.1 Rule

Nothing derived from a message body (its HTML, its text, its inline images) is fetched by, passed to, parsed by or
rendered in a document of inflite.ai, **with one exception: the plain-text `snippet` (≤ 240 characters, as
`receive.js` `snippet()` makes it), drawn only with `textContent`** (RB3). Summaries (subject, people, snippet, dates,
file names and types) are JSON drawn with `textContent`. Raster pictures are shown only as S4-D17 says. Every
attacker-controlled byte rendered as a document is rendered on email.inflite.ai with scripts off. **Mail's server
enforces this** (§3.5): from an InFlite origin it refuses every endpoint that returns a body.

Drafts are George's own words. The page reads them with `GET /api/drafts/<id>` (drafts only, §3.5), which returns the
compose fields with any old-style `quote.html` removed: `quote` becomes `{ of, mode }` when the stored quote has `of` or
Mail can match `inReplyTo` to a stored message, else `quoteOld: true` (BB6). A `quoteOld` draft opens with "This draft
was started in Mail on its own. Its quoted text is added only when you send it there." and Open Mail; Send asks "Send
Without the Quoted Text?" first (Q14).

### 3.2 The parent side (`email/public/roof/bodyframe.js`, ≤ 3 KB, the only file that touches the frame)

- `bodyFrame(message, { theme, images, eager }) → { el, setTheme(t), allowImages(), destroy() }`: builds
  `iframe.mail-body` with `src = MAIL + "/body/#" + new URLSearchParams({ m: id, t, img, p: location.origin })` (id
  checked `/^[\w-]{1,64}$/` first; `p` tells the shell which parent to answer),
  `sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"`, `allow=""`,
  `referrerpolicy="no-referrer"`, `loading` = `eager` for the newest message and `lazy` for the rest,
  `title="Message from <sender>"`, `height` 120 until told.
- The reader creates the newest message's frame on the tap, in parallel with the thread fetch, from the list row's
  `latestId` (new in thread summaries, §6.1) (BI4).
- One `message` listener for all frames (added at mount, removed at unmount). A message counts only if
  `e.origin === MAIL` **and** `e.source` is the `contentWindow` of a live frame it made, and `e.data` is a plain object
  `{ ifl: "mailbody", v: 1, id }` whose `id` is that frame's message. Accepted fields, each validated: `h` (integer
  40–40000 → frame height), `designed` (boolean → white card), `remote` (boolean → the module's banner "Remote pictures
  are hidden to protect your privacy. · Load"), `quotes` (boolean, informational), `mailto` (string matching `^mailto:`
  and ≤ 2000 characters → `mailtoDraft` → compose), `touched` (→ `readAt`). Anything else is ignored.
- "Needs a connection": a frame that hasn't reported a height 6 s after its `load` event, or after an
  IntersectionObserver first sees it, while `navigator.onLine`, is covered with "Couldn’t show this message · Open in
  Mail" (RI10). Offline the module's own offline state covers the reader.
- The parent never reads `contentDocument` (it can't: cross-origin) and never posts the body to the frame. It posts only
  `{ ifl: "mailbody", v: 1, t }` on a theme change (target origin `MAIL`, never `*`).
- Load remote pictures: the frame's address is replaced with `img=1` (this message only), as `m._loadRemote` does today
  (app.js:5182). The per-device setting sets `img=1` on every frame.

### 3.3 The shell (`email/public/body/index.html`, `body/body.js`, `body/body.css`; ≤ 8 KB gzip together)

- Lives in its own folder so the assets' trailing-slash handling can't serve it at another path (RI9). The Worker
  serves it only at `/body/` (§3.4).
- One page for every message: the message id is in the hash, which never reaches a server. The Worker writes two things
  into it: `data-parents="<origins>"` (the hub origins switched on, the same list as the CORS gate and `frame-ancestors`:
  one place decides, RI14) and `?v=<BUILD>` on `body.js`/`body.css`, which are then `immutable` (BI4).
- `body.js` reads `m`, `t`, `img`, `p` from `location.hash` (strict patterns; `p` must be in `data-parents`, else it
  posts nothing: `document.referrer` is empty under `no-referrer`). It posts only to `parent` with `targetOrigin = p`,
  and accepts only messages with `e.source === parent && e.origin === p` (RI14, RB2). It fetches `/api/messages/<m>`
  (same-origin, cookie; a 401 posts `{ h: 64 }` and says "Open Mail to read this").
- It builds the inner document from today's code, moved verbatim but for colours: the HTML path (`cleanMail` 5062–5066,
  the `remotePattern`/`DESIGNED` tests and meta CSP strings 5057, 5069–5075, `<base target="_blank">`,
  `x-dns-prefetch-control off`, `foldQuotes` 5196–5225 with its "Show quoted text" button drawn by the shell under the
  inner frame, `fit`/`fitWidth` with their ResizeObservers 5118–5168, the `mailto:` click catch 5167 which now posts
  `{ mailto }`, and the touch notes 5165 as `{ touched }` at most once a second) **and the text path** (`messageBody`
  5031–5054: escape, `linkify`, the quote cut, `ATTRIBUTION`), drawn in the same inner sandbox (BI11). Colours: `body.css`
  holds the light and dark values of Mail's body text, quote, rule and link (`--mail-text`, `--mail-quote`,
  `--mail-rule`, `--mail-link` from `app.css`), chosen by `t`.
- Inner frame: `sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"` (no `allow-scripts`: unchanged
  from production), `referrerpolicy="no-referrer"`, `srcdoc`. The inner document inherits the shell's CSP (srcdoc
  documents do) and adds its own meta CSP, so a script would need to pass the sandbox, the shell's `script-src 'self'`
  and the meta `default-src 'none'`.
- The fixed test-hub origin `http://ifl.test:8788` may appear in `HUB_ORIGIN` for tests only; a comment says `.test`
  never resolves (RFC 6761), so no reviewer "fixes" it.

### 3.4 Mail's Worker for `/body/` (`email/src/body.js`)

- `GET|HEAD /body/` → the asset `/body/` (index.html) with headers set by the Worker (as `page()`, index.js:104–111):
  `Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'
  data: https: http:; font-src data: https:; media-src https:; connect-src 'self'; frame-src 'self' about:; base-uri
  'none'; form-action 'none'; object-src 'none'; frame-ancestors <hub origins switched on>`, `Referrer-Policy:
  no-referrer`, `X-Content-Type-Options: nosniff`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`,
  `Cross-Origin-Resource-Policy: same-site`, `Cache-Control: private, max-age=300`, no `X-Frame-Options`. With no hub
  origin switched on: 404.
- `GET /body/body.js?v=…`, `/body/body.css?v=…` → the asset with `Cache-Control: public, max-age=31536000, immutable`,
  nosniff.
- `/body`, `/body/index.html` and anything else under `/body/` → 404. `wrangler.jsonc` `run_worker_first` lists `/body`
  and `/body/*`; `public/_headers` gets `/body/*` with `frame-ancestors 'none'` as a backstop.
- The shell's own `img-src https:` only matters inside the inner frame, which narrows it to `data:` and `'self'` unless
  remote pictures are allowed.

### 3.5 Mail's API gate (`api()`, index.js:121–136; new `email/src/hubgate.js`)

- `hubOrigins(env)` = `HUB_ORIGIN`'s list (exact origins, the `pagePolicy` parsing) **filtered by the switches**:
  `https://inflite.ai` only if `HUB_API === "1"`, `https://next.inflite.ai` only if `HUB_API_NEXT === "1"`, any other
  listed origin (the test hub) only if `HUB_API_TEST === "1"` (a var set by `hubstack.mjs` only). `hub` = the request's
  `Origin` is in that list. The milestone-1 framed page's `frame-ancestors` (`pagePolicy`) still uses the whole
  `HUB_ORIGIN` list: the switch-off page must keep working.
- `OPTIONS` from a hub origin on `/api/*` → 204, `Access-Control-Allow-Origin: <origin>`, `-Allow-Credentials: true`,
  `-Allow-Methods: GET, POST, PATCH, DELETE`, `-Allow-Headers: Content-Type, X-Inflite`, `-Max-Age: 7200`, `Vary:
  Origin`. Every answer to a hub origin carries the first two and `Vary: Origin`. Every `/api/attachments/*` answer, to
  anyone, carries `Vary: Origin` (RI6).
- From a hub origin: `POST`/`PATCH`/`DELETE` need `X-Inflite: 1`; `GET` needs none. `Sec-Fetch-Site`, **if present**,
  must be `same-site` (older iOS doesn't send it; the exact `Origin` and CORS do the real work; BI13, RI12).
- **Refused from a hub origin (403):** `/api/logout`, `/api/push/*` (InFlite owns sign-out and push);
  `GET /api/messages/<id>` and `GET /api/messages/<id>/raw` by CORS (bodies, RB3); `GET /api/threads` or
  `GET /api/contacts` with a `q` (queries only by POST); `GET /api/attachments/<id>` unless the stored type is one of
  S4-D17's raster types; `POST /api/addresses`, `DELETE /api/addresses/*`, and `PATCH /api/addresses/*` that sets
  `isDefault` (S4-D11).
- **New, for hub and Mail alike:** `GET /api/messages/<id>/meta` (`rowToMessage` + `replyTo`, `messageId`, `inReplyTo`,
  `references` + non-inline `attachments` with `{ id, filename, type, size }`; never `html` or `text`), `GET
  /api/drafts/<id>` (only `folder = 'drafts'`, §3.1; files as `{ i, filename, type, size }`, never their bytes),
  `POST /api/threads/search`, `POST /api/contacts/find`, `GET /api/notice/<threadId>` (at access `ok` **or** `reauth`,
  RI4).
- Everything else (`/api/session`, `/api/auth/handback`, `/api/notify`, `route()`'s) is answered with the same access
  checks as now.
- Navigations: `GET /api/attachments/<id>` and `/api/messages/<id>/raw` with `Sec-Fetch-Mode: navigate`,
  `Sec-Fetch-Dest: document` and `Sec-Fetch-Site: same-site` are allowed while any hub origin is switched on (S4-D17's
  "open at Mail's address" and Open Original from inflite.ai); the response's own headers already make anything risky a
  download (`attachment`, index.js:600–632).
- Anything else same-site without a hub `Origin` is refused as now (`index.js:134`), so chat., weather., fitness. pages
  still can't use Mail's API, and nor can inflite.ai while its switch is off.
- The existing account CORS (`index.js:24`) is kept as is.

### 3.6 Proof (§10): unit `mailgate.test.mjs` (the gate) and `mailbody.test.mjs` (shell, route, headers, Mail's worker),
e2e `roofmailbody.mjs` (hostile mail), and the deep review of `bodyframe.js`, `body/*`, `email/src/body.js`,
`hubgate.js` and Mail's `sw.js` change before merge.

---

## 4. Module architecture (IFL `email/public/roof/`)

### 4.1 Files (owners are the batches of `handoff.md`)

| File | Load | Owner | What (ported from app.js) |
|---|---|---|---|
| `mail.js` | entry | MM | `CONTRACT`, `BUILD`, `NEWS` (literal copies), `SECTIONS`; `mount` builds list and reader regions, store, `ctx`, poll, provider, keys; `show(route)`: header first, section → lens, `thread` → open, `settings`/`signin` → lazy files; `hide`, `back` (S4-D7), `busy` (S4-D13), `flush` (C10), `sendable` → null, `unmount` (`boot` 6985, `start` 7084) |
| `connector.js` | static, no imports, ≤ 4 KB | MM | §4.6 |
| `store.js` | static | MM | `createStore(init) → { get(), set(patch, why), on(key, fn) → off }`: frozen snapshots; emits each changed top-level key then `"*"`, batched in a microtask (replaces `S`, 1730) |
| `api.js` | static | MM | `MAIL` (§4.7); `createApi({ base: MAIL, onLost })`: §4.7's methods, `credentials: "include"`, `X-Inflite: 1` on writes only, Mail's timeouts, `ApiError`, XHR uploads with progress (`realApi` 1144–1245) |
| `logic.js` | static, no DOM | MM | formatters (119–198); `linkify`, `textToHtml`, `parseAddress`, `mailtoDraft` (225–295, without `htmlToText`/`bodyInner`); `VIEWS`, `LENSES`, `FILTERS`, `lensCount`, `listTitle` (1725, 2929–2950); search tokeniser (3068–3160, no storage); `at`, `laterChoices`, `fmtWhen` (4153–4185); `inView` (4374); `mine`, `dedupe`, `replyDraft` with `quote: { of, mode }` (5687–5740) |
| `actions.js` | static | MM | optimistic `act`/`batch` by `inView`, all through `threadBatch`, undo toast, put back on error (4410–4458) |
| `list.js` | static | MM | `view(el, ctx) → { draw, hide, destroy }`: search field and chips, rows by day, digest, caught-up, empty and alternatives, Load More (3012–3943) |
| `rows.js` | static | MM | `ifl-row` conversation row; swipe physics from `setupRowGestures` (3977–4150), ignoring pointers that start at x ≤ 20 |
| `menus.js` | static | MM | `openViews(ctx)`, `openLater(ctx, ids)`, `openRowMenu(ctx, t)`, `openUnsub(ctx, t)`, `confirm(ctx, spec) → Promise<bool>` (sheets `mail-views`, `mail-later`, `mail-rowmenu`, `mail-unsub`, `mail-confirm`) (BB4) |
| `icons.js` | static, ≤ 2 KB | MM | `icon(name) → SVGElement` by `createElementNS` from constant path data: done, reply, reply-all, forward, flag, trash, attachment, more, later (BI12) |
| `outbox.js` | static | MM | Send = save then send (S4-D18), undo with the toast handle, retry, `/api/sends`, `mail:unsent`, `mail:outbox` (text only), the 256 KB cap, `flush` (5796–5888, 6543–6697) |
| `reader.js` | static | MR | `view(el, ctx)`: head, message cards from `/meta`, a body frame per expanded message, files (S4-D17), quick reply, foot, iPad toolbar and sticky pane (4631–4960, 5234) |
| `bodyframe.js` | static | MB | §3.2 (the parent half of 5068–5195) |
| `compose.js` | lazy, kept offline | MR | `openCompose(ctx, init)` (5889–6542), the `mail-compose` sheet, close rules (S4-D18) |
| `signin.js` | lazy, kept offline | MR | `signIn(ctx)`, `finishSignIn(ctx, code)` (6796–6852) |
| `mailsettings.js` | lazy | MR | `openSettings(ctx, page)` (2288–2772, without New/Delete Address and Send From) |
| `viewer.js` | lazy | MR | `openViewer(ctx, files, i)` (5287–5680) |
| `mail.css` | linked before mount | MM | list, rows, header line, menus; under `.m-mail` and `.ifl-sheet[data-app=mail]`, tokens only |
| `reader.css` | linked before mount | MR | reader, cards, iPad pane |
| `mailsheets.css` | linked before mount | MR | compose, settings, viewer sheets, under `.ifl-sheet[data-app=mail]` |

Not carried: Mail's `IFL` copy (305–1066), embed glue (1066–1137), gate and welcome (6853–6964), sky, glass, theme,
Home Screen fix, its tab bar, header and profile menu, `setupPush`/`togglePush` (2780–2860), `demoApi` (1246–1650,
which stays in app.js and is also copied as the test mock `.tools/tests/mocks/mailmock.mjs`, BI22).

### 4.2 State, events and `ctx` (frozen by B0)

```
store keys and shapes:
  access: "ok"|"signin"|"notadmin"|"passkey"|"reauth"|null     me: { displayName, defaultFrom, identities[], addresses[], signature } | null
  counts: { people, updates, later, drafts, trash, byAddress: { [email]: n } } | null
  version: string|null   offline: bool   updatedAt: number|null
  lens: "people"|"updates"|"later"|"done"   filter: "all"|"unread"|"flagged"|"files"   address: string|null
  box: null|"drafts"|"trash"   query: string
  list: { rows: Summary[], more: bool, loading: bool, err: string|null }
  threadId: string|null   thread: { t: Thread|null, metas: { [id]: Meta }, loading: bool, err: string|null }
  layout: "phone"|"pad"   compose: bool   sending: number   outbox: OutboxItem[]
ctx = { store, api, logic, actions, fw, layout(), icon,
        open: { compose, later, views, rowMenu, unsub, settings, viewer, signin, confirm } }
```
Views subscribe to the keys they draw and draw only their own region; actions change the store and call the API; the
poll sets `version`, `counts`, `list`. The header is set from one place (`mail.js`, on `lens`, `filter`, `address`,
`box`, `counts`, `offline`, `threadId`, `layout`). This replaces the ~300 functions that read and write `S` and `els`
(map-mail R3) with three seams a unit test can drive: `store`, `logic`, `actions` (with a fake `api`).

Openers (frozen): `openCompose(ctx, init)` with `init = { to, cc, bcc, subject, text, quote: { of, mode } | null,
files: [{ ref, filename, type, size } | File], draftId, from, inReplyTo, references }`; `openSettings(ctx, page)`;
`openViewer(ctx, files, i)`; `signIn(ctx)`; and `menus.js`'s five. Every lazy opener is reached through
`fw.lazy(() => import("./…"))`.

### 4.3 DOM, listeners, CSS

Only `root`, `fw.screenEl` and elements the module made are queried (`roofcontract`'s greps, §5.1, run over
`email/public/roof/*.js` too). Document/window listeners: `message` (body frames), `keydown` (S4-D23), the `matchMedia`
listener for the phone rule, all removed in `unmount`. No inline styles: heights and offsets via
`el.style.setProperty("--h", …)` (frame height uses the `height` attribute). Strings from mail only through
`textContent`/`fw.ui` builders. No `innerHTML`, `insertAdjacentHTML` or `document.title`.

### 4.4 Import graph and `connector.files` / `connector.lazy`

Static graph (from `mail.js`): `mail.js, store.js, api.js, logic.js, actions.js, list.js, rows.js, menus.js, icons.js,
reader.js, bodyframe.js, outbox.js` (12) + `mail.css, reader.css, mailsheets.css` = **15 files** in `connector.files`
(absolute paths under `/mail/roof/`). Lazy, only through `fw.lazy(() => import("./…"))`: `compose.js, signin.js` (both
in `connector.lazy`, C11, so the root worker keeps them for offline, BI1) and `mailsettings.js, viewer.js` (network
only). `roofcontract` walks the graph and fails on a missing or extra file, or an `import(` outside `fw.lazy(`.

### 4.5 Transfer budget (gzip -9, comments stripped, as `roofui.test` measures; IFL has no minify step)

Measured on today's code (BI5; `tools/gz.mjs`): the app.js ranges the static files port come to 31.4 KB; compose 6.9;
Mail Settings 5.4; viewer 4.8; sign-in 0.8; Mail's icons 1.7; `app.css`'s Mail part 17.7; whole app.js 81 KB.

- First Mail open: static JS ≤ **55 KB**, CSS (three files) ≤ **12 KB**; same-origin `/mail/roof/` requests ≤
  `files.length + 2`. Lazy: compose ≤ 12 KB, mailsettings ≤ 10 KB, viewer ≤ 8 KB, signin ≤ 2 KB. Body shell ≤ 8 KB once,
  then nothing (immutable script and style, shell kept 5 minutes).
- Times (warm cache, modulepreloaded, 4G): skeleton in the tap's frame; list ≤ 900 ms after files are in (Mail has no
  kept list, S4-D15); a thread's cards ≤ 600 ms, its first body ≤ 900 ms after the tap (the newest frame starts on the
  tap). Reads have no preflight (S4-D2).
- `roofmailcontract` checks the byte budgets in seconds (no e2e); `roofmail` records bytes and requests of the first
  open and fails over budget.
- Preload: like Weather (D2), `connector.js` at idle after Today's first paint, only for the admin with roof and
  `apps.mail` on; `modulepreload` of `files` on `pointerdown`/`focus` of a link to `/mail/`, and at once on a `/mail/`
  boot.

### 4.6 `connector.js`

```js
export const CONNECTOR = 1;
export const connector = {
  app: "mail", name: "Mail",
  shares: {
    cards: "How many from people are waiting, and what’s back from Later: numbers only",
    search: "Conversations already on screen, on this phone; asking Mail is your choice",
    notifications: "New mail from people and what’s back from Later, through InFlite when you choose",
    actions: "Open People, Updates, Later or Done, or a conversation",
    screens: "People · Updates · Later · Done",
  },
  sections: [["people","People"],["updates","Updates"],["later","Later"],["done","Done"]],
  aliases: { thread: "people", settings: "people", signin: "people" },
  files: [ /* §4.4, the 15 */ ],
  lazy: ["/mail/roof/compose.js", "/mail/roof/signin.js"],
  mini: (answer) => { const c = answer?.cards?.mail; const n = Number(c?.people); return c && Number.isFinite(n) ? { kind: "num", num: String(n), label: "From people" } : null; },
};
```
No `search` export (the provider exists only while mounted, S4-D9).

### 4.7 `api.js` (frozen by B0)

`MAIL` = `` `${location.protocol}//email.${location.host.replace(/^next\./, "")}` `` (modules.js:59's rule; the test
stack gives `http://email.ifl.test:8788`). Methods (everything `realApi` has, app.js:1209–1243, except `logout`,
`push*`, `message`, `send`, `createAddress`, `deleteAddress`, with these changes):

| Method | Request | Returns |
|---|---|---|
| `session()` `me()` `version()` `counts()` `settings()` `handback(code, verifier)` | as today | as today |
| `threads({ view, category, address, before })` | `GET /api/threads?…` (never `q`) | `{ threads: Summary[], hasMore }`, each with `latestId` |
| `search({ q, view, category, address, before, count })` | `POST /api/threads/search` | as `threads`, or `{ count }` |
| `thread(id)` | `GET /api/threads/<id>` | `{ thread, messages: Summary[] }` (as today) |
| `meta(id)` | `GET /api/messages/<id>/meta` | `Meta` = summary + `replyTo, messageId, inReplyTo, references, attachments[]` |
| `draft(id)` | `GET /api/drafts/<id>` | `{ compose: { from,to,cc,bcc,subject,text,inReplyTo,references,quote,files[] }, quoteOld }` |
| `batch(body)` | `POST /api/threads/batch` | as today (single-thread actions use it too) |
| `emptyTrash()` `unsubInfo(id)` `unsubscribe(id)` `remove(id)` `saveSettings(p)` `checkAddress(l)` `updateAddress(e, p)` | as today | as today |
| `findContacts(q)` | `POST /api/contacts/find` | `{ contacts }` |
| `saveDraft(draft, onProgress)` | `POST /api/drafts` (XHR, progress), files as today or `{ ref }` | `{ id }` |
| `sendDraft(draftId, key)` | `POST /api/send { draftId, key }` | `{ id }` |
| `sent(keys)` | `GET /api/sends?keys=` | `{ sent }` |
| `picture(id)` | `GET /api/attachments/<id>` (raster only) | `Blob` |
| `fileUrl(id)`, `rawUrl(id)` | – | `MAIL + "/api/attachments/<id>"`, `MAIL + "/api/messages/<id>/raw"` (navigation only) |

Payload shapes (frozen): draft `{ id?, from, to, cc, bcc, subject, text, inReplyTo, references, quote: { of, mode } |
null, attachments: [{ filename, type, size, content } | { ref }] }`; `/api/connector/card` → `{ people, updates, later:
{ n, next } }`; `/api/notice/<id>` → `{ title, body }`; `POST /api/account/mail/notice` `{ kind, thread }` → `{ on,
will, held }`.

---

## 5. Contract changes: the joint R0 for stages 2–4 (built in B0)

Stages 2, 3 and 4 each proposed the same switch in a different shape (BB1). This is one shape, built once in B0 before
either wave (handoff `B0-a`), merged into both stages' integration branches. Names follow what two of the three stages
already used. Each change is backward compatible: with no new module switched on, behaviour is stage 1's exactly. **If
stage 2's B0 lands first with other names, B0-a stops and the integrator picks one set for both stages; Mail's code
reaches these only through `fw` and REGISTRY, so a rename is a search and replace.**

Framework budget: `roofui.test`'s cap goes from 20 KB to **24 KB** (it is at 20,452 of 20,480 B; BB2), recorded in the
test with the reason. R0's own additions ≤ 1.5 KB; stage 2's later framework work ≤ 1.2 KB; stage 3 ≤ 1.3 KB.

**C1. Per-app switch (CONTRACT CHANGE).**
- Server, `today/src/roof.js`: `roofOn(env, app = "weather")` = `env.ROOF_OFF !== "1" && (v === "1" || (v === undefined
  && app === "weather"))` with `v = env["ROOF_" + app.toUpperCase()]`. So Weather stays on unless `ROOF_OFF` or
  `ROOF_WEATHER="0"`, and **every other app is off unless its secret is `"1"`**. Whichever stage deploys R0 first can't
  switch on another stage's module before its files exist (the reason for opt-in; §15 BB1). `appsOn(env)` →
  `{ weather, markets, fitness, mail, chats }` over REGISTRY's apps.
- `/api/hub` → `{ ready, roof, apps: { [app]: bool } }` (`hub.js:96`); `roof` keeps stage 1's meaning (Weather on).
- Client: `apps` kept in `sessionStorage["ifl-roof-apps"]` (JSON of app names → booleans only) beside `ifl-roof`
  (app.js:853–870); a missing `apps` means `{ weather: roof }` (a stage-1 Worker). `F.session.apps` (each ANDed with
  `hub`).
- `router.parse(href, { roof })` takes `false`, `true` (every REGISTRY app: only the frame's own re-parse of an address
  it already accepted, frame.js:190, 303) or a map `{ [app]: bool }`; the test at `router.js:77–79` becomes
  `roof === true || roof?.[r.app] === true`. The callers that decide (`roofOn()`, frame.js:76, used at 88, 163, 428;
  Today's `here`, app.js:1405) pass the map. Stage 1's boolean cases keep passing.
- `F.setRoof(v, apps)`: an app that turns off is unmounted; if it is showing, D14's bounce (marker, one reload). **While
  the showing module's `busy()` is true, or any sheet is open, the bounce waits for the next `hidden`** (as D21 waits),
  and the module's `flush()` runs first (RI2).
- `modules.loadModule` refuses unless `F.session.apps[app]` (modules.js:37). The page asks `/api/hub` again on `visible`
  (≤ every 5 min), before `loadModule`, and after a module reports its API refused it (Mail: a CORS failure while
  online).

**C2. REGISTRY entries, `link` and `keep` (CONTRACT CHANGE to ❄ `router.js`).**
```
mail: { app: "mail", name: "Mail", link: "email", path: "/mail/", entry: "/mail/roof/mail.js",
  connector: "/mail/roof/connector.js", css: ["/mail/roof/mail.css", "/mail/roof/reader.css", "/mail/roof/mailsheets.css"],
  sections: [["people","People"],["updates","Updates"],["later","Later"],["done","Done"]],
  aliases: { thread: "people", settings: "people", signin: "people" }, keep: ["thread"] }
```
(and stage 2's `markets`/`fitness` entries, stage 2's C1 wider `ARG`, as its spec gives them).
- `keep`: frame.js `tidy` (299) leaves the address alone when `R.keep?.includes(r.key)`.
- `link`: the key of `F.session.links` for "Open <App> on Its Own": `links[R.link || app]` (`modules.js:59`; the links
  object calls Mail `email`, app.js:790).

**C3. `fw.header.set({ sections: null })` hides the switcher** (frame.js `appHead` 228: `sections: h.sections === null ?
null : R.sections`). Any other value, or none, shows it.

**C4. `fw.nav.go(path, { replace, kind })`** (frame.js:370 passes `replace: !!o?.replace` and `kind` to `F.nav.go`).

**C5. `fw.nav.depth() → number`** (`curDepth()`), so a module can tell a cold screen from a pushed one (BB3a).

**C6. Back label from the module:** `appHead` uses `h.back.label` when the module set `fw.header.set({ back: { label }
})`; the action is always `F.nav.back` (BB3b).

**C7. A change of a `keep` key is a screen change** for focus and scroll (BB3c): on a push, focus moves to the header's
title; on a pop, focus returns to the element that opened it (`backTo`); the pop's saved scroll is re-applied after the
module's `show()` resolves, as `F.nav.section` already does (`frame.js:200`), not straight after `showApp` schedules it.

**C8. Places search stays while another module is mounted** (BB3d): `places()` and `fw.search.provide` drop the Places
provider only when **Weather's** module has its own provider (`frame.js:372–379, 402–409`).

**C9. `fw.ui.toast(…)` returns `{ close() }`** (`toast.js:8–48`, two lines; BI8).

**C10. Flush before sign-out (CONTRACT CHANGE, RI1).** Module instances may export `flush() → Promise<{ lost: number }>`;
`F.flush()` calls every mounted module's with a 2 s cap. Today's `signOut()` awaits `F.flush()` **before**
`/api/logout`; if any `lost > 0`, it asks "Something you wrote couldn’t be saved to its app. Sign Out Anyway?" (Cancel /
Sign Out). `signedOutNow()` (signed out elsewhere) also calls `forgetApps()` and clears `sessionStorage` keys named in
`APP_SESSION_KEPT` (new; Mail's verifier). `APP_KEPT` gains S4-D16's keys (and stage 2's).

**C11. `connector.lazy`** (stage 2's C4, as its spec gives it): lazy files the root worker keeps for offline; never
preloaded; `files ∪ lazy` ≤ 60.

**C12. The root worker keeps any registered module (`today/public/sw.js`).** `KEEP_APPS` (95), `ROOF_DOCS`, `FRAMEWORK`
(303), `APPS` (190), `NAME`, `BASES` (248) and `HOSTS` from one REGISTRY-shaped list (gaining `mail`: "Mail", `/mail/`,
`email`); `keep()` checks files under `/<app>/roof/` (Weather's reused paths unchanged); `moduleFile`/`fromModule`
(164–180) by app prefix, cache `roof-<app>-*`; navigations to `/mail/`, `/mail/index.html` as `/weather/`'s (network,
else the kept `/`, never `put`); and `notify(d)` for `app === "mail"` (§6.4).

**C13. CSP of the framework's page** (`_headers` `/*` and `roof.js` `PAGE_HEADERS`, compared by `roofserve.test`):
`connect-src` and `frame-src` gain `https://email.inflite.ai http://email.ifl.test:8788` (the second is the test
stack's Mail; `.test` never resolves, and `_headers` is static). The same header covers the root worker's fetch to Mail.
Nothing else widens (S4-D17).

**C14. `connectors.js`:** `connectorOf` (47) asks a REGISTRY app's connector file before `STATIC` when that app is on;
`STATIC.mail` stays for the switch-off case. The Apps search provider lists an app's sections only when
`view.apps[app] !== false` (Mail: admin only).

**C15. Test contracts** (MAIN): `roofhooks.mjs` gains §10.2's Mail hooks and sheet names; `unit/fixtures/roof.mjs`
gains `mailSkip` (reason when IFL `email/public/roof/mail.js` is missing); `hubstack.mjs` gains flags `roof-<app>`
(`ROOF_<APP>: "1"`; for `mail` also Mail's `HUB_API_TEST: "1"`), a pass-through port for `email.ifl.test:8788` with
`MAIL_VIA` in IFL's and the account's vars (RI13), and `MAIL_KEY` in Mail's and the account's; `roofkit/serve.mjs` and
the kit page serve any REGISTRY app's `/<app>/roof/*` from disk (Mail's from IFL `email/public/roof/`) and take the
session's `apps`; `rooflib.mjs` gains `connectorFiles(app)`, `moduleBuild(app)`, `meter(p, app)`, `staticGz(app)`.

No change to the module contract's other exports (`CONTRACT` stays 1), the connector contract (v1), `fw.lazy` or D21.

---

## 6. Server and hub changes

### 6.1 Mail's Worker (IFL `email/src/`, owners MW and MB)

| Change | Owner | Notes |
|---|---|---|
| Hub gate (`hubgate.js`, called from `fetch`/`api()`) | MW | §3.5 |
| `/body/` (`body.js`; `public/body/*`) | MB | §3.3–3.4 |
| `/roof/*` | MW | from `env.ASSETS`, **404 unless the asset exists and ends `.js`/`.css`** (`not_found_handling` is `single-page-application`); `no-cache`, nosniff |
| `GET /roof/version` | MW | `{ build }` read from `roof/mail.js` (as `appBuild` reads `app.js`, index.js:353–364); `no-store`; no sign-in |
| `GET /api/messages/<id>/meta`, `GET /api/drafts/<id>` | MW | §3.5; `draft` maps an old `quote.html` to `{ of, mode }` by `quote.of` or `inReplyTo` → `messages.message_id`, else `quoteOld: true` |
| `latestId` in thread summaries | MW | `threads.js`, the newest message's id |
| `POST /api/threads/search`, `POST /api/contacts/find` | MW | the GET handlers (`listThreads`, `contacts` index.js:634) fed from the body; `q` ≤ 300; the GET forms stay for Mail on its own |
| `GET /api/notice/:threadId` | MW | access `ok` or `reauth`; `{ title, body }` = newest incoming sender's name (else address) and subject, ≤ 120 each, only where a notice is due (People, or an address that notifies); else 404; `no-store` |
| `GET /api/connector/card` | MW | before `accountView`; `Authorization: Bearer <MAIL_KEY>`, constant-time; `{ people, updates, later: { n, next } }` from `counts()` (threads.js:355); never cookies |
| `quote.js`; `send`, `saveDraft` | MW | S4-D4: `quote: { of, mode }` → header ("On 3 Nov 2026 at 14:02, Pat <pat@x> wrote:", `fmtQuoteDate`'s words), `> ` text or forward block, `<blockquote type="cite">` without Mail's inline pictures (as `buildPayload`, 6595); `draftFiles` accepts `{ ref }` and `send` copies `att/<id>` from R2; **`POST /api/send { draftId, key }` with no other fields sends the stored draft** (its fields, files, refs and quote), then deletes it; size checks as now |
| `push.js` `noticeInflite(env, { kind, threadId })` at `receive.js:224`, `index.js:56` | MW | `POST ${ACCOUNT_ORIGIN}/api/account/mail/notice` `{ kind, thread }`, Bearer key, `X-Inflite: 1`, 3 s; keeps `on` in `meta` `inflite_on`; `pushAll` per S4-D8; no key → `pushAll` as now |
| `public/app.js` `replyDraft` | MW | the saved quote also carries `of: <message id>` (one line; Mail on its own otherwise unchanged) |
| `public/sw.js` | MB | §7 (RB1, RB2) |
| `public/app.js:300–302` | I | 1.49, `NEWS`: "Mail opens inside InFlite now, with its notifications there if you choose. Mail on its own works as before." |

Secrets on `inflite-email`: `MAIL_KEY` (= the Pages secret `MAIL_KEY`), `HUB_API`, `HUB_API_NEXT` (both absent until
`roof.yml` sets them). `wrangler.jsonc` `run_worker_first` += `/body`, `/body/*`, `/roof/*` (B0); vars unchanged
(`HUB_ORIGIN` already lists both hubs).

### 6.2 The root Worker (IFL `today/src/`)

- New `today/src/mailroof.js` (MT): `mailRoof(request, env)`, asked first by `mailPage` (`mailhost.js:114`). With
  `roofOn(env, "mail")`: `GET|HEAD /mail/`, `/mail/index.html` → `roofPage` (roof.js); `/mail/roof/<file>` (file
  `[\w.-]+\.(js|css)`) → a fetch of Mail's `/roof/<file>` (`env.MAIL_VIA || env.MAIL_ORIGIN`, RI13) with no cookie and no
  request headers but `Accept` and `If-None-Match`, passed back only if 200/304 and its type is `text/javascript` or
  `text/css` (else 502), with `Cache-Control: no-cache`, nosniff; `/mail/version` → Mail's `/roof/version`,
  `no-store`. With the switch off: `/mail/roof/*` and `/mail/version` → 404 `no-store`; the rest is `mailPage` as now.
- The hub already fetches same-zone hosts live (`hub.js` `forward` to weather., chat., fitness.); `email.inflite.ai` is
  a Worker custom domain in the same zone, which Cloudflare routes to that Worker. If go-live step 3 shows otherwise,
  the fallback is a service binding `MAIL` → `inflite-email` (`wrangler.toml`, both envs), which `mailroof.js` prefers
  when present (BI20).
- `mailhost.js`: only the call above. `today/public/mailhost.js`: §2.3's `#thread` and `#settings` rules (RI5).
- `roof.js`, `hub.js`, `sw.js`, `_headers`: C1, C12, C13 (B0-a).
- `wrangler.toml`: none (`run_worker_first` already has `/mail`, `/mail/*`).

### 6.3 The account (MAIN `functions/`, owner MT)

- `_mailapp.js`: `POST mail/notice` (key first, constant time; no cookie). Reads the admin (`adminOf`) and the
  preference `prefs.mail.inflite` (default false). Off → `{ on: false, will: 0, held: false }`. On: `isQuiet` or the
  ride hold → `{ on: true, will: 0, held: true }` (counted as `_notify.js` counts held pushes); else `todayDevices(env,
  admin.id)` (`_today.js:175`) → answers `{ on: true, will: n, held: false }` at once and pushes each with
  `pushToSub(env, sub, note)` (`_notify.js:149`) in `ctx.waitUntil` (RI3). `fromMail` (23) accepts, for `mail/handback`
  only, the site's own origins (`inflite.ai`, `next.inflite.ai`, the test's) as well as Mail's.
- `_todaynotify.js`: body part `{ mail: { inflite: bool } }` (admin only) in `notifyPatch`; `notifyGet` returns `mail: {
  inflite }`.
- New `_todaymail.js`: `mailCard(env, u)` → `null` unless admin and `env.MAIL_KEY`; fetch of
  `(env.MAIL_VIA || appOrigin("email", env, request)) + "/api/connector/card"` (`functions/_sites.js:31`) with the key,
  700 ms; **any non-200 → null** (Mail before 1.49 answers 401, RI14) → numbers (each a finite non-negative integer;
  `next` a time).
- `_todayday.js`: `cards.mail` from it (in the same `Promise.all` as the other cards, never on the critical path past
  700 ms) and `appsOf` (472–500) `mail:` line "3 from people" / "All caught up". `_today.js`: `CARDS` (18) += `"mail"`,
  and a separate `LINES` list (the old `CARDS` without `mail`) for `linesOf` (85) and the `lines` patch (133), so Mail
  never becomes a morning line (BI14). A saved order without `mail` gets it appended (`todayPrefs`/`savePrefs`).
- Pages secret `MAIL_KEY`.

### 6.4 The root worker's Mail notice (`today/public/sw.js`, C12, B0-a)

`notify(d)` for `app === "mail"`: `showNotification` at once with the push's own words and tag `mail:<tag>`. Then, only
if `d.tag` matches `/^[\w-]{1,64}$/` (BI19, RI4): `words = await Promise.race([fetch(MAIL + "/api/notice/" + d.tag, {
credentials: "include", cache: "no-store" }).then(r => r.ok ? r.json() : null), timeout 3000])`; if `words.title` and
`words.body` are strings ≤ 120, `showNotification(words.title, { body: words.body, tag: "mail:" + d.tag, renotify:
false, silent: true, data })`. `MAIL` = `${location.protocol}//email.` + the worker's host without `next.` (the test
stack's `ifl.test:8788` gives `email.ifl.test:8788`). Nothing fetched is stored.

### 6.5 Today's page and You (B0-a, MT, then the integrator's one-liners)

- B0-a (shared): `app.js` hub/apps reading (C1), `signOut`/`signedOutNow` (C10), `APP_KEPT`/`APP_SESSION_KEPT`.
- B0-b: `index.html` gains only `dialog#sh-mailnotify` (stage 1 §3.8's frozen form), inert until I's `you.js` line.
- MT: `today/public/mailcard.js` (the card drawer), `today/public/mailnotify.js` (`openMailNotify(F)`: the sheet's
  logic: account preference through Today's own `/api/notify`, Mail's `GET /api/notify` and `PATCH /api/notify` by CORS,
  the switch-off wording), `today/public/apps/mail.svg`.
- I (after stage 2's batches merge, one line each): `you.js` (the Mail row opens `openMailNotify`; Settings search entry
  "Mail Notifications"), `cards.js` (`CARD_KEYS`, `APP.mail` with the
  icon, the drawer import; Edit Today lists Mail only when `view.apps.mail`), `apps.js` (Mail's chips when `apps.mail`),
  `sw.js` `FILES` (+`apps/mail.svg`).

---

## 7. Offline and the service workers

- The module's 15 files and 2 kept lazy files are kept as `roof-mail-<BUILD>` when the page asks (`keepOffline`,
  modules.js:108, with C11), all or nothing (C12). Network first, kept copy on a network error or 5xx; a 404 (switch off)
  passes through.
- **Mail's own worker (`email/public/sw.js`, MB; RB1, RB2):**
  - Navigations use the shell key `"/"` only for `/` and `/index.html`; any other navigation (`/body/`, `/api/…`) is
    left to the network (no `respondWith`). `SHELL` → `mail-app-2`, so the `"/"` copies that a body frame may already
    have overwritten are dropped on activate (sw.js:23).
  - `openMail()` picks only `frameType !== "nested"` window clients; with none, `openWindow(url)`.
  - `body.js` ignores every message not from `parent` (§3.3), so nothing Mail's worker posts reaches it.
- Body shell offline: the frame shows the browser's error; the reader is covered by the module's offline state, and a
  frame silent 6 s after loading while online offers "Open in Mail" (§3.2).
- No Mail data is kept by the root worker or the page (S4-D15). Mail's own worker never controls inflite.ai pages.
- Offline boot at `/mail/` (Home Screen): framework from the kept `/`, module from `roof-mail-*`, Mail's offline words,
  compose available (text only); never a navigation to email.inflite.ai (D23's rule, applied to `/mail/`).

---

## 8. The rollback switch (both Workers)

- **Level 1 (seconds), `roof.yml`:** input `app: all | weather | markets | fitness | mail` (default `all`, which is stage
  1's `ROOF_OFF` exactly; RB4, BB1). For an app, `state=on|off` **puts** `ROOF_<APP>="1"|"0"` on the root Worker(s) named
  by `where` (never deletes: one code path). For `mail` it first puts Mail's Worker switch for the same `where`
  (`HUB_API` for inflite.ai, `HUB_API_NEXT` for next.inflite.ai) on `inflite-email`: **Mail's first both ways** (on:
  the gate opens before any page can load the module; off: the API closes at once, then the page). `hub.sh`:
  `roof_set W NAME VALUE`; `worker_settled` accepts `inflite-email`; `wait_roof` reads `/api/hub`'s `apps.<app>` and, for
  `mail`, a preflight from the chosen origin (`OPTIONS` with `Origin:` → ACAO present or absent) and `/body/`'s status;
  `roof_verdict` names the module ("Mail is back to its framed page at /mail/").
- **Effect of off:** Mail's API answers no InFlite origin, `/body/` 404s for it; `/mail/` is the framed page again;
  `/mail/roof/*` and `/mail/version` 404, so a page that missed the change can't start the module. An open page's next
  Mail call fails, the module shows its error state ("Couldn’t reach Mail · Open Mail on Its Own"), and the page asks
  `/api/hub` at once (C1) and bounces once when not busy (D14). A body shell already in an open page's cache may draw
  for up to 5 minutes (it reads only through Mail's own origin). Notifications through InFlite keep working: their tap
  opens `/mail/#thread=<id>`, which the framed page passes into the frame (§2.3). Unsent work is safe: every send and
  every closed compose is a server draft in Mail's Drafts, which Mail on its own shows (RI7); `mail:*` keeps only text,
  cleared at sign-out.
- **Level 2 (minutes):** revert the stage-4 merge on IFL `claude/inflite` and `dist7t` (both Workers redeploy). MAIN
  needs none: the notice route answers `on: false` when the preference is off, Mail before 1.49 never calls it, and
  `_todaymail.js` treats 1.48's 401 as no card. An open page still running the module meets a 1.48 server that refuses
  `POST /api/send { draftId }` (no recipients, 400): compose says "Couldn’t send. It’s in Drafts", never a silent loss of
  a quote or file (RI7). To stop InFlite delivery without a deploy: You → Mail Notifications → Through InFlite off.
- **Level 3:** `hub-off.yml` (milestone 1's switch), as stage 1.

---

## 9. Privacy check (the rule, item by item)

| Where | What of Mail reaches it |
|---|---|
| InFlite's Worker, its logs | Module files (code) and `/mail/version`; never an API call (S4-D2) |
| The account's server, its logs | Numbers (card), `{ kind, thread }` (notice: an opaque id), a hand-back code |
| Pushes (payload and push service) | `title: "Mail"`, fixed body, opaque thread id in `tag` and `url` |
| Page URLs and history | `/mail/`, `#<lens>`, `#thread=<uuid>`, `#settings`; `#signin=<code>` until tidied. Never a query, subject, address or search |
| Mail's own Worker logs | As now, except search and contact lookups from InFlite are POST bodies (S4-D9; GET with `q` refused from a hub) |
| `today:*` storage | Numbers in the kept card |
| inflite.ai storage | S4-D16's `mail:*` keys: what you wrote (text only, ≤ 256 KB), the last lens, never mail you got; cleared at any sign-out |
| The inflite.ai document | Summaries as text (snippet the one body-derived field); pictures as images (S4-D17); never a body, refused by Mail's server (§3) |

---

## 10. Tests

### 10.1 Unit tests (MAIN `.tools/tests/unit/`; each skips with its reason when IFL's Mail module isn't beside it,
`mailSkip` from `fixtures/roof.mjs`)

| Test | Owner | Proves |
|---|---|---|
| `roofmailcontract.test.mjs` (new) | B0-b, then MM | exports (CONTRACT 1; `BUILD`/`NEWS` literals = `email/public/app.js`'s; `SECTIONS` = REGISTRY = connector); `files` = the static graph exactly, `lazy` = the two; `import(` only in `fw.lazy(`; §5.1's greps over `email/public/roof/*.js`; no `innerHTML`/`insertAdjacentHTML`/`document.title`; only `bodyframe.js` names `/body/` or `postMessage`; `createObjectURL` only in `reader.js`/`viewer.js` behind the S4-D17 list; no `api.message(`, no `/api/messages/${…}` without `/meta`; connector words; byte budgets §4.5 |
| `roofmaillogic.test.mjs` (new) | MM | parity: same-named functions extracted from `email/public/app.js` (as `roofwxcore` does) = `logic.js`'s on fixed inputs (London dates, `laterChoices` at fixed clocks, `inView`, tokeniser, `mailtoDraft`, `replyDraft` but `quote`) |
| `roofmailstore.test.mjs` (new) | MM | `store` events (per key, batched, frozen); `actions` optimistic move and roll-back through `batch` (fake `api`); `outbox`: save then send, 6 s window, Undo before and after ("Already sent"), retry, offline text-only queue, files refused offline, 256 KB cap, `QuotaExceededError`, `/api/sends`, `flush` |
| `roofmailviews.test.mjs` (new) | MR | compose close rules (`mail:unsent` written synchronously on every close but Send/Delete), `quoteOld` path, Mail Settings writes only its keys and has no New/Delete Address or Send From, viewer's type list |
| `mailgate.test.mjs` (new) | MW | Mail's Worker, fake env: CORS only for the switched-on exact origins (`https://inflite.ai.evil.com`, `null`, wrong scheme, a listed origin whose switch is off: all refused); preflight headers; GET without `X-Inflite` allowed, write without it 403; `Sec-Fetch-Site` absent allowed, `cross-site` refused; every §3.5 refusal (403 on `/api/messages/<id>`, `/raw` by CORS, `q` in GET, SVG attachment, address create/delete/default, logout, push); `/meta` and `/api/drafts/<id>` hold neither `html` nor body `text` (drafts: only for drafts; `quote.html` removed); `Vary: Origin` on every attachment answer; same-site without Origin 403 except the two navigations, and those only while a switch is on; missing `/roof/x.js` → 404, never Mail's page; `/roof/version` |
| `mailbody.test.mjs` (new) | MB | `/body/` headers exact (`frame-ancestors` = switched-on origins; 404 with none); `/body`, `/body/index.html`, `/body/x` 404; script/style immutable with `?v=`; the shell holds `data-parents` from the same list; `body.js` holds exactly the inner `sandbox` (no `allow-scripts`), the meta CSP strings, `<base target="_blank">`, posts only with `targetOrigin = p` from `data-parents`, accepts only `e.source === parent && e.origin === p`; text-path parity with app.js's `messageBody` on fixed inputs; `bodyframe.js` with a fake window: forged origin/source/shape ignored, fields validated |
| `mailsw.test.mjs` (changed) | MB | Mail's worker: navigate to `/body/` not intercepted, to `/` kept; `SHELL` `mail-app-2`; `openMail` skips nested clients and opens a window |
| `mailquote.test.mjs` (new) | MW | `quote.js` words for reply, reply-all, forward; text quoting; blockquote; Mail's inline pictures left out; a hostile original comes out as today's `buildPayload` makes it; `ref` copies; send-from-draft uses the stored fields |
| `mailconnect.test.mjs` (new) | MW | `/api/connector/card` key (missing, wrong, timing-safe), numbers only; `/api/notice` People only, lengths, `reauth` allowed; `POST /api/threads/search` = GET's results; `noticeInflite`: `pushAll` exactly when `!on || (will === 0 && !held)`, held → no push, timeout with last `on` true → no push, false → push |
| `mailnotice.test.mjs` (new) | MT | account `mail/notice`: key first; off → `{ on: false }`, no push; on → answers before pushing, the note's words are exactly the fixed ones and only the id comes from the request; quiet and ride hold → `held`; `fromMail` takes the hub only for hand-back; `_todaymail.js` cap, non-200 → null, number checks; `appsOf` line; `CARDS` has mail, `LINES` doesn't |
| `roofmailserve.test.mjs` (new) | MT | root Worker: `/mail/` framework only with `ROOF_MAIL=1`, not with `ROOF_OFF=1` or `ROOF_MAIL="0"`; `/mail/roof/*` passes code only (type check, no cookie out, 404 when off, `MAIL_VIA`); `/mail/version`; `/mail/index.html` 404 when off |
| `mailhost.test.mjs` (changed) | MT | roof branch; `#thread` and `#settings` passed; a same-path `{ifl:"open"}` sets `frame.src` |

Changed by B0-a (shared): `roofrouter` (C1, C2), `roofcontract` (iterates REGISTRY; lazy; Mail's paths),
`roofui` (24 KB; C3–C9), `roofserve` and `todayfiles` (C13), `rootsw` and `todaysw` (C12, §6.4), `hubworker` (`apps`),
`todaykept` (C10: Mail's keys, `signedOutNow`), `roofpage` (C10 sign-out order). Changed by MT: Mail's part of
`todaydaypage`. Changed by I: `roofpage` (`sh-mailnotify` markup). Unchanged and green: `mailframe`, `mailsignin`,
`mailpage`, `mailcounts`, `mailcron`, `mailstore`, `mailapp`, `mail`, `homeemail`.

### 10.2 End-to-end tests (MAIN `.tools/tests/`; `rooflib.mjs`, `roofhooks.mjs`)

Hooks (B0-a, in `roofhooks.mjs`; owners in comments): `main#m-mail`, `.m-mail [data-thread]`, `.m-mail
iframe.mail-body`, `dialog.ifl-sheet[data-sheet=mail-views|mail-later|mail-compose|mail-rowmenu|mail-unsub|mail-viewer|
mail-settings|mail-confirm]`, `dialog#sh-mailnotify`, `.m-mail [data-act=…]` for Done, Later, Reply, Send, Undo. The
hub stack seeds mail through `/cdn-cgi/handler/email` as `hubmail.mjs:55` does.

| Test | Owner | `// needs:` | Proves |
|---|---|---|---|
| `roofmailmount.mjs` (new, kit) | MM | kit | the module on the kit page with Mail's API stood in by `context.route` from `mocks/mailmock.mjs`: lenses, filters, Views sheet, rows, swipes, Later sheet, undo, outbox, search provider; static bytes |
| `roofmailmount2.mjs` (new, kit) | MR | kit | reader (cards from `/meta`, frames stubbed in the kit), compose (send with undo, close saves, `quoteOld`), Mail Settings pages, viewer, sign-in states |
| `roofmailbody.mjs` (new) | MB | `hub mail roof-mail` | part A (MB's own branch): a page on `http://ifl.test:8788/` frames `email.ifl.test:8788/body/` exactly as §3.2 builds it, with hostile mails (`<script>`, `onerror`, `javascript:`, meta refresh, `<base>`, preconnect, `<form>`, CSS `url()` to an attacker host, `mailto:`, a 5000 px newsletter, a long quote, a text body with a link): no script ran; nothing reaches the attacker host until Load, then only for that message; `contentDocument` is `null`; forged `postMessage` changes nothing; heights follow quotes; wide mail shrunk; Mail's own worker registered first, online and offline (RB1). Part B (after MM, MR, MT merge): the same through the reader; SVG and HTML attachments open at Mail's address, the SVG never in the viewer; the page never navigates |
| `roofmail.mjs` (new) | MQ | `hub mail roof-mail` | 1 tile → Mail in one document; header (crumb, view ▾, line, one act, People's badge); lens URLs by `replaceState`; Back to Apps with scroll. 2 phone: row → `/mail/#thread=` pushed and kept, switcher hidden, "Back to Mail" with scroll and focus, back/forward, reload on the reader, cold reader's Back → People with the right label; a thread longer than the screen shows no false "Couldn’t show" (RI10). 3 iPad 1024: pane, no address change, cold thread tidied, the pane scrolls without moving the list. 4 swipe Done/Later and row menu, undo; Later sheet; a picture opened in Mail on its own first, then in the module's viewer (RI6). 5 send with undo and outbox; reply: Mail's sent copy has the blockquote, and the page never asked `/api/messages/<id>`; forward by `ref`; type, tap a stand-in notification → the text is in Drafts or `mail:unsent`; type, sign out → a server draft exists. 6 search: provider hit; "Search Mail for…" is a POST and the query is in no URL, history entry or storage key |
| `roofmail2.mjs` (new) | MQ | `hub mail roof-mail` | 7 Mail Settings save; New Address opens Mail's own address; Notifications row → You's sheet. 8 Today card and Apps mini and chips; non-admin sees no Mail in Edit Today. 9 storage: only `mail:*` added. 10 module files through the root Worker, no cookie; `IFL.built("mail")` once; budget. 11 reauth round trip; non-admin state with one call. 12 CSP clean, axe, 390 light/dark, 1024 |
| `roofmailnav.mjs` (new) | MQ | `hub mail roof-mail` | notice: the push stand-in's payload holds none of the subject's or sender's words; the shown notification has them (from Mail), or the fixed words with Mail unreachable; tap → in-page `/mail/#thread=` with sheets closed, or a new window there; one delivery (Mail's own push stand-in called only when the preference is off; held → neither). Every §2.3 address with the switch on, and off (`apps.mail:false`, `/mail/roof/*` 404, Mail's preflight refused): a shown Mail bounces once, not while composing; the framed page opens a notification tap with it already open (RI5). Remote sign-out → no `mail:*` keys left. Offline standalone after one online open: the module's offline words, compose opens, no navigation to Mail's own address |

Must stay green unchanged (switches off by default): `hubmail`, `mailauth`, `contactmail`, `todayauth`, `todaymoments`,
`hubpush`, `roofweather`, `roofnav`, `roofsw`, `roofshell`, `todayshell`, `todaypage`, `todayphases`, `roofkit`,
`roofwxmount`. Per R1 a batch runs only the e2e its brief names; the integrator runs the full suite twice, in halves on
the extra sessions (R3).

---

## 11. Batches (built beside stage 2; files apart). Briefs: `handoff.md`

```
B0  contracts, two sessions at once (≈ half a day):
    B0-a joint R0 (§5): framework, Today's hub/sign-out parts, root Worker/worker/CSP, roof.yml + hub.sh, test contracts
         (merged into stage 4's AND stage 2's integration branches; names commit first, behaviour second)
    B0-b Mail's contracts: every email/public/roof/* stub with frozen exports (§4.2, §4.7), body/ and email/src/body.js
         stubs, the route lines and wrangler/_headers lines, mocks/mailmock.mjs, roofmailcontract, sh-mailnotify markup
  └─ wave (parallel; starts when B0-b and B0-a's names commit are merged): MW · MB · MM · MR · MT · MQ
       MW Mail's Worker      MB body boundary + Mail's sw.js      MM module core      MR reader and sheets
       MT InFlite and account side      MQ acceptance tests (written now, run after merges)
  └─ I  integration (one-liners after stage 2's batches, versions, suite, deep reviews, full e2e twice, go-live)
```
No file has two owners inside the wave. MW and MB meet only at B0-b's route lines; MM and MR only through B0-b's frozen
stubs and their own CSS files. Every file stage 2 also edits is B0-a's or I's. Stage 2's batches own `markets/roof/*`,
`fitness/roof/*` and their tests, and never touch `email/**`, `today/public/mail*.js`, `today/src/mail*.js` or Mail's
tests.

---

## 12. Risks and guards

| # | Risk | Guard |
|---|---|---|
| 1 | A body reaches inflite.ai (a page bug, or a trusted frame message) | §3.1; **Mail's server refuses body endpoints to hub origins**; only `bodyframe.js` touches frames, checking origin, source and shape; contract greps; `roofmailbody`; deep review |
| 2 | Script runs on email.inflite.ai, beside Mail's API | inner frame as in production (no `allow-scripts`, meta CSP, cleaning) plus the shell's header CSP inherited by srcdoc; the shell document holds no data; `mailbody` pins it |
| 3 | CORS widens Mail's surface | exact switched-on origins; writes need `X-Inflite`; `Sec-Fetch-Site` checked when sent; sign-out, push, body, address and query-in-URL paths refused; other subdomains still refused; the switch closes it in seconds |
| 4 | `blob:` URLs render attacker bytes as an inflite.ai document | raster types only, on the server and in the page; re-typed blobs, `<img>` only; the rest at Mail's address; greps |
| 5 | Mail behaviour lost (map-mail R6) | ported: undo send, outbox, did-it-go, drafts, quick replies, swipes, caught-up, search alternatives, keys, busy, poll, remembered lens; parity test; `roofmail` 4–6 |
| 6 | Three deploys, one page | switches default off; additive server paths; CONTRACT check; D21 via `/mail/version`; error state with "Open Mail on Its Own"; send-from-draft fails loudly on an old server |
| 7 | Doubled or missing notifications | the account decides first and says `on/will/held`; Mail's own only when it says so, or on failure with the last `on` false; `roofmailnav` |
| 8 | The 12-hour check looks like a fault | plain gate states, one button, Mail's working hand-back; `roofmail2` 11 |
| 9 | Today regressions | card off the critical path (700 ms, absent on any non-200); Mail not a morning line; `todaydaypage`, `todayshell`; deep review of the shared edits (R3) |
| 10 | Both stages change the frozen router and frame | one joint R0 in B0-a; Weather's cases unchanged |
| 11 | Memory (a frame per message) | frames only for expanded messages, lazy but the newest, dropped with the thread; picture URLs revoked |
| 12 | Safari and cross-origin frames in a Home Screen app | same-site, not cross-site (no partitioning); Mail's worker no longer touches body frames (§7); phone checks; a silent frame offers "Open in Mail" |
| 13 | **Accepted:** any script on inflite.ai (the framework, a module, the hub-proxied app pages at `/chats/`, `/fitness/`, `/markets/`) can read and send George's mail while the switch is on; before, it could only frame Mail (RI11) | no bodies over the API; addresses and Send From refused; the 12-hour check; `HUB_API` off closes it in seconds; every inflite.ai page already carries a strict CSP with no inline script (`roofcontract`, `roofpage`). Trusted Types for the whole page are a later, separate change (Today's `app.js` still has 13 `innerHTML` uses) |
| 14 | Sign-out or a switch flip loses what George wrote | C10 flush before logout; `onClose` writes synchronously; setRoof waits while busy; every send is a server draft first |
| 15 | localStorage full for every app on inflite.ai | no file bytes; `mail:*` ≤ 256 KB; quota errors handled |

---

## 13. Go-live order (MAIN first, then IFL dark, then the switches)

0. Set the Pages secret `MAIL_KEY` (production) and the Worker secret `MAIL_KEY` on `inflite-email` (same value).
   Nothing reads them yet. `ROOF_MAIL`, `HUB_API`, `HUB_API_NEXT` stay absent (= off).
1. **MAIN → `main`.** Inert: Mail before 1.49 never calls `mail/notice`; `_todaymail.js` treats 1.48's 401 as no card.
   Check: main's CI green; Today unchanged for George.
2. **IFL → `claude/inflite` and `dist7t`** (Mail 1.49, Today's next number; both Workers redeploy). Check:
   `email.inflite.ai` works on its own (open, read, send to self; open offline from the Home Screen: Mail, not a blank
   card); `email.inflite.ai/roof/mail.js` 200 `text/javascript`; `email.inflite.ai/body/` 404; a preflight from
   `Origin: https://inflite.ai` gets no `Access-Control-Allow-Origin`; `inflite.ai/mail/roof/mail.js` 404;
   `inflite.ai/api/hub` `apps.mail: false`; Today shows the Mail card for George (proves Pages → Mail's Worker); a test
   mail notifies as before (preference off). Both Workers' newest version is the deployed one.
3. **Staging:** `hub-stage.yml inflite_ref=claude/inflite` → next.inflite.ai; `roof.yml app=mail state=on
   where=next.inflite.ai`; smoke at next: Mail opens (proves the root Worker → Mail fetch; else the service binding,
   §6.2), a body draws (a designed newsletter and a plain reply), reply sends with its quote, swipe Done, Mail Settings
   opens, a compose closed by a tap on Apps is in Drafts; `roof.yml app=mail state=off where=next.inflite.ai` (and it
   stays off: production Mail shouldn't answer a hub deployed from any branch).
4. **`roof.yml app=mail state=on where=inflite.ai`.** Check: `/api/hub` `apps.mail: true`; `/mail/` framework
   (noindex, CSP with Mail's origin); a thread opens in-page; `/mail/version` = 1.49.
5. George turns on You → Notifications → Mail → Through InFlite when he chooses (Q1). A test mail then notifies once,
   with sender and subject, and its tap opens the conversation in-page.
6. No other IFL branch pushed for a day (stage 1's rule: keeps the switch usable).

Phone checks for George (not a gate): Today → Apps → Mail → a newsletter (pinch is the frame's), Back; a reply with the
keyboard up; iPad split; a Mail notification tap from the lock screen (Through InFlite off, then on); Home Screen
offline Mail (both addresses); Dark on a light phone (body follows the theme).

---

## 14. Questions for George (the build uses the default)

1. Once you switch "Through InFlite" on, should Mail stop its own notifications (one notification per mail), falling back
   to its own only if InFlite says it can't deliver? **[Yes. The switch starts off; Mail on its own is unchanged until
   you turn it on.]**
2. Notifications show the sender and subject by asking Mail from your phone when they arrive (never through InFlite's
   servers). The phone shows "New mail from people" first and swaps in the sender and subject a moment later, silently.
   OK? **[Yes]**
3. No Reply, Done or Later buttons on Mail's notifications through InFlite in this stage (tap opens the conversation).
   **[Yes; Mail on its own keeps them]**
4. "Search Mail for …" in InFlite's search sends what you typed to Mail's own server (as Mail's search does today, but in
   the request's body, never its address). OK? **[Yes]**
5. Mail under the roof keeps no mail on the phone, so offline it says it needs a connection. You can still write; a
   message without files waits and goes when you're back. OK? **[Yes]**
6. Today's Mail card shows numbers only (from people, back from Later), no names or subjects. OK? **[Yes]**
7. PDFs, videos and other files open at Mail's own address in a new tab; only pictures open in InFlite's viewer. OK?
   **[Yes]**
8. Mail Settings stay Mail's (from the ▾ menu, search, and Mail in Connected Apps); only Mail's notifications move into
   You. OK? **[Yes, as for Weather]**
9. Go live dark and switch Mail on after the staging check, rather than with the push. **[Yes]**
10. Recent searches aren't remembered under the roof. **[Yes]**
11. Mail at email.inflite.ai stays as it is (its own look, menu and notifications) for now. **[Yes; retiring it is a later
    stage]**
12. Adding or deleting an address, and choosing Send From, open Mail Settings at Mail's own address (a new tab) rather
    than inside InFlite, so a fault anywhere on inflite.ai can't change where your mail goes. OK? **[Yes]**
13. Closing a message you're writing (swipe down, a tap elsewhere, signing out) always keeps it as a draft, with "Draft
    saved"; Delete Draft is in the message's ⋯ menu. No "Save or Delete?" question. OK? **[Yes]**
14. A draft started in Mail on its own before this update that quotes a message: sending it from InFlite asks "Send
    Without the Quoted Text?" (sending it from Mail on its own keeps the quote). OK? **[Yes; such drafts are rare]**
15. Only People shows a count on its tab; Updates' and Later's numbers are in the header line and the ▾ menu. OK?
    **[Yes]**
16. To finish sooner, "notifications through InFlite" could move to a small stage 4b (Mail's own notifications keep
    working meanwhile, opening Mail at its own address). It runs in parallel here, so it costs review time more than
    calendar time. Build it now? **[Yes, build it now]**

---

## 15. Replies (where each critique item went)

### critique-risk.md
- **RB1** Mail's worker and body frames: fixed, §7 (navigations keyed only for `/`, `mail-app-2`), `mailsw.test`,
  `roofmailbody` part A with Mail's worker registered, go-live step 2's offline check. Owner MB.
- **RB2** taps to nested clients: fixed, §7 (`frameType` filter, `openWindow`), `body.js` source check (§3.3).
- **RB3** body endpoint: fixed on the server, §3.5 (`/meta`, `/api/drafts/<id>`, 403 on `/api/messages/<id>` and
  `/raw` by CORS), `mailgate.test`; §3.1 reworded for `snippet`.
- **RB4** switch doesn't cover the gate: fixed, S4-D24, §3.5 (`HUB_API`/`HUB_API_NEXT`, absent = off; the origin list
  filtered by them), §8 (`roof.yml app=mail` flips Mail's first, `worker_settled`/`wait_roof` cover `inflite-email`),
  go-live step 2 checks inertness and step 3 turns staging off again. Taken with one change: two per-origin secrets
  instead of `HUB_API` + a var `HUB_API_ORIGINS`, because a var needs a deploy to change and the switch must not.
- **RI1** sign-out: fixed, C10 (`flush` before logout; `signedOutNow` clears app keys and the verifier); `todaykept`,
  `roofmail` 5, `roofmailnav`.
- **RI2** switch-off or a tap drops compose: fixed, C1 (bounce waits while busy, after `flush`), S4-D18 (`onClose`
  synchronous), S4-D13 (`keepalive`).
- **RI3** ride hold and the race: fixed, S4-D8, §6.3 (`{ on, will, held }`, answer first, push in `waitUntil`; Mail's
  last `on` decides on failure).
- **RI4** slow notice: fixed, §6.4 (show at once, replace silently), `/api/notice` at `reauth`, tag checked, raw id.
- **RI5** framed page hash tap: fixed, §2.3, `mailhost.test`, `roofmailnav`.
- **RI6** shared cache: fixed, `Vary: Origin` on every attachment answer (§3.5), `roofmail` 4.
- **RI7** rollback strands mail: fixed differently from the proposal: every send is a server draft first (S4-D18), so
  nothing unsent lives only in inflite.ai storage, and a 1.48 server refuses `send { draftId }` loudly (§8). No `build`
  in `/api/session` is needed.
- **RI8** quota: fixed, S4-D16 (no file bytes, 256 KB cap, quota errors).
- **RI9** `/body/` routing: fixed, §3.3–3.4 (`body/` folder, Worker answers only `/body/`, 404s, `_headers`
  backstop), `mailbody.test`.
- **RI10** lazy frame vs 6 s: fixed, §3.2.
- **RI11** origin as credential: recorded, §12 row 13, with the address and Send From guard (S4-D11, Q12).
  `require-trusted-types-for 'script'` is not taken in this stage: Today's `app.js` has 13 `innerHTML` uses on the same
  page, so it is a separate audit (S4-D22). `X-Inflite` stays on writes (RI12).
- **RI12** preflight on every GET: fixed, S4-D2, §3.5.
- **RI13** test wiring: fixed, C15 (`MAIL_VIA` pass-through, `MAIL_KEY`), §6.2, §6.3.
- **RI14** smaller points: all fixed: `/mail/index.html` (§2.3), `#settings=<page>` (§2.3), the 401 card (§6.3), theme
  message checks (§3.3), one origin list written by the Worker (§3.3), header reset and no `document.title` (§2.1,
  `roofmailcontract`).

### critique-build.md
- **BB1** three shapes: fixed, §5 is one joint R0 built in B0-a. Names: `apps`, `ifl-roof-apps` (JSON), `F.session.apps`,
  `F.setRoof(v, apps)`, `link`, `keep`, `sections: null`, `roof.yml app=all|<app>`. One change from the proposal: the
  secret is `ROOF_<APP>` with `"1"`/`"0"` and **absent = off for every app but Weather**, not `ROOF_OFF_<APP>`.
  Reason: R0 carries REGISTRY entries for Markets, Fitness and Mail, and whichever stage deploys R0 first would switch on
  the other stage's module before its files exist; a go-live step 0 that sets `ROOF_OFF_MAIL` protects only one stage.
  `roof.yml` always puts a value, so `hub.sh` still has one code path. If stage 2's revision keeps `ROOF_OFF_<APP>`,
  the integrator settles it in B0-a (§5).
- **BB2** framework budget: fixed, §5 (24 KB, shares per stage).
- **BB3** a–e: fixed as C5, C6, C7, C8 and C1.
- **BB4** ownership: fixed, §4.1 (three CSS files, `menus.js`, `icons.js`), §10 (an owner per test), C15 (hooks,
  `mailSkip` in B0-a), `mailnotify.js` (MT) with I's one-liners after stage 2 merges.
- **BB5** contracts not frozen: fixed, B0-b (§4.2, §4.7; handoff).
- **BB6** drafts: fixed, §3.1, §3.5 (`/api/drafts/<id>` only for drafts, `quote.html` removed, `quoteOld`), `/raw` by
  CORS refused, raster-only attachments; Mail on its own writes `of` from 1.49.
- **BI1** offline compose: fixed, C11 and §4.4. **BI2** outbox quota: fixed (S4-D16, S4-D18: upload first, text-only
  queue; no IndexedDB needed). **BI3** preflights: fixed (S4-D2); the cards target is now 600 ms (§4.5). **BI4** shell
  revalidation: fixed (§3.3–3.4, `latestId`, frame on tap). **BI5** budgets: fixed (§4.5 with the measurements).
  **BI6** crowded header: fixed (S4-D26). **BI7** badges: fixed (S4-D26, People only, no contract change). **BI8** undo
  vs toast: fixed (6 s, C9, "Already sent"). **BI9** closing compose: fixed (S4-D18). **BI10** iPad scroll: fixed
  (§2.1). **BI11** text bodies: fixed (§3.3, `mailbody.test` parity). **BI12** glyphs: fixed (`icons.js`; `menu.js`
  untouched, S4-D19). **BI13** `Sec-Fetch-Site`: fixed (§3.5). **BI14** Today card and morning lines: fixed (§6.3
  `LINES`, `mail.svg`, Edit Today admin-only). **BI15** Mail Settings in search: fixed (S4-D9). **BI16** remembered
  lens: fixed (S4-D25). **BI17** thread section: fixed (S4-D6). **BI18** search result: fixed (S4-D9). **BI19** notice
  tag: fixed (§6.4).
- **BI20** same-zone fetches: not a B0 probe, because batches never deploy. The hub already fetches same-zone Pages
  hosts live, and a Worker custom domain in the same zone is routed to that Worker; go-live step 2 (Today card: Pages →
  Mail) and step 3 (root Worker → Mail) prove it before anything is switched on at inflite.ai, with the service binding
  as the fallback (§6.2). The account side uses `appOrigin("email", …)`.
- **BI21** versions: fixed (S4-D19). **BI22** development without a hub: fixed (`roofmailmount`, `roofmailmount2`, the
  kit serving IFL's Mail module, `mocks/mailmock.mjs` from `demoApi` in B0-b). **BI23** one long e2e: fixed (`roofmail`
  and `roofmail2`).
- **Minor**: `keydown` is S4-D23 (§4.3); `resize` → `matchMedia`; `run_worker_first` lists `/body` and `/body/*`;
  `back=` encoded as `mailhost.js:40`; People written `/mail/`; Apps tile chips; `MAIL_KEY` in hubstack (C15); the
  `.test` comment (§3.3). All taken.
- **§5 (making it faster)**: taken: one joint R0 (B0-a) in parallel with Mail's contracts (B0-b); six wave batches
  start together; kit tests and a mock instead of the hub for module work; `roofmail` split; deep review only for MB,
  MW's gate and B0-a's shared Today code. The optional scope cut is Q16 (default: build it now).
